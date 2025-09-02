"""
AI Core Module

Contains core functionality including prompts, agent factory, memory, utilities, and essential components.
"""

from .prompts import get_system_prompt
from .agent_factory import create_agent, MyDeps
# Import other core components as needed
# from .utils import *
# from .wrapper import *
# from .mem0_local import *

__all__ = [
    "get_system_prompt",
    "create_agent",
    "MyDeps"
]
