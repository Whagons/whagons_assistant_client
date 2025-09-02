"""
AI assistant functions package

This package provides organized AI functionality with separate modules for:
- Configuration (models, settings)
- Core functionality (prompts, agent factory, memory, utilities)
- Assistant functions (tools and utilities)
- Database (models and database operations)
- Workflows (workflow context and scheduling)
- Services (business logic layer)
"""

# Main exports for easy access
from ai.Manager import create_ai_agent, get_model_by_key, list_available_models, MyDeps, DEFAULT_MODEL

# Re-export key modules for direct access if needed
from ai import config, core, assistant_functions, workflows, services

__version__ = "1.0.0"
__all__ = [
    "create_ai_agent",
    "get_model_by_key",
    "list_available_models",
    "MyDeps",
    "DEFAULT_MODEL",
    "config",
    "core",
    "assistant_functions",
    "workflows",
    "services"
] 