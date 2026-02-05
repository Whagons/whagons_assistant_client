import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmationDialogProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * ConfirmationDialog component for agent confirmation requests.
 * Used when the AI agent calls Confirm_With_User tool to get user confirmation
 * before executing an action.
 */
export function ConfirmationDialog({
  open,
  title = "Confirm Action",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  // Track if user has already responded to prevent duplicate sends
  // (clicking Confirm/Cancel triggers both onClick AND onOpenChange)
  const hasResponded = React.useRef(false);

  const handleConfirm = () => {
    if (hasResponded.current) return;
    hasResponded.current = true;
    onConfirm();
  };

  const handleCancel = () => {
    if (hasResponded.current) return;
    hasResponded.current = true;
    onCancel();
  };

  // Reset ref when dialog opens
  React.useEffect(() => {
    if (open) {
      hasResponded.current = false;
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => !isOpen && handleCancel()}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap text-muted-foreground">
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ConfirmationDialog;
