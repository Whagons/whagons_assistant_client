import { AlertTriangle, RefreshCw, X } from "lucide-react";

interface HistoryWarning {
  type: string;
  message: string;
  details: string;
}

interface HistoryWarningBannerProps {
  warnings: HistoryWarning[];
  onDismiss: () => void;
}

export default function HistoryWarningBanner({ warnings, onDismiss }: HistoryWarningBannerProps) {
  if (warnings.length === 0) return null;

  // Group warnings by message to avoid showing duplicates
  const uniqueWarnings = warnings.reduce((acc, w) => {
    const key = w.message;
    if (!acc.find(existing => existing.message === key)) {
      acc.push(w);
    }
    return acc;
  }, [] as HistoryWarning[]);

  // Check if any warnings are upload failures (temporary issues)
  const hasUploadFailures = uniqueWarnings.some(w => w.type === "upload_failed");
  
  // Choose appropriate header based on warning types
  const headerText = hasUploadFailures
    ? "Some files are being transferred to the new model"
    : "Some content from previous messages couldn't be transferred to this model";

  return (
    <div className="mx-4 mb-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
      <div className="flex items-start gap-3">
        {hasUploadFailures ? (
          <RefreshCw className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5 animate-spin" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-amber-600 dark:text-amber-400 text-sm mb-1">
            {headerText}
          </div>
          <ul className="text-xs text-amber-700/80 dark:text-amber-300/80 space-y-0.5">
            {uniqueWarnings.map((warning, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="text-amber-500 mt-0.5">•</span>
                <span title={warning.details}>
                  {warning.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={onDismiss}
          className="text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 p-1 -mr-1 -mt-1"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
