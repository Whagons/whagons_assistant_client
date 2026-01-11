"""
AI Manager - Main entry point for AI functionality
Provides a clean interface to AI agent creation and management.
"""

import logging
from ai.core.agent_factory import create_agent, MyDeps
from ai.llms import get_model, get_available_models, DEFAULT_MODEL
from helpers.Firebase_helpers import FirebaseUser

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)


async def create_ai_agent(user_object: FirebaseUser, memory: str, has_pdfs: bool = False):
    """
    Create an AI agent for the user.

    Args:
        user_object: Firebase user object containing user information
        memory: User's memory context string
        has_pdfs: Whether the conversation contains PDF content

    Returns:
        Configured AI Agent instance
    """
    return await create_agent(user_object, memory, has_pdfs)


def get_model_by_key(model_key: str = None):
    """
    Get a model by key, with fallback to default.

    Args:
        model_key: Model key to retrieve

    Returns:
        Model instance
    """
    return get_model(model_key)


def list_available_models():
    """
    Get list of all available model keys.

    Returns:
        List of model keys
    """
    return get_available_models()


# Re-export key classes and functions for backward compatibility
__all__ = [
    "create_ai_agent",
    "get_model_by_key",
    "list_available_models",
    "MyDeps",
    "DEFAULT_MODEL"
]
