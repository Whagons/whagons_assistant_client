import { useRef, useCallback } from "react";
import { ContentItem, Message, ImageData, PdfData } from "../models/models";
import { MessageCache } from "../utils/memory_cache";
import { HOST } from "../utils/utils";
import { createWSManager } from "../utils/ws";
import { processFrontendTool, isFrontendTool } from "../utils/frontend_tools";
import { handleFrontendToolPromptMessage } from "../utils/frontend_tool_prompts";
import { buildAuthUserContext } from "../utils/user_context";

const wsManager = createWSManager(HOST);

export { wsManager };

// Lightweight streaming debug logger
const DEBUG_STREAM =
  typeof window !== "undefined" && localStorage.getItem("debug_stream") === "1";
const debug = (...args: any[]) => {
  if (DEBUG_STREAM) {
    // eslint-disable-next-line no-console
    console.log("[chat-stream]", ...args);
  }
};

// Type guards
const isImageData = (c: any): c is ImageData =>
  typeof c === "object" && c !== null && c.kind === "image-url";
const isPdfData = (c: any): c is PdfData =>
  typeof c === "object" && c !== null && c.kind === "pdf-file";

/** Map content items to backend Gemini API parts format. */
function mapContentToParts(
  content: string | ContentItem[]
): Array<{ text?: string; inline_data?: any; image_data?: any; file_data?: any }> {
  const parts: Array<{ text?: string; inline_data?: any; image_data?: any; file_data?: any }> = [];

  if (typeof content === "string") {
    parts.push({ text: content });
  } else {
    for (const item of content) {
      if (typeof item.content === "string") {
        parts.push({ text: item.content });
      } else if (isImageData(item.content) && item.content.serverUrl) {
        parts.push({
          image_data: {
            mimeType: item.content.media_type,
            fileUrl: item.content.serverUrl,
          },
        });
      } else if (isPdfData(item.content) && item.content.serverUrl) {
        parts.push({
          file_data: {
            mimeType: item.content.media_type,
            fileUrl: item.content.serverUrl,
          },
        });
      } else {
        console.error("Encountered incomplete or unexpected content item:", item);
      }
    }
  }
  return parts;
}

export interface UseChatWebSocketDeps {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  conversationId: string;
  gettingResponse: boolean;
  setGettingResponse: React.Dispatch<React.SetStateAction<boolean>>;
  scrollToBottom: () => void;
}

export interface UseChatWebSocketReturn {
  handleSubmit: (content: string | ContentItem[]) => Promise<void>;
  handleStopRequest: () => Promise<void>;
  unsubscribeWSRef: React.MutableRefObject<(() => void) | null>;
  abortControllerRef: React.MutableRefObject<boolean>;
  lastActivityAtRef: React.MutableRefObject<number>;
}

export function useChatWebSocket(deps: UseChatWebSocketDeps): UseChatWebSocketReturn {
  const {
    messages,
    setMessages,
    conversationId,
    gettingResponse,
    setGettingResponse,
    scrollToBottom,
  } = deps;

  const unsubscribeWSRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef(false);
  const lastActivityAtRef = useRef(0);

  const handleSubmit = async (content: string | ContentItem[]) => {
    if (gettingResponse) return;
    setGettingResponse(true);

    const currentConversationId = conversationId;

    // Build message and optimistic update
    const newMessage: Message = { role: "user", content };
    const currentMessages = [...messages];
    const updatedMessages = [...currentMessages, newMessage];

    setMessages(updatedMessages);
    const assistantPlaceholder: Message = { role: "assistant", content: "", reasoning: "" };
    const withAssistantPlaceholder = [...updatedMessages, assistantPlaceholder];
    setMessages(withAssistantPlaceholder);
    MessageCache.set(currentConversationId, withAssistantPlaceholder);
    queueMicrotask(scrollToBottom);

    // Map content to parts
    const parts = mapContentToParts(content);
    if (parts.length === 0) {
      console.error("No valid content to send after mapping.");
      setGettingResponse(false);
      return;
    }

    // ── WebSocket event handler ──
    const handleWebSocketEvent = (data: any) => {
      debug("ws:event", data?.type || "raw_parts");
      lastActivityAtRef.current = Date.now();

      // Frontend tool prompts
      if (data.type === "frontend_tool_prompt") {
        handleFrontendToolPromptMessage(data, (payload) => {
          wsManager.send(currentConversationId, payload);
        });
        return;
      }

      // Terminal events
      if (data.type === "done" || data.type === "stopped" || data.type === "error") {
        debug("ws:terminal", data.type);
        setGettingResponse(false);
        if (data.type === "error") {
          console.error("WebSocket error:", data.error || data.message);
        }
        if (unsubscribeWSRef.current) {
          try { unsubscribeWSRef.current(); } catch {}
          unsubscribeWSRef.current = null;
        }
        return;
      }

      // Structured tool_result
      if (data.type === "tool_result") {
        if (data.function_name && data.result && isFrontendTool(data.function_name)) {
          const sendResponseMessage = (message: string) => {
            if (message && !gettingResponse) {
              handleSubmit(message);
            }
          };
          processFrontendTool(data.function_name, data.result, sendResponseMessage);
        }

        setMessages((prevMessages) => {
          const currentMessageState = [...prevMessages];
          const toolCallIndex = currentMessageState.findIndex(
            (msg) =>
              msg.role === "tool_call" &&
              typeof msg.content === "object" &&
              (msg.content as any).name === data.function_name &&
              (msg.content as any).tool_call_id?.startsWith("temp_")
          );

          console.log("[TOOL_RESULT]", data.function_name, "realId:", data.function_id, "foundTempCallAt:", toolCallIndex);

          if (toolCallIndex !== -1) {
            const oldId = (currentMessageState[toolCallIndex].content as any).tool_call_id;
            const updatedToolCall = { ...currentMessageState[toolCallIndex] };
            (updatedToolCall.content as any).tool_call_id = data.function_id;
            currentMessageState[toolCallIndex] = updatedToolCall;
            console.log("[ID_UPDATE]", data.function_name, "from:", oldId, "to:", data.function_id);
            debug("updated_tool_call_id", data.function_name, data.function_id);
          } else {
            console.warn("[NO_MATCH]", "Could not find tool_call to update for", data.function_name);
          }

          const newToolResultMessage: Message = {
            role: "tool_result",
            content: {
              tool_call_id: data.function_id,
              name: data.function_name,
              content: data.result || data.result_json,
            },
          };
          currentMessageState.push(newToolResultMessage);
          debug("tool_result", data.function_name, "id:", data.function_id);
          MessageCache.set(currentConversationId, [...currentMessageState]);
          return currentMessageState;
        });
        return;
      }

      // Raw parts format (Gemini format)
      if (data.parts && Array.isArray(data.parts)) {
        setMessages((prevMessages) => {
          let currentMessageState = [...prevMessages];
          let lastMessage = currentMessageState[currentMessageState.length - 1];

          if (!lastMessage || lastMessage.role !== "assistant") {
            const newAssistantMessage: Message = { role: "assistant", content: "", reasoning: "" };
            currentMessageState = [...currentMessageState, newAssistantMessage];
            lastMessage = newAssistantMessage;
          }

          for (const part of data.parts) {
            if (part.text && typeof lastMessage.content === "string") {
              const updated = { ...lastMessage } as Message;
              updated.content = (lastMessage.content as string) + part.text;
              currentMessageState[currentMessageState.length - 1] = updated;
              lastMessage = updated;
              debug("raw_text", { addLen: part.text.length, totalLen: updated.content.length });
            }

            if (part.functionCall) {
              const hasId = part.functionCall.id && part.functionCall.id.length > 0;
              const toolCallId = hasId
                ? part.functionCall.id
                : `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const newToolCallMessage: Message = {
                role: "tool_call",
                content: {
                  tool_call_id: toolCallId,
                  name: part.functionCall.name,
                  args: part.functionCall.args,
                },
              };
              currentMessageState.push(newToolCallMessage);
              console.log("[TOOL_CALL]", part.functionCall.name, "hasBackendId:", hasId, "id:", toolCallId);
              debug("raw_tool_call", part.functionCall.name, "id:", toolCallId);
            }
          }

          MessageCache.set(currentConversationId, [...currentMessageState]);
          return currentMessageState;
        });
        return;
      }

      // Structured event format (backwards compat)
      setMessages((prevMessages) => {
        let currentMessageState = [...prevMessages];
        let messagesChanged = false;

        let lastMessage = currentMessageState[currentMessageState.length - 1];
        const isAssistantMessage = lastMessage?.role === "assistant";

        if (
          !isAssistantMessage &&
          (data.type === "part_start" || data.type === "part_delta" || data.type === "content_chunk")
        ) {
          const newAssistantMessage: Message = { role: "assistant", content: "", reasoning: "" };
          currentMessageState = [...currentMessageState, newAssistantMessage];
          lastMessage = newAssistantMessage;
          messagesChanged = true;
        }

        if (data.type === "part_start" || data.type === "part_delta") {
          const part = data.data?.part || data.data?.delta;
          if (part && lastMessage?.role === "assistant") {
            const updated = { ...lastMessage } as Message;

            if (part.part_kind === "text" && typeof lastMessage.content === "string") {
              const newContent = (lastMessage.content as string) + (part.content || "");
              updated.content = newContent;
              debug("text_delta", { addLen: (part.content || "").length, totalLen: newContent.length });
              messagesChanged = true;
            }

            if (part.part_kind === "reasoning") {
              const deltaText =
                typeof (part as any).reasoning === "string" && (part as any).reasoning !== ""
                  ? (part as any).reasoning
                  : typeof (part as any).content === "string"
                    ? (part as any).content
                    : "";
              if (deltaText) {
                const prevReasoning = typeof lastMessage.reasoning === "string" ? lastMessage.reasoning : "";
                updated.reasoning = prevReasoning + deltaText;
                debug("reasoning_delta", { addLen: deltaText.length, totalLen: updated.reasoning.length });
                messagesChanged = true;
              }
            }

            if (messagesChanged) {
              currentMessageState[currentMessageState.length - 1] = updated;
            }
          }
        } else if (data.type === "content_chunk" && data.data) {
          if (lastMessage?.role === "assistant" && typeof lastMessage.content === "string") {
            const updated = { ...lastMessage } as Message;
            const newContent = (lastMessage.content as string) + data.data;
            updated.content = newContent;
            debug("content_chunk", { addLen: data.data.length, totalLen: newContent.length });
            currentMessageState[currentMessageState.length - 1] = updated;
            messagesChanged = true;
          }
        } else if (data.type === "tool_call" && data.data?.tool_call) {
          debug("tool_call", Object.keys(data.data.tool_call ?? {}));
          const newToolCallMessage: Message = { role: "tool_call", content: data.data.tool_call };
          currentMessageState.push(newToolCallMessage);
          messagesChanged = true;
        } else if (data.type === "tool_result" && data.data?.tool_result) {
          debug("tool_result", typeof data.data.tool_result);
          const newToolResultMessage: Message = { role: "tool_result", content: data.data.tool_result };
          currentMessageState.push(newToolResultMessage);
          messagesChanged = true;
        }

        if (messagesChanged) {
          MessageCache.set(currentConversationId, [...currentMessageState]);
          return currentMessageState;
        }
        return prevMessages;
      });
    };

    // ── WS connection ──
    const ensureSubscription = async () => {
      if (unsubscribeWSRef.current) {
        debug("ws:cleanup", "Closing previous connection");
        try { unsubscribeWSRef.current(); } catch {}
        unsubscribeWSRef.current = null;
      }
      wsManager.close(currentConversationId);
      const selectedModel = localStorage.getItem("preferred_model") || undefined;
      debug("ws:subscribe", currentConversationId, "model:", selectedModel);
      unsubscribeWSRef.current = await wsManager.subscribe(
        currentConversationId,
        handleWebSocketEvent,
        selectedModel
      );
    };

    try {
      abortControllerRef.current = false;
      ensureSubscription();

      const maxWaitTime = 5000;
      const checkInterval = 100;
      const maxAttempts = maxWaitTime / checkInterval;

      let connected = false;
      for (let i = 0; i < maxAttempts; i++) {
        const wsState = wsManager.getState(currentConversationId);
        if (wsState === WebSocket.OPEN) {
          connected = true;
          debug("ws:connected", `Connection ready after ${i * checkInterval}ms`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
      }

      if (!connected) {
        const wsState = wsManager.getState(currentConversationId);
        console.error("[WS] Connection failed. State:", wsState, "Expected:", WebSocket.OPEN);
        throw new Error(`WebSocket connection timeout. State: ${wsState}`);
      }

      const messagePayload = {
        message: {
          role: "user",
          content: { parts },
        },
        user_context: buildAuthUserContext(),
      };

      debug("ws:send", messagePayload);
      const sent = wsManager.send(currentConversationId, messagePayload);
      if (!sent) {
        throw new Error("Failed to send message via WebSocket - connection not ready");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setGettingResponse(false);

      setMessages((prev) => {
        if (
          prev.length >= 2 &&
          prev[prev.length - 2] === newMessage &&
          prev[prev.length - 1]?.role === "assistant" &&
          typeof prev[prev.length - 1]?.content === "string" &&
          (prev[prev.length - 1]?.content as string) === ""
        ) {
          return prev.slice(0, -2);
        }
        if (prev.length > 0 && prev[prev.length - 1] === newMessage) {
          return prev.slice(0, -1);
        }
        return prev;
      });

      if (!(error instanceof DOMException && error.name === "AbortError") && !abortControllerRef.current) {
        alert(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const handleStopRequest = useCallback(async () => {
    abortControllerRef.current = true;
    setGettingResponse(false);
    try {
      wsManager.close(conversationId);
      console.log("[WS] Stopped chat by closing WebSocket connection");
    } catch (e) {
      console.error("Failed to stop chat:", e);
    }
  }, [conversationId, setGettingResponse]);

  return {
    handleSubmit,
    handleStopRequest,
    unsubscribeWSRef,
    abortControllerRef,
    lastActivityAtRef,
  };
}
