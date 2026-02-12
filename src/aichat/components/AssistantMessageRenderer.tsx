import { useMemo, useEffect, useRef, useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { ContentItem } from "../models/models";
import { LoadingWidget } from "@/components/ui/loading-widget";
import Prism from "prismjs";

interface AssistantMessageProps {
  fullContent: string | ContentItem[] | { name: string };
  gettingResponse: boolean;
  reasoning?: string | undefined;
  isLast: boolean;
}

// Helper: detect array of content items
function isContentItemArray(
  content: string | ContentItem[] | { name: string }
): content is ContentItem[] {
  return Array.isArray(content);
}

const AssistantMessageRenderer: React.FC<AssistantMessageProps> = (props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReasoningOpen, setIsReasoningOpen] = useState(false);

  const content = useMemo(() => props.fullContent, [props.fullContent]);
  const reasoning = useMemo(() => props.reasoning, [props.reasoning]);

  // Render content directly — no buffering, stream chunks appear immediately
  const displayContent = String(content || "");

  useEffect(() => {
    if (containerRef.current && !props.gettingResponse) {
      Prism.highlightAllUnder(containerRef.current);
    }
  }, [displayContent, props.gettingResponse]);

  return (
    <div ref={containerRef} className="assistant-message-container p-1">
      {reasoning && (
        <div className="mb-4">
          <button
            onClick={() => setIsReasoningOpen(!isReasoningOpen)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-4 w-4 transform transition-transform ${isReasoningOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
            <span>{isReasoningOpen ? "Hide Reasoning" : "View Reasoning"}</span>
          </button>
          {isReasoningOpen && (
            <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono">{reasoning || ""}</pre>
            </div>
          )}
        </div>
      )}

      <div className="markdown-content">
        {typeof content === "string" ? (
          <div>
            <MarkdownRenderer
              isStreaming={props.gettingResponse && props.isLast}
            >
              {displayContent}
            </MarkdownRenderer>
            {props.gettingResponse && props.isLast && (
              <span className="inline-flex items-center ml-1">
                <LoadingWidget
                  size={32}
                  strokeWidthRatio={8}
                  color="currentColor"
                  cycleDuration={0.9}
                />
              </span>
            )}
          </div>
        ) : isContentItemArray(content) ? (
          <div>
            {content.map((item, index) => (
              <div key={index}>{typeof item.content === "string" ? item.content : JSON.stringify(item.content)}</div>
            ))}
          </div>
        ) : (
          <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded-md overflow-auto">
            {JSON.stringify(content, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};

export default AssistantMessageRenderer;
