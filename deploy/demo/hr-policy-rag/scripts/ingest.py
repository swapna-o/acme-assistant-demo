"""Ingest policy documents and persist a searchable index.

Examples:
    # Local sample data (offline, default):
    python -m scripts.ingest

    # Google Drive folder (needs google-api-python-client + creds):
    python -m scripts.ingest --gdrive-folder <FOLDER_ID>

    # SharePoint library (needs msal + requests + Entra app creds):
    python -m scripts.ingest --sharepoint-drive <DRIVE_ID> --sharepoint-path root
"""

from __future__ import annotations

import argparse
import os

from rag.connectors import (
    GoogleDriveConnector,
    LocalFolderConnector,
    MCPDriveConnector,
    SharePointConnector,
)
from rag.system import RagSystem

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--policies", default=os.path.join(HERE, "data", "sample_policies"))
    p.add_argument("--no-local", action="store_true", help="skip the local folder")
    p.add_argument("--gdrive-folder", help="Google Drive folder id to ingest")
    p.add_argument("--sharepoint-drive", help="SharePoint drive (library) id")
    p.add_argument("--sharepoint-path", default="root")
    p.add_argument("--mcp-manifest", help="Google Drive over MCP: a sync manifest written by an MCP client")
    p.add_argument("--mcp-server", help="Google Drive over MCP, live: the server command, e.g. 'npx -y @modelcontextprotocol/server-gdrive'")
    p.add_argument("--mcp-folder", help="Drive folder id for a live MCP sync")
    p.add_argument("--index", default=os.path.join(HERE, "index.json"))
    args = p.parse_args()

    connectors = []
    if not args.no_local:
        connectors.append(LocalFolderConnector(args.policies))
    if args.gdrive_folder:
        connectors.append(GoogleDriveConnector(args.gdrive_folder))
    if args.mcp_manifest:
        connectors.append(MCPDriveConnector(manifest_path=args.mcp_manifest))
    elif args.mcp_server:
        connectors.append(MCPDriveConnector(folder_id=args.mcp_folder or "", server=args.mcp_server.split()))
    if args.sharepoint_drive:
        connectors.append(
            SharePointConnector(args.sharepoint_drive, args.sharepoint_path)
        )

    system = RagSystem()
    n = system.ingest_connectors(connectors)
    system.save(args.index)
    print(f"Ingested {n} chunks from {len(connectors)} connector(s).")
    print(f"Index saved to {args.index}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
