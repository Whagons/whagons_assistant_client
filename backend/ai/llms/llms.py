"""
AI Model Configuration
Centralized configuration for all AI models used in the system.
"""

from pydantic_ai.models.groq import GroqModel
from pydantic_ai.providers.groq import GroqProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.google_gla import GoogleGLAProvider
from pydantic_ai.models import cached_async_http_client
import os
import httpx

# Create a custom HTTP client with optimized connection pooling
http_client = httpx.AsyncClient(
    timeout=httpx.Timeout(60.0, connect=2.0),
    limits=httpx.Limits(max_keepalive_connections=20, keepalive_expiry=120),
)

# Define available models
models = {
    "gemini-2.5-flash": GeminiModel(
        "gemini-2.5-flash",
        provider=GoogleGLAProvider(
            api_key=os.getenv("GEMINI_API_KEY"), http_client=http_client
        ),
    ),
    "gemini-2.0-flash": GeminiModel(
        "gemini-2.0-flash",
        provider=GoogleGLAProvider(
            api_key=os.getenv("GEMINI_API_KEY"), http_client=http_client
        ),
    ),
    "gemini-2.5-flash-lite": GeminiModel(
        "gemini-2.5-flash-lite",
        provider=GoogleGLAProvider(
            api_key=os.getenv("GEMINI_API_KEY"), http_client=http_client
        ),
    ),
    # "deepseek-r1-distill-llama-70b": GroqModel(
    #     "deepseek-r1-distill-llama-70b",
    #     provider=GroqProvider(api_key=os.getenv("GROQ_API_KEY")),
    # ),
    #  "llama4-scout": GroqModel(
    #     "meta-llama/llama-4-scout-17b-16e-instruct",
    #     provider=GroqProvider(api_key=os.getenv("GROQ_API_KEY")),
    # ),
    "sonnet-4": OpenAIModel(
        "anthropic/claude-sonnet-4",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    # "gpt-4o-mini": OpenAIModel(
    #     "gpt-4o-mini", provider=OpenAIProvider(api_key=os.getenv("OPENAI_API_KEY"))
    # ),
    "kimi": OpenAIModel(
        "moonshotai/kimi-k2",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    # "4.1": OpenAIModel(
    #     "openai/gpt-4.1",
    #     provider=OpenAIProvider(
    #         base_url="https://openrouter.ai/api/v1",
    #         api_key=os.getenv("OPENROUTER_API_KEY"),
    #     ),
    # ),
    "qwen3": OpenAIModel(
        "qwen/qwen3-235b-a22b-07-25",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    # "gpt-oss-120b-groq": GroqModel(
    #     "openai/gpt-oss-120b",
    #      provider=GroqProvider(api_key=os.getenv("GROQ_API_KEY")),
    # ),
    "gpt-oss-120b": OpenAIModel(
        "openai/gpt-oss-120b",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    "gpt-5-mini": OpenAIModel(
        "openai/gpt-5-mini",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
    # "gpt-5": OpenAIModel(
    #     "openai/gpt-5",
    #     provider=OpenAIProvider(
    #         base_url="https://openrouter.ai/api/v1",
    #         api_key=os.getenv("OPENROUTER_API_KEY"),
    #     ),
    # ),

    "grok-4-fast": OpenAIModel(
        "x-ai/grok-4-fast",
        provider=OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        ),
    ),
}

# Set default model
DEFAULT_MODEL = "gemini-2.0-flash"

def get_model(model_key: str = None):
    """Get a model by key, fallback to default if not found."""
    if model_key is None:
        model_key = DEFAULT_MODEL
    return models.get(model_key, models[DEFAULT_MODEL])

def get_available_models():
    """Get list of available model keys."""
    return list(models.keys())
