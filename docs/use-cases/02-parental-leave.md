# Use case 02: Parental leave (agentic RAG)

Full chapter: https://swapna-oundhakar.netlify.app/work-leave.html

**Problem.** The global parental leave policy defers to country supplements. One search
returns the global answer and misses the 26 weeks India grants, or the US rules.

**What it does.** The agent reads the global policy, notices the deferral, searches again for
the asker's country, and answers from both, with the sections cited. Eligibility comes from
tenure and employment type; contractors get an explanation, not a refusal. It can draft a
leave of absence and submit it after an explicit yes.

**Try it.** As Ananya (India): "How much maternity leave do I get?" Then the same question as
Sarah (US). Two different answers from the same assistant.

**Where the code is.** `timeoff-agent/server/agents/leave.ts`, entitlement assessment in
`server/workday/tools.ts`.

**Evals.** Cross-country cases, the second-search behaviour, eligibility gates, and the
draft-before-write rule.
