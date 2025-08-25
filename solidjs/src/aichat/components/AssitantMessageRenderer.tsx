import { Component, Show, Accessor, createMemo, createSignal, createEffect, createResource } from "solid-js";
import MarkdownRenderer from "./MarkdownRenderer";
import { ContentItem } from "../models/models";
import Prism from "prismjs";

interface AssistantMessageProps {
  fullContent: Accessor<string | ContentItem[] | { name: string }>;
  gettingResponse: boolean;
  reasoning?: Accessor<string | undefined>;
  isLast: Accessor<boolean>;
}

// Helper: detect array of content items
function isContentItemArray(
  content: string | ContentItem[] | { name: string }
): content is ContentItem[] {
  return Array.isArray(content);
}

const AssistantMessageRenderer: Component<AssistantMessageProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [isReasoningOpen, setIsReasoningOpen] = createSignal(false);

  const content = createMemo(() => props.fullContent());
  const reasoning = createMemo(() => (props.reasoning ? props.reasoning() : undefined));

  // Buffered content renderer for performance optimization
  const [bufferedContent, setBufferedContent] = createSignal("");
  const [renderTrigger, setRenderTrigger] = createSignal(0);

  // Content accumulation logic
  createEffect(() => {
    const rawContent = String(content() || "");
    if (!rawContent) {
      setBufferedContent("");
      return;
    }

    // If response is complete, render everything immediately
    if (!props.gettingResponse) {
      setBufferedContent(rawContent);
      setRenderTrigger(prev => prev + 1);
      return;
    }

    // During streaming, use intelligent buffering
    const currentBuffered = bufferedContent();
    if (rawContent.length > currentBuffered.length) {
      const newContent = rawContent.slice(currentBuffered.length);

      // Accumulate content and check for structural boundaries
      let shouldRender = false;
      let accumulatedBuffer = currentBuffered + newContent;

      // Check for table row completion (ends with | followed by newline)
      if (accumulatedBuffer.includes('|') && /\|\s*$/m.test(accumulatedBuffer)) {
        // Look for complete table rows
        const lines = accumulatedBuffer.split('\n');
        let tableRowCount = 0;
        let inTable = false;

        for (const line of lines) {
          if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
            tableRowCount++;
            inTable = true;
          } else if (inTable && line.trim() === '') {
            // Empty line after table - good render point
            shouldRender = true;
            break;
          } else if (inTable && !line.trim().startsWith('|')) {
            // Left table context - render accumulated rows
            shouldRender = tableRowCount >= 3; // At least header + separator + 1 data row
            break;
          }
        }
      }

      // Check for code block completion
      if (accumulatedBuffer.includes('```')) {
        const codeBlockMatches = accumulatedBuffer.match(/```[\s\S]*?```/g);
        if (codeBlockMatches && codeBlockMatches.length > 0) {
          const lastBlock = codeBlockMatches[codeBlockMatches.length - 1];
          if (lastBlock.endsWith('```')) {
            shouldRender = true;
          }
        }
      }

      // Check for paragraph completion (double newline)
      if (accumulatedBuffer.includes('\n\n')) {
        shouldRender = true;
      }

      // Force render every 1000 characters to prevent memory issues
      if (accumulatedBuffer.length - currentBuffered.length > 1000) {
        shouldRender = true;
      }

      if (shouldRender) {
        setBufferedContent(accumulatedBuffer);
        setRenderTrigger(prev => prev + 1);
      }
    }
  });

  createEffect(() => {
    if (containerRef) {
      Prism.highlightAllUnder(containerRef);
    }
  });

  return (
    <div ref={containerRef} class="assistant-message-container p-1">
      <Show when={reasoning()}>
        <div class="mb-4">
          <button
            onClick={() => setIsReasoningOpen(!isReasoningOpen())}
            class="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class={`h-4 w-4 transform transition-transform ${isReasoningOpen() ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
            <span>{isReasoningOpen() ? "Hide Reasoning" : "View Reasoning"}</span>
          </button>
          <Show when={isReasoningOpen()}>
            <div class="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <pre class="whitespace-pre-wrap text-sm font-mono">{(reasoning() as string) || ""}</pre>
            </div>
          </Show>
        </div>
      </Show>

      <div class="markdown-content">
        <Show when={typeof content() === "string"}>
          <div>
            <MarkdownRenderer
              isStreaming={props.gettingResponse && props.isLast()}
            >
              {bufferedContent() || (props.gettingResponse ? "" : String(content() || ""))}
            </MarkdownRenderer>
            <Show when={props.gettingResponse && props.isLast()}>
              <span class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </Show>
          </div>
        </Show>

        <Show when={isContentItemArray(content())}>
          <div>
            {(content() as ContentItem[]).map((item) => (
              <div>{typeof item.content === "string" ? item.content : JSON.stringify(item.content)}</div>
            ))}
          </div>
        </Show>

        <Show when={typeof content() !== "string" && !isContentItemArray(content())}>
          <pre class="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded-md overflow-auto">
            {JSON.stringify(content(), null, 2)}
          </pre>
        </Show>
      </div>
    </div>
  );
};

export default AssistantMessageRenderer;