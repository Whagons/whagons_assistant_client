import { useState, useEffect, useMemo, useRef } from 'react';
import { ExecutionTrace, ToolCallTraces } from '../models/traces';
import { useTheme } from '@/lib/theme-provider';

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
  
  // Track which operation IDs we've seen to detect new ones
  const seenOperationIds = useRef<Set<string>>(new Set());
  const [newOperationIds, setNewOperationIds] = useState<Set<string>>(new Set());

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
    
    console.log('[Timeline] Building operations from traces:', traces.size, 'tool calls');
    
    traces.forEach((toolCallTraces, toolCallId) => {
      const traceList = [...toolCallTraces.traces].sort((a, b) => a.timestamp - b.timestamp);
      console.log('[Timeline] Tool call', toolCallId, 'has', traceList.length, 'traces:', traceList.map(t => `${t.status}:${t.label}`));
      
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
    console.log('[Timeline] Final operations:', ops.length, ops.map(o => `${o.status}:${o.startLabel}`));
    return ops.sort((a, b) => a.timestamp - b.timestamp);
  }, [traces]);

  // Track new operations for animation
  useEffect(() => {
    const currentIds = new Set(operations.map(op => op.id));
    const newIds = new Set<string>();
    
    for (const id of currentIds) {
      if (!seenOperationIds.current.has(id)) {
        newIds.add(id);
        seenOperationIds.current.add(id);
      }
    }
    
    if (newIds.size > 0) {
      setNewOperationIds(newIds);
      // Clear "new" status after animation completes
      const timer = setTimeout(() => {
        setNewOperationIds(new Set());
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [operations]);

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
            <style>{`
              @keyframes line-grow {
                from { transform: scaleY(0); }
                to { transform: scaleY(1); }
              }
            `}</style>
            {/* Vertical connecting line - only show if more than 1 item, starts/ends at dot centers */}
            {/* Line connects from first dot center to last dot center */}
            {visibleOps.length > 1 && (
              <div 
                className={`absolute left-[4px] w-0.5 origin-top transition-all duration-300 ease-out ${
                  hasActiveTraces ? 'bg-zinc-600 dark:bg-zinc-300' : 'bg-zinc-400 dark:bg-zinc-500'
                }`}
                style={{
                  top: '20px', // Center of first dot (py-2 = 8px + half of dot 5px + some offset)
                  bottom: '20px', // Center of last dot
                }}
              />
            )}
            
            <div className="space-y-0">
              {visibleOps.map((op, index) => {
                const isFirstAndFading = index === 0 && operations.length > MAX_VISIBLE_ITEMS;
                // Shimmer only the LAST item if it's active (the currently running one)
                const isLastAndActive = index === visibleOps.length - 1 && op.status === 'active';
                const isNew = newOperationIds.has(op.id);
                
                return (
                  <OperationItem 
                    key={op.id} 
                    operation={op} 
                    isShimmering={isLastAndActive}
                    isFading={isFirstAndFading}
                    isNew={isNew}
                    hasActiveTraces={hasActiveTraces}
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
  isNew?: boolean;
  hasActiveTraces?: boolean;
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
function OperationItem({ operation, isShimmering, isFading, isNew, hasActiveTraces }: OperationItemProps) {
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
        ${isFading ? 'opacity-30' : 'opacity-100'}
        ${isNew ? 'animate-trace-appear' : ''}
      `}
    >
      <style>{`
        @keyframes shimmer-sweep {
          0% { background-position: -150% 0; }
          100% { background-position: 150% 0; }
        }
        @keyframes trace-appear {
          0% {
            opacity: 0;
            transform: translateY(-20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes dot-emerge {
          0% {
            transform: scale(0) translateY(-10px);
            opacity: 0;
          }
          50% {
            transform: scale(1.2) translateY(0);
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
        @keyframes text-emerge {
          0% {
            opacity: 0;
            transform: translateX(-10px);
            clip-path: inset(0 100% 0 0);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
            clip-path: inset(0 0 0 0);
          }
        }
        .animate-trace-appear {
          animation: trace-appear 0.3s ease-out forwards;
        }
        .animate-dot-emerge {
          animation: dot-emerge 0.3s ease-out forwards;
        }
        .animate-text-emerge {
          animation: text-emerge 0.4s ease-out 0.15s forwards;
          opacity: 0;
        }
      `}</style>
      
      {/* Timeline dot - orange for error, all same color based on whether ANY trace is active */}
      <div className="absolute -left-5 top-1/2 -translate-y-1/2">
        <span className={`block rounded-full w-2.5 h-2.5 ${
          isError ? 'bg-orange-500' : 
          hasActiveTraces ? 'bg-zinc-600 dark:bg-zinc-300' : 
          'bg-zinc-400 dark:bg-zinc-500'
        } ${isNew ? 'animate-dot-emerge' : ''}`} />
      </div>

      {/* Label with shimmer for active, muted for done, orange for errors */}
      {isShimmering ? (
        <ShimmerText 
          text={displayLabel} 
          isNew={isNew} 
        />
      ) : (
        <span 
          className={`
            flex-1 min-w-0 truncate
            ${isError ? 'text-orange-600 dark:text-orange-400' : 'text-muted-foreground'}
            ${isNew ? 'animate-text-emerge' : ''}
          `}
        >
          {displayLabel}
        </span>
      )}

      {/* Duration */}
      {operation.duration_ms !== undefined && operation.duration_ms > 0 && (
        <span className={`text-xs text-muted-foreground/70 tabular-nums ${isNew ? 'animate-text-emerge' : ''}`}>
          {operation.duration_ms < 1000 
            ? `${operation.duration_ms}ms` 
            : `${(operation.duration_ms / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
}

/**
 * Shimmer text component that handles dark/light mode
 */
function ShimmerText({ text, isNew }: { text: string; isNew?: boolean }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  
  // Dark mode: white shimmer on dark background
  // Light mode: dark shimmer on light background
  const baseColor = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
  const shimmerColor = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.7)';
  
  return (
    <span 
      className={`flex-1 min-w-0 truncate ${isNew ? 'animate-text-emerge' : ''}`}
      style={{
        color: baseColor,
        background: `linear-gradient(90deg, transparent 20%, ${shimmerColor} 50%, transparent 80%)`,
        backgroundSize: '150% 100%',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        animation: isNew 
          ? 'text-emerge 0.4s ease-out 0.15s forwards, shimmer-sweep 0.8s linear 0.55s infinite'
          : 'shimmer-sweep 0.8s linear infinite',
        opacity: isNew ? 0 : undefined,
      }}
    >
      {text}
    </span>
  );
}

export default ExecutionTraceTimeline;
