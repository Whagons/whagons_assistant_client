import { ContentItem, Message } from "../models/models";
export const HOST = import.meta.env.VITE_CHAT_HOST || "";

// Go backend message format
interface DBMessage {
  ID: number;
  CreatedAt: string;
  UpdatedAt: string;
  ConversationID: string;
  Sequence: number;
  Role: string; // "user" or "model"
  Type: string;
  PartsJSON: string; // JSON string that needs parsing
}

type ChatMessage = Message;

// Helper function to check if content is an array of ContentItems
export function isContentItemArray(content: any): content is ContentItem[] {
  return Array.isArray(content);
}

export function convertToChatMessages(messages: DBMessage[]): ChatMessage[] {
  return messages.flatMap((dbMessage) => {
    const outputMessages: ChatMessage[] = [];
    
    // Skip messages with undefined or empty PartsJSON
    if (!dbMessage.PartsJSON || dbMessage.PartsJSON === "" || dbMessage.PartsJSON === "null") {
      console.warn("Skipping message with undefined PartsJSON:", dbMessage.ID);
      return outputMessages;
    }
    
    try {
      // Parse the JSON string
      const parsed = JSON.parse(dbMessage.PartsJSON);
      const parts = Array.isArray(parsed) ? parsed : [parsed];
      
      // Handle Go backend format: [{text: "..."}, ...] or [{function_call: {...}}, ...]
      const role = dbMessage.Role === "user" ? "user" : "assistant";
      
      // Collect different types of content separately
      let textContent = "";
      let reasoningContent = "";
      const toolCalls: ChatMessage[] = [];
      const toolResults: ChatMessage[] = [];
      
      for (const part of parts) {
        if (part.text) {
          // Simple text part
          textContent += part.text;
        }
        
        // Handle reasoning content (chain-of-thought from models like Kimi K2.5, DeepSeek-R1)
        if (part.reasoning) {
          reasoningContent += part.reasoning;
        }
        
        // Handle function_call (tool_call)
        if (part.functionCall) {
          console.log('[convertToChatMessages] Found functionCall:', part.functionCall.name, 'id:', part.functionCall.id);
          toolCalls.push({
            role: "tool_call",
            content: {
              tool_call_id: part.functionCall.id,
              name: part.functionCall.name,
              args: part.functionCall.args,
            }
          });
        }
        
        // Handle function_response (tool_result)
        if (part.function_response) {
          console.log('[convertToChatMessages] Found function_response:', part.function_response.name, 'id:', part.function_response.id);
          toolResults.push({
            role: "tool_result",
            content: {
              tool_call_id: part.function_response.id,
              name: part.function_response.name,
              content: part.function_response.response?.result || part.function_response.response,
            }
          });
        }
      }
      
      // Output order matters for timeline grouping:
      // 1. Text content FIRST (so it doesn't break tool_call/tool_result consecutive grouping)
      // 2. Tool calls
      // 3. Tool results
      // This ensures tool_calls and tool_results stay consecutive across DB message boundaries
      if (textContent || reasoningContent) {
        const msg: ChatMessage = { role, content: textContent };
        if (reasoningContent) {
          msg.reasoning = reasoningContent;
        }
        outputMessages.push(msg);
      }
      outputMessages.push(...toolCalls);
      outputMessages.push(...toolResults);
      
    } catch (e) {
      console.error(`Error processing DB message (ID: ${dbMessage.ID}):`, e);
      console.error("Original PartsJSON:", dbMessage.PartsJSON);
    }
    return outputMessages; // Return whatever valid messages were parsed, or empty if parse failed
  });
}

export function pythonReprStringToJsObject(pyString: string) {
  // 1. Replace Python bools/None with JSON equivalents
  let jsonString = pyString
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null');

  // 2. Replace single quotes with double quotes carefully
  // This is tricky because single quotes can appear *inside* strings.
  // A common approach is to handle keys and values separately,
  // or use more complex regex, but a simpler (potentially fragile)
  // approach for *this specific structure* might be:

  // Temporarily replace escaped single quotes inside strings
  jsonString = jsonString.replace(/\\'/g, '__TEMP_SINGLE_QUOTE__');

  // Replace single quotes used for keys and string boundaries
  // Match 'key': or 'string', etc.
  // This regex tries to match single quotes around keys and string values
  // It assumes keys are simple words/hyphens and avoids touching numbers/bools/null
  jsonString = jsonString.replace(/'([\w\s\-\/.:]+?)'\s*:/g, '"$1":'); // Keys
  jsonString = jsonString.replace(/:\s*'(.+?)'(?=[,\}])/g, ': "$1"');  // String values (heuristic)
  // Handle potential remaining strings at the end
  jsonString = jsonString.replace(/:\s*'(.+?)'$/g, ': "$1"');

  // Restore the escaped single quotes within the now double-quoted strings
  jsonString = jsonString.replace(/__TEMP_SINGLE_QUOTE__/g, "\\'"); // Or just "'" if needed inside JS string

  // 3. Attempt to parse the potentially valid JSON string
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed to parse string after replacements:", error);
    console.error("String after replacements:", jsonString); // Log for debugging
    // Fallback or throw error - parsing failed
    // You might need more robust regex or a different approach
    // if the structure is more complex than the example.
    return null; // Or throw new Error("Could not parse Python string representation");
  }
}
