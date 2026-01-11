"""
AI Agent Factory
Handles the creation and configuration of AI agents with proper model selection and tool setup.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional
import logging

from pydantic_ai import Agent, RunContext
from pydantic_ai.common_tools.tavily import tavily_search_tool

from ai.tools.graph import graph_api_request
from ai.tools.python_interpreter import python
from ai.tools.workflow_functions import (
    create_workflow,
    update_workflow,
    get_workflow,
    list_workflows,
    add_workflow_schedule,
    run_workflow,
    read_file_content,
    search_in_file,
    list_directory,
    write_file_content,
    create_shareable_file_link,
    get_local_file_url,
    get_local_file_view_url,
    execute_shell_command,
)
from ai.core.prompts import get_system_prompt
from ai.llms import models, DEFAULT_MODEL
from helpers.Firebase_helpers import FirebaseUser

import os

# Environment variables
tavily_api_key = os.getenv("TAVILY_API_KEY")

# Global agent cache keyed by model key
_AGENT_CACHE: Dict[str, Agent] = {}


@dataclass
class MyDeps:
    """Dependencies for the AI agent."""
    user_object: FirebaseUser
    user_rejection_flags: Dict[str, bool] = field(default_factory=dict)
    conversation_id: Optional[str] = None  # Add conversation ID for file organization
    memory: str = field(default="")  # Memory context available at runtime


def get_system_prompt_dynamic(ctx: RunContext[MyDeps]) -> str:
    """Dynamic system prompt function that reads user and memory from runtime dependencies."""
    logging.info(f"Generating dynamic system prompt for user {ctx.deps.user_object.uid}")
    return get_system_prompt(ctx.deps.user_object, ctx.deps.memory)


async def create_agent(user_object: FirebaseUser, memory: str, has_pdfs: bool = False, model_key: Optional[str] = None) -> Agent:

    if has_pdfs:
        # Force Gemini when PDFs are present (OpenAI doesn't support PDFs)
        preferred_model_key = "gemini-2.5-flash"
    else:
        # Use passed-in model key if provided; otherwise use user's preferred or default
        preferred_model_key = model_key or getattr(user_object, 'prefered_model', None) or DEFAULT_MODEL

    # Check cache first
    if preferred_model_key in _AGENT_CACHE:
        cached_agent = _AGENT_CACHE[preferred_model_key]
        model_name = getattr(cached_agent.model, 'model_name', preferred_model_key)
        logging.info(f"Using cached agent for model '{model_name}' (key: {preferred_model_key})")
        return cached_agent

    # Cache miss - create new agent
    selected_model = models.get(preferred_model_key, models[DEFAULT_MODEL])
    model_name = getattr(selected_model, 'model_name', preferred_model_key)
    
    if has_pdfs:
        print(f"🤖 MODEL SELECTION: Using {model_name} due to PDF content")
        logging.info(f"Creating new agent for Gemini model due to PDF content: {model_name}")
    else:
        print(
            f"🤖 MODEL SELECTION: Using {model_name} (user preference: {getattr(user_object, 'prefered_model', None) or 'default'})"
        )
        logging.info(f"Creating new agent for model '{model_name}' (key: {preferred_model_key})")

    # Create agent with dynamic system prompt function
    agent = Agent(
        model=selected_model,
        # system_prompt is registered below to handle the dynamic function
        deps_type=MyDeps,
        # mcp_servers=mcp_servers,
        tools=[
            tavily_search_tool(tavily_api_key),
            graph_api_request,
            python,
            # Workflow management tools
            create_workflow,
            update_workflow,
            get_workflow,
            list_workflows,
            add_workflow_schedule,
            run_workflow,
            # File operation tools
            read_file_content,
            search_in_file,
            list_directory,
            write_file_content,
            create_shareable_file_link,
            get_local_file_url,
            get_local_file_view_url,
            execute_shell_command,
        ],
    )
    
    # Register dynamic system prompt
    agent.system_prompt(get_system_prompt_dynamic)
    
    # Cache the agent before returning
    _AGENT_CACHE[preferred_model_key] = agent
    logging.info(f"Cached agent for model '{model_name}' (key: {preferred_model_key})")
    
    return agent
