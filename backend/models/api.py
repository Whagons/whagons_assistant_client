from typing import List, Union
from pydantic import BaseModel, Field
from pydantic_ai.messages import (
    ImageUrl, AudioUrl, DocumentUrl, BinaryContent,
    FinalResultEvent, FunctionToolCallEvent, FunctionToolResultEvent, PartDeltaEvent, PartStartEvent
)


# --- Auth Models ---

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


# --- Chat & Agent API Models ---

class ImageUrlContent(BaseModel):
    url: str
    media_type: str = Field(..., pattern="^image/.*")
    kind: str = "image-url"


class AudioUrlContent(BaseModel):
    url: str
    media_type: str = Field(..., pattern="^audio/.*")
    kind: str = "audio-url"


class DocumentUrlContent(BaseModel):
    url: str
    media_type: str = Field(
        ...,
        pattern="^(application/pdf|text/plain|text/csv|application/vnd.openxmlformats-officedocument.wordprocessingml.document|application/vnd.openxmlformats-officedocument.spreadsheetml.sheet|text/html|text/markdown|application/vnd.ms-excel)$",
    )
    kind: str = "document-url"


class BinaryContentModel(BaseModel):
    data: bytes
    media_type: str
    kind: str = "binary"


class ChatContent(BaseModel):
    content: Union[
        str, ImageUrlContent, AudioUrlContent, DocumentUrlContent, BinaryContentModel
    ]


class ChatRequest(BaseModel):
    content: List[ChatContent]

    def to_user_content(
        self,
    ) -> List[Union[str, ImageUrl, AudioUrl, DocumentUrl, BinaryContent]]:
        """Convert the request content to the format expected by agent.iter"""
        result = []
        for item in self.content:
            if isinstance(item.content, str):
                result.append(item.content)
            elif isinstance(item.content, ImageUrlContent):
                result.append(ImageUrl(url=item.content.url))
            elif isinstance(item.content, AudioUrlContent):
                result.append(AudioUrl(url=item.content.url))
            elif isinstance(item.content, DocumentUrlContent):
                result.append(DocumentUrl(url=item.content.url))
            elif isinstance(item.content, BinaryContentModel):
                result.append(
                    BinaryContent(
                        data=item.content.data, media_type=item.content.media_type
                    )
                )
        return result


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

