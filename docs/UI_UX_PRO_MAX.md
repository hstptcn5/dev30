# Dev30 UI UX Pro Max design delta

This document records the intentional UI/UX direction applied after real-user pilot feedback. It is not a replacement design system. Dev30 keeps its existing dark neutral identity, evidence-first product model, and zero-runtime-dependency frontend.

## Inputs

The redesign follows `hstptcn5/ui-ux-pro-max-personal` and the pinned upstream UI UX Pro Max baseline `v2.15.0` / commit `a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5`.

Relevant personal rules:

- solve the user job before styling the screenshot;
- one dominant primary action per context;
- show value early;
- keep implementation jargon away from the primary journey;
- distinguish a reader experience from an operator/admin experience;
- progressively disclose evidence and technical detail;
- treat loading, error, empty, long-content, keyboard, narrow viewport and reduced-motion states as part of the design;
- avoid default AI-purple/glass/glow aesthetics unless they serve the product.

Relevant upstream product guidance:

- Micro SaaS: keep the landing simple and show the product quickly;
- Productivity Tool: prioritize clear hierarchy, ease of use and speed;
- AI Platform: use minimal chrome and an interactive product demonstration where possible;
- Minimalism / Swiss-style structure is a better fit for Dev30 than decorative AI styling.

## Product job

Primary first-time job:

> Enter a GitHub username and understand what that developer actually built recently.

Primary returning-user job:

> See what changed since the previous snapshot and get the next stakeholder-ready update.

Dev30 is primarily a **reader/briefing** experience. Evidence and technical metrics are verification layers, not the opening screen.

## Intentional visual deltas

### Home

- Keep exactly one primary action: `See their work`.
- Treat username + time window + language as one command surface.
- Reduce hero-only space and make the example briefing feel like a real output surface.
- Preserve connected-private-repo consent as an explicit optional control, not a second flow.
- Use concise outcome copy rather than architecture or access terminology.

### Report

- Use editorial reading hierarchy: profile context → briefing → main focus → projects → observations.
- Remove the visual feeling that every paragraph needs a card.
- Use whitespace, separators and typography before borders/elevation.
- Keep technical details and evidence collapsed but easy to find.
- Make long repository names, evidence titles and translated copy wrap safely.

### Workspace

- Present the workspace as a developer journal, not an admin dashboard.
- Latest snapshot / change / next update remain above settings and quotas.
- Reduce card density in history and overview surfaces.
- Keep the schedule editor clearly operational because that screen is an operator task.

## Interaction deltas

- Analysis status gets visible progress treatment without inventing percentage completion.
- Recoverable workspace errors use a non-blocking accessible toast rather than `alert()`.
- Destructive GitHub disconnect keeps explicit confirmation.
- Focus-visible styling applies to buttons, links, inputs, selects and disclosure summaries.
- Reduced-motion removes decorative progress animation.

## Responsive targets

Review behavior at:

- 375px
- 768px
- 1024px
- 1440px

At narrow widths:

- command controls stack intentionally;
- project/observation/technical grids become one column;
- evidence metadata wraps instead of forcing horizontal scroll;
- workspace overview and schedule fields collapse by task priority.

## Preserve

Do not casually change these in future polish passes:

- green/blue on dark-neutral identity;
- evidence-backed claim model;
- public-by-default privacy posture;
- private repository opt-in;
- reader-first report ordering;
- progressive disclosure for technical/evidence layers;
- local-first/PAT development compatibility.

Future redesigns should identify a concrete user failure before replacing these decisions.
