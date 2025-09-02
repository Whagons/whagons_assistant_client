from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from requests import Session

from ai.database.models import get_session, User, Conversation, Message as DBMessage
from models.general import ConversationCreate, MessageCreate

conversations_router = APIRouter(prefix="/chats")


@conversations_router.post("/conversations/", response_model=dict)
def create_conversation(
    request: Request,
    conversation: ConversationCreate,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only create conversations for yourself",
        )
    user = session.get(User, conversation.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db_conversation = Conversation(
        title=conversation.title, user_id=conversation.user_id
    )
    session.add(db_conversation)
    session.commit()
    session.refresh(db_conversation)
    return {"status": "success", "conversation": db_conversation}


@conversations_router.get("/conversations/{conversation_id}", response_model=dict)
def read_conversation(
    request: Request,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only view your own conversations",
        )
    return {"status": "success", "conversation": conversation}


@conversations_router.get("/users/{user_id}/conversations", response_model=dict)
def read_user_conversations(
    request: Request,
    user_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    if user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only view your own conversations",
        )
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "success", "conversations": user.conversations}


@conversations_router.post("/messages/", response_model=dict)
def create_message(
    request: Request,
    message: MessageCreate,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, message.conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only add messages to your own conversations",
        )
    db_message = DBMessage(
        content=message.content,
        is_user_message=message.is_user_message,
        conversation_id=message.conversation_id,
    )
    session.add(db_message)
    conversation.updated_at = datetime.now()
    session.commit()
    session.refresh(db_message)
    return {"status": "success", "message": db_message}


@conversations_router.get("/conversations/{conversation_id}/messages", response_model=dict)
def read_conversation_messages(
    request: Request,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only view messages from your own conversations",
        )
    sorted_messages = sorted(conversation.messages, key=lambda m: m.created_at)
    processed_messages = [
        {
            "id": message.id,
            "content": message.content,
            "is_user_message": message.is_user_message,
            "created_at": message.created_at.isoformat(),
            "updated_at": message.updated_at.isoformat(),
            "conversation_id": message.conversation_id,
        }
        for message in sorted_messages
    ]
    return {"status": "success", "messages": processed_messages}


@conversations_router.get("/conversations/{conversation_id}/verify", response_model=dict)
def verify_conversation_state(
    request: Request,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(
            status_code=403,
            detail="Access denied: You can only verify your own conversations",
        )

    sorted_messages = sorted(conversation.messages, key=lambda m: m.created_at)
    message_count = len(sorted_messages)
    last_message_id = sorted_messages[-1].id if sorted_messages else None

    return {
        "status": "success",
        "conversation_id": conversation_id,
        "message_count": message_count,
        "updated_at": conversation.updated_at.isoformat(),
        "last_message_id": last_message_id,
    }


@conversations_router.delete("/conversations/{conversation_id}")
def delete_conversation(
    request: Request,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conversation.user_id != current_user.uid:
        raise HTTPException(status_code=403, detail="Access denied: You can only delete your own conversations")
    session.delete(conversation)
    session.commit()
    return {"status": "success"}


