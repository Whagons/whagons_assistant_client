from typing import List, Union
from enum import Enum
from pydantic import BaseModel

from pydantic_ai.messages import FinalResultEvent, FunctionToolCallEvent, FunctionToolResultEvent, PartDeltaEvent, PartStartEvent


class MessageType(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    TOOL_CALL = "tool_call"
    TOOL_RESPONSE = "tool_response"



class FirebaseUser:
    def __init__(self, uid: str, email: str, whitelisted: bool = False):
        self.uid = uid
        self.email = email
        self.whitelisted = whitelisted


class UserCredentials(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str


# Define request models for API endpoints
class UserCreate(BaseModel):
    email: str
    name: str = None


class ConversationCreate(BaseModel):
    title: str
    user_id: str


class MessageCreate(BaseModel):
    content: str
    message_type: MessageType = MessageType.USER
    conversation_id: str



class Part(BaseModel):
    type: str
    content: str

class ChatMessage(BaseModel):
    role: str
    parts: List[Part]


class AgentStreamEvent(BaseModel):
    type: str
    data: Union[
        PartStartEvent,
        PartDeltaEvent,
        FunctionToolCallEvent,
        FunctionToolResultEvent,
        FinalResultEvent,
    ]