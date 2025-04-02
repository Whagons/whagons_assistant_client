from ai.utils import extract_and_format_memory_data
from pydantic_ai.tools import RunContext
from typing import Tuple
from dotenv import load_dotenv
from ai.mem0_local import m
import logging

logger = logging.getLogger(__name__)

load_dotenv()





def add_memory(ctx: RunContext[str], message: str) -> Tuple[str, str]:
    """Add a new memory to my persistent memory store.

    I use this function to store important information or experiences
    that I may need to reference later.

    Args:
        message: The content of the memory to be stored

    Returns:
        A tuple containing a success message and the stored memory content
    """
    if not m:
        logger.error("Memory client not initialized")
        return "Memory service unavailable.", "Memory service is not initialized."
    try:
        result = m.add(message, user_id=ctx.deps.user_object.uid)
        return "Memory added successfully.", str(result)
    except Exception as e:
        logger.error(f"Error adding memory: {str(e)}", exc_info=True)
        return "Failed to add memory.", str(e)


def get_memory(ctx: RunContext[str], query: str) -> Tuple[str, str]:
    """Retrieve memories from my persistent memory store based on a search query.

    I use this function to search through previously stored memories using a text query.
    Use this memory before using other search tools, to ensure you have the correct context. Avoid calling other tools first so as to not frustrate the user.


    Args:
        query: The search query to find relevant memories

    Returns:
        A tuple containing the search results and any associated metadata
    """
    if not m:
        logger.error("Memory client not initialized")
        return "Memory service unavailable.", "Memory service is not initialized."
    try:
        results = m.search(query, user_id=ctx.deps.user_object.uid)

        memory = extract_and_format_memory_data(str(results))

        return "Memory search completed successfully.", memory
    except Exception as e:
        logger.error(f"Error searching memory: {str(e)}", exc_info=True)
        return "Failed to search memory.", str(e)


def get_memory_no_context(user_id: str, query: str) -> Tuple[str, str]:
    """Retrieve memories from my persistent memory store based on a search query.

    I use this function to search through previously stored memories using a text query.
    Use this memory before using other search tools, to ensure you have the correct context. Avoid calling other tools first so as to not frustrate the user.

    Args:
        user_id: The user ID to retrieve memories for
        query: The search query to find relevant memories

    Returns:
        A tuple containing the search results and any associated metadata
    """
    if not m:
        logger.error("Memory client not initialized")
        return "Memory service unavailable.", "Memory service is not initialized."
    try:
        results = m.search(query, user_id=user_id)

        # print("results", results)


        memory = extract_and_format_memory_data(str(results))
        return "Memory from current question.", memory
    except Exception as e:
        logger.error(f"Error searching memory: {str(e)}", exc_info=True)
        return "Failed to search memory.", str(e)
