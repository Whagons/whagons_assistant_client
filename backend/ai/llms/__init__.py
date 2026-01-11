"""
AI Configuration Module

Contains configuration files for models, settings, and other configurable components.
"""

from .llms import models, get_model, get_available_models, DEFAULT_MODEL

__all__ = [
    "models",
    "get_model",
    "get_available_models",
    "DEFAULT_MODEL"
]
