"""Runtime configuration, driven by environment variables with sane defaults.

Everything is overridable via env vars so the same code runs offline (local
hashing embedder, extractive answers) or in production (Voyage embeddings,
Claude answers) without edits.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

# Best-effort .env loading; optional dependency.
try:  # pragma: no cover
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass


@dataclass
class Config:
    # Embeddings: "local" (offline, no deps), "voyage", or "sentence-transformers".
    embedder: str = os.getenv("RAG_EMBEDDER", "local")
    embed_dim: int = int(os.getenv("RAG_EMBED_DIM", "768"))
    voyage_model: str = os.getenv("VOYAGE_MODEL", "voyage-3")
    st_model: str = os.getenv("RAG_ST_MODEL", "all-MiniLM-L6-v2")

    # Answer + judge models (Claude). Defaults to the latest Opus.
    answer_model: str = os.getenv("RAG_ANSWER_MODEL", "claude-opus-4-8")
    judge_model: str = os.getenv("RAG_JUDGE_MODEL", "claude-opus-4-8")

    # Chunking (character-based).
    chunk_size: int = int(os.getenv("RAG_CHUNK_SIZE", "900"))
    chunk_overlap: int = int(os.getenv("RAG_CHUNK_OVERLAP", "150"))

    # Retrieval.
    top_k: int = int(os.getenv("RAG_TOP_K", "6"))
    # Minimum cosine similarity for a chunk to count as relevant. Chunks below
    # this are dropped, which lets the system abstain on off-topic questions
    # instead of answering from a loosely-related document. This is scale-
    # dependent on the embedder: the 0.26 default is tuned for the local hashing
    # embedder, where on-topic and off-topic scores sit close together. Semantic
    # embedders (Voyage / sentence-transformers) separate them far more cleanly,
    # so raise it (e.g. 0.5-0.7) there, or set 0.0 to disable relevance gating.
    min_relevance: float = float(os.getenv("RAG_MIN_RELEVANCE", "0.26"))

    # Where the persisted index lives.
    index_path: str = os.getenv("RAG_INDEX_PATH", "index.json")


def load_config() -> Config:
    return Config()
