"""Core data models.

The security model lives here. Every `Document` (and therefore every `Chunk`
derived from it) carries an `ACL` describing who is allowed to read it. A
`Principal` describes the identity asking a question (their email plus the
groups they belong to). `ACL.permits(principal)` is the single predicate that
decides visibility, and it is enforced *before* retrieval so that content a
user cannot see never reaches the vector search or the language model.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class Principal:
    """The identity of whoever is asking a question."""

    email: str
    groups: frozenset[str] = field(default_factory=frozenset)

    @staticmethod
    def anonymous() -> "Principal":
        return Principal(email="anonymous", groups=frozenset())


@dataclass(frozen=True)
class ACL:
    """Access-control list attached to a document.

    A principal is permitted iff the document is public, OR their email is
    explicitly listed, OR they belong to at least one allowed group. This
    mirrors how Google Drive and SharePoint express permissions (direct grants
    to a person, plus grants to a group), so connectors can map real ACLs onto
    it faithfully.
    """

    public: bool = False
    allowed_users: frozenset[str] = field(default_factory=frozenset)
    allowed_groups: frozenset[str] = field(default_factory=frozenset)

    def permits(self, principal: Principal) -> bool:
        if self.public:
            return True
        if principal.email in self.allowed_users:
            return True
        if self.allowed_groups & principal.groups:
            return True
        return False

    # --- serialization (for persisting the index) ---
    def to_dict(self) -> dict:
        return {
            "public": self.public,
            "allowed_users": sorted(self.allowed_users),
            "allowed_groups": sorted(self.allowed_groups),
        }

    @staticmethod
    def from_dict(d: dict) -> "ACL":
        return ACL(
            public=bool(d.get("public", False)),
            allowed_users=frozenset(d.get("allowed_users", [])),
            allowed_groups=frozenset(d.get("allowed_groups", [])),
        )


@dataclass
class Document:
    """A source document pulled from a connector, before chunking."""

    id: str
    source: str  # "local" | "google_drive" | "sharepoint"
    title: str
    text: str
    acl: ACL
    uri: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class Chunk:
    """A retrievable slice of a document. Inherits the parent document's ACL."""

    id: str
    doc_id: str
    title: str
    text: str
    acl: ACL
    source: str
    uri: str
    ordinal: int
    embedding: Optional[list[float]] = None

    def to_dict(self, include_embedding: bool = True) -> dict:
        d = {
            "id": self.id,
            "doc_id": self.doc_id,
            "title": self.title,
            "text": self.text,
            "acl": self.acl.to_dict(),
            "source": self.source,
            "uri": self.uri,
            "ordinal": self.ordinal,
        }
        if include_embedding:
            d["embedding"] = self.embedding
        return d

    @staticmethod
    def from_dict(d: dict) -> "Chunk":
        return Chunk(
            id=d["id"],
            doc_id=d["doc_id"],
            title=d["title"],
            text=d["text"],
            acl=ACL.from_dict(d["acl"]),
            source=d.get("source", ""),
            uri=d.get("uri", ""),
            ordinal=d.get("ordinal", 0),
            embedding=d.get("embedding"),
        )
