import { useState, useRef, useEffect } from "react";
import Prism from "prismjs";
import "./index.css";
import { ContentItem, Message } from "../models/models";
import MicrophoneVisualizer from "../../components/MicrophoneVisualizer";
import { useSidebar } from "@/components/ui/sidebar";
import { useChatContext } from "@/layout";
import { useParams } from "react-router-dom";
import AssistantMessageRenderer from "../components/AssitantMessageRenderer";

const HOST = import.meta.env.VITE_CHAT_HOST;

interface DBMessage {
  id: number;
  created_at: string;
  conversation_id: number;
  content: string;
  is_user_message: boolean;
  updated_at: string;
}

type ChatMessage = Message;

function convertToChatMessages(messages: DBMessage[]): ChatMessage[] {
  return messages
    .map((message) => {
      try {
        const parsed = JSON.parse(message.content);
        const messageType = parsed.kind || parsed.type;

        // Handle model requests
        if (messageType === "request") {
          // Find the UserPromptPart in the parts array
          const userPart = parsed.parts.find((part: any) => part.type === "UserPromptPart");
          if (userPart) {
            // Handle array content (mixed content including ImageUrl)
            if (Array.isArray(userPart.content)) {
              return {
                role: "user",
                content: userPart.content.map((item: any) => {
                  // Handle string type items
                  if (item.type === "str") {
                    return {
                      type: "str",
                      content: item.content,
                      part_kind: "text"
                    };
                  }
                  // Handle ImageUrl, AudioUrl, DocumentUrl objects
                  if (item.type && item.content && item.part_kind && item.part_kind.endsWith("-url")) {
                    return {
                      content: {
                        url: item.content.url,
                        media_type: item.part_kind.replace("-url", "/*"),
                        kind: item.part_kind,
                        serverUrl: item.content.url
                      }
                    };
                  }
                  return { content: JSON.stringify(item) };
                })
              };
            }
            // Handle single string content
            if (typeof userPart.content === "string") {
              return {
                role: "user",
                content: userPart.content
              };
            }
            // Handle single object content
            return {
              role: "user",
              content: [{
                content: userPart.content
              }]
            };
          }
          const toolReturnPart = parsed.parts.find(
            (part: any) => part.type === "ToolReturnPart"
          );
          if (toolReturnPart) {
            return {
              role: "tool_result",
              content: JSON.stringify(toolReturnPart.content),
            };
          }
          return null;
        }

        // Handle model responses
        if (messageType === "response") {
          //to rerturn
          let result = {
            role: "assistant",
            content: "",
            reasoning: "",
          };

          for (const part of parsed.parts) {
            if (part.type === "TextPart") {
              result.content += part.content;
            }
            if (part.type === "ReasoningPart") {
              result.reasoning += part.content;
            }
            if (parsed.parts[0].type === "ToolCallPart") {
              return {
                role: "tool_call",
                content: JSON.stringify(parsed.parts[0].content),
              };
            }
          }

          return result;
        }

        return null;
      } catch (e) {
        console.error("Error parsing message:", e);
        return null;
      }
    })
    .filter((message): message is ChatMessage => message !== null);
}

import ChatInput from "../components/ChatInput";

function ChatWindow() {
  const { open, openMobile, isMobile } = useSidebar();
  const [gettingResponse, setGettingResponse] = useState<boolean>(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { id } = useParams();
  const [conversationId, setConversationId] = useState<string>(
    id || crypto.randomUUID().toString()
  );
  const [isMuted, setIsMuted] = useState<boolean>(false);

  // Add abort controller ref
  const abortControllerRef = useRef<boolean>(false);
  const { fetchConversations } = useChatContext();

  // Ref to track if the *last* action was submitting a user message

  function scrollToBottom() {
    if (messagesEndRef.current) {
      const scrollOptions: ScrollIntoViewOptions = {
        behavior: "smooth",
        block: "end",
        inline: "nearest",
      };
      messagesEndRef.current.scrollIntoView(scrollOptions);
    }
  }

  useEffect(() => {
    if (id) {
      setConversationId(id);
    }
    (async () => {
      await fetchMessageHistory(id);

      Prism.highlightAll();
    })();
  }, [id]);

  useEffect(() => {
    Prism.highlightAll();
    console.log("messages", messages);
  }, [messages]);

  //   //when chats load set messages
  useEffect(() => {
    // load messages based on chat_id 123 and user_id random
    (async () => {
      await fetchMessageHistory();

      Prism.highlightAll();
      scrollToBottom();
    })();
  }, []);

  const handleSubmit = async (content: string | ContentItem[]) => {
    if (gettingResponse) return;

    setGettingResponse(true);

    const newMessage: Message = {
      role: "user",
      content: content,
    };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);

    setTimeout(() => {
      scrollToBottom();
    }, 100);

    const url = new URL(`${HOST}/api/v1/chats/chat`);
    const requestBody = {
      content: typeof content === "string"
        ? [{ content: content }]
        : content.map(item => {
            if (typeof item.content === "string") {
              return {
                content: item.content
              };
            } else if (item.content.serverUrl) {
              return {
                content: {
                  url: item.content.serverUrl,
                  media_type: item.content.media_type,
                  kind: "image-url"
                }
              };
            } else {
              throw new Error("Image upload data is incomplete.");
            }
          })
    };
    url.searchParams.append("conversation_id", conversationId);

    try {
      // Reset abort flag at start of new request
      abortControllerRef.current = false;

      // Import authFetch to add auth token to the request
      const { authFetch } = await import("@/lib/utils");

      const response = await authFetch(url.toString(), {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";

      while (true) {
        // Check if request was aborted
        if (abortControllerRef.current) {
          reader.cancel();
          break;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE messages from buffer
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || ""; // Keep the last incomplete chunk in the buffer

        let newAssistantMessage = {
          role: "assistant",
          content: "",
          reasoning: "",
        };
        let newToolCallMessage = {
          role: "tool_call",
          content: "",
        };

        let newToolResultMessage = {
          role: "tool_result",
          content: "",
        };

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const jsonString = line.slice(6);
              const data = JSON.parse(jsonString);
              // console.log("data:", data);
              // console.log("event kind:", data.type);
              if (data.type === "part_start") {
                //if it's a part start we can create a new message
                //it it's start we push the new message to the messages
                updatedMessages.push(newAssistantMessage);

                if (data.data.part.part_kind === "text") {
                  updatedMessages[updatedMessages.length - 1].content +=
                    data.data.part.content;
                  // console.log("Text part:", data.data.part.content);
                } else if (data.data.part.part_kind === "reasoning") {
                  updatedMessages[updatedMessages.length - 1].reasoning +=
                    data.data.part.reasoning;
                  // console.log("Reasoning part:", data.data.part.reasoning);
                }
              } else if (data.type === "part_delta") {
                if (data.data.delta.part_kind === "text") {
                  // console.log("Text delta:", data.data.delta.content);
                  updatedMessages[updatedMessages.length - 1].content +=
                    data.data.delta.content;
                } else if (data.data.delta.part_kind === "reasoning") {
                  // console.log("Reasoning delta:", data.data.delta.reasoning);
                  updatedMessages[updatedMessages.length - 1].reasoning +=
                    data.data.delta.reasoning;
                }
              } else if (data.type === "tool_call") {
                newToolCallMessage.content = data.data.tool_call;
                updatedMessages.push(newToolCallMessage);
              } else if (data.type === "tool_result") {
                newToolResultMessage.content = data.data.tool_result;
                updatedMessages.push(newToolResultMessage);
              }
              // console.log("newMessages", updatedMessages);
              setMessages([...updatedMessages]); // Trigger re-render with the updated array
            } catch (e) {
              console.error("Error parsing JSON:", e);
            }
          }
        }
      }

      if (window.location.pathname === "/") {
        window.history.pushState({}, "", `/chat/${conversationId}`);
        fetchConversations();
      }
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setGettingResponse(false);
    }
  };

  const fetchMessageHistory = async (id: string = conversationId) => {
    const url = new URL(`${HOST}/api/v1/chats/conversations/${id}/messages`);
    try {
      // Import here to avoid circular dependency
      const { authFetch } = await import("@/lib/utils");

      const response = await authFetch(url.toString(), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      // console.log(data.messages);
      const chatMessages = convertToChatMessages(data.messages);
      console.log("chatMessages", chatMessages);
      // console.log(data);
      setMessages(chatMessages);
    } catch (error) {
      console.error("Failed to fetch chat history:", error);
    }
  };

  const handleFileAttachment = () => {
    console.log("File attachment initiated");
  };

  const handleMicrophoneClose = () => {
    if (navigator.mediaDevices) {
      console.log("Stopping microphone");
      // Stop all microphone tracks
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          //print all tracks
          console.log(stream.getTracks());
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch((err) => console.error("Error accessing microphone:", err));
    }
    setIsListening(false);
  };

  const handleMicrophoneMute = () => {
    if (navigator.mediaDevices) {
      // Stop all microphone tracks
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          stream.getTracks().forEach((track) => track.stop());
        })
        .catch((err) => console.error("Error accessing microphone:", err));
    }
    setIsMuted(!isMuted);
  };

  // Update the stop button click handler
  const handleStopRequest = () => {
    abortControllerRef.current = true;
    setGettingResponse(false);
  };

  useEffect(() => {
    // height of last message must content he + 80% of parent height calculate then set as pixels
    const lastMessage = document.getElementById("last-message");
    if (lastMessage) {
      const contentHeight =
        lastMessage.querySelector(".message-content")?.clientHeight ?? 0;
      const parentHeight = lastMessage.clientHeight ?? 0;
      const newHeight = contentHeight + parentHeight * 0.7;
      lastMessage.style.height = `${newHeight}px`;
    }
  }, [messages]);

  return (
    <div className="flex w-full h-full flex-col justify-center items-center bg-gray-50 dark:bg-gray-900 ">
      {isListening ? (
        <div className="flex-1 flex items-center justify-center">
          <MicrophoneVisualizer
            isListening={!isMuted}
            onClose={handleMicrophoneClose}
            onMute={handleMicrophoneMute}
          />
        </div>
      ) : (
        <>
          <div
            className={`flex-1 flex flex-col items-center overflow-y-auto space-y-6 Chat-Container
            max-h-[calc(100vh-134px)] 
            md:max-h-[calc(100vh-136px)] 
            ${
              isMobile
                ? openMobile
                  ? "w-[calc(100vw-var(--sidebar-width))]"
                  : "w-full"
                : open
                ? "w-[calc(100vw-var(--sidebar-width))]"
                : "w-full"
            }
            ${messages.length === 0 ? "h-full" : ""}
            `}
          >
            {messages.map((message, index) =>
              message.role === "user" || message.role === "assistant" ? (
                <div
                  key={index}
                  ref={
                    index === messages.length - 1 ? messagesEndRef : undefined
                  }
                  className={`md:max-w-[900px] w-full flex message${
                    message.role === "user"
                      ? " user justify-end items-start "
                      : " assistant justify-start items-start"
                  } ${index === messages.length - 1 ? "min-h-full" : ""}`}
                  id={index === messages.length - 1 ? "last-message" : ""}
                >
                  <div
                    className={`message-content ${
                      message.role === "user"
                        ? "max-w-[85%] flex items-end self-start"
                        : "w-full"
                    } rounded-3xl pt-2 pb-2 pl-4 pr-4 ${
                      message.role === "user"
                        ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        : "bg-transparent"
                    } break-words overflow-hidden`}
                  >
                    {message.role === "user" ? (
                      <div className="text-sm md:text-base flex flex-col gap-8 w-full items-end">
                        {Array.isArray(message.content)
                          ? message.content.map((item, idx) => {
                              if (typeof item.content === "string") {
                                return (
                                  <div key={idx} className="text-base leading-relaxed m-2">
                                    {item.content}
                                  </div>
                                );
                              }
                              if (typeof item.content === "object") {
                                if ("kind" in item.content && item.content.kind === "image-url") {
                                  return (
                                    <div key={idx} className="flex justify-end">
                                      <img
                                        src={item.content.serverUrl || item.content.url}
                                        alt="Uploaded content"
                                        className="h-80 w-80 object-cover rounded-xl shadow-lg hover:shadow-xl transition-shadow mt-4 ml-4 mr-4"
                                      />
                                    </div>
                                  );
                                }
                                if ("content" in item.content && typeof item.content.content === "string") {
                                  return (
                                    <div key={idx} className="text-base leading-relaxed m-2">
                                      {item.content.content}
                                    </div>
                                  );
                                }
                              }
                              return (
                                <div key={idx} className="text-base leading-relaxed m-2">
                                  {JSON.stringify(item.content)}
                                </div>
                              );
                            })
                          : (message.content as string)}
                      </div>
                    ) : (
                      <AssistantMessageRenderer
                        fullContent={message.content as string}
                        gettingResponse={gettingResponse}
                      />
                    )}
                  </div>
                </div>
              ) : null
            )}
            {messages.length > 0 &&
              messages[messages.length - 1].role === "tool_call" && (
                <div className="md:max-w-[900px] w-full flex justify-start min-h-full">
                  <span className="wave-text ml-5 pl-4">
                    {((
                      messages[messages.length - 1].content as { name: string }
                    ).name as string) || "processing..."}
                  </span>
                </div>
              )}
            {messages.length > 0 &&
              messages[messages.length - 1].role === "tool_result" && (
                <div className="md:max-w-[900px] w-full flex justify-start min-h-full">
                  <span className="wave-text ml-5 pl-4">processing...</span>
                </div>
              )}
            <style>
              {`
                @keyframes continuous-wave-forward-smooth {
                  0% {
                    background-position: 0% 50%;
                  }
                  100% {
                    background-position: -600% 50%;
                  }
                }
                .wave-text {
                  font-size: 1rem;
                  font-weight: 500;
                  color: gray;
                  background: linear-gradient(
                    90deg,
                    gray 0%,
                    gray 40%,
                    black 50%,
                    gray 60%,
                    gray 100%
                  );
                  background-size: 300% 100%;
                  background-clip: text;
                  -webkit-background-clip: text;
                  color: transparent;
                  animation: continuous-wave-forward-smooth 5s infinite linear;
                }

                @keyframes fadeIn {
                  from {
                    opacity: 0;
                    transform: translateY(10px);
                  }
                  to {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }

                .message {
                  animation: fadeIn 0.3s ease-out forwards;
                }

                .message-content {
                  animation: fadeIn 0.3s ease-out forwards;
                }
              `}
            </style>
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t md:border md:rounded-lg md:mb-4 md:shadow-md border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800 w-full md:max-w-[900px]">
            <ChatInput
              onSubmit={handleSubmit}
              gettingResponse={gettingResponse}
              handleFileAttachment={handleFileAttachment}
              setIsListening={setIsListening}
              handleStopRequest={handleStopRequest}
            />
          </div>
        </>
      )}
    </div>
  );
}

export default ChatWindow;
