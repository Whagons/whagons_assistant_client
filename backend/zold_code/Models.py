import os
from abc import ABC, abstractmethod
import base64
import aiohttp  # For asynchronous HTTP requests
from typing import List, Dict, Optional, Callable, Any, AsyncIterator, get_origin
import json
from lib.Classes import Part, PartType, Message, ToolCallMessage, AssistantMessage, Role
import inspect


class Model(ABC):
    def __init__(
        self, base_url=os.getenv("AI_BASE_URL"), api_key=os.getenv("AI_DEFAULT_KEY")
    ):  # Optional parameters
        self.base_url = base_url
        self.api_key = api_key

    @abstractmethod
    def Chat(self, messages, tools):
        pass

    @abstractmethod
    def ChatStream(self, messages, tools):
        pass

    async def get_image_data_from_url(image_url: str) -> Dict[str, str]:
        """
        Asynchronously fetches image data from a URL, encodes it to base64,
        and returns a dictionary containing the MIME type and base64 data.
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(image_url) as response:
                    response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
                    image_data = await response.read()
                    mime_type = response.headers.get(
                        "Content-Type", "image/jpeg"
                    )  # Default to JPEG if not found
                    base64_encoded = base64.b64encode(image_data).decode("utf-8")
                    return {"mimeType": mime_type, "imageBase64": base64_encoded}
        except aiohttp.ClientError as e:
            print(f"Error fetching image from {image_url}: {e}")
            return None
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return None


class GeminiModel(Model):
    def __init__(
        self, model="gemini-2.0-flash", api_key=os.getenv("AI_DEFAULT_KEY")
    ):  # Optional parameters
        super().__init__(
            "https://generativelanguage.googleapis.com/v1beta/models/", api_key
        )
        self.url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        self.stream_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={api_key}"

    async def Chat(
        self, messages: List[Message], tools: List[Callable] = []
    ) -> Optional[str]:
        """
        Asynchronously sends a list of messages to the Gemini API and returns the generated text.

        Args:
            messages: A list of Message objects representing the conversation history.
            tools: A list of Python functions representing available tools.

        Returns:
            The full JSON response from the Gemini API, or None if an error occurred.
        """

        contents = []
        tools_formatted = self.tools_to_gemini_format(tools)

        for message in messages:
            parts = []
            if message.role == Role.USER and hasattr(message, "parts"):
                for part in message.parts:
                    if part.type == PartType.TEXT:
                        parts.append({"text": part.content})
                    elif part.type == PartType.IMAGE_URL:
                        image_data = await super.get_image_data_from_url(part.content)
                        if image_data:
                            parts.append({"text": "Describe this image."})
                            parts.append(
                                {
                                    "inlineData": {
                                        "mimeType": image_data["mimeType"],
                                        "data": image_data["imageBase64"],
                                    }
                                }
                            )
                        else:
                            print(f"Skipping image part due to retrieval error: {part}")
                    else:
                        print(f"Unknown part type: {part.type}. Skipping.")
            elif (
                message.role == Role.TOOL_RESPONSE
                and hasattr(message, "parts")
                and message.parts
            ):
                for part in message.parts:
                    if part.type == PartType.TOOL_RESPONSE:
                        parts.append(part.content)
            elif (
                message.role == Role.TOOL_CALL
                and hasattr(message, "parts")
                and message.parts
            ):
                for part in message.parts:
                    if part.type == PartType.TOOL_CALL:
                        parts.append(part.content)
            else:
                print(
                    f"message.content is missing parts or is not properly structured: {message}"
                )

            contents.append(
                {
                    "role": "user"
                    if message.role in [Role.USER, Role.TOOL_RESPONSE]
                    else "model",  # Map to Gemini roles
                    "parts": [part for part in parts],
                }
            )

        data = {
            "contents": contents,
        }

        # save content to json to inspect

        if tools_formatted:
            data["tools"] = tools_formatted

        with open("content.json", "w") as f:
            json.dump(data, f)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.url,
                    headers={"Content-Type": "application/json"},
                    data=json.dumps(data),
                ) as response:
                    response.raise_for_status()
                    response_data = await response.json()

                    # parse into specific message class
                    message = await self.parse_message(response_data, tools)
                    return message  # Returns the full data to be parsed upsteam

        except aiohttp.ClientError as e:
            print(f"Error fetching data from Gemini API: {e}")
            return None
        except KeyError as e:
            print(f"Error parsing response from Gemini API: Missing key: {e}")
            print(f"Response data: {response_data}")
            return None
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return None

    async def ChatStream(
        self, messages: List[Message], tools: List[Callable] = []
    ) -> AsyncIterator[Message]:
        """
        Asynchronously streams messages from the Gemini API.

        Args:
            messages: A list of Message objects representing the conversation history.
            tools: A list of Python functions representing available tools.

        Yields:
            Message objects containing the streamed responses.
        """

        contents = []
        tools_formatted = self.tools_to_gemini_format(tools)
        # save tools formatted to json
        with open("tools.json", "w") as f:
            json.dump(tools_formatted, f)

        for message in messages:
            parts = []
            if message.role == Role.USER and hasattr(message, "parts"):
                for part in message.parts:
                    if part.type == PartType.TEXT:
                        parts.append({"text": part.content})
                    elif part.type == PartType.IMAGE_URL:
                        image_data = await super.get_image_data_from_url(part.content)
                        if image_data:
                            parts.append({"text": "Describe this image."})
                            parts.append(
                                {
                                    "inlineData": {
                                        "mimeType": image_data["mimeType"],
                                        "data": image_data["imageBase64"],
                                    }
                                }
                            )
                        else:
                            print(f"Skipping image part due to retrieval error: {part}")
                    else:
                        print(f"Unknown part type: {part.type}. Skipping.")
            elif (
                message.role == Role.TOOL_RESPONSE
                and hasattr(message, "parts")
                and message.parts
            ):
                for part in message.parts:
                    if part.type == PartType.TOOL_RESPONSE:
                        parts.append(part.content)
            elif (
                message.role == Role.TOOL_CALL
                and hasattr(message, "parts")
                and message.parts
            ):
                for part in message.parts:
                    if part.type == PartType.TOOL_CALL:
                        parts.append(part.content)
            else:
                print(
                    f"message.content is missing parts or is not properly structured: {message}"
                )

            contents.append(
                {
                    "role": "user"
                    if message.role in [Role.USER, Role.TOOL_RESPONSE]
                    else "model",  # Map to Gemini roles
                    "parts": [part for part in parts],
                }
            )

        data = {
            "contents": contents,
        }

        if tools_formatted:
            data["tools"] = tools_formatted

        # Save request data as JSON for debugging/logging
        with open('gemini_request.json', 'w') as f:
            json.dump(data, f, indent=2)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.stream_url}",  # Use streaming endpoint
                    headers={"Content-Type": "application/json"},
                    data=json.dumps(data),
                ) as response:
                    response.raise_for_status()# Read the response as a stream of JSON objects
                    text_buffer = ""
                    index = 0

                    try:
                        async for line in response.content:
                            if not line:  # Skip empty lines
                                continue

                            text = line.decode('utf-8').strip()
                            text_buffer += text
                            try:
                                json_data = json.loads(text_buffer+"]")
                                index += 1
                                yield json_data[index-1]
                            except json.JSONDecodeError:
                                # If we can't decode yet, continue accumulating data
                                continue
                    except Exception as e:
                        print(f"Error processing line: {e}")
        except aiohttp.ClientError as e:
            print(f"Error fetching data from Gemini API: {e}")
            return
        except KeyError as e:
            print(f"Error parsing response from Gemini API: Missing key: {e}")
            return
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
            return

    # implement this
    async def parse_message(
        self, response_data: Dict[str, Any], tools: List[Callable]
    ) -> Message:
        """Parse Gemini API response data into a Message object"""
        if not response_data.get("candidates"):
            raise ValueError("No candidates in response data")

        candidate = response_data["candidates"][0]
        if not candidate.get("content"):
            raise ValueError("No content in candidate")

        content = candidate["content"]
        if not content.get("parts"):
            raise ValueError("No parts in content")

        # Extract text from parts
        parts = []
        for part in content["parts"]:
            if "text" in part:
                # print("text", part["text"])
                parts.append(Part(PartType.TEXT, part))
            elif "functionCall" in part:
                parts.append(Part(PartType.TOOL_CALL, part))
            else:
                print(f"Unknown part type in response: {part}")
                continue

        # Create Content object with parts
        message_content = parts

        # Determine message type based on content
        if any(p.type == PartType.TOOL_CALL for p in parts):
            # Get all tool call parts and find matching functions
            tool_funcs = []
            for part in parts:
                if part.type == PartType.TOOL_CALL:
                    tool_name = part.content["functionCall"]["name"]
                    tool_func = next(
                        (t for t in tools if t.__name__ == tool_name), None
                    )
                    if not tool_func:
                        raise ValueError(f"Tool {tool_name} not found")
                    tool_funcs.append(tool_func)
            return ToolCallMessage(message_content, tool_funcs)
        else:
            return AssistantMessage(message_content)

    def tools_to_gemini_format(self, tools: List[Callable]) -> List[Dict[str, Any]]:
        """
        Converts a list of Python functions to the format expected by Gemini's tools API.

        Args:
            tools: A list of Python functions, each representing a tool.
                It is assumed that each function has a docstring that describes its
                purpose and uses type hints for parameters and return value.

        Returns:
            A list of dictionaries, where each dictionary represents a function definition
            in the Gemini tools format, wrapped in "functionDeclarations".
            Returns an empty list if any error occurs in processing.
        """
        gemini_tools = []
        for tool in tools:
            try:
                signature = inspect.signature(tool)
                has_parameters = False  # Flag to track if the function has parameters

                parameters = {"type": "OBJECT", "properties": {}, "required": []}
                for param_name, param in signature.parameters.items():
                    has_parameters = (
                        True  # If we get to at least one param, the flag is set
                    )
                    annotation = param.annotation
                    if annotation is inspect._empty:
                        print(
                            f"Warning: Missing type annotation for parameter '{param_name}' in function '{tool.__name__}'. Skipping."
                        )
                        continue  # Skip parameters without type hints

                    param_type = None
                    param_properties = {}  # Default, will be overridden for lists/dicts

                    if annotation is str:
                        param_type = "STRING"
                    elif annotation is int or annotation is float:
                        param_type = "NUMBER"
                    elif annotation is bool:
                        param_type = "BOOLEAN"
                    elif get_origin(annotation) is list:  # Handle generic List
                        param_type = "ARRAY"
                        inner_type = annotation.__args__[0] if hasattr(annotation, '__args__') and annotation.__args__ else Any  # Try to get the list's element type
                        inner_gemini_type = "STRING"  # Default
                        if inner_type is str:
                            inner_gemini_type = "STRING"
                        elif inner_type is int or inner_type is float:
                            inner_gemini_type = "NUMBER"
                        elif inner_type is bool:
                            inner_gemini_type = "BOOLEAN"
                        param_properties = {
                            "type": "array",
                            "description": f"List of {inner_gemini_type.lower()}s",
                            "items": {
                                "type": inner_gemini_type.lower()
                            }
                        }

                    elif annotation is Dict[str, Any]:  # Example for Dict


                        param_type = "OBJECT"

                        # Check if this is the 'updates' parameter in the 'update_user' function
                        if tool.__name__ == "update_user" and param_name == "updates":

                            # Get the ALLOWED_UPDATE_PROPERTIES from the function
                            allowed_properties  = {
                                        "displayName",
                                        "jobTitle",
                                        "mailNickname",
                                        "mobilePhone",
                                        "officeLocation",
                                        "preferredLanguage",
                                        "usageLocation",
                                        "userPrincipalName",
                                        "userType",
                                        # Add other allowed properties here!
                                    }
                            if allowed_properties:
                                updates_properties = {}
                                for prop_name in allowed_properties:
                                    updates_properties[prop_name] = {
                                        "type": "string",  # Assuming string for all.  Could improve type detection
                                        "description": f"The new {prop_name} for the user (optional)."
                                    }

                                param_properties = {
                                    "type": "object",
                                    "description": "A JSON object containing properties to update.",
                                    "properties": updates_properties,
                                    "required": []  # No required properties in this example
                                }


                            else:
                                print(f"Warning: ALLOWED_UPDATE_PROPERTIES not found in {tool.__name__}.  Skipping property definitions.")
                                param_properties = {
                                    "type": "object",
                                    "description": "A JSON object containing properties to update (schema unknown).",
                                    "properties": {},
                                    "required": []
                                }


                    # Add more type mappings as needed, e.g.,
                    # elif annotation is List[int]:
                    #     param_type = "ARRAY" # Adjust as needed
                    # elif get_origin(annotation) is Union: # Handle Union types like Optional[str]
                    #     #  ... logic to extract underlying type ...

                    if param_type is None:
                        print(
                            f"Warning: Unsupported type annotation '{annotation}' for parameter '{param_name}' in function '{tool.__name__}'. Skipping."
                        )
                        continue  # Skip parameters with unsupported type hints

                    param_description = ""  # You might want to improve this by parsing docstrings for parameter descriptions
                    # Example using regex
                    # docstring = inspect.getdoc(tool)
                    # if docstring:
                    #    match = re.search(rf"{param_name}:\s*(.+?)(?=\n\s*\w+:|$)", docstring, re.DOTALL)
                    #    if match:
                    #       param_description = match.group(1).strip()
                    #  ****  THIS IS THE CORRECTED SECTION ****
                    if param_properties: # If we generated param_properties (for lists or Dicts) use them.
                        parameters["properties"][param_name] = param_properties
                    else:
                        parameters["properties"][param_name] = {
                            "type": param_type.lower(),
                            "description": param_description,
                        }

                    if (
                        param.default == inspect._empty
                    ):  # Check if parameter is required
                        parameters["required"].append(param_name)

                #  **** THIS SECTION WAS WRONGLY PLACED.  MUST BE *INSIDE* THE `try` BLOCK ****
                tool_description = inspect.getdoc(tool)
                if not tool_description:
                    print(
                        f"Warning: Missing docstring for function '{tool.__name__}'.  Skipping."
                    )
                    continue

                gemini_tool_def = {
                    "name": tool.__name__,
                    "description": tool_description,
                }

                # Add parameters ONLY if there are any parameters
                if has_parameters:
                    gemini_tool_def["parameters"] = parameters

                gemini_tool = {"functionDeclarations": [gemini_tool_def]}
                gemini_tools.append(gemini_tool)


            except Exception as e:
                print(f"Error processing tool '{tool.__name__}': {e}")
                #  Do *not* return here.  Skip the problem tool.
                continue  # Skip to the next tool

        return gemini_tools
            



def find_next_json_end(json_string):
    """
    Finds the end of the next JSON object in a string. This is a simplified solution
    that works when JSON objects are not nested deeply.  A full solution would need
    to track open and close braces/brackets more robustly.

    Args:
        json_string: The string to search.

    Returns:
        The index of the closing brace/bracket of the JSON object, or -1 if no valid JSON
        object end is found.
    """
    brace_count = 0
    bracket_count = 0
    in_string = False
    start_index = -1
    for i, char in enumerate(json_string):
        if char == '"' and (i == 0 or json_string[i - 1] != '\\'):
             in_string = not in_string #Detect if it is a string
        if not in_string: #only if we are not in string then continue
            if char == '{':
                if start_index == -1: #If this is the starting brace, record it.
                    start_index = i
                brace_count += 1
            elif char == '[':
                if start_index == -1: #If this is the starting bracket, record it.
                    start_index = i
                bracket_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0 and start_index != -1: #We have a complete object starting with brace
                    return i
            elif char == ']':
                bracket_count -= 1
                if bracket_count == 0 and start_index != -1: #We have a complete object starting with bracket
                    return i

    return -1  # No complete JSON object found