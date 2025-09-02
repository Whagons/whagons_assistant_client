"""
AI Agent Factory
Handles the creation and configuration of AI agents with proper model selection and tool setup.
"""

from dataclasses import dataclass, field
from typing import Dict, Optional
import logging

from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStdio
from pydantic_ai.common_tools.tavily import tavily_search_tool

from ai.assistant_functions.graph import graph_api_request
from ai.assistant_functions.python_interpreter import python
from ai.assistant_functions.memory_functions import add_memory, get_memory
from ai.assistant_functions.workflow_functions import (
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
from ai.config.models import models, DEFAULT_MODEL, get_model
from helpers.Firebase_helpers import FirebaseUser

import os

# Environment variables
tavily_api_key = os.getenv("TAVILY_API_KEY")


@dataclass
class MyDeps:
    """Dependencies for the AI agent."""
    user_object: FirebaseUser
    user_rejection_flags: Dict[str, bool] = field(default_factory=dict)
    conversation_id: Optional[str] = None  # Add conversation ID for file organization


async def create_agent(user_object: FirebaseUser, memory: str, has_pdfs: bool = False) -> Agent:
    """
    Create and configure an AI agent with appropriate model and tools.

    Args:
        user_object: Firebase user object
        memory: User's memory context
        has_pdfs: Whether the conversation contains PDF content

    Returns:
        Configured Agent instance
    """
    # Initialize MCP servers list
    mcp_servers = []

    # Check if GitHub server is enabled for the user and they have a token
    github_server_enabled = any(
        server.get("server_id") == "github" and server.get("enabled", False)
        for server in user_object.mcp_servers
    )

    if github_server_enabled and user_object.github_token:
        github_server = MCPServerStdio(
            command="npx",
            args=["-y", "@modelcontextprotocol/server-github"],
            env={"GITHUB_PERSONAL_ACCESS_TOKEN": user_object.github_token},
        )
        mcp_servers.append(github_server)

    # Smart model selection
    if has_pdfs:
        # Force Gemini when PDFs are present (OpenAI doesn't support PDFs)
        selected_model = models["gemini"]
        model_name = "gemini-2.5-flash"
        print(f"🤖 MODEL SELECTION: Using {model_name} due to PDF content")
        logging.info(f"Using Gemini model due to PDF content: {model_name}")
    else:
        # Use user's preferred model (fallback to global default if missing)
        preferred_model_key = DEFAULT_MODEL
        selected_model = models.get(preferred_model_key, models[DEFAULT_MODEL])

        # Resolve a friendly model name for logs before logging
        model_name = getattr(selected_model, 'model_name', preferred_model_key)

        print(
            f"🤖 MODEL SELECTION: Using {model_name} (user preference: {getattr(user_object, 'prefered_model', None) or 'default'})"
        )
        logging.info(f"Using model '{model_name}' (key: {preferred_model_key})")

    return Agent(
        model=selected_model,
        system_prompt=get_system_prompt(user_object, memory),
        deps_type=MyDeps,
        # mcp_servers=mcp_servers,
        tools=[
            tavily_search_tool(tavily_api_key),
            graph_api_request,
            python,
            add_memory,
            get_memory,
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
