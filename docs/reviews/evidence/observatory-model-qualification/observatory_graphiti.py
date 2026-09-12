"""Local-only model factory for bounded synthetic Observatory qualification."""
import os
from types import SimpleNamespace
os.environ['GRAPHITI_TELEMETRY_ENABLED'] = 'false'
from redis.asyncio import Redis
from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.cross_encoder.client import CrossEncoderClient
from falkordb.asyncio.graph import AsyncGraph

LLM_BASE = os.environ['LLM_BASE']
LLM_MODEL = os.environ['LLM_MODEL']
EMBED_BASE = os.environ['EMBED_BASE']
EMBED_MODEL = os.environ['EMBED_MODEL']
os.environ.update(LLM_MODEL=LLM_MODEL, EMBED_MODEL=EMBED_MODEL)

class NoModelReranker(CrossEncoderClient):
    async def rank(self, query, passages):
        return [(p, 1.0 / (i + 1)) for i, p in enumerate(passages)]

def make_graphiti(name):
    connection = Redis(unix_socket_path=os.environ['GRAPHITI_SOCKET'], decode_responses=True)
    # Use the public graph API around the upstream Unix-socket cluster probe bug.
    db = SimpleNamespace(connection=connection,
        select_graph=lambda name: AsyncGraph(connection, name), close=connection.aclose)
    return Graphiti(
        graph_driver=FalkorDriver(falkor_db=db, database=name),
        llm_client=OpenAIGenericClient(config=LLMConfig(api_key='local',
            base_url=LLM_BASE, model=LLM_MODEL, small_model=LLM_MODEL,
            temperature=0, max_tokens=4096)),
        embedder=OpenAIEmbedder(config=OpenAIEmbedderConfig(api_key='local',
            base_url=EMBED_BASE, embedding_model=EMBED_MODEL, embedding_dim=768)),
        cross_encoder=NoModelReranker(), max_coroutines=2)
