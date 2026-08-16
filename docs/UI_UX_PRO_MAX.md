# Dev30 UI UX Pro Max design delta

This document records the intentional UI/UX direction applied after real-user pilot feedback. It is not a replacement design system. Dev30 keeps its evidence-first product model, reader-first information architecture, and zero-runtime-dependency frontend.

## Inputs

The redesign follows `hstptcn5/ui-ux-pro-max-personal` and the pinned upstream UI UX Pro Max baseline `v2.15.0` / commit `a38d04c3d5c298c851dbe5e6ee1965ee3de42cb5`.

The explicit visual preference is now:

> Use a light interface. Avoid a dark overall theme.

Per UI UX Pro Max Personal priority order, explicit user intent overrides earlier aesthetic preservation decisions.

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

## Visual direction

Dev30 uses a **warm-light editorial** system:

- warm off-white page background instead of pure white glare;
- white primary surfaces with soft neutral separators;
- charcoal text for strong reading contrast;
- restrained green for primary action, verified states and product identity;
- blue for links and keyboard focus;
- pale mint / pale blue surfaces only when they communicate grouping or state;
- shallow shadows used sparingly for command, preview and operational surfaces;
- no global dark panels, neon glow, purple AI gradients or glass-card aesthetic.

`public/light-theme.css` is loaded after the Pro Max structural layer. `public/polish.css` is the final screenshot-driven density/hierarchy layer. These preserve the product flow while allowing visual refinements to remain reversible and auditable.

## Intentional UX deltas

### Home

- Keep exactly one primary action: `See their work`.
- Treat username + time window + language as one command surface.
- Make the command surface a clear white object against the warm-light page.
- Preserve connected-private-repo consent as an explicit optional control, not a second flow.
- Keep the example briefing visible early and visually closer to the real report.
- On wide desktop screens, reduce hero-only whitespace so the command surface and example output feel causally connected.
- Keep the connected GitHub state as a compact status row; show private availability and privacy consequence without turning it into a settings card.

### Report

- Use editorial reading hierarchy: profile context → briefing → main focus → projects → observations.
- Use whitespace, separators and typography before borders/elevation.
- Keep the report itself largely paper-like rather than turning every section into a card.
- Keep technical details and evidence collapsed but easy to find on white grouped surfaces.
- Make long repository names, evidence titles and translated copy wrap safely.

### Workspace

- Present the workspace as a developer journal, not an admin dashboard.
- Latest snapshot / change / next update remain above settings and quotas.
- Make **Latest activity** the dominant returning-user surface; it is larger and contained while the two status summaries remain lighter-weight.
- Put `Analyze latest work` with the latest-activity surface instead of floating it in the page header.
- Remove duplicate refresh links when they perform the same action as the dominant CTA.
- Keep overview/history surfaces light and mostly borderless.
- Use a white contained surface for the schedule editor because it is an operational task.
- Keep destructive/disconnect settings visually distinct without using a dark danger zone.

## Interaction deltas

- Analysis status gets visible progress treatment without inventing percentage completion.
- Recoverable workspace errors use a non-blocking accessible toast rather than `alert()`.
- Destructive GitHub disconnect keeps explicit confirmation.
- Focus-visible styling applies to buttons, links, inputs, selects and disclosure summaries.
- Reduced-motion removes decorative progress animation.
- Private-repository consent remains one explicit checkbox; the consequence copy is concise and visible beside that control.

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
- workspace overview and schedule fields collapse by task priority;
- the dominant latest-activity CTA becomes a full-width mobile action;
- shadows are reduced so mobile does not look like a stack of floating cards.

## Preserve

Do not casually change these in future polish passes:

- light overall visual direction;
- green/blue functional identity on warm neutral surfaces;
- evidence-backed claim model;
- public-by-default privacy posture;
- private repository opt-in;
- reader-first report ordering;
- latest-activity-first workspace hierarchy;
- progressive disclosure for technical/evidence layers;
- local-first/PAT development compatibility.

Future redesigns should identify a concrete user failure or explicit user preference before replacing these decisions.
