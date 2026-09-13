# Use case 01: Ask (policy search with permissions)

Full chapter: https://swapna-oundhakar.netlify.app/work-ask.html

**Problem.** An employee has a policy question. The answer is in a document they may or may
not be allowed to read, and the same question from a manager or from HR should reach more.

**What it does.** Identity comes from the sign-in, never from the message. Documents outside
the asker's groups are removed before ranking, so a locked document never reaches the model.
Nothing outside your scope is named, flagged, or counted. Questions no policy covers get an
honest "I have nothing on that" instead of a guess.

**Try it.** As Alex (an engineer): "Can I carry over unused PTO?" Then: "What are the
compensation bands for executives?" The second is locked for Alex and the reply abstains.

**Where the code is.** Search service: `deploy/demo/hr-policy-rag/` (ingest, ACL filter,
ranking, the Google Drive over MCP connector in `rag/connectors/mcp_drive.py`). Fallback
library and routing: `timeoff-agent/server/policies/`, `server/agents/intent.ts`.

**Evals.** Fourteen cases: six routing, six access, two library. Canary strings planted in
locked documents make a leak provable; one leaked title, count, or canary fails the run.
