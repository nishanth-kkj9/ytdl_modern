# references/prompts — Agent Prompt Templates

## What belongs here

- Reusable, approved prompt templates for recurring coding-agent tasks in this
  repository (e.g. audit rounds, release checks, documentation sweeps).
- Task briefs that a human wants preserved verbatim for future sessions.

## What does NOT belong here

- One-off chat instructions with no reuse value.
- Generated agent output (session reports belong in session storage, not here).
- Anything that duplicates `AGENTS.md` rules — AGENTS.md is the binding policy;
  prompts here may reference it but never override it.

## How coding agents must use this material

- Treat templates here as **starting points**, not requirements: adapt the
  template to the actual task rather than running steps that do not apply.
- If a template conflicts with `AGENTS.md`, `AGENTS.md` wins.
- When improving a template, edit the file in place and keep it concise.
