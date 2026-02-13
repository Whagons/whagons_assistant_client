import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authFetch } from "@/lib/utils";
import { HOST } from "@/aichat/utils/utils";
import { toast } from "sonner";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { auth } from "@/lib/firebase";

// Initialize dayjs plugins
dayjs.extend(relativeTime);

// Types matching backend responses
interface WorkflowSchedule {
  enabled: boolean;
  type: "cron" | "once" | "interval";
  cron?: string;
  run_at?: string;
  interval_sec?: number;
  last_run?: string;
  next_run?: string;
}

interface Workflow {
  id: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at?: string;
  completed_at?: string;
  error?: string;
  created_at: string;
  pid?: number;
  schedule?: WorkflowSchedule;
  code?: string;
}

// Status badge colors
const statusColors: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  running: "bg-blue-500/20 text-blue-400",
  completed: "bg-green-500/20 text-green-400",
  failed: "bg-red-500/20 text-red-400",
};

// Status icons
const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "running":
      return (
        <div className="w-3 h-3 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
      );
    case "completed":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      );
    case "failed":
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
          <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
      );
    default:
      return (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      );
  }
};

export default function WorkflowsPage() {
  const { id: workflowIdFromUrl } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [logs, setLogs] = useState<string>("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsContainerRef = useRef<HTMLDivElement | null>(null);

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    loadWorkflows();
  }, []);

  // Connect to SSE for log streaming when a workflow is selected
  const connectToLogStream = useCallback(async (workflowId: string) => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsStreaming(true);
    setLogs(""); // Clear logs for fresh stream

    try {
      // Get auth token for SSE connection
      const user = auth.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }
      const token = await user.getIdToken();

      // EventSource doesn't support custom headers, so we pass token as query param
      const url = `${HOST}/api/v1/workflows/${workflowId}/logs/stream?token=${encodeURIComponent(token)}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener("logs", (event) => {
        const data = JSON.parse(event.data);
        if (data.logs) {
          setLogs((prev) => prev + data.logs);
          // Auto-scroll to bottom
          if (logsContainerRef.current) {
            logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
          }
        }
      });

      eventSource.addEventListener("status", (event) => {
        const data = JSON.parse(event.data);
        // Update the selected workflow's status
        setSelectedWorkflow((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: data.status,
            started_at: data.started_at,
            completed_at: data.completed_at,
            error: data.error,
            pid: data.pid,
          };
        });
        // Also update in the workflows list
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === workflowId
              ? { ...w, status: data.status, completed_at: data.completed_at, error: data.error }
              : w
          )
        );
      });

      eventSource.addEventListener("done", (event) => {
        const data = JSON.parse(event.data);
        setIsStreaming(false);
        eventSource.close();
        eventSourceRef.current = null;
        // Refresh workflow list to get final state
        loadWorkflows(false);
      });

      eventSource.addEventListener("error", (event) => {
        // Check if this is a normal close or an actual error
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsStreaming(false);
          return;
        }
        console.error("SSE error:", event);
        setIsStreaming(false);
        // Fallback to regular fetch
        loadLogs(workflowId);
      });

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          setIsStreaming(false);
          eventSourceRef.current = null;
        }
      };
    } catch (err) {
      console.error("Failed to connect to log stream:", err);
      setIsStreaming(false);
      // Fallback to regular fetch
      loadLogs(workflowId);
    }
  }, []);

  // Handle URL param to select workflow
  useEffect(() => {
    if (workflowIdFromUrl && workflows.length > 0 && !selectedWorkflow) {
      const workflow = workflows.find(w => w.id === workflowIdFromUrl);
      if (workflow) {
        setSelectedWorkflow(workflow);
        connectToLogStream(workflow.id);
      }
    }
  }, [workflowIdFromUrl, workflows, selectedWorkflow, connectToLogStream]);

  // Auto-refresh workflow list only when a workflow is running
  useEffect(() => {
    const hasRunning = workflows.some(w => w.status === "running");
    if (!hasRunning) return;
    const interval = setInterval(() => {
      loadWorkflows(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [workflows]);

  const loadWorkflows = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/`);
      if (!response.ok) throw new Error("Failed to load workflows");
      const data = await response.json();
      setWorkflows(data.workflows || []);
      
      // Update selected workflow if it exists in the new data
      if (selectedWorkflow) {
        const updated = (data.workflows || []).find((w: Workflow) => w.id === selectedWorkflow.id);
        if (updated) {
          setSelectedWorkflow(updated);
        }
      }
    } catch (err) {
      if (showLoading) {
        setError(err instanceof Error ? err.message : "Failed to load workflows");
      }
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadLogs = async (workflowId: string, showLoading = true) => {
    if (showLoading) setLogsLoading(true);
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${workflowId}/logs`);
      if (!response.ok) throw new Error("Failed to load logs");
      const data = await response.json();
      setLogs(data.logs || "No logs available.");
    } catch (err) {
      if (showLoading) {
        toast.error("Failed to load logs");
      }
    } finally {
      if (showLoading) setLogsLoading(false);
    }
  };

  const handleSelectWorkflow = async (workflow: Workflow) => {
    if (selectedWorkflow?.id === workflow.id) {
      // Deselecting - close SSE connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setSelectedWorkflow(null);
      setLogs("");
      setIsStreaming(false);
      navigate('/workflows', { replace: true });
      return;
    }
    setSelectedWorkflow(workflow);
    navigate(`/workflows/${workflow.id}`, { replace: true });
    // Connect to SSE stream for real-time logs
    connectToLogStream(workflow.id);
  };

  const handleRunWorkflow = async (workflowId: string) => {
    setActionLoading(workflowId);
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${workflowId}/run`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to run workflow");
      }
      toast.success("Workflow started");
      await loadWorkflows(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run workflow");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStopWorkflow = async (workflowId: string) => {
    setActionLoading(workflowId);
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${workflowId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to stop workflow");
      }
      toast.success("Workflow stopped");
      await loadWorkflows(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop workflow");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm("Are you sure you want to delete this workflow?")) return;
    
    setActionLoading(workflowId);
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${workflowId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete workflow");
      }
      toast.success("Workflow deleted");
      if (selectedWorkflow?.id === workflowId) {
        setSelectedWorkflow(null);
        setLogs("");
      }
      await loadWorkflows(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete workflow");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnschedule = async (workflowId: string) => {
    setActionLoading(workflowId);
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${workflowId}/schedule`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to unschedule workflow");
      }
      toast.success("Workflow unscheduled");
      await loadWorkflows(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unschedule workflow");
    } finally {
      setActionLoading(null);
    }
  };

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    return workflows.filter((workflow) => {
      const matchesSearch =
        searchFilter === "" ||
        workflow.name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        workflow.id.toLowerCase().includes(searchFilter.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || workflow.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [workflows, searchFilter, statusFilter]);

  // Format schedule description
  const formatSchedule = (schedule: WorkflowSchedule | undefined) => {
    if (!schedule || !schedule.enabled) return null;

    switch (schedule.type) {
      case "cron":
        return `Cron: ${schedule.cron}`;
      case "once":
        return `Once at: ${dayjs(schedule.run_at).format("MMM D, YYYY h:mm A")}`;
      case "interval":
        const secs = schedule.interval_sec || 0;
        if (secs >= 86400) return `Every ${Math.floor(secs / 86400)} day(s)`;
        if (secs >= 3600) return `Every ${Math.floor(secs / 3600)} hour(s)`;
        if (secs >= 60) return `Every ${Math.floor(secs / 60)} minute(s)`;
        return `Every ${secs} second(s)`;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Workflows</h1>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Loading workflows...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Workflows</h1>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto h-full overflow-auto scrollbar">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Workflows</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Background TypeScript tasks created by the assistant
          </p>
        </div>
        <button
          onClick={() => loadWorkflows()}
          className="px-3 py-2 text-sm bg-muted/50 hover:bg-muted rounded-lg transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
          />
          {searchFilter && (
            <button
              onClick={() => setSearchFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              &times;
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {filteredWorkflows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {workflows.length === 0 ? (
            <div>
              <p className="text-lg mb-2">No workflows yet</p>
              <p className="text-sm">Ask the assistant to create a workflow to get started</p>
            </div>
          ) : (
            <p>No workflows match your filters</p>
          )}
        </div>
      ) : (
        <div className="flex gap-4 h-[calc(100vh-280px)]">
          {/* Workflows List */}
          <div className={`${selectedWorkflow ? 'w-1/3 min-w-[300px]' : 'w-full'} flex flex-col transition-all duration-200`}>
            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {filteredWorkflows.map((workflow) => (
                <button
                  key={workflow.id}
                  onClick={() => handleSelectWorkflow(workflow)}
                  className={`w-full p-4 rounded-lg border text-left transition-colors ${
                    selectedWorkflow?.id === workflow.id
                      ? 'bg-primary/10 border-primary/50'
                      : 'bg-card/50 border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium truncate">{workflow.name || "(unnamed)"}</h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{workflow.id}</p>
                    </div>
                    <span className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full shrink-0 ${statusColors[workflow.status]}`}>
                      <StatusIcon status={workflow.status} />
                      {workflow.status}
                    </span>
                  </div>

                  {/* Schedule info */}
                  {workflow.schedule?.enabled && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-purple-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      {formatSchedule(workflow.schedule)}
                    </div>
                  )}

                  {/* Time info */}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span title={workflow.created_at}>
                      Created {dayjs(workflow.created_at).fromNow()}
                    </span>
                    {workflow.schedule?.next_run && (
                      <span className="text-purple-400" title={workflow.schedule.next_run}>
                        Next: {dayjs(workflow.schedule.next_run).fromNow()}
                      </span>
                    )}
                    {workflow.schedule?.last_run && (
                      <span title={workflow.schedule.last_run}>
                        Last ran {dayjs(workflow.schedule.last_run).fromNow()}
                      </span>
                    )}
                    {!workflow.schedule?.enabled && workflow.completed_at && (
                      <span title={workflow.completed_at}>
                        {workflow.status === "completed" ? "Completed" : "Ended"} {dayjs(workflow.completed_at).fromNow()}
                      </span>
                    )}
                  </div>

                  {/* Error preview */}
                  {workflow.error && !selectedWorkflow && (
                    <p className="mt-2 text-xs text-red-400 line-clamp-1">{workflow.error}</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Workflow Detail Panel */}
          {selectedWorkflow && (
            <div className="flex-1 flex flex-col border-l border-border pl-4 min-w-0">
              {/* Header */}
              <div className="flex items-start justify-between mb-4 shrink-0">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold truncate">{selectedWorkflow.name || "(unnamed)"}</h2>
                  <p className="text-xs text-muted-foreground font-mono">{selectedWorkflow.id}</p>
                </div>
                <button
                  onClick={() => {
                    if (eventSourceRef.current) {
                      eventSourceRef.current.close();
                      eventSourceRef.current = null;
                    }
                    setSelectedWorkflow(null);
                    setLogs("");
                    setIsStreaming(false);
                    navigate('/workflows', { replace: true });
                  }}
                  className="p-2 hover:bg-muted/30 rounded-lg transition-colors text-muted-foreground hover:text-foreground shrink-0 ml-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mb-4 shrink-0">
                {selectedWorkflow.status === "running" ? (
                  <button
                    onClick={() => handleStopWorkflow(selectedWorkflow.id)}
                    disabled={actionLoading === selectedWorkflow.id}
                    className="px-3 py-1.5 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {actionLoading === selectedWorkflow.id ? (
                      <div className="w-3 h-3 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="6" y="6" width="12" height="12"/>
                      </svg>
                    )}
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => handleRunWorkflow(selectedWorkflow.id)}
                    disabled={actionLoading === selectedWorkflow.id}
                    className="px-3 py-1.5 text-sm bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {actionLoading === selectedWorkflow.id ? (
                      <div className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                    )}
                    Run
                  </button>
                )}

                {selectedWorkflow.schedule?.enabled && (
                  <button
                    onClick={() => handleUnschedule(selectedWorkflow.id)}
                    disabled={actionLoading === selectedWorkflow.id}
                    className="px-3 py-1.5 text-sm bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    Unschedule
                  </button>
                )}

                <button
                  onClick={() => handleDeleteWorkflow(selectedWorkflow.id)}
                  disabled={actionLoading === selectedWorkflow.id || selectedWorkflow.status === "running"}
                  className="px-3 py-1.5 text-sm bg-muted hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  title={selectedWorkflow.status === "running" ? "Stop the workflow before deleting" : "Delete workflow"}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Delete
                </button>
              </div>

              {/* Status & Schedule Info */}
              <div className="grid grid-cols-2 gap-3 mb-4 shrink-0">
                <div className="p-3 rounded-lg bg-card/50 border border-border">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <span className={`inline-flex items-center gap-1.5 text-sm px-2 py-0.5 rounded-full ${statusColors[selectedWorkflow.status]}`}>
                    <StatusIcon status={selectedWorkflow.status} />
                    {selectedWorkflow.status}
                  </span>
                </div>
                {selectedWorkflow.schedule?.enabled && (
                  <div className="p-3 rounded-lg bg-card/50 border border-border">
                    <p className="text-xs text-muted-foreground mb-1">Schedule</p>
                    <p className="text-sm text-purple-400">{formatSchedule(selectedWorkflow.schedule)}</p>
                    {selectedWorkflow.schedule.next_run && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Next: {dayjs(selectedWorkflow.schedule.next_run).format("MMM D, h:mm A")} ({dayjs(selectedWorkflow.schedule.next_run).fromNow()})
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Error */}
              {selectedWorkflow.error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 shrink-0">
                  <p className="text-xs text-red-400 font-medium mb-1">Error</p>
                  <p className="text-sm text-red-300">{selectedWorkflow.error}</p>
                </div>
              )}

              {/* Logs */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">Logs</h3>
                    {isStreaming && (
                      <span className="flex items-center gap-1.5 text-xs text-green-400">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        Live
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (isStreaming) {
                        // Reconnect to stream
                        connectToLogStream(selectedWorkflow.id);
                      } else {
                        loadLogs(selectedWorkflow.id);
                      }
                    }}
                    disabled={logsLoading}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    {logsLoading ? (
                      <div className="w-3 h-3 border border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/>
                        <path d="M21 3v5h-5"/>
                      </svg>
                    )}
                    Refresh
                  </button>
                </div>
                <div 
                  ref={logsContainerRef}
                  className="flex-1 overflow-auto bg-card/30 rounded-lg border border-border p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap min-h-0"
                >
                  {logsLoading && !logs ? (
                    <div className="text-muted-foreground">Loading logs...</div>
                  ) : (
                    <div className="text-muted-foreground">{logs || "No logs available."}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
