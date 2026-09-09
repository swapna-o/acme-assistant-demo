"""RagSystem: the facade tying ingestion, embedding, retrieval, and QA together."""

from __future__ import annotations

from .chunking import chunk_document
from .config import Config, load_config
from .embeddings import get_embedder
from .models import Chunk, Document, Principal
from .qa import Answer, AnswerGenerator
from .retriever import Retriever
from .vectorstore import InMemoryVectorStore


class RagSystem:
    def __init__(self, config: Config | None = None):
        self.config = config or load_config()
        self.embedder = get_embedder(self.config)
        self.store = InMemoryVectorStore(dim=self.embedder.dim)
        self.retriever = Retriever(
            self.embedder, self.store, self.config.min_relevance
        )
        self.generator = AnswerGenerator(self.config)

    # --- ingestion ---
    def ingest_documents(self, documents: list[Document]) -> int:
        all_chunks: list[Chunk] = []
        for doc in documents:
            all_chunks.extend(
                chunk_document(doc, self.config.chunk_size, self.config.chunk_overlap)
            )
        if not all_chunks:
            return 0
        vectors = self.embedder.embed([c.text for c in all_chunks])
        for c, v in zip(all_chunks, vectors):
            c.embedding = v.tolist()
        self.store.add(all_chunks)
        return len(all_chunks)

    def ingest_connectors(self, connectors) -> int:
        docs: list[Document] = []
        for connector in connectors:
            docs.extend(connector.fetch())
        return self.ingest_documents(docs)

    # --- query ---
    def retrieve(self, question: str, principal: Principal, k: int | None = None):
        return self.retriever.retrieve(question, principal, k or self.config.top_k)

    def answer(
        self, question: str, principal: Principal, k: int | None = None
    ) -> Answer:
        chunks = self.retrieve(question, principal, k)
        return self.generator.answer(question, chunks, principal)

    # --- persistence ---
    def save(self, path: str | None = None) -> None:
        self.store.save(path or self.config.index_path)

    def load(self, path: str | None = None) -> None:
        self.store = InMemoryVectorStore.load(path or self.config.index_path)
        if self.store.dim != self.embedder.dim:
            raise ValueError(
                f"index dim {self.store.dim} != embedder dim {self.embedder.dim}; "
                "re-ingest with the current embedder."
            )
        self.retriever = Retriever(
            self.embedder, self.store, self.config.min_relevance
        )
