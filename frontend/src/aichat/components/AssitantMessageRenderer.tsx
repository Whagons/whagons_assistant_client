import {
  useRef,
  memo,
  useLayoutEffect,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import supersub from "remark-supersub";

// --- Import your CustomPre component ---
// Adjust the path based on your project structure
import CustomPre from "./CustomPre";
import { visit, SKIP } from "unist-util-visit";
import type { Plugin } from 'unified';
import type { Root, Element, Text } from 'hast';

interface AssistantMessageProps {
  fullContent: string;
  gettingResponse: boolean;
  reasoning?: string;
}

const rehypeWrapWordsInSpans: Plugin<[], Root> = () => {
    return (tree: Root) => {
      visit(tree, 'text', (node: Text, index: number | undefined, parent: Element | Root | undefined) => {
        // Basic validation for index and parent
        if (typeof index !== 'number' || !parent || !('children' in parent)) {
          return;
        }
  
        // Skip if inside unwanted tags like code, pre, or our own spans
        if (parent.type === 'element') {
          const tagName = parent.tagName.toLowerCase();
          if (tagName === 'span' && Array.isArray(parent.properties?.className) && parent.properties.className.includes('streaming-word-fade-in')) {
            return SKIP; // Already wrapped by us
          }
          if (tagName === 'code' || tagName === 'pre' || tagName === 'script' || tagName === 'style') {
            return SKIP; // Don't process text inside these specific tags
          }
        }
  
        const textValue = node.value;
        // Don't process empty or whitespace-only text nodes
        if (!textValue || /^\s*$/.test(textValue)) {
          return;
        }
  
        // Split the text value into words and whitespace chunks
        const parts = textValue.split(/(\s+)/).filter(part => part.length > 0); // Filter empty strings
  
        // Create an array of new nodes (spans for words, text nodes for spaces)
        const newNodes: (Element | Text)[] = parts.map((part): Element | Text => {
          if (/^\s+$/.test(part)) {
            // It's whitespace, return a simple Text node
            return { type: 'text', value: part };
          } else {
            // It's a word, return a span Element node
            return {
              type: 'element',
              tagName: 'span',
              properties: { className: ['streaming-word-fade-in'] }, // Class for animation
              children: [{ type: 'text', value: part }], // Word text inside span
            };
          }
        });
  
        // Replace the original text node with the array of new nodes
        // using the spread operator (...)
        parent.children.splice(index, 1, ...newNodes);
  
        // Important: Return the index + number of nodes inserted - 1
        // This tells visit to continue processing *after* the nodes we just inserted.
        // Otherwise, it might re-process the text nodes inside the new spans.
        return index + newNodes.length; // Correct way to advance the visitor index
        // Returning SKIP here would skip siblings, which is usually not desired.
      });
    };
  };
// --- Component ---

const AssistantMessageRenderer = memo(
  ({ fullContent, gettingResponse, reasoning }: AssistantMessageProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isReasoningOpen, setIsReasoningOpen] = useState(false);

    // --- Scrolling Effect (keep as is) ---
    useLayoutEffect(() => {
      if (containerRef.current) {
        const element = containerRef.current;
        const isScrolledToBottom =
          element.scrollHeight - element.scrollTop <= element.clientHeight + 50;
        if (isScrolledToBottom) {
          element.scrollTop = element.scrollHeight;
        }
      }
      // Scroll when stable content OR the latest chunk changes
    }, [fullContent]);

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
                className={`h-4 w-4 transform transition-transform ${
                  isReasoningOpen ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
              <span className={gettingResponse && fullContent.length === 0 ? "wave-text" : ""}>
                {gettingResponse && fullContent.length === 0 ? "thinking..." : "View Reasoning"}
              </span>
            </button>
            {isReasoningOpen && (
              <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <ReactMarkdown
                  components={{
                    pre: CustomPre,
                  }}
                  children={reasoning}
                  remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
                  rehypePlugins={[]}
                />
              </div>
            )}
          </div>
        )}
        {gettingResponse ? (
          <ReactMarkdown
            components={{
              pre: CustomPre,
            }}
            children={fullContent}
            remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
            rehypePlugins={[rehypeWrapWordsInSpans]}
          />
        ) : (
          <ReactMarkdown
            components={{
              pre: CustomPre,
            }}
            children={fullContent}
            remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
            rehypePlugins={[]}
          />
        )}
      </div>
    );
  }
);

// Set display name for better debugging in React DevTools
AssistantMessageRenderer.displayName = "AssistantMessageRenderer";

export default AssistantMessageRenderer;
