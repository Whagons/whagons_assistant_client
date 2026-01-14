import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import supersub from "remark-supersub";
import CustomPre from "./CustomPre";
import TableRenderer from "./TableRenderer";

interface MarkdownRendererProps {
  children: string;
  isStreaming: boolean;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = (props) => {
  const content = useMemo(() => props.children || "", [props.children]);

  // Check if content contains table markdown
  const hasTable = useMemo(() => {
    const text = content;
    return text.includes('|') && /\n\|[\s\-\w\|:]+\|\n/.test(text);
  }, [content]);

  // Extract table content if present
  const tableContent = useMemo(() => {
    if (!hasTable) return null;

    const text = content;
    const lines = text.split('\n');

    // Find table boundaries
    let tableStart = -1;
    let tableEnd = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (tableStart === -1) {
          tableStart = i;
        }
        tableEnd = i;
      } else if (tableStart !== -1 && line !== '') {
        // Found end of table (non-empty line after table)
        break;
      }
    }

    if (tableStart !== -1 && tableEnd !== -1) {
      const tableLines = lines.slice(tableStart, tableEnd + 1);
      return tableLines.join('\n');
    }

    return null;
  }, [hasTable, content]);

  // Get non-table content
  const nonTableContent = useMemo(() => {
    if (!hasTable) return content;

    const text = content;
    const tableMatch = tableContent;

    if (tableMatch) {
      return text.replace(tableMatch, '').trim();
    }

    return text;
  }, [hasTable, content, tableContent]);

  return (
    <div className="markdown-renderer">
      {hasTable && tableContent && (
        <TableRenderer
          content={tableContent}
          isStreaming={props.isStreaming}
        />
      )}

      {nonTableContent && (
        <ReactMarkdown
          components={{
            pre: CustomPre,
            table: () => null, // Disable table rendering in ReactMarkdown
            thead: () => null,
            tbody: () => null,
            tr: () => null,
            th: () => null,
            td: () => null
          }}
          remarkPlugins={[remarkGfm, remarkBreaks, supersub]}
          rehypePlugins={[]}
        >
          {nonTableContent}
        </ReactMarkdown>
      )}
    </div>
  );
};

export default MarkdownRenderer;
