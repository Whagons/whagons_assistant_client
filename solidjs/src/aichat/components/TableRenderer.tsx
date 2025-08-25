import { Component, createMemo, Show, For, createSignal, onMount, onCleanup } from "solid-js";

interface TableRow {
  cells: string[];
}

interface TableData {
  headers: string[];
  rows: TableRow[];
  isComplete: boolean;
}

interface TableRendererProps {
  content: string;
  isStreaming: boolean;
}

const TableRenderer: Component<TableRendererProps> = (props) => {
  const [showDownloadOptions, setShowDownloadOptions] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  let dropdownRef: HTMLDivElement | undefined;

  // Close dropdown when clicking outside
  const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
      setShowDownloadOptions(false);
    }
  };

  onMount(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onCleanup(() => {
    document.removeEventListener('click', handleClickOutside);
  });

  const tableData = createMemo(() => {
    const lines = props.content.split('\n').filter(line => line.trim());

    if (lines.length < 3) {
      return null; // Not enough lines for a complete table
    }

    const headers: string[] = [];
    const rows: TableRow[] = [];
    let inTable = false;
    let headerParsed = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('|') && line.endsWith('|')) {
        const cells = line.split('|')
          .slice(1, -1) // Remove empty strings from start and end
          .map(cell => cell.trim());

        if (!headerParsed) {
          headers.push(...cells);
          headerParsed = true;
          inTable = true;
        } else if (inTable) {
          // Check if this is a separator row (supports alignment markers like :---, ---:, :---:)
          if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) {
            continue; // Skip separator row
          }
          rows.push({ cells });
        }
      } else if (inTable && line === '') {
        // Empty line after table - table is complete
        break;
      } else if (inTable) {
        // Left table context
        break;
      }
    }

    if (headers.length === 0) {
      return null;
    }

    return {
      headers,
      rows,
      isComplete: !props.isStreaming || lines.some(line => line.trim() && !line.startsWith('|'))
    };
  });

  // Compute responsive column widths using heuristics:
  // - Columns that look like indices/IDs become compact fixed width.
  // - Columns that look like emails get extra weight.
  // - Others share remaining width evenly.
  const colWidths = createMemo(() => {
    const t = tableData();
    const headers = t?.headers ?? [];
    const rows = t?.rows ?? [];
    const colCount = headers.length;
    if (colCount === 0) return [] as string[];

    const isCompactColumn = (col: number) => {
      const header = (headers[col] || '').trim().toLowerCase();
      const headerSuggestsCompact = ['#', 'no', 'no.', 'index', 'id', 'rank'].includes(header);
      if (headerSuggestsCompact) return true;
      // Inspect up to first 8 rows
      const sampleCount = Math.min(8, rows.length);
      if (sampleCount === 0) return false;
      let numericOrTiny = 0;
      for (let r = 0; r < sampleCount; r++) {
        const cell = String(rows[r]?.cells[col] ?? '').trim();
        if (/^\d+$/.test(cell) || cell.length <= 3) numericOrTiny++;
      }
      return numericOrTiny / sampleCount >= 0.8;
    };

    const isEmailColumn = (col: number) => {
      const header = (headers[col] || '').toLowerCase();
      if (header.includes('email')) return true;
      const sampleCount = Math.min(8, rows.length);
      for (let r = 0; r < sampleCount; r++) {
        const cell = String(rows[r]?.cells[col] ?? '').toLowerCase();
        if (cell.includes('@')) return true;
      }
      return false;
    };

    const compact: boolean[] = [];
    const weights: number[] = [];
    let totalWeight = 0;
    for (let c = 0; c < colCount; c++) {
      const isCompact = isCompactColumn(c);
      compact[c] = isCompact;
      if (isCompact) {
        weights[c] = 0; // fixed width; not part of percentage pool
      } else if (isEmailColumn(c)) {
        weights[c] = 2; // give email-ish columns more space
        totalWeight += 2;
      } else {
        weights[c] = 1;
        totalWeight += 1;
      }
    }

    // Build width strings. Compact cols get fixed width, others get percentage of remaining.
    const widths: string[] = new Array(colCount);
    let consumedPercent = 0;
    let lastFlexCol = -1;
    for (let c = 0; c < colCount; c++) {
      if (!compact[c]) lastFlexCol = c;
    }
    for (let c = 0; c < colCount; c++) {
      if (compact[c]) {
        widths[c] = '4rem';
      } else {
        if (totalWeight === 0) {
          widths[c] = `${Math.floor(100 / Math.max(1, colCount))}%`;
          consumedPercent += parseInt(widths[c]);
        } else {
          const pct = c === lastFlexCol
            ? Math.max(0, 100 - consumedPercent)
            : Math.floor((weights[c] / totalWeight) * 100);
          widths[c] = `${pct}%`;
          consumedPercent += pct;
        }
      }
    }
    return widths;
  });

  // Convert table data to markdown format
  const getMarkdownContent = () => {
    if (!tableData()) return '';
    const { headers, rows } = tableData()!;

    let markdown = `| ${headers.join(' | ')} |\n`;
    markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;

    rows.forEach(row => {
      markdown += `| ${row.cells.join(' | ')} |\n`;
    });

    return markdown;
  };

  // Convert table data to CSV format
  const getCSVContent = () => {
    if (!tableData()) return '';
    const { headers, rows } = tableData()!;

    let csv = headers.join(',') + '\n';
    rows.forEach(row => {
      csv += row.cells.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    });

    return csv;
  };

  // Copy table as markdown to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getMarkdownContent());
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      console.error('Failed to copy table:', err);
    }
  };

  // Download table in specified format
  const handleDownload = (format: 'csv' | 'markdown') => {
    const content = format === 'csv' ? getCSVContent() : getMarkdownContent();
    const filename = `table.${format === 'csv' ? 'csv' : 'md'}`;
    const mimeType = format === 'csv' ? 'text/csv' : 'text/markdown';

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setShowDownloadOptions(false);
  };

  return (
    <Show when={tableData()}>
      <div class="w-full overflow-x-auto">
          <table class="w-full table-fixed table-rounded !border-0 !border-separate !border-spacing-0">
            <colgroup>
              <For each={colWidths()}>
                {(w) => <col style={{ width: w }} />}
              </For>
            </colgroup>
            <thead>
              <tr class="bg-gray-800/80 dark:bg-gray-800 text-white">
                <For each={tableData()!.headers}>
                  {(header, index) => (
                    <th class="px-6 py-4 text-left text-sm font-semibold tracking-wide truncate">
                      {header}
                      <Show when={props.isStreaming && !tableData()!.isComplete && index() === tableData()!.headers.length - 1}>
                        <span class="inline-block w-2 h-3 bg-blue-400 animate-pulse ml-2 rounded"></span>
                      </Show>
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              <For each={tableData()!.rows}>
                {(row) => (
                  <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                    <For each={row.cells}>
                      {(cell) => (
                        <td class="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 align-top whitespace-normal break-words">
                          {cell}
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
            <tfoot>
              <tr class="bg-gray-900/80 dark:bg-gray-900/70">
                <td colspan={tableData()!.headers.length} class="px-4 py-2">
                  <div class="flex items-center justify-end gap-1">
                    {/* Copy Button */}
                    <button
                      onClick={handleCopy}
                      class="relative p-1.5 text-gray-300 hover:text-white hover:bg-white/10 rounded transition-colors inline-flex items-center"
                      title="Copy table as Markdown"
                    >
                      <svg class={`w-4 h-4 transition-opacity ${copied() ? 'opacity-0' : 'opacity-100'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <svg class={`w-4 h-4 absolute text-green-400 transition-opacity ${copied() ? 'opacity-100' : 'opacity-0'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>

                    {/* Download Button with Dropdown */}
                    <div class="relative" ref={dropdownRef}>
                      <button
                        onClick={() => setShowDownloadOptions(!showDownloadOptions())}
                        class="p-1.5 text-gray-300 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="Download table"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </button>

                      {/* Download Options Dropdown */}
                      <Show when={showDownloadOptions()}>
                        <div class="absolute right-0 bottom-full mb-1 w-36 bg-white dark:bg-gray-700 border border-gray-200/40 dark:border-gray-600 rounded-md shadow-lg z-10">
                          <button
                            onClick={() => handleDownload('csv')}
                            class="w-full px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2 rounded-t-md"
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            CSV
                          </button>
                          <button
                            onClick={() => handleDownload('markdown')}
                            class="w-full px-3 py-2 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-2 rounded-b-md"
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            Markdown
                          </button>
                        </div>
                      </Show>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <Show when={props.isStreaming && !tableData()!.isComplete}>
          <div class="text-sm text-gray-500 dark:text-gray-400 mt-3 flex items-center justify-center">
            <span class="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </span>
            <span class="ml-2">Building table...</span>
          </div>
        </Show>
    </Show>
  );
};

export default TableRenderer;
