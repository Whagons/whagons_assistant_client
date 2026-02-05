import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Prism from "prismjs";
import "../styles/index.css";
import "../styles/prisma/prisma.css";
import "../styles/prisma-dark/prisma-dark.css";
// Import ImageData and PdfData for type guards
import { ContentItem, Message, ImageData, PdfData } from "../models/models";
import { useSidebar } from "@/components/ui/sidebar";
import { useChatContext } from "@/layout";
import { useNavigate, useParams } from "react-router-dom";
import ChatInput, { QueuedMessage } from "../components/ChatInput";
import MessageItem from "../components/ChatMessageItem";
import { MessageCache } from "../utils/memory_cache";
import { Skeleton } from "@/components/ui/skeleton";
import { convertToChatMessages, HOST } from "../utils/utils";
import { createWSManager } from "../utils/ws";
import ToolMessageRenderer, { ToolCallMap } from "../components/ToolMessageRenderer";
import NewChat from "../components/NewChat";
import { processFrontendTool, isFrontendTool } from "../utils/frontend_tools";
import { handleFrontendToolPromptMessage, ConfirmationRequest } from "../utils/frontend_tool_prompts";
import { useExecutionTraces } from "../hooks/useExecutionTraces";
import ExecutionTraceTimeline from "../components/ExecutionTraceTimeline";
import ConfirmationDialog from "../components/ConfirmationDialog";
import HistoryWarningBanner from "../components/HistoryWarningBanner";
import { useTheme } from "@/lib/theme-provider";

// Component to render user message content

const wsManager = createWSManager(HOST);

function ChatWindow() {
  // Lightweight streaming debug logger. Enable with: localStorage.setItem('debug_stream','1')
  const DEBUG_STREAM = typeof window !== 'undefined' && localStorage.getItem('debug_stream') === '1'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const debug = (...args: any[]) => {
    if (DEBUG_STREAM) {
      // eslint-disable-next-line no-console
      console.log('[chat-stream]', ...args)
    }
  }
  const { open, openMobile, isMobile } = useSidebar();
  const [gettingResponse, setGettingResponse] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const params = useParams();
  const id = params.id;
  const [conversationId, setConversationId] = useState<string>(
    id || crypto.randomUUID().toString()
  );
  const abortControllerRef = useRef(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false);
  const [scrollBtnLeft, setScrollBtnLeft] = useState<number | undefined>(undefined);
  // Single multiplexed WebSocket via wsManager; per-conversation subscription only
  const unsubscribeWSRef = useRef<(() => void) | null>(null);
  const lastActivityAtRef = useRef(0);
  // Track verified conversations to avoid redundant API calls
  const verifiedConversationsRef = useRef<Set<string>>(new Set());
  const { chats, setChats } = useChatContext();
  const navigate = useNavigate();
  // Track scroll positions for each conversation
  const [scrollPositions, setScrollPositions] = useState<
    Record<string, number>
  >({});

  // Reference to the chat container
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Reference to input container to position the floating button above it
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // Execution trace management (for real-time TypeScript execution visualization)
  const { traces, handleTrace, clearTraces, hasActiveTraces, loadTracesFromAPI } = useExecutionTraces();
  
  // Confirmation dialog state (for Confirm_With_User tool)
  const [confirmationRequest, setConfirmationRequest] = useState<ConfirmationRequest | null>(null);
  
  // History warnings state (for model compatibility warnings when switching models)
  const [historyWarnings, setHistoryWarnings] = useState<Array<{type: string; message: string; details: string}>>([]);
  
  // Message queue state (for queueing messages while agent is running)
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  
  // Toggle for legacy tool visualization vs trace-based
  // Default to trace-based visualization (useLegacyToolViz = false)
  // To enable legacy mode: localStorage.setItem('use_legacy_tool_viz', '1')
  // To enable trace mode: localStorage.removeItem('use_legacy_tool_viz')
  const [useLegacyToolViz] = useState<boolean>(() => {
    const legacy = localStorage.getItem('use_legacy_tool_viz') === '1';
    console.log('[ChatWindow] Tool visualization mode:', legacy ? 'LEGACY' : 'TRACE');
    return legacy;
  });

  // Memoize the messages to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => messages, [messages]);
  // Track the index of the last user message for scrolling
  const lastUserIndex = useMemo(() => {
    const arr = memoizedMessages;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i]?.role === "user") return i;
    }
    return -1;
  }, [memoizedMessages]);
  
  // Create a memoized map of tool_call_id to the tool_call message
  const toolCallMap = useMemo<ToolCallMap>(() => {
    const map: ToolCallMap = new Map();
    // Use memoizedMessages here for consistency
    for (const msg of memoizedMessages) { 
      // Check role first, then check if content is an object (basic check)
      if (msg.role === 'tool_call' && typeof msg.content === 'object' && msg.content !== null) {
         // Use type assertion to access potential properties like tool_call_id
        const contentObj = msg.content as any; 
        if (contentObj.tool_call_id) { 
          // Ensure tool_call_id is treated as a string
          const toolCallId = String(contentObj.tool_call_id);
          // Add any valid tool_call_id to the map
          if (toolCallId && toolCallId.length > 0) { 
            map.set(toolCallId, msg);
          }
        }
      }
    }
    return map;
  }, [memoizedMessages]);

  // Scroll to bottom with smooth animation (for new messages)
  const scrollToBottom = useCallback(() => {
    // Prefer last user message if present; else fall back to last message sentinel
    const lastUser = document.getElementById("last-user-message");
    const target = lastUser || document.getElementById("last-message");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  // Instant scroll to bottom without animation (for chat switching)
  const instantScrollToBottom = useCallback(() => {
    const lastUser = document.getElementById("last-user-message");
    const target = lastUser || document.getElementById("last-message");
    if (target) {
      target.scrollIntoView({ behavior: "auto", block: "start" });
    }
  }, []);

  // Scroll chat container to absolute bottom
  const scrollContainerToBottom = useCallback(() => {
    if (!chatContainerRef.current) return;
    // Instant jump to bottom
    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    // Hide button immediately
    setShowScrollToBottom(false);
  }, []);

  // Verify conversation state only if it already exists server-side
  // Uses a ref to track verified conversations and avoid redundant calls
  const verifyIfExists = useCallback(async (cid: string) => {
    // Skip if already verified this session
    if (verifiedConversationsRef.current.has(cid)) {
      return;
    }
    try {
      const { authFetch } = await import("@/lib/utils");
      const resp = await authFetch(`${HOST}/api/v1/chats/conversations/${cid}`);
      if (resp.ok) {
        verifiedConversationsRef.current.add(cid);
        // TODO: Implement verifyAndSync in memory_cache.ts
        // import("../utils/memory_cache").then(({ DB }) => DB.verifyAndSync(cid));
      }
    } catch {
      // ignore 404/Network here; conversation may not be created yet
    }
  }, []);

  // Save the current scroll position
  const saveScrollPosition = useCallback(() => {
    if (chatContainerRef.current && conversationId) {
      const newScrollPositions = { ...scrollPositions };
      newScrollPositions[conversationId] = chatContainerRef.current.scrollTop;
      setScrollPositions(newScrollPositions);
    }
  }, [conversationId, scrollPositions]);

  // Update visibility of the "Scroll to bottom" button based on position
  const updateScrollBottomVisibility = useCallback(() => {
    if (!chatContainerRef.current) return;
    const distanceFromBottom =
      chatContainerRef.current.scrollHeight - chatContainerRef.current.scrollTop - chatContainerRef.current.clientHeight;
    setShowScrollToBottom(distanceFromBottom > 120);
    // Also keep the button horizontally centered to the chat body
    updateScrollButtonPosition();
  }, []);

  const updateScrollButtonPosition = useCallback(() => {
    try {
      const rect = inputContainerRef.current?.getBoundingClientRect();
      if (rect) {
        setScrollBtnLeft(rect.left + rect.width / 2);
      }
    } catch {}
  }, []);

  const fetchMessageHistory = useCallback(async (id: string = conversationId) => {
    // Return early if id is empty
    if (!id) {
      setMessages([]);
      return;
    }

    try {
      const messagesFromCache = await MessageCache.get(id);
      // Check if messages have valid content
      if (Array.isArray(messagesFromCache)) {
        // Filter out invalid messages and empty assistant messages
        const validMessages = messagesFromCache.filter(
          (msg) => {
            if (!msg || typeof msg !== "object" || !("role" in msg)) {
              return false;
            }
            // Filter out empty assistant messages (these are leftover reasoning traces)
            if (msg.role === "assistant") {
              const content = msg.content;
              const reasoning = (msg as any).reasoning;
              // Keep if has actual text content OR meaningful reasoning
              const hasContent = content !== undefined && content !== null && content !== "";
              const hasReasoning = reasoning !== undefined && reasoning !== null && reasoning !== "";
              return hasContent || hasReasoning;
            }
            // Keep all other message types
            return msg.content !== undefined;
          }
        );

        setMessages(validMessages);
      } else {
        // If cache is invalid or empty, set messages to empty array
        console.warn(
          "Invalid messages format from cache or cache empty:",
          messagesFromCache
        );
        setMessages([]);
      }
    } catch (error) {
      console.error("Error fetching message history:", error);
      setMessages([]); // Ensure messages are cleared on error
    }
  }, [conversationId]);

  useEffect(() => {
    // initialize scroll button visibility on mount
    queueMicrotask(() => updateScrollBottomVisibility());
    // Recompute on window resize
    const onResize = () => updateScrollButtonPosition();
    window.addEventListener('resize', onResize);

     // Set up cache invalidation listener
     const cleanup = MessageCache.addInvalidationListener((invalidatedConversationId) => {
      const currentId = conversationId;
      if (currentId === invalidatedConversationId) {
        console.log(`Cache invalidated for current conversation ${currentId}, refetching messages`);
        // Refetch messages for the current conversation
        fetchMessageHistory(currentId);
      }
    });

    // Original onMount logic
    const initializeChat = async () => {
      if (id) {
        setConversationId(id);
        setLoading(true);
        await fetchMessageHistory(id);
        setLoading(false);
        instantScrollToBottom();
        Prism.highlightAll();
        // Verify only if conversation already exists (avoid 404 on brand new chats)
        verifyIfExists(id);
      } else {
        console.log("onMount: On new chat route (/chat)");
        setMessages([]);
        setConversationId(crypto.randomUUID().toString());
      }
    };

    initializeChat();

    // Clean up listener when component unmounts
    return () => {
      cleanup();
      try { window.removeEventListener('resize', onResize); } catch {}
    };
  }, []); // Empty deps - only run on mount

  useEffect(() => {
    // Cleanup WebSocket subscription on unmount
    return () => {
      if (unsubscribeWSRef.current) {
        try { unsubscribeWSRef.current(); } catch {}
        unsubscribeWSRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      Prism.highlightAll();
    }
    // update scroll button visibility when content changes
    queueMicrotask(() => updateScrollBottomVisibility());
  }, [messages, updateScrollBottomVisibility]);

  // Synthesize traces when loading a conversation (on mount or navigation)
  // This runs once when messages are loaded and we're not in an active session
  const synthesizedForConversationRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Reset synthesis tracking when conversation changes
    if (conversationId !== synthesizedForConversationRef.current) {
      synthesizedForConversationRef.current = null;
    }
  }, [conversationId]);

  useEffect(() => {
    // Don't synthesize while actively getting a response (real-time traces handle this)
    if (gettingResponse) return;
    
    // Don't synthesize if we already did for this conversation
    if (synthesizedForConversationRef.current === conversationId) return;
    
    // Don't synthesize if not in timeline mode
    if (useLegacyToolViz) return;
    
    // Need messages with tool calls
    if (!conversationId || messages.length === 0) return;
    const hasToolCalls = messages.some(m => m.role === 'tool_call');
    if (!hasToolCalls) return;
    
    console.log('[Traces] Synthesizing traces for:', conversationId, 'messages:', messages.length);
    synthesizedForConversationRef.current = conversationId;
    loadTracesFromAPI(conversationId, messages);
  }, [useLegacyToolViz, conversationId, messages, gettingResponse, loadTracesFromAPI]);

  //if ID changes normally from navigating to old conversation
  useEffect(() => {
    const handleIdChange = async () => {
      const currentId = id;
      // Original effect logic
      if (currentId && currentId !== conversationId) {
          // Reset active state when switching chats
          setGettingResponse(false);
          setMessages([]);
          // Clear traces from previous conversation
          clearTraces();
          setConversationId(currentId);
          // Drop any existing subscription; do not auto-subscribe unless active
          if (unsubscribeWSRef.current) { 
            try { unsubscribeWSRef.current(); } catch {} 
            unsubscribeWSRef.current = null; 
          }
          const startTime = performance.now(); 

          setLoading(true);
          await fetchMessageHistory(currentId);
          setLoading(false);

          const endTime = performance.now(); 
          const executionTime = endTime - startTime; 

          console.log(
            `fetchMessageHistory execution time: ${executionTime} milliseconds`
          );

          instantScrollToBottom();
          Prism.highlightAll();
          // Verify only if conversation already exists (avoid 404 on brand new chats)
          verifyIfExists(currentId);
      }
    };
    handleIdChange();
  }, [id, conversationId, fetchMessageHistory, instantScrollToBottom, verifyIfExists, clearTraces]);

  //if ID changes to undefined because new chat button clicked
  useEffect(() => {
    if (!id) {
      // Ensure no active indicator leaks into new chat view
      setGettingResponse(false);
      setMessages([]);
      const newId = crypto.randomUUID().toString();
      setConversationId(newId);
      // Do not subscribe for a new chat until a request starts
      if (unsubscribeWSRef.current) { 
        try { unsubscribeWSRef.current(); } catch {} 
        unsubscribeWSRef.current = null; 
      }
    }
  }, [id]);

  const handleSubmit = async (content: string | ContentItem[]) => {
    if (gettingResponse) return;
    setGettingResponse(true);
    
    // Clear execution traces from previous interaction
    clearTraces();

    // If it's the first message in a new chat, update the URL and sidebar
    const isNewChat = !id;
    const currentConversationId = conversationId;

    if (isNewChat) {
      console.log("isNewChat", currentConversationId);
      console.log("currentConversationId", currentConversationId);
      console.log("id", id);
      navigate(`/chat/${currentConversationId}`, { replace: true }); 
      const newChats = [...chats];
      newChats.unshift({
        id: currentConversationId,
        title: "New Chat",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setChats(newChats);
    }

    const newMessage: Message = {
      role: "user",
      content: content,
    };
    // Get current messages and add the new user message
    const currentMessages = [...messages];
    const updatedMessages = [...currentMessages, newMessage];

    setMessages(updatedMessages);
    // Optimistic assistant placeholder so typing dots appear immediately
    const assistantPlaceholder: Message = { role: "assistant", content: "", reasoning: "" };
    const withAssistantPlaceholder = [...updatedMessages, assistantPlaceholder];
    setMessages(withAssistantPlaceholder);
    MessageCache.set(currentConversationId, withAssistantPlaceholder);
    // Delay scroll slightly to ensure DOM update
    queueMicrotask(scrollToBottom);

    // Map content to the backend format (Gemini API structure)
    const parts: Array<{ text?: string; inline_data?: any; image_data?: any; file_data?: any }> = [];

    if (typeof content === "string") {
      parts.push({ text: content });
    } else {
      // Type guard for ImageData
      const isImageData = (c: any): c is ImageData =>
        typeof c === "object" && c !== null && c.kind === "image-url";
      // Type guard for PdfData
      const isPdfData = (c: any): c is PdfData =>
        typeof c === "object" && c !== null && c.kind === "pdf-file";

      for (const item of content) {
        if (typeof item.content === "string") {
          parts.push({ text: item.content });
        } else if (isImageData(item.content) && item.content.serverUrl) {
          parts.push({
            image_data: {
              mimeType: item.content.media_type,
              fileUrl: item.content.serverUrl,
            }
          });
        } else if (isPdfData(item.content) && item.content.serverUrl) {
          parts.push({
            file_data: {
              mimeType: item.content.media_type,
              fileUrl: item.content.serverUrl,
            }
          });
        } else {
          console.error("Encountered incomplete or unexpected content item:", item);
        }
      }
    }

    if (parts.length === 0) {
      console.error("No valid content to send after mapping.");
      setGettingResponse(false);
      return;
    }

    // WebSocket event handler for streaming responses
    const handleWebSocketEvent = (data: any) => {
      debug('ws:event', data?.type || 'raw_parts');
      
      // Track activity
      lastActivityAtRef.current = Date.now();
      
      // Handle execution traces (for real-time tool execution visualization)
      // These are UI-only and NOT stored in chat history
      if (data.type === "execution_trace") {
        console.log('[ChatWindow] Received trace:', data.status, data.label);
        handleTrace(data);
        debug('ws:trace', data.status, data.label);
        return; // Don't process as chat message - traces are non-semantic
      }
      
      // Handle history warnings (when model adapts conversation history and some content is filtered)
      // These appear when switching between models with incompatible features (e.g., images, files)
      if (data.type === "history_warnings") {
        console.log('[ChatWindow] History warnings:', data.warnings);
        setHistoryWarnings(data.warnings || []);
        // Auto-dismiss warnings after 10 seconds
        setTimeout(() => setHistoryWarnings([]), 10000);
        return;
      }
      
      // Handle frontend tool prompts (tool-specific messages, not chat content)
      if (data.type === "frontend_tool_prompt") {
        handleFrontendToolPromptMessage(
          data,
          (payload) => {
            wsManager.send(currentConversationId, payload);
          },
          // Callback for showing confirmation dialogs
          (request) => {
            setConfirmationRequest({
              ...request,
              onConfirm: () => {
                request.onConfirm();
                setConfirmationRequest(null);
              },
              onCancel: () => {
                request.onCancel();
                setConfirmationRequest(null);
              },
            });
          }
        );
        return; // Don't process as chat message
      }
      
      // Handle terminal events
      if (data.type === "done" || data.type === "stopped" || data.type === "error") {
        debug('ws:terminal', data.type);
        setGettingResponse(false);
        if (data.type === "error") {
          console.error("WebSocket error:", data.error || data.message);
        }
        // Backend closes connection after done - clean up
        if (unsubscribeWSRef.current) {
          try { unsubscribeWSRef.current(); } catch {}
          unsubscribeWSRef.current = null;
        }
        return;
      }

      // Handle structured tool_result messages
      if (data.type === "tool_result") {
        // Process frontend tools (Browser_Alert, Browser_Prompt, etc.) if applicable
        if (data.function_name && data.result && isFrontendTool(data.function_name)) {
          // Create a callback to send user responses back to the AI
          const sendResponseMessage = (message: string) => {
            if (message && !gettingResponse) {
              handleSubmit(message);
            }
          };
          
          processFrontendTool(data.function_name, data.result, sendResponseMessage);
        }
        
        setMessages(prevMessages => {
          const currentMessageState = [...prevMessages];
          
          // Try to find the matching tool_call and update its ID if it was temporary
          const toolCallIndex = currentMessageState.findIndex(
            msg => msg.role === "tool_call" && 
                   typeof msg.content === "object" &&
                   (msg.content as any).name === data.function_name &&
                   (msg.content as any).tool_call_id?.startsWith('temp_')
          );
          
          console.log('[TOOL_RESULT]', data.function_name, 'realId:', data.function_id, 'foundTempCallAt:', toolCallIndex);
          
          if (toolCallIndex !== -1) {
            // Update the temporary ID with the real one
            const oldId = (currentMessageState[toolCallIndex].content as any).tool_call_id;
            const updatedToolCall = { ...currentMessageState[toolCallIndex] };
            (updatedToolCall.content as any).tool_call_id = data.function_id;
            currentMessageState[toolCallIndex] = updatedToolCall;
            console.log('[ID_UPDATE]', data.function_name, 'from:', oldId, 'to:', data.function_id);
            debug('updated_tool_call_id', data.function_name, data.function_id);
          } else {
            console.warn('[NO_MATCH]', 'Could not find tool_call to update for', data.function_name);
          }
          
          const newToolResultMessage: Message = {
            role: "tool_result",
            content: {
              tool_call_id: data.function_id,
              name: data.function_name,
              content: data.result || data.result_json,
            }
          };
          currentMessageState.push(newToolResultMessage);
          debug('tool_result', data.function_name, 'id:', data.function_id);
          MessageCache.set(currentConversationId, [...currentMessageState]);
          return currentMessageState;
        });
        return;
      }

      // Handle raw parts format from backend (Gemini format)
      if (data.parts && Array.isArray(data.parts)) {
        setMessages(prevMessages => {
          let currentMessageState = [...prevMessages];
          let lastMessage = currentMessageState[currentMessageState.length - 1];
          
          // Ensure we have an assistant message
          if (!lastMessage || lastMessage.role !== "assistant") {
            const newAssistantMessage: Message = { role: "assistant", content: "", reasoning: "" };
            currentMessageState = [...currentMessageState, newAssistantMessage];
            lastMessage = newAssistantMessage;
          }
          
          // Process each part
          for (const part of data.parts) {
            // Handle reasoning content (chain-of-thought from models like Kimi K2.5)
            if (part.reasoning && typeof part.reasoning === "string") {
              const updated = { ...lastMessage } as Message;
              const prevReasoning = typeof lastMessage.reasoning === "string" ? lastMessage.reasoning : "";
              updated.reasoning = prevReasoning + part.reasoning;
              currentMessageState[currentMessageState.length - 1] = updated;
              lastMessage = updated;
              debug('raw_reasoning', { addLen: part.reasoning.length, totalLen: updated.reasoning?.length || 0 });
            }
            
            if (part.text && typeof lastMessage.content === "string") {
              const updated = { ...lastMessage } as Message;
              updated.content = (lastMessage.content as string) + part.text;
              currentMessageState[currentMessageState.length - 1] = updated;
              lastMessage = updated;
              debug('raw_text', { addLen: part.text.length, totalLen: updated.content.length });
            }
            
            // Handle function calls in raw format
            if (part.functionCall) {
              // Generate a temporary ID if backend doesn't provide one yet
              const hasId = part.functionCall.id && part.functionCall.id.length > 0;
              const toolCallId = hasId ? part.functionCall.id : `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const newToolCallMessage: Message = {
                role: "tool_call",
                content: {
                  tool_call_id: toolCallId,
                  name: part.functionCall.name,
                  args: part.functionCall.args,
                }
              };
              currentMessageState.push(newToolCallMessage);
              console.log('[TOOL_CALL]', part.functionCall.name, 'hasBackendId:', hasId, 'id:', toolCallId);
              debug('raw_tool_call', part.functionCall.name, 'id:', toolCallId);
            }
          }
          
          MessageCache.set(currentConversationId, [...currentMessageState]);
          return currentMessageState;
        });
        return;
      }

      // Handle structured event format (for backwards compatibility)
      setMessages(prevMessages => {
        let currentMessageState = [...prevMessages];
        let messagesChanged = false;
        
        let lastMessage = currentMessageState[currentMessageState.length - 1];
        const isAssistantMessage = lastMessage?.role === "assistant";

        if (!isAssistantMessage && (data.type === "part_start" || data.type === "part_delta" || data.type === "content_chunk")) {
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
              debug('text_delta', { addLen: (part.content || '').length, totalLen: newContent.length });
              messagesChanged = true;
            }
            
            if (part.part_kind === "reasoning") {
              const deltaText = typeof (part as any).reasoning === 'string' && (part as any).reasoning !== ''
                ? (part as any).reasoning
                : (typeof (part as any).content === 'string' ? (part as any).content : '');
              if (deltaText) {
                const prevReasoning = typeof lastMessage.reasoning === "string" ? lastMessage.reasoning : "";
                updated.reasoning = prevReasoning + deltaText;
                debug('reasoning_delta', { addLen: deltaText.length, totalLen: updated.reasoning.length });
                messagesChanged = true;
              }
            }
            
            if (messagesChanged) {
              currentMessageState[currentMessageState.length - 1] = updated;
            }
          }
        } 
        else if (data.type === "content_chunk" && data.data) {
          if (lastMessage?.role === "assistant" && typeof lastMessage.content === "string") {
            const updated = { ...lastMessage } as Message;
            const newContent = (lastMessage.content as string) + data.data;
            updated.content = newContent;
            debug('content_chunk', { addLen: data.data.length, totalLen: newContent.length });
            currentMessageState[currentMessageState.length - 1] = updated;
            messagesChanged = true;
          }
        }
        else if (data.type === "tool_call" && data.data?.tool_call) {
          debug('tool_call', Object.keys(data.data.tool_call ?? {}));
          const newToolCallMessage: Message = { role: "tool_call", content: data.data.tool_call };
          currentMessageState.push(newToolCallMessage);
          messagesChanged = true;
        }
        else if (data.type === "tool_result" && data.data?.tool_result) {
          debug('tool_result', typeof data.data.tool_result);
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

    // Subscribe to WebSocket events for this session
    let unsubscribeCloseHandler: (() => void) | null = null;
    
    const ensureSubscription = async () => {
      // Always close existing connection before creating new one (backend closes after each message)
      if (unsubscribeWSRef.current) {
        debug('ws:cleanup', 'Closing previous connection');
        try { unsubscribeWSRef.current(); } catch {}
        unsubscribeWSRef.current = null;
      }
      if (unsubscribeCloseHandler) {
        try { unsubscribeCloseHandler(); } catch {}
        unsubscribeCloseHandler = null;
      }
      
      // Force close any existing connection for this session
      wsManager.close(currentConversationId);
      
      // Get selected model from localStorage
      const selectedModel = localStorage.getItem("preferred_model") || undefined;
      debug('ws:subscribe', currentConversationId, 'model:', selectedModel);
      
      // Register close handler to stop loading state on unexpected disconnect
      unsubscribeCloseHandler = wsManager.onClose(currentConversationId, (sessionId, code, reason) => {
        debug('ws:closed', sessionId, code, reason);
        // Stop loading state on any close (expected or unexpected)
        setGettingResponse(false);
      });
      
      // Create new subscription (will create new WebSocket connection)
      unsubscribeWSRef.current = await wsManager.subscribe(currentConversationId, handleWebSocketEvent, selectedModel);
    };

    try {
      abortControllerRef.current = false;
      
      // Create fresh WebSocket connection for this message
      ensureSubscription();
      
      // Wait for WebSocket to be ready
      const maxWaitTime = 5000; // 5 seconds max
      const checkInterval = 100; // Check every 100ms
      const maxAttempts = maxWaitTime / checkInterval;
      
      let connected = false;
      for (let i = 0; i < maxAttempts; i++) {
        const wsState = wsManager.getState(currentConversationId);
        if (wsState === WebSocket.OPEN) {
          connected = true;
          debug('ws:connected', `Connection ready after ${i * checkInterval}ms`);
          break;
        }
        await new Promise(resolve => setTimeout(resolve, checkInterval));
      }

      if (!connected) {
        const wsState = wsManager.getState(currentConversationId);
        console.error('[WS] Connection failed. State:', wsState, 'Expected:', WebSocket.OPEN);
        throw new Error(`WebSocket connection timeout. State: ${wsState}`);
      }

      // Send message via WebSocket in Gemini API format
      const messagePayload = {
        message: {
          role: "user",
          content: {
            parts: parts
          }
        }
      };
      
      debug('ws:send', messagePayload);
      const sent = wsManager.send(currentConversationId, messagePayload);
      
      if (!sent) {
        throw new Error("Failed to send message via WebSocket - connection not ready");
      }

      // Verify conversation exists (for history persistence)
      verifyIfExists(currentConversationId);
      
    } catch (error) {
      console.error("Error sending message:", error);
      setGettingResponse(false);
      
      // Revert optimistic messages (user + assistant placeholder)
      setMessages(prev => {
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
      
      if (!(error instanceof DOMException && error.name === 'AbortError') && !abortControllerRef.current) {
        alert(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const handleFileAttachment = () => {
    console.log("File attachment initiated");
  };


  const handleStopRequest = async () => {
    abortControllerRef.current = true;
    setGettingResponse(false);
    
    // Close the WebSocket connection to stop streaming
    try {
      wsManager.close(conversationId);
      console.log('[WS] Stopped chat by closing WebSocket connection');
    } catch (e) {
      console.error("Failed to stop chat:", e);
    }
  };

  // Message queue management
  const handleQueueMessage = useCallback((message: QueuedMessage) => {
    setMessageQueue(prev => [...prev, message]);
  }, []);

  const handleRemoveFromQueue = useCallback((id: string) => {
    setMessageQueue(prev => prev.filter(msg => msg.id !== id));
  }, []);

  const handleClearQueue = useCallback(() => {
    setMessageQueue([]);
  }, []);

  // Process queued messages when agent finishes
  const prevGettingResponseRef = useRef(gettingResponse);
  useEffect(() => {
    // Detect transition from gettingResponse=true to gettingResponse=false
    if (prevGettingResponseRef.current && !gettingResponse && messageQueue.length > 0) {
      // Combine all queued messages into one
      const combinedText = messageQueue.map(msg => msg.text).join('\n\n');
      console.log('[Queue] Processing queued messages:', messageQueue.length, 'combined length:', combinedText.length);
      
      // Clear the queue
      setMessageQueue([]);
      
      // Send the combined message after a small delay to let UI settle
      setTimeout(() => {
        handleSubmit(combinedText);
      }, 100);
    }
    prevGettingResponseRef.current = gettingResponse;
  }, [gettingResponse, messageQueue, handleSubmit]);

  return (
    <div className="flex w-full h-full flex-col justify-between z-5 bg-background rounded-lg">
      {/* Confirmation Dialog for Confirm_With_User tool */}
      <ConfirmationDialog
        open={confirmationRequest !== null}
        title={confirmationRequest?.title}
        message={confirmationRequest?.message || ""}
        confirmLabel={confirmationRequest?.confirmLabel}
        cancelLabel={confirmationRequest?.cancelLabel}
        onConfirm={() => confirmationRequest?.onConfirm()}
        onCancel={() => confirmationRequest?.onCancel()}
      />
      
      {/* History warnings banner (shown when switching between models with incompatible features) */}
      <HistoryWarningBanner
        warnings={historyWarnings}
        onDismiss={() => setHistoryWarnings([])}
      />
      
      {/* Debug traces panel - shows mock traces for styling when VITE_DEBUG_TRACES=true */}
      {import.meta.env.VITE_DEBUG_TRACES === 'true' && (
        <DebugTracesPanel />
      )}
      
      {/* Main Content Area: Takes full width, allows vertical flex. NO CENTERING HERE. */}
      <div className="flex-1 w-full overflow-hidden flex flex-col">
        {/* Show existing chat content OR NewChat component in fallback */}
        {id ? (
          /* Container for Existing Chat UI (Loading/Messages/Mic): Takes full width/height */
          <div className="w-full h-full flex flex-col flex-1">
            {loading ? (
              /* Skeleton Loading UI: Centered with max-width */
              <div className="w-full h-full flex flex-col gap-6 p-4 md:max-w-[900px] mx-auto">
                {[...Array(5)].map((_, index) => (
                  <div
                    key={index}
                    className={`flex gap-4 ${
                      index % 2 === 0 ? "justify-start" : "justify-end"
                    }`}
                  >
                    {index % 2 !== 0 && (
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-[200px] ml-auto" />
                        <Skeleton className="h-4 w-[350px] ml-auto" />
                      </div>
                    )}
                    <Skeleton className="h-10 w-10 rounded-full" />
                    {index % 2 === 0 && (
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-[250px]" />
                        <Skeleton className="h-4 w-[400px]" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              /* Show Messages */
              (
                <>
                  {/* Chat messages container: Full width scrollable area, content centered with max-width */}
                  <div
                    ref={chatContainerRef}
                    className={`flex-1 overflow-y-auto overscroll-contain Chat-Container scrollbar rounded-t-lg w-full`}
                    onScroll={() => { saveScrollPosition(); updateScrollBottomVisibility(); }}
                  >
                    {/* Inner div for message content centering and padding - REMOVED PADDING  md:max-w-[900px] mx-auto pt-20*/}
                    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-10 pt-safe-offset-10 ">
                      {memoizedMessages.map((message, index) => {
                        // User and assistant messages always render normally
                        if (message.role === "user" || message.role === "assistant") {
                          return (
                            <MessageItem
                              key={index}
                              message={message}
                              messages={memoizedMessages}
                              isLast={index === memoizedMessages.length - 1}
                              gettingResponse={
                                gettingResponse &&
                                index === memoizedMessages.length - 1
                              }
                              isLastUser={index === lastUserIndex}
                            />
                          );
                        }
                        
                        // Tool messages: legacy mode shows the old widget
                        if (useLegacyToolViz) {
                          return (
                            <ToolMessageRenderer
                              key={index}
                              message={message}
                              messages={memoizedMessages}
                              index={index}
                              toolCallMap={toolCallMap}
                            />
                          );
                        }
                        
                        // In trace/timeline mode: render timeline for consecutive tool_calls as a group
                        // Skip tool_result messages (they're shown in the timeline)
                        if (message.role === "tool_result") {
                          return null;
                        }
                        
                        // For tool_call: only render at the FIRST one in a consecutive group
                        if (message.role === "tool_call" && typeof message.content === "object" && message.content !== null) {
                          // Check if previous message was also a tool_call or tool_result - if so, skip
                          const prevMessage = index > 0 ? memoizedMessages[index - 1] : null;
                          if (prevMessage?.role === "tool_call" || prevMessage?.role === "tool_result") {
                            return null; // Already rendered at the first tool_call in this group
                          }
                          
                          // This is the first tool_call in a consecutive group
                          // Collect all unique tool_call IDs in this group
                          const groupToolCallIds = new Set<string>();
                          for (let i = index; i < memoizedMessages.length; i++) {
                            const msg = memoizedMessages[i];
                            if (msg.role === "tool_call" && typeof msg.content === "object" && msg.content !== null) {
                              const c = msg.content as any;
                              if (c.tool_call_id) {
                                groupToolCallIds.add(c.tool_call_id);
                              }
                            } else if (msg.role === "tool_result") {
                              continue; // tool_results are part of the group
                            } else {
                              break; // Hit a non-tool message, stop
                            }
                          }
                          
                          // Build traces for this group
                          const groupTraces = new Map<string, typeof traces extends Map<string, infer V> ? V : never>();
                          for (const toolCallId of groupToolCallIds) {
                            if (traces.has(toolCallId)) {
                              groupTraces.set(toolCallId, traces.get(toolCallId)!);
                            }
                          }
                          
                          if (groupTraces.size > 0) {
                            return (
                              <div key={index} className="pt-3 pl-3 pr-3">
                                <ExecutionTraceTimeline 
                                  traces={groupTraces} 
                                  isExpanded={hasActiveTraces()}
                                />
                              </div>
                            );
                          }
                          
                          // Fallback if no traces - check if tool is still running
                          const content = message.content as any;
                          const toolName = content.name || 'Tool';
                          const toolCallId = content.tool_call_id;
                          
                          // Check if this tool_call has a corresponding tool_result
                          const hasResult = memoizedMessages.some(
                            m => m.role === 'tool_result' && 
                            typeof m.content === 'object' && 
                            (m.content as any)?.tool_call_id === toolCallId
                          );
                          
                          // Tool is running if: we're getting a response AND this is the last tool_call AND no result yet
                          const isLastToolCall = !memoizedMessages.slice(index + 1).some(m => m.role === 'tool_call');
                          const isRunning = gettingResponse && isLastToolCall && !hasResult;
                          
                          return (
                            <div key={index} className="pt-3 pl-5 pr-3 text-sm flex items-center gap-2">
                              <span className={`inline-flex rounded-full h-2 w-2 ${isRunning ? 'bg-zinc-600 dark:bg-zinc-300' : 'bg-zinc-400 dark:bg-zinc-500'}`}></span>
                              {isRunning ? (
                                <FallbackShimmerText text={toolName} />
                              ) : (
                                <span className="text-muted-foreground">{toolName}</span>
                              )}
                            </div>
                          );
                        }
                        
                        return null;
                      })}
                      {gettingResponse &&
                        memoizedMessages.length > 0 &&
                        memoizedMessages[memoizedMessages.length - 1].role === "user" && (
                        <div className="pl-5 pt-2">
                          <span className="loading-dots">
                            <span></span>
                            <span></span>
                            <span></span>
                          </span>
                        </div>
                      )}
                      <div id="last-message" className="h-1"></div> 
                    </div>
                  </div>
                  {/* Floating Scroll to bottom button (positioned above input bar, centered to chat body) */}
                  {showScrollToBottom && (
                    <div
                      className="fixed z-[1050]"
                      style={{ bottom: `${((inputContainerRef.current?.offsetHeight ?? 84) + 12)}px`, left: `${scrollBtnLeft ?? window.innerWidth / 2}px`, transform: 'translateX(-50%)' }}
                    >
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-full bg-card/70 backdrop-blur border border-border/60 shadow-sm text-xs text-foreground hover:bg-card/90 transition-colors flex items-center gap-1.5"
                        onClick={() => scrollContainerToBottom()}
                      >
                        <span>Scroll to bottom</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="opacity-80">
                          <path d="M12 16a1 1 0 0 1-.707-.293l-6-6a1 1 0 1 1 1.414-1.414L12 13.586l5.293-5.293a1 1 0 0 1 1.414 1.414l-6 6A1 1 0 0 1 12 16z"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        ) : (
          // Render NewChat centered using flexbox and margins
          <div className="flex-1 flex flex-col w-full md:max-w-[900px] mx-auto justify-center">
            <NewChat onPromptClick={handleSubmit} />
          </div>
        )}
      </div>

      {/* Chat Input Area: Rendered below the main content area */}
      <div className="w-full md:max-w-[760px] mx-auto" ref={inputContainerRef}>
        <ChatInput
          onSubmit={handleSubmit}
          gettingResponse={gettingResponse}
          setIsListening={() => {}}
          handleStopRequest={handleStopRequest}
          conversationId={conversationId}
          messageQueue={messageQueue}
          onQueueMessage={handleQueueMessage}
          onRemoveFromQueue={handleRemoveFromQueue}
          onClearQueue={handleClearQueue}
        />
      </div>
    </div>
  );
}

/**
 * Debug panel for styling tool traces without needing to send real messages
 * Only shown when VITE_DEBUG_TRACES=true
 */
function DebugTracesPanel() {
  const [mockTraces, setMockTraces] = useState<Map<string, any>>(new Map());
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const startMockTraces = () => {
    setIsRunning(true);
    const toolCallId = `debug_${Date.now()}`;
    const now = Date.now();
    
    // Initial trace - start executing code
    setMockTraces(new Map([[toolCallId, {
      tool_call_id: toolCallId,
      traces: [{
        type: 'execution_trace',
        trace_id: `${toolCallId}_main`,
        tool_call_id: toolCallId,
        tool: 'code',
        operation: 'Execute_TypeScript',
        status: 'start',
        label: 'Executing code',
        timestamp: now,
      }],
      isActive: true,
      startTime: now,
    }]]));

    // Simulate trace progression
    let step = 0;
    intervalRef.current = setInterval(() => {
      step++;
      const stepTime = now + step * 800;
      
      setMockTraces(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(toolCallId);
        if (!existing) return prev;
        
        const newTraces = [...existing.traces];
        
        if (step === 1) {
          // Start search
          newTraces.push({
            type: 'execution_trace',
            trace_id: `${toolCallId}_search`,
            tool_call_id: toolCallId,
            tool: 'tavily',
            operation: 'search',
            status: 'start',
            label: 'Searching: "chicago bears"',
            timestamp: stepTime,
          });
        } else if (step === 2) {
          // Search progress
          newTraces.push({
            type: 'execution_trace',
            trace_id: `${toolCallId}_search`,
            tool_call_id: toolCallId,
            tool: 'tavily',
            operation: 'search',
            status: 'progress',
            label: 'Querying search index...',
            timestamp: stepTime,
          });
        } else if (step === 3) {
          // Search end
          newTraces.push({
            type: 'execution_trace',
            trace_id: `${toolCallId}_search`,
            tool_call_id: toolCallId,
            tool: 'tavily',
            operation: 'search',
            status: 'end',
            label: 'Found 5 results',
            timestamp: stepTime,
            duration_ms: 1600,
          });
        } else if (step === 4) {
          // Start math
          newTraces.push({
            type: 'execution_trace',
            trace_id: `${toolCallId}_math`,
            tool_call_id: toolCallId,
            tool: 'math',
            operation: 'evaluate',
            status: 'start',
            label: 'Evaluating: 2 + 2 * 3 - 8 / 4',
            timestamp: stepTime,
          });
        } else if (step === 5) {
          // Math end
          newTraces.push({
            type: 'execution_trace',
            trace_id: `${toolCallId}_math`,
            tool_call_id: toolCallId,
            tool: 'math',
            operation: 'evaluate',
            status: 'end',
            label: 'Result: 6',
            timestamp: stepTime,
            duration_ms: 50,
          });
        } else if (step === 6) {
          // Main execution end
          newTraces.push({
            type: 'execution_trace',
            trace_id: `${toolCallId}_main`,
            tool_call_id: toolCallId,
            tool: 'code',
            operation: 'Execute_TypeScript',
            status: 'end',
            label: 'Executed code',
            timestamp: stepTime,
            duration_ms: 4800,
          });
          
          // Stop interval
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setIsRunning(false);
        }
        
        newMap.set(toolCallId, {
          ...existing,
          traces: newTraces,
          isActive: step < 6,
          endTime: step >= 6 ? stepTime : undefined,
        });
        
        return newMap;
      });
    }, 800);
  };

  const stopMockTraces = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  };

  const clearMockTraces = () => {
    stopMockTraces();
    setMockTraces(new Map());
  };

  return (
    <div className="border-b border-border bg-yellow-500/10 p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm font-medium text-yellow-600 dark:text-yellow-400">DEBUG TRACES</span>
          <button
            onClick={isRunning ? stopMockTraces : startMockTraces}
            className={`px-3 py-1 text-sm rounded ${isRunning ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}
          >
            {isRunning ? 'Stop' : 'Start Mock Traces'}
          </button>
          <button
            onClick={clearMockTraces}
            className="px-3 py-1 text-sm rounded bg-gray-500 text-white"
          >
            Clear
          </button>
        </div>
        
        {/* Show the fallback tool display (green dot + shimmer) */}
        <div className="mb-4 p-3 bg-background rounded border border-border">
          <div className="text-xs text-muted-foreground mb-2">Fallback Display (no traces):</div>
          <div className="pt-3 pl-5 pr-3 text-sm flex items-center gap-2">
            <span className="inline-flex rounded-full h-2 w-2 bg-green-500 animate-pulse"></span>
            <style>{`
              @keyframes shimmer-sweep {
                0% { background-position: -150% 0; }
                100% { background-position: 150% 0; }
              }
            `}</style>
            <span style={{
              color: 'rgba(255, 255, 255, 0.1)',
              background: 'linear-gradient(90deg, transparent 20%, rgba(255, 255, 255, 0.8) 50%, transparent 80%)',
              backgroundSize: '150% 100%',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              animation: 'shimmer-sweep 0.8s linear infinite',
            }}>Search</span>
          </div>
        </div>
        
        {/* Show ExecutionTraceTimeline with mock traces */}
        {mockTraces.size > 0 && (
          <div className="p-3 bg-background rounded border border-border">
            <div className="text-xs text-muted-foreground mb-2">ExecutionTraceTimeline:</div>
            <ExecutionTraceTimeline traces={mockTraces} isExpanded={true} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Shimmer text for fallback tool display (when no traces available)
 */
function FallbackShimmerText({ text }: { text: string }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  const baseColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const shimmerColor = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)';
  
  return (
    <>
      <style>{`
        @keyframes shimmer-sweep {
          0% { background-position: -150% 0; }
          100% { background-position: 150% 0; }
        }
      `}</style>
      <span style={{
        color: baseColor,
        background: `linear-gradient(90deg, transparent 20%, ${shimmerColor} 50%, transparent 80%)`,
        backgroundSize: '150% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        animation: 'shimmer-sweep 0.8s linear infinite',
      }}>{text}</span>
    </>
  );
}

export default ChatWindow;
