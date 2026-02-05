export type FrontendToolPromptMessage = {
  type: "frontend_tool_prompt";
  tool?: string;
  action?: string;
  data?: {
    message?: string;
    title?: string;
    default_value?: string;
    confirm_label?: string;
    cancel_label?: string;
    [key: string]: any;
  };
  [key: string]: any;
};

export type SendFrontendToolResponse = (payload: {
  type: "frontend_tool_response";
  tool?: string;
  response: string;
}) => void;

/**
 * Confirmation dialog request that can be shown by the UI
 */
export type ConfirmationRequest = {
  tool?: string;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Callback type for showing confirmation dialogs
 * The UI component should call this with the request details
 */
export type ShowConfirmationCallback = (request: ConfirmationRequest) => void;

/**
 * Handle "frontend_tool_prompt" messages from the backend.
 * Keep UI-side tool behavior out of ChatWindow.
 * 
 * @param data - The frontend tool prompt message from the backend
 * @param send - Callback to send the response back to the backend
 * @param showConfirmation - Optional callback for showing confirmation dialogs (for Confirm_With_User)
 */
export function handleFrontendToolPromptMessage(
  data: FrontendToolPromptMessage,
  send: SendFrontendToolResponse,
  showConfirmation?: ShowConfirmationCallback,
): boolean {
  const action = data?.action;
  const msg = data?.data?.message;

  if (action === "browser_prompt" && msg) {
    const userInput = prompt(msg, data?.data?.default_value || "");
    send({
      type: "frontend_tool_response",
      tool: data?.tool,
      response: userInput !== null ? userInput : "(User cancelled)",
    });
    return true;
  }

  if (action === "browser_alert" && msg) {
    alert(msg);
    send({ type: "frontend_tool_response", tool: data?.tool, response: "ok" });
    return true;
  }

  // Handle Confirm_With_User tool - shows a shadcn AlertDialog
  if (action === "confirm_with_user" && msg) {
    if (showConfirmation) {
      // Use the callback-based confirmation dialog
      showConfirmation({
        tool: data?.tool,
        title: data?.data?.title || "Confirm Action",
        message: msg,
        confirmLabel: data?.data?.confirm_label || "Confirm",
        cancelLabel: data?.data?.cancel_label || "Cancel",
        onConfirm: () => {
          send({
            type: "frontend_tool_response",
            tool: data?.tool,
            response: "confirmed",
          });
        },
        onCancel: () => {
          send({
            type: "frontend_tool_response",
            tool: data?.tool,
            response: "cancelled",
          });
        },
      });
    } else {
      // Fallback to browser confirm if no callback provided
      const confirmed = confirm(msg);
      send({
        type: "frontend_tool_response",
        tool: data?.tool,
        response: confirmed ? "confirmed" : "cancelled",
      });
    }
    return true;
  }

  return false;
}

