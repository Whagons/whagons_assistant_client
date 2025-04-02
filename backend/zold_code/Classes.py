from enum import Enum
from typing import List, Any, Callable
from pydantic import BaseModel
from abc import ABC

class Role(Enum):
    ASSISTANT = "assistant"
    USER = "user"
    SYSTEM = "system"
    TOOL_CALL = "tool_call"
    TOOL_RESPONSE = "tool_response"


class PartType(Enum):
    TEXT = 1
    IMAGE_URL = 2
    TOOL_CALL = 3
    TOOL_RESPONSE = 4


class Part:
    def __init__(self, type: PartType, content: Any):
        self.type = type
        self.content = content

    def __repr__(self):
        return f"Part(type={self.type}, content={self.content})"  # Modified to print the content representation




class Message(ABC):
    def __init__(self, role: Role, parts: List[Part]):  # Optional parameters
        self.role = role
        self.parts = parts

    def __repr__(self):
        return f"Message(role={self.role}, parts={self.parts})"


class UserMessage(Message):
    def __init__(self, parts: List[Part]):
        super().__init__(Role.USER, parts)


class AssistantMessage(Message):
    def __init__(self, parts: List[Part]):
        super().__init__(Role.ASSISTANT, parts)


class SystemMessage(Message):
    def __init__(self, parts: List[Part]):
        super().__init__(Role.SYSTEM, parts)


class ToolCallMessage(Message):
    def __init__(self, parts: List[Part], funcs: List[Callable]):
        super().__init__(
            Role.TOOL_CALL, parts
        )  # Tool calls are made by the assistant

        self.function_calls = []
        for part in parts:
            if part.type == PartType.TOOL_CALL:
                # Find the matching function from funcs list
                func_name = part.content["functionCall"]["name"]
                func = next((f for f in funcs if f.__name__ == func_name), None)
                
                if func:
                    self.function_calls.append({
                        'func': func,  # Store the actual callable function
                        'args': part.content["functionCall"]["args"]
                    })
                else:
                    print(f"Warning: Function {func_name} not found in available tools")



    def __repr__(self):
        return f"ToolCallMessage(role={self.role}, parts={self.parts})"

    def run(self):
        """
        Makes the ToolCallMessage callable, executing all stored function calls.
        Returns a list of function results.
        """
        results = []
        for call in self.function_calls:
            func = call['func']
            args = call['args']
            results.append(func(**args))
        return results


class ToolResponseMessage(Message):
    def __init__(self, parts: List[Part]):
        super().__init__(
            Role.USER, parts
        )  # Tool responses come from the user (back to the LLM)

    def __repr__(self):
        return f"ToolResponseMessage(role={self.role}, parts={self.parts})"
