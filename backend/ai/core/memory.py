import os
import logging
from datetime import datetime
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from graphiti_core.llm_client.gemini_client import GeminiClient, LLMConfig
import graphiti_core.llm_client.gemini_client as gc
from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig
from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
from graphiti_core.driver.falkordb_driver import FalkorDriver
from dotenv import load_dotenv

# Suppress verbose info logs from memory/graph libraries
logging.getLogger("graphiti_core").setLevel(logging.WARNING)
logging.getLogger("falkordb").setLevel(logging.WARNING)

# Monkey-patch the small model default to a stable available one (from main.py)
gc.DEFAULT_SMALL_MODEL = 'models/gemini-2.0-flash'

load_dotenv()

# Setup constants
MEMORY_GROUP_ID = "agent_memories"
SEMAPHORE_LIMIT = int(os.environ.get('SEMAPHORE_LIMIT', '30'))

def get_graphiti_client(database: str = "agent_memories"):
    """Create a fresh Graphiti client for the current event loop."""
    llm_client = GeminiClient(
        config=LLMConfig(
            api_key=os.environ["GEMINI_API_KEY"],
            model="models/gemini-2.0-flash",
        )
    )

    embedder = GeminiEmbedder(
        config=GeminiEmbedderConfig(
            api_key=os.environ["GEMINI_API_KEY"],
            embedding_model="embedding-001"
        )
    )

    cross_encoder = GeminiRerankerClient(
        config=LLMConfig(
            api_key=os.environ["GEMINI_API_KEY"],
            model="models/gemini-2.0-flash"
        )
    )

    falkor_driver = FalkorDriver(
        host='127.0.0.1',
        port='6379',
        database=database # Separate DB/Key for memory
    )

    return Graphiti(
        graph_driver=falkor_driver,
        llm_client=llm_client,
        embedder=embedder,
        cross_encoder=cross_encoder,
    )

def ingest_message(sender: str, message: str, database: str = "agent_memories"):
    """
    Ingest a message into the memory.
    sender: "User" or "Assistant"
    message: The content of the message
    """
    import asyncio

    async def _ingest_async():
        # Delay to prevent contention with chat response
        await asyncio.sleep(2)
        content = f"{sender}: {message}"
        graphiti = get_graphiti_client(database)

        try:
            await graphiti.add_episode(
                name=f"Message from {sender}",
                episode_body=content,
                source=EpisodeType.message,
                source_description="Agent Conversation History",
                reference_time=datetime.now(),
                group_id=MEMORY_GROUP_ID
            )
            print(f"Ingested message from {sender}")
        except Exception as e:
            print(f"Error ingesting message: {e}")
        finally:
            await graphiti.close()

    # Run in background without blocking
    asyncio.create_task(_ingest_async())

async def retrieve_memories(query: str, limit: int = 100, database: str = "agent_memories"):
    """
    Retrieve memories relevant to the query.
    """
    graphiti = get_graphiti_client(database)
    try:
        results = await graphiti.search(
            query=query, 
            group_ids=[MEMORY_GROUP_ID],
            num_results=limit
        )
        return results
    except Exception as e:
        print(f"Error retrieving memories: {e}")
        return []
    finally:
        await graphiti.close()

async def build_indices(database: str = "agent_memories"):
    """Build indices manually if needed"""
    graphiti = get_graphiti_client(database)
    try:
        await graphiti.build_indices_and_constraints()
        print("Indices built.")
    except Exception as e:
        print(f"Error building indices: {e}")
    finally:
        await graphiti.close()

