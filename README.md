# Dev30

Dev30 turns a GitHub username into an evidence-backed summary of what that developer actually worked on during the last 30 days.

The product is intentionally two-layered:

- **Simple view** translates technical activity into plain language for clients, founders, recruiters, and other non-technical readers.
- **Technical view** exposes work mix, stack, project trajectory, changed areas, and the GitHub evidence behind every major claim.

The analysis pipeline is deterministic GitHub collection first, then DeepSeek synthesis. GitHub remains the source of truth; the LLM is used to cluster, interpret, and explain evidence rather than invent activity.

Implementation is being developed on `agent/dev30-mvp`.
