# Evaluating it

Full chapter: https://swapna-oundhakar.netlify.app/work-evals.html
Case by case: https://swapna-oundhakar.netlify.app/work-evals-cases.html

**The suite.** 46 cases in `timeoff-agent/eval/test-cases.ts`. Each is a sequence of steps as
a named persona, and the checks run on the reply's structure, not only its text: which path
ran, which documents the persona had access to, whether anything outside that was named,
flagged, or counted. The no-leak assertion runs on every persona in every case.

**The golden set.** 47 questions for the search layer, one expected outcome each, across all
ten documents and nine personas. It is data, not code, so HR can extend it. Denied and
cross-country cases hold with zero leaks; what fails is retrieval quality without an
embedding model, which is the honest state of a portable demo.

**Tracing.** One trace per turn with nested spans (route, model calls with cost, tools, the
access filter, gate denials) in `timeoff-agent/server/tracing/tracer.ts`. Read with
`npm run traces`.

**Run it.** `cd timeoff-agent && npm run eval` uses the offline planner and needs no key.
`EVAL_MODE=claude npm run eval` runs the same suite through the model.
