from typing import List, Callable, Any, TypeVar, AsyncGenerator
from lib.Classes import Message, Role, Part, PartType, ToolCallMessage
from functools import wraps


RT = TypeVar("RT")

DEFAULT_SYSTEM = "You are a helpful friendly assistant. Please answer clearly and concisely. You are part of a home assitant system, only use tools calls after asking the user"



class RunResult:
    def __init__(self, message: Message, message_history: List[Message]):
        self.message = message
        self.message_history = message_history

    def __repr__(self):
        return (
            f"RunResult(message={self.message}, message_history={self.message_history})"
        )

    @property
    def text(self) -> str:
        """Returns the text content of the message."""
        if (
            not self.message
            or not self.message.parts
            or not self.message.parts[0].content
        ):
            return ""

        # Combine text from all text parts
        text_parts = [
            part.content["text"]
            for part in self.message.parts
            if part.type == PartType.TEXT
        ]
        return "".join(text_parts)

class Agent:
    tools = []

    def __init__(self, model=None, system_prompt=DEFAULT_SYSTEM, tools=[]):
        self.model = model
        self.system_prompt = system_prompt
        #tools are raw functions I must turn them into real tools
        for tool in tools:
            self.tools.append(self.tool(tool))

    def tool(self, func: Callable[..., RT]) -> Callable[..., RT]:
        """Decorator to register a function as a tool."""

        @wraps(func)  # Preserves docstring and other metadata
        def wrapper(*args: Any, **kwargs: Any) -> RT:
            tool_call_result = func(*args, **kwargs)
            return {
                "functionResponse": {
                    "name": func.__name__,
                    "response": {
                        "name": func.__name__,
                        "content": tool_call_result,
                    },
                }
            }

        self.tools.append(wrapper)
        return wrapper

    async def run(self, prompt: str, message_history: List[Message] = []) -> RunResult:
        messages = [Message(Role.USER, [Part(PartType.TEXT, prompt)])]
        messages.extend(message_history)

        result = await self.model.Chat(messages, self.tools)
        # print("message",result)

        while isinstance(result, ToolCallMessage):
            # Add the tool call to messages
            messages.append(result)

            # Execute the tool call
            tool_call_result_parts = result.run()




            messages.append(
                Message(
                    Role.TOOL_RESPONSE,
                    [Part(PartType.TOOL_RESPONSE, result) for result in tool_call_result_parts],
                ),
            )

            result = await self.model.Chat(messages, self.tools)
            messages.append(result)

        return RunResult(result, messages)
    

    async def run_stream(self, prompt: str, message_history: List[Message] = []) -> AsyncGenerator[str, None]:
        """
        Runs the agent and returns an asynchronous generator that yields parts of the response as they become available.
        """

        messages = [Message(Role.USER, [Part(PartType.TEXT, prompt)])]
        messages.extend(message_history)

        async for chunk in self.model.ChatStream(messages, self.tools):
            #accumulate parts
            parts = []
            for part in chunk["candidates"][0]["content"]["parts"]:
                if "text" in part:
                    parts.append(Part(PartType.TEXT, part["text"]))
                elif "functionCall" in part:
                    parts.append(Part(PartType.TOOL_CALL, part))
            # print(chunk)
            yield chunk
    