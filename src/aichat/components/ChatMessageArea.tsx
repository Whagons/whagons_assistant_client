import React from "react";
import { Message } from "../models/models";
import MessageItem from "./ChatMessageItem";
import ToolMessageRenderer, { ToolCallMap } from "./ToolMessageRenderer";
import { Skeleton } from "@/components/ui/skeleton";

interface ChatMessageAreaProps {
  messages: Message[];
  memoizedMessages: Message[];
  lastUserIndex: number;
  toolCallMap: ToolCallMap;
  gettingResponse: boolean;
  loading: boolean;
  chatContainerRef: React.RefObject<HTMLDivElement>;
  inputContainerRef: React.RefObject<HTMLDivElement>;
  showScrollToBottom: boolean;
  scrollBtnLeft: number | undefined;
  onScroll: () => void;
  onScrollToBottom: () => void;
}

function LoadingSkeleton() {
  return (
    <div className="w-full h-full flex flex-col gap-6 p-4 md:max-w-[900px] mx-auto">
      {[...Array(5)].map((_, index) => (
        <div
          key={index}
          className={`flex gap-4 ${index % 2 === 0 ? "justify-start" : "justify-end"}`}
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
  );
}

const ChatMessageArea: React.FC<ChatMessageAreaProps> = ({
  messages,
  memoizedMessages,
  lastUserIndex,
  toolCallMap,
  gettingResponse,
  loading,
  chatContainerRef,
  inputContainerRef,
  showScrollToBottom,
  scrollBtnLeft,
  onScroll,
  onScrollToBottom,
}) => {
  if (loading) {
    return (
      <div className="w-full h-full flex flex-col flex-1">
        <LoadingSkeleton />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col flex-1">
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain Chat-Container scrollbar rounded-t-lg w-full"
        onScroll={onScroll}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col px-4 pb-10 pt-safe-offset-10 ">
          {memoizedMessages.map((message, index) =>
            message.role === "user" || message.role === "assistant" ? (
              <MessageItem
                key={index}
                message={message}
                messages={memoizedMessages}
                isLast={index === memoizedMessages.length - 1}
                gettingResponse={gettingResponse && index === memoizedMessages.length - 1}
                isLastUser={index === lastUserIndex}
              />
            ) : (
              <ToolMessageRenderer
                key={index}
                message={message}
                messages={memoizedMessages}
                index={index}
                toolCallMap={toolCallMap}
              />
            )
          )}
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
      {showScrollToBottom && (
        <div
          className="fixed z-[1050]"
          style={{
            bottom: `${(inputContainerRef.current?.offsetHeight ?? 84) + 12}px`,
            left: `${scrollBtnLeft ?? window.innerWidth / 2}px`,
            transform: "translateX(-50%)",
          }}
        >
          <button
            type="button"
            className="px-3 py-1.5 rounded-full bg-card/70 backdrop-blur border border-border/60 shadow-sm text-xs text-foreground hover:bg-card/90 transition-colors flex items-center gap-1.5"
            onClick={onScrollToBottom}
          >
            <span>Scroll to bottom</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="opacity-80"
            >
              <path d="M12 16a1 1 0 0 1-.707-.293l-6-6a1 1 0 1 1 1.414-1.414L12 13.586l5.293-5.293a1 1 0 0 1 1.414 1.414l-6 6A1 1 0 0 1 12 16z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatMessageArea;
