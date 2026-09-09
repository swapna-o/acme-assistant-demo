"""Local folder connector — the offline stand-in for Drive/SharePoint.

Reads .md/.txt files from a folder. ACLs come from an `acl.json` manifest in
the same folder, mapping filename -> {public, allowed_users, allowed_groups}.
Files not listed in the manifest default to non-public with no grants (deny).
"""

from __future__ import annotations

import json
import os
from typing import Iterable

from ..models import ACL, Document


class LocalFolderConnector:
    source_name = "local"

    def __init__(self, folder: str, manifest: str = "acl.json"):
        self.folder = folder
        self.manifest_path = os.path.join(folder, manifest)

    def _load_manifest(self) -> dict:
        if not os.path.exists(self.manifest_path):
            return {}
        with open(self.manifest_path) as f:
            return json.load(f)

    def fetch(self) -> Iterable[Document]:
        manifest = self._load_manifest()
        for name in sorted(os.listdir(self.folder)):
            if not name.endswith((".md", ".txt")):
                continue
            path = os.path.join(self.folder, name)
            with open(path) as f:
                text = f.read()
            entry = manifest.get(name, {})
            acl = ACL.from_dict(entry) if entry else ACL(public=False)
            title = entry.get("title") or _title_from(name, text)
            yield Document(
                id=f"local::{name}",
                source=self.source_name,
                title=title,
                text=text,
                acl=acl,
                uri=path,
                metadata={"filename": name},
            )


def _title_from(name: str, text: str) -> str:
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#"):
            return line.lstrip("#").strip()
    return os.path.splitext(name)[0].replace("_", " ").title()
