from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from requests import Session

from database.models import get_session, User, Conversation, Message as DBMessage
from models.general import ConversationCreate, MessageCreate
from ai.config.models import get_available_models


conversations_router = APIRouter(prefix="/chats")


@conversations_router.post("/conversations/", response_model=dict)
def create_conversation(
    request: Request,
    conversation: ConversationCreate,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    _ = getattr(current_user, 'uid', None)

    try:

        if conversation.user_id != current_user.uid:
            raise HTTPException(
                status_code=403,
                detail="Access denied: You can only create conversations for yourself",
            )

        user = session.get(User, conversation.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        # Inherit model from user's preferred_model at creation
        db_conversation = Conversation(
            title=conversation.title,
            user_id=conversation.user_id,
            model=user.preferred_model,
        )
        session.add(db_conversation)
        session.commit()
        session.refresh(db_conversation)

        

        return {"status": "success", "conversation": db_conversation}

    except HTTPException:
        raise
    except Exception:
        raise


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
    _ = getattr(current_user, 'uid', None)

    try:

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
            message_type=message.message_type,
            conversation_id=message.conversation_id,
        )
        session.add(db_message)
        conversation.updated_at = datetime.now()
        session.commit()
        session.refresh(db_message)

        

        return {"status": "success", "message": db_message}

    except HTTPException:
        raise
    except Exception:
        raise


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
            "message_type": message.message_type.value,
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

    # Ensure we have the DB user to read preferred_model (do not create here)
    user = session.get(User, current_user.uid)
    preferred_model = getattr(user, "preferred_model", None) if user else None

    if not conversation:
        # Do NOT auto-create conversations here; return existence=false and preferred model
        return {
            "status": "success",
            "conversation_id": conversation_id,
            "exists": False,
            "message_count": 0,
            "updated_at": None,
            "last_message_id": None,
            "model": preferred_model,
        }

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
        "exists": True,
        "message_count": message_count,
        "updated_at": conversation.updated_at.isoformat(),
        "last_message_id": last_message_id,
        "model": conversation.model or preferred_model,
    }


@conversations_router.get("/models", response_model=dict)
def list_models(request: Request):
    """List available models for the frontend dropdown."""
    return {"status": "success", "models": get_available_models()}


@conversations_router.patch("/conversations/{conversation_id}/model", response_model=dict)
def update_conversation_model(
    request: Request,
    conversation_id: str,
    model: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    convo = session.get(Conversation, conversation_id)
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if convo.user_id != current_user.uid:
        raise HTTPException(status_code=403, detail="Access denied")
    # Update conversation model and user's preferred_model
    convo.model = model
    user = session.get(User, current_user.uid)
    if user:
        user.preferred_model = model
    convo.updated_at = datetime.now()
    session.add(convo)
    session.commit()
    session.refresh(convo)
    return {"status": "success", "conversation": convo}


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


