import { useState, useEffect, useMemo } from 'react';
import { ExecutionTrace, ToolCallTraces } from '../models/traces';

const MAX_VISIBLE_ITEMS = 5;

interface ExecutionTraceTimelineProps {
  traces: Map<string, ToolCallTraces>;
  isExpanded?: boolean;
}

/**
 * ExecutionTraceTimeline - Real-time visualization of tool execution traces
 * 
 * Features:
 * - Shows max 5 items, with oldest fading out at top
 * - Shimmer effect on active (running) trace text
 * - Smooth slide-up animation as new traces arrive
 * - Collapsible when done
 */
function ExecutionTraceTimeline({ traces, isExpanded: initialExpanded }: ExecutionTraceTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded ?? true);

  // Determine if any trace is still active
  const hasActiveTraces = useMemo(() => {
    for (const [, toolCallTraces] of traces) {
      if (toolCallTraces.isActive) return true;
    }
    return false;
  }, [traces]);

  // Auto-expand when active, keep user's choice when done
  useEffect(() => {
    if (hasActiveTraces) {
      setIsExpanded(true);
    }
  }, [hasActiveTraces]);

  // Build a flat list of "operations" - each start trace paired with its end/error
  // Deduplicates operations with the same label
  // Shows both successful and failed operations (errors shown with "Tried..." label)
  const operations = useMemo(() => {
    const ops: OperationDisplay[] = [];
    const seenLabels = new Set<string>();
    
    traces.forEach((toolCallTraces, toolCallId) => {
      const traceList = [...toolCallTraces.traces].sort((a, b) => a.timestamp - b.timestamp);
      
      // Map trace_id to its start trace
      const startTraces = new Map<string, ExecutionTrace>();
      
      for (const trace of traceList) {
        if (trace.status === 'start') {
          startTraces.set(trace.trace_id, trace);
        } else if (trace.status === 'end') {
          const startTrace = startTraces.get(trace.trace_id);
          if (startTrace) {
            const dedupeKey = `${trace.tool}:${trace.label}`;
            if (seenLabels.has(dedupeKey)) {
              startTraces.delete(trace.trace_id);
              continue;
            }
            seenLabels.add(dedupeKey);
            
            ops.push({
              id: trace.trace_id,
              toolCallId,
              tool: startTrace.tool || trace.tool,
              operation: startTrace.operation || trace.operation,
              startLabel: startTrace.label,
              endLabel: trace.label,
              status: 'end',
              duration_ms: trace.duration_ms,
              timestamp: startTrace.timestamp,
            });
            startTraces.delete(trace.trace_id);
          }
        } else if (trace.status === 'error') {
          // Show error traces with "Tried..." label
          const startTrace = startTraces.get(trace.trace_id);
          if (startTrace) {
            const dedupeKey = `${trace.tool}:${startTrace.label}:error`;
            if (seenLabels.has(dedupeKey)) {
              startTraces.delete(trace.trace_id);
              continue;
            }
            seenLabels.add(dedupeKey);
            
            ops.push({
              id: trace.trace_id,
              toolCallId,
              tool: startTrace.tool || trace.tool,
              operation: startTrace.operation || trace.operation,
              startLabel: startTrace.label,
              endLabel: trace.label,
              status: 'error',
              duration_ms: trace.duration_ms,
              timestamp: startTrace.timestamp,
            });
          }
          startTraces.delete(trace.trace_id);
        }
      }
      
      // Remaining start traces are still active (no end or error received yet)
      startTraces.forEach((startTrace) => {
        const dedupeKey = `${startTrace.tool}:${startTrace.label}`;
        if (seenLabels.has(dedupeKey)) {
          return;
        }
        seenLabels.add(dedupeKey);
        
        ops.push({
          id: startTrace.trace_id,
          toolCallId,
          tool: startTrace.tool,
          operation: startTrace.operation,
          startLabel: startTrace.label,
          endLabel: null,
          status: 'active',
          duration_ms: undefined,
          timestamp: startTrace.timestamp,
        });
      });
    });
    
    // Sort by timestamp
    return ops.sort((a, b) => a.timestamp - b.timestamp);
  }, [traces]);

  if (operations.length === 0) {
    return null;
  }

  // Get visible operations (last MAX_VISIBLE_ITEMS)
  const visibleOps = operations.slice(-MAX_VISIBLE_ITEMS);
  const hiddenCount = Math.max(0, operations.length - MAX_VISIBLE_ITEMS);
  


  // Count for header
  const completedCount = operations.filter(op => op.status === 'end').length;
  const activeCount = operations.filter(op => op.status === 'active').length;
  const errorCount = operations.filter(op => op.status === 'error').length;
  const totalCount = completedCount + activeCount + errorCount;

  return (
    <div className="w-full my-2 pl-2">
      {/* Collapsed header - simple arrow toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={isExpanded}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span className="font-medium text-muted-foreground">
          {hasActiveTraces ? (
            <span>
              {activeCount > 0 && `${activeCount} running`}
              {activeCount > 0 && (completedCount > 0 || errorCount > 0) && ', '}
              {completedCount > 0 && `${completedCount} done`}
              {completedCount > 0 && errorCount > 0 && ', '}
              {errorCount > 0 && <span className="text-orange-600 dark:text-orange-400">{errorCount} failed</span>}
            </span>
          ) : (
            <span>
              {totalCount > 0 ? (
                <>
                  {completedCount + errorCount} operation{(completedCount + errorCount) !== 1 ? 's' : ''}
                  {errorCount > 0 && <span className="text-orange-600 dark:text-orange-400"> ({errorCount} failed)</span>}
                </>
              ) : 'No operations'}
            </span>
          )}
        </span>
      </button>

      {/* Expanded timeline with animations */}
      {isExpanded && (
        <div className="mt-2 ml-6 relative overflow-hidden">
          {/* Fade gradient at top when there are hidden items */}
          {hiddenCount > 0 && (
            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />
          )}
          
          {/* Timeline container with connecting line */}
          <div className="relative pl-5">
            {/* Vertical connecting line - only show if more than 1 item, starts/ends at dot centers */}
            {/* Line connects from first dot center to last dot center */}
            {visibleOps.length > 1 && (
              <div 
                className="absolute left-[4px] w-0.5 bg-zinc-500" 
                style={{
                  top: '20px', // Center of first dot (py-2 = 8px + half of dot 5px + some offset)
                  bottom: '20px', // Center of last dot
                }}
              />
            )}
            
            <div className="space-y-0">
              {visibleOps.map((op, index) => {
                const isFirstAndFading = index === 0 && operations.length > MAX_VISIBLE_ITEMS;
                
                return (
                  <OperationItem 
                    key={op.id} 
                    operation={op} 
                    isShimmering={op.status === 'active'}
                    isFading={isFirstAndFading}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface OperationDisplay {
  id: string;
  toolCallId: string;
  tool: string;
  operation: string;
  startLabel: string;
  endLabel: string | null;
  status: 'active' | 'end' | 'error';
  duration_ms?: number;
  timestamp: number;
}

interface OperationItemProps {
  operation: OperationDisplay;
  isShimmering?: boolean;
  isFading?: boolean;
}

/**
 * Convert a label to "Tried..." format for errors
 * "Running X" -> "Tried to run X"
 * "Searching: query" -> "Tried to search: query"
 * "GET /users" -> "Tried: GET /users"
 */
function toTriedLabel(label: string): string {
  // Common patterns to convert
  const patterns: [RegExp, string][] = [
    [/^Running:?\s*/i, 'Tried to run: '],
    [/^Ran:?\s*/i, 'Tried to run: '],
    [/^Searching:?\s*/i, 'Tried to search: '],
    [/^Searched:?\s*/i, 'Tried to search: '],
    [/^Generating:?\s*/i, 'Tried to generate: '],
    [/^Generated:?\s*/i, 'Tried to generate: '],
    [/^Creating:?\s*/i, 'Tried to create: '],
    [/^Created:?\s*/i, 'Tried to create: '],
    [/^Listing:?\s*/i, 'Tried to list: '],
    [/^Listed:?\s*/i, 'Tried to list: '],
    [/^Reading:?\s*/i, 'Tried to read: '],
    [/^Read:?\s*/i, 'Tried to read: '],
    [/^Fetching:?\s*/i, 'Tried to fetch: '],
    [/^Fetched:?\s*/i, 'Tried to fetch: '],
    [/^(GET|POST|PUT|PATCH|DELETE)\s+/i, 'Tried: '],
  ];
  
  for (const [pattern, replacement] of patterns) {
    if (pattern.test(label)) {
      return label.replace(pattern, replacement);
    }
  }
  
  // Default: prepend "Tried: "
  return `Tried: ${label}`;
}

/**
 * Single operation in the timeline with animation support
 */
function OperationItem({ operation, isShimmering, isFading }: OperationItemProps) {
  const isActive = operation.status === 'active';
  const isError = operation.status === 'error';

  // Show start label while active, end label when done, "Tried..." for errors
  let displayLabel: string;
  if (isActive) {
    displayLabel = operation.startLabel;
  } else if (isError) {
    displayLabel = toTriedLabel(operation.startLabel);
  } else {
    displayLabel = operation.endLabel || operation.startLabel;
  }

  return (
    <div 
      className={`
        relative flex items-center gap-2 text-sm py-2
        transition-all duration-300 ease-out
        animate-slide-up
        ${isFading ? 'opacity-30' : 'opacity-100'}
      `}
    >
      {/* Timeline dot - zinc for normal, red/orange for error */}
      <div className="absolute -left-5 top-1/2 -translate-y-1/2">
        <span className={`block rounded-full w-2.5 h-2.5 ${isError ? 'bg-orange-500' : 'bg-zinc-500'}`} />
      </div>

      {/* Label with optional shimmer, muted for errors */}
      <span 
        className={`
          flex-1 min-w-0 truncate
          ${isError ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}
          ${isShimmering ? 'shimmer-text' : ''}
        `}
      >
        {displayLabel}
      </span>

      {/* Duration */}
      {operation.duration_ms !== undefined && operation.duration_ms > 0 && (
        <span className="text-xs text-muted-foreground/70 tabular-nums">
          {operation.duration_ms < 1000 
            ? `${operation.duration_ms}ms` 
            : `${(operation.duration_ms / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
}

export default ExecutionTraceTimeline;
