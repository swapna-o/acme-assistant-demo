"""Google Drive over MCP.

The same job as the Drive SDK connector next door, done through the Model Context
Protocol instead of Google's client library: ask an MCP server for the files in a
folder, read each one, and list each file's permissions, then map those permissions
onto our `ACL` exactly as the SDK connector does:

    Drive permission type   ->  ACL field
    anyone                  ->  public = True
    user (emailAddress)     ->  allowed_users += email
    group (emailAddress)    ->  allowed_groups += group email
    domain (domain)         ->  allowed_groups += "domain:<domain>"

Two ways to run it:

  1. Live, as an MCP client. `MCPDriveConnector(folder_id, server=["npx", "-y", "..."])`
     spawns any Google Drive MCP server that exposes search / read / permissions tools
     (tool names are configurable) and speaks JSON-RPC to it over stdio.

  2. From a sync manifest. Any MCP client that already has the Drive server connected
     (Claude Code, for one) can run the three calls and save the results as JSON; the
     connector then builds the same documents from that file. This is how the demo's
     index was built, and the manifest is published with it as the sync report.

Nothing in the index cares which path produced it.
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
from typing import Iterable, Optional

from ..models import ACL, Document


def clean_drive_text(text: str) -> str:
    """Google Docs exported through the MCP server come back with markdown characters
    escaped (\\# \\*\\*) and blank lines padded with spaces. Undo both so the text
    indexes the same way a local markdown file would."""
    import re
    t = text.replace("\r\n", "\n")
    t = re.sub(r"\\([#*_\-\[\]()`>])", r"\1", t)
    t = re.sub(r"\n[ \t]+\n", "\n\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip() + "\n"


def acl_from_drive_permissions(perms: list[dict]) -> ACL:
    """Map Google Drive permission records onto an ACL. Same rules as the SDK connector."""
    public = False
    users: set[str] = set()
    groups: set[str] = set()
    for p in perms or []:
        t = (p.get("type") or "").lower()
        if t == "anyone":
            public = True
        elif t == "user" and p.get("emailAddress"):
            users.add(p["emailAddress"].lower())
        elif t == "group" and p.get("emailAddress"):
            groups.add(p["emailAddress"].lower())
        elif t == "domain" and p.get("domain"):
            groups.add(f"domain:{p['domain'].lower()}")
    return ACL(public=public, allowed_users=frozenset(users), allowed_groups=frozenset(groups))


class McpStdioClient:
    """A minimal MCP client: JSON-RPC 2.0 over the server's stdin/stdout."""

    def __init__(self, command: list[str], env: Optional[dict] = None):
        self.proc = subprocess.Popen(
            command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1, env={**os.environ, **(env or {})},
        )
        self._id = 0
        self._lock = threading.Lock()
        self.request("initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "hr-policy-rag", "version": "1.0"}})
        self.notify("notifications/initialized", {})

    def _send(self, msg: dict) -> None:
        assert self.proc.stdin
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def notify(self, method: str, params: dict) -> None:
        self._send({"jsonrpc": "2.0", "method": method, "params": params})

    def request(self, method: str, params: dict) -> dict:
        with self._lock:
            self._id += 1
            rid = self._id
            self._send({"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
            assert self.proc.stdout
            while True:
                line = self.proc.stdout.readline()
                if not line:
                    raise RuntimeError("MCP server closed the connection")
                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if msg.get("id") == rid:
                    if "error" in msg:
                        raise RuntimeError(f"MCP error from {method}: {msg['error']}")
                    return msg.get("result", {})

    def tools(self) -> list[dict]:
        return self.request("tools/list", {}).get("tools", [])

    def call(self, name: str, arguments: dict) -> dict:
        """Call a tool and return its structured content, or parse the first text block as JSON."""
        res = self.request("tools/call", {"name": name, "arguments": arguments})
        if res.get("structuredContent") is not None:
            return res["structuredContent"]
        for block in res.get("content", []):
            if block.get("type") == "text":
                try:
                    return json.loads(block["text"])
                except json.JSONDecodeError:
                    return {"text": block["text"]}
        return res

    def close(self) -> None:
        try:
            self.proc.terminate()
        except Exception:
            pass


class MCPDriveConnector:
    source_name = "google_drive_mcp"

    def __init__(
        self,
        folder_id: str = "",
        server: Optional[list[str]] = None,
        manifest_path: Optional[str] = None,
        tool_names: Optional[dict] = None,
    ):
        self.folder_id = folder_id
        self.server = server
        self.manifest_path = manifest_path
        self.tools = {"search": "search_files", "read": "read_file_content", "permissions": "get_file_permissions", **(tool_names or {})}

    # ---- path 2: a manifest written by any MCP client ----
    def fetch_from_manifest(self) -> Iterable[Document]:
        with open(self.manifest_path or "") as f:
            manifest = json.load(f)
        for item in manifest.get("files", []):
            yield Document(
                id=f"gdrive::{item['id']}",
                source=self.source_name,
                title=item.get("title") or item["id"],
                text=clean_drive_text(item.get("text", "")),
                acl=acl_from_drive_permissions(item.get("permissions", [])),
                uri=item.get("uri") or f"https://drive.google.com/file/d/{item['id']}/view",
                metadata={"owner": item.get("owner"), "modifiedTime": item.get("modifiedTime"), "synced": manifest.get("synced")},
            )

    # ---- path 1: live, as an MCP client ----
    def fetch_live(self) -> Iterable[Document]:
        if not self.server:
            raise ValueError("server command required for a live sync")
        client = McpStdioClient(self.server)
        try:
            listing = client.call(self.tools["search"], {"query": f"parentId = '{self.folder_id}'", "pageSize": 100})
            files = listing.get("files") or listing.get("items") or []
            for f in files:
                if (f.get("mimeType") or "").endswith("folder"):
                    continue
                content = client.call(self.tools["read"], {"fileId": f["id"]})
                perms = client.call(self.tools["permissions"], {"fileId": f["id"]})
                perm_list = perms.get("permissions") if isinstance(perms, dict) else perms
                yield Document(
                    id=f"gdrive::{f['id']}",
                    source=self.source_name,
                    title=f.get("title") or f.get("name") or f["id"],
                    text=clean_drive_text(content.get("fileContent") or content.get("text") or "") if isinstance(content, dict) else clean_drive_text(str(content)),
                    acl=acl_from_drive_permissions(perm_list or []),
                    uri=f.get("webViewLink") or f"https://drive.google.com/file/d/{f['id']}/view",
                    metadata={"modifiedTime": f.get("modifiedTime")},
                )
        finally:
            client.close()

    def fetch(self) -> Iterable[Document]:
        return self.fetch_from_manifest() if self.manifest_path else self.fetch_live()
