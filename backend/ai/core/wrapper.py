import typing as t
import logging
import json
# Import base classes and definitions from pydantic-ai
from pydantic_ai.mcp import MCPServer, MCPServerStdio, MCPServerHTTP
from pydantic_ai.tools import ToolDefinition
from pydantic_ai.mcp import CallToolResult
from pydantic_ai.messages import RetryPromptPart, ToolReturnPart

# Ensure 'override' decorator is available
try:
    # Try standard library first (Python 3.12+)
    from typing import override
except ImportError:
    try:
        # Fallback to typing_extensions
        from typing_extensions import override
    except ImportError:
        # If neither is available, create a dummy decorator
        def override(func):
            return func

log = logging.getLogger(__name__) # Setup logger for the mixin

# --- The Enhanced Translator Mixin ---
class MCPServerMixin(MCPServer):
    """
    Acts as a translation layer for Gemini compatibility:
    1. Removes '$schema'.
    2. Transforms 'queryParams' schema to list of key-value pairs.
    3. Transforms 'queryParams' arguments back to dict.
    4. Modifies 'body' schema to expect a JSON string. <--- NEW
    5. Parses the 'body' JSON string back into an object during call_tool. <--- NEW
    6. Ensures other objects have 'additionalProperties: false'.
    """
    _QUERY_PARAMS_KEY = "queryParams"
    _BODY_KEY = "body" # Standardize the body key name

    @override
    async def list_tools(self) -> list[ToolDefinition]:
        # ... (fetching logic remains the same) ...
        log.debug("Fetching original tools list...")
        try:
            original_tools = await super().list_tools()
            log.debug(f"Received {len(original_tools)} tools from base server.")
        except Exception as e:
            log.exception("Error fetching tools from base server.")
            raise

        modified_tools = []
        for tool in original_tools:
            try:
                modified_tools.append(self._modify_schema(tool))
            except Exception as e:
                log.exception(f"Error modifying schema for tool '{tool.name}'. Skipping tool.")
        return modified_tools


    @override
    async def call_tool(self, tool_name: str, arguments: dict[str, t.Any]) -> t.Any: # Changed return type hint
        """
        Intercepts tool calls, transforms arguments, calls the base server,
        and returns the *serializable result* from the CallToolResult object.
        """
        log.debug(f"Intercepting call_tool for '{tool_name}' with raw args: {arguments}")
        transformed_arguments = arguments.copy() # Work on a copy

        # --- Transform queryParams (existing logic) ---
        # ... (Keep the queryParams transformation logic) ...
        query_param_value = transformed_arguments.get(self._QUERY_PARAMS_KEY)
        if isinstance(query_param_value, list):
            log.debug(f"Transforming '{self._QUERY_PARAMS_KEY}' from list to dict.")
            param_dict = {}
            malformed_items = []
            for item in query_param_value:
                 if isinstance(item, dict) and "key" in item and "value" in item:
                      key = str(item["key"])
                      value = item["value"]
                      param_dict[key] = str(value)
                 else:
                     malformed_items.append(item)
            if malformed_items: log.warning(f"Skipped malformed queryParam items: {malformed_items}")
            transformed_arguments[self._QUERY_PARAMS_KEY] = param_dict
            log.debug(f"Transformed '{self._QUERY_PARAMS_KEY}': {param_dict}")
        elif query_param_value is not None:
             log.warning(f"Expected list for '{self._QUERY_PARAMS_KEY}', got {type(query_param_value)}. Passing as is.")


        # --- Parse body JSON string (existing logic) ---
        # ... (Keep the body parsing logic) ...
        body_value = transformed_arguments.get(self._BODY_KEY)
        if isinstance(body_value, str):
            log.debug(f"Found '{self._BODY_KEY}' as string, attempting JSON parsing.")
            try:
                parsed_body = json.loads(body_value)
                transformed_arguments[self._BODY_KEY] = parsed_body
                log.debug(f"Successfully parsed '{self._BODY_KEY}' JSON string.")
            except json.JSONDecodeError as e:
                log.error(f"Failed to parse JSON string for '{self._BODY_KEY}': {e}. Passing raw string.")
        elif body_value is not None:
             log.warning(f"Expected string for '{self._BODY_KEY}', got {type(body_value)}. Passing as is.")


        # Call the original call_tool
        log.debug(f"Calling base call_tool for '{tool_name}' with transformed args: {transformed_arguments}")
        try:
            # This returns the CallToolResult object from the base class
            mcp_result_obj: CallToolResult = await super().call_tool(tool_name, transformed_arguments)

            # --- START: Extract serializable data ---
            # Check if the result is a RetryPromptPart (error case)
            if isinstance(mcp_result_obj, RetryPromptPart):
                log.error(f"MCP tool '{tool_name}' reported an error: {mcp_result_obj.content}")
                # Return a dictionary representation of the error
                return {
                    "error": {
                        "message": mcp_result_obj.content
                    }
                }
            # Check if the result is a ToolReturnPart (success case)
            elif isinstance(mcp_result_obj, ToolReturnPart):
                log.debug(f"Received successful result from base call_tool for '{tool_name}'. Returning content field.")
                return mcp_result_obj.content
            else:
                # For any other type, try to convert to a dictionary
                log.warning(f"Unexpected result type from call_tool: {type(mcp_result_obj)}")
                try:
                    # Try to get a dictionary representation
                    if hasattr(mcp_result_obj, 'model_dump'):
                        return mcp_result_obj.model_dump()
                    elif hasattr(mcp_result_obj, 'dict'):
                        return mcp_result_obj.dict()
                    else:
                        # If no conversion method available, return a basic representation
                        return {
                            "type": type(mcp_result_obj).__name__,
                            "value": str(mcp_result_obj)
                        }
                except Exception as e:
                    log.error(f"Failed to convert result to JSON-serializable format: {e}")
                    return {
                        "error": {
                            "message": f"Failed to process result: {str(e)}"
                        }
                    }
            # --- END: Extract serializable data ---

        except Exception as e:
            log.exception(f"Exception calling base call_tool or processing result for '{tool_name}'.")
            raise # Re-raise the exception

    # --- Schema Modification Helpers ---

    def _modify_schema(self, tool: ToolDefinition) -> ToolDefinition:
        # ... (logic to remove $schema remains the same) ...
        log.debug(f"Modifying schema for tool '{tool.name}'...")
        schema = tool.parameters_json_schema
        if not isinstance(schema, dict):
            log.warning(f"Tool '{tool.name}' schema is not dict: {type(schema)}. Cannot modify.")
            return tool

        original_schema_key = schema.pop("$schema", None)
        if original_schema_key: log.debug(f"Removed '$schema' key.")

        self._process_schema_node(schema)
        log.debug(f"Finished modifying schema for tool '{tool.name}'.")
        return tool


    def _process_schema_node(self, schema_part: t.Any):
        """Recursively traverses schema, fixing queryParams, body type, and setting additionalProperties=False."""
        if isinstance(schema_part, dict):
            is_object_type = schema_part.get("type") == "object"

            if "properties" in schema_part and isinstance(schema_part["properties"], dict):
                properties_copy = list(schema_part["properties"].items()) # Iterate over copy
                for prop_name, prop_schema in properties_copy:
                    if prop_name == self._QUERY_PARAMS_KEY and self._is_original_query_params_node(prop_schema):
                        # *** REPLACE the queryParams schema ***
                        schema_part["properties"][prop_name] = self._get_key_value_list_schema()
                        log.debug(f"Replaced schema for '{self._QUERY_PARAMS_KEY}'.")
                        # No further recursion needed for this replaced node

                    # --- START: Modify 'body' schema to string ---
                    elif prop_name == self._BODY_KEY and isinstance(prop_schema, dict):
                        log.debug(f"Replacing schema for '{self._BODY_KEY}' with JSON string type.")
                        schema_part["properties"][prop_name] = {
                            "type": "string",
                            "description": f"REQUIRED: The request {self._BODY_KEY} as a valid JSON string. Example for creating a user: '{{\"displayName\":\"Test User\",\"mailNickname\":\"testuser\",\"userPrincipalName\":\"testuser@yourdomain.com\",\"passwordProfile\":{{\"password\":\"StrongPwd!123\",\"forceChangePasswordNextSignIn\":false}}}}'. Escape quotes within the string properly.",
                        }
                        # No recursion needed for this simple string type
                    # --- END: Modify 'body' schema to string ---

                    else:
                        # Recurse into other properties normally
                         self._process_schema_node(prop_schema)

            # --- Set additionalProperties=False for other objects ---
            if is_object_type:
                 if schema_part.get("additionalProperties", True) is not False:
                     # Check it's not the queryParams inner object type (handled by its own schema)
                     # Check it's not the body schema we just replaced (it's now string type)
                     schema_part["additionalProperties"] = False
                     log.debug(f"Set additionalProperties=False for generic object node.")

            # --- Recurse into other schema structures ---
            if "items" in schema_part:
                self._process_schema_node(schema_part["items"])

        elif isinstance(schema_part, list):
            for item in schema_part:
                self._process_schema_node(item)

    def _is_original_query_params_node(self, node: t.Any) -> bool:
        """Checks if a schema node represents the original Lokka queryParams structure."""
        return (
            isinstance(node, dict) and
            node.get("type") == "object" and
            # Check that additionalProperties exists and IS a dictionary
            isinstance(node.get("additionalProperties"), dict) and
            # Check the type within additionalProperties
            node["additionalProperties"].get("type") == "string"
        )

    def _get_key_value_list_schema(self) -> dict:
        """Returns the JSON schema for an array of {key: string, value: string} objects."""
        return {
            "type": "array",
            "description": f"Query parameters as a list of key-value pairs. Example: [{{\"key\": \"$filter\", \"value\": \"startswith(displayName,'A')\"}}, {{\"key\": \"$top\", \"value\": \"5\"}}]",
            "items": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "description": "The query parameter name (e.g., $filter, $select, $top)."
                        },
                    "value": {
                        "type": "string",
                        "description": "The query parameter value (as a string)."
                        }
                },
                "required": ["key", "value"],
                "additionalProperties": False # Gemini requires this for nested objects too
            }
        }


# --- Your Concrete Wrapper Classes (use the mixin) ---
class MCPServerStdioSchema(MCPServerMixin, MCPServerStdio):
    """
    Stdio MCP Server using the translation mixin for Gemini compatibility.
    Inherits constructor and stdio logic from MCPServerStdio.
    """
    pass

class MCPServerHTTPSchema(MCPServerMixin, MCPServerHTTP):
    """
    HTTP MCP Server using the translation mixin for Gemini compatibility.
    Inherits constructor and HTTP logic from MCPServerHTTP.
    """
    pass

# --- Example Usage (Conceptual) ---
# import asyncio
# import os

# # Configure logging
# logging.basicConfig(level=logging.DEBUG)

# async def main():
#     tenant_id = os.getenv("TENANT_ID")
#     client_id = os.getenv("CLIENT_ID")
#     client_secret = os.getenv("CLIENT_SECRET")

#     # Use the wrapper class
#     server = MCPServerStdioSchema(
#         "npx",
#         ["-y", "@merill/lokka", "stdio"],
#         env={
#             "TENANT_ID": tenant_id,
#             "CLIENT_ID": client_id,
#             "CLIENT_SECRET": client_secret,
#         },
#     )

#     async with server:
#         print("Server running...")
#         tools = await server.list_tools()
#         print("\nModified Tools Schema:")
#         import json
#         print(json.dumps([t.model_dump() for t in tools], indent=2)) # Use model_dump for Pydantic v2

#         # --- Simulate a tool call ---
#         print("\nSimulating tool call with queryParams list...")
#         # This is how the LLM might structure the arguments based on the modified schema
#         simulated_args_from_llm = {
#             "path": "/users",
#             "method": "get",
#             "queryParams": [
#                 {"key": "$filter", "value": "startswith(displayName,'Test')"},
#                 {"key": "$select", "value": "id,displayName"}
#             ]
#         }
#         # The overridden call_tool will transform this before sending to Lokka
#         # Note: This doesn't actually *run* Lokka here, just shows the interception
#         try:
#             # Replace with actual tool name if different
#             tool_name = next((t.name for t in tools), "Lokka-MicrosoftGraph") # Find tool name dynamically
#             if tool_name:
#                  # await server.call_tool(tool_name, simulated_args_from_llm)
#                  print(f"call_tool for '{tool_name}' would be intercepted and args transformed.")
#             else:
#                  print("Could not find Lokka tool to simulate call.")
#         except Exception as e:
#             print(f"Simulated call_tool interception failed: {e}")

# if __name__ == "__main__":
#      # Make sure environment variables are set before running
#      # export TENANT_ID=... CLIENT_ID=... CLIENT_SECRET=...
#      asyncio.run(main())