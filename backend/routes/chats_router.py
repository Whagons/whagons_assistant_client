import json
import os
import logging
from fastapi import APIRouter, Depends, Request, WebSocket, WebSocketDisconnect
from requests import Session
import asyncio

from ai.Manager import MyDeps, get_system_prompt
from ai.assistant_functions.memory_functions import get_memory_no_context
from pydantic_ai.messages import ImageUrl  # noqa: F401
from helpers.helper_funcs import geminiParts
from ai.models import get_session, User, Conversation
from fastapi.responses import JSONResponse
from services.chat_events import get_message_history
from services.chat_session import get_or_create_session, chat_sessions


from models.chat_models import (
    DocumentUrlContent,
    ChatRequest,
)


chats_router = APIRouter(prefix="/chats")
ws_chats_router = APIRouter(prefix="/chats")

# Streaming debug flag and logger (enable with env STREAM_DEBUG=1)
def STREAM_DEBUG() -> bool:
    # Evaluate at call time so .env loaded later still works
    return os.getenv("STREAM_DEBUG", "0") == "1"

stream_logger = logging.getLogger("chat.stream")

# Chat session state and helpers moved to services.chat_session
@chats_router.get("/running", response_model=dict)
def list_running_conversations(
    request: Request,
    session: Session = Depends(get_session),
):
    """Return conversation_ids currently running for this user."""
    current_user = request.state.user
    running: list[str] = []
    for conv_id, chat_session in chat_sessions.items():
        try:
            if not chat_session.is_running():
                continue
            convo = session.get(Conversation, conv_id)
            if convo and convo.user_id == current_user.uid:
                running.append(conv_id)
        except Exception:
            continue
    return {"status": "success", "running": running}



@chats_router.post("/chat")
async def chat(
    request: Request,
    chat_request: ChatRequest,
    conversation_id: str,
    session: Session = Depends(get_session),
):
    current_user = request.state.user
    """
    Endpoint to initiate a chat session and stream the response.
    Accepts a list of content that can be text, image URLs, or audio URLs.
    """
    # Get or create conversation
    conversation = session.get(Conversation, conversation_id)
    if not conversation:
        # Check if user exists in the database, create if not
        user = session.get(User, current_user.uid)
        if not user:
            user = User(
                id=current_user.uid,
                email=current_user.email,
                name=current_user.email.split("@")[0] if current_user.email else None,
            )
            session.add(user)
            session.commit()

        # Generate title using the mixed content
        title = await geminiParts(chat_request.to_user_content())
        conversation = Conversation(
            id=conversation_id,
            title=title,
            user_id=current_user.uid,
        )
        session.add(conversation)
        session.commit()

    # Get message history from the conversation
    message_history = get_message_history(conversation)
    
    # Check if message count is a multiple of 10 (excluding the new message we're about to add)
    message_count = len(conversation.messages)
    if message_count > 0 and message_count % 10 == 0:
        # Generate a new title based on recent conversation
        new_title = await geminiParts(chat_request.to_user_content())
        conversation.title = new_title
        session.commit()


    ##refresh system prompt
    # Get first text content for memory context
    text_content = next(
        (
            item.content
            for item in chat_request.content
            if isinstance(item.content, str)
        ),
        "",
    )

    ##only get memory if text content is not empty
    memory = get_memory_no_context(request.state.user.uid, text_content) if text_content != "" else None

    if len(message_history) > 0:
        system_prompt = message_history[0].parts[0].content
        if system_prompt:
            message_history[0].parts[0].content = get_system_prompt(
                request.state.user, memory
            )

    # In the chat endpoint, before creating the agent:
    has_pdfs = any(
        isinstance(item.content, DocumentUrlContent) 
        for item in chat_request.content 
        if hasattr(item, 'content') and hasattr(item.content, 'kind')
    )

    # Start or resume background chat session
    user_content = chat_request.to_user_content()
    if STREAM_DEBUG():
        try:
            # Brief content summary without heavy data
            kinds = []
            for item in chat_request.content:
                c = getattr(item, "content", None)
                if isinstance(c, str):
                    kinds.append("text")
                elif hasattr(c, "kind"):
                    kinds.append(str(getattr(c, "kind", "unknown")))
                else:
                    kinds.append(type(c).__name__)
            stream_logger.info(
                "chat:start user=%s conv=%s kinds=%s",
                getattr(current_user, "uid", None),
                conversation_id,
                ",".join(kinds),
            )
        except Exception:
            pass
    chat_session = get_or_create_session(conversation_id)
    await chat_session.start(current_user, user_content, has_pdfs=has_pdfs, memory=memory)

    # Do not hold the HTTP request open; background session streams via WebSocket
    return JSONResponse({"status": "started", "conversation_id": conversation_id}, status_code=202)


@chats_router.post("/chat/stop")
async def stop_chat(
    request: Request,
    conversation_id: str,
):
    """Stop a running chat session for the given conversation."""
    _ = request.state.user  # Reserved for future authorization checks per conversation
    chat_session = get_or_create_session(conversation_id)
    if not chat_session.is_running():
        return JSONResponse({"status": "not_running", "conversation_id": conversation_id})
    await chat_session.stop()
    return JSONResponse({"status": "stopped", "conversation_id": conversation_id})

async def get_user_confirmation(node, deps: MyDeps) -> bool:
    # Placeholder: actual confirmation should be driven by WebSocket messages
    return False




@ws_chats_router.websocket("/ws")
async def chat_ws(websocket: WebSocket, conversation_id: str):
    # Manual auth for WebSocket: read token from headers or query param
    token_header = websocket.headers.get('authorization')
    token_param = websocket.query_params.get('token')
    _token = None
    if token_header and token_header.lower().startswith('bearer '):
        _token = token_header.split(' ', 1)[1]
    elif token_param:
        _token = token_param

    # Optionally verify token here or allow anonymous if upstream proxies handle auth
    # We accept and proceed even if token is missing to avoid handshake failures in dev
    await websocket.accept()
    if STREAM_DEBUG():
        stream_logger.info("ws:open conv=%s", conversation_id)

    chat_session = get_or_create_session(conversation_id)

    async def forward_events():
        try:
            while True:
                chunk = await chat_session.queue.get()
                if chunk.startswith("data: "):
                    payload = chunk[len("data: ") :].strip()
                    if STREAM_DEBUG():
                        try:
                            d = json.loads(payload)
                            et = d.get("type")
                            kind = None
                            data = d.get("data") or {}
                            if isinstance(data, dict):
                                if "part" in data and isinstance(data["part"], dict):
                                    kind = data["part"].get("part_kind")
                                elif "delta" in data and isinstance(data["delta"], dict):
                                    kind = data["delta"].get("part_kind")
                            stream_logger.info("ws:send conv=%s type=%s kind=%s", conversation_id, et, kind)
                        except Exception:
                            pass
                    await websocket.send_text(payload)
                else:
                    await websocket.send_text(chunk)
        except asyncio.CancelledError:
            return

    producer = asyncio.create_task(forward_events())
    try:
        while True:
            _ = await websocket.receive_text()
            await websocket.send_text(json.dumps({"type": "ack"}))
    except WebSocketDisconnect:
        producer.cancel()
        if STREAM_DEBUG():
            stream_logger.info("ws:close conv=%s", conversation_id)
    except Exception:
        producer.cancel()
        if STREAM_DEBUG():
            stream_logger.exception("ws:error conv=%s", conversation_id)


@ws_chats_router.websocket("/ws-all")
async def chat_ws_all(websocket: WebSocket, conversation_ids: str | None = None):
    """Multiplexed websocket: forwards events for multiple conversation IDs.
    Query param conversation_ids is a comma-separated list. If omitted, no subscriptions are created.
    """
    await websocket.accept()

    ids: list[str] = []
    if conversation_ids:
        ids = [c.strip() for c in conversation_ids.split(",") if c.strip()]

    forwarders: list[asyncio.Task] = []

    async def make_forwarder(conv_id: str):
        session_obj = get_or_create_session(conv_id)

        async def forward_events():
            try:
                while True:
                    chunk = await session_obj.queue.get()
                    payload = chunk
                    if chunk.startswith("data: "):
                        payload = chunk[len("data: ") :].strip()
                    # Attempt to merge conversation_id into JSON events
                    try:
                        d = json.loads(payload)
                        d["conversation_id"] = conv_id
                        await websocket.send_text(json.dumps(d))
                    except Exception:
                        await websocket.send_text(json.dumps({"conversation_id": conv_id, "raw": payload}))
            except asyncio.CancelledError:
                return

        return asyncio.create_task(forward_events())

    for cid in ids:
        forwarders.append(await make_forwarder(cid))

    try:
        while True:
            _ = await websocket.receive_text()
            await websocket.send_text(json.dumps({"type": "ack"}))
    except WebSocketDisconnect:
        for t in forwarders:
            t.cancel()
    except Exception:
        for t in forwarders:
            t.cancel()
