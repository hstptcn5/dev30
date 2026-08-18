# Dev30 Console UI Migration

Status: **branch-only / do not deploy to production yet**

Branch: `feature/console-ui-migration`

## Design source

The uploaded Stitch `dev30-console` project is the visual source of truth for this migration:

- hard 2–4px technical borders;
- hard hardware-style shadows;
- off-white / forest-green console palette;
- editorial Inter-style headings with monospace system labels;
- top hardware dock and desktop side rail;
- GitHub evidence scanner visual;
- save-point / developer-journal timeline;
- restrained scanline and pixel-grid texture;
- hardware-modal treatment for portable exports.

The Stitch project is **not** the runtime architecture for Dev30. Dev30 stays on its existing Node + static DOM application so the current server routes, authentication, billing, snapshots, exports, scheduled work and email delivery continue to use the already-tested implementation.

## Explicitly excluded from Stitch

The migration must not introduce unsupported mock semantics from the design prototype. In particular, production UI must not claim or display invented values such as:

- Operational Efficiency;
- Incidents;
- Deployments when no Dev30 evidence field exists;
- generic Build Status telemetry;
- `DEV30 Heavy Industries`;
- GPG / ED25519 verification claims;
- SHA256 signature claims.

The Stitch dependency on `@google/genai` / `GEMINI_API_KEY` is also excluded. AI-provider credentials remain server-side and the UI continues to call Dev30-owned `/api/*` endpoints only.

## Product mapping

Prototype concepts map to real Dev30 data as follows:

| Console concept | Real Dev30 source |
| --- | --- |
| Scanner inputs | GitHub commits, pull requests and repository context |
| Current story | `report.headline`, `report.summary`, `report.mainFocus` |
| Projects | evidence-backed report project clusters |
| Save points | saved Dev30 snapshots |
| Work signals | `workMix`, repositories, technical signals and evidence |
| Journal | merged public/private workspace snapshots allowed for the connected workspace |
| Weekly | actual entitlement + schedule state |
| Export modal | existing PDF / Markdown / Copy Markdown / Full JSON / Pixel Card actions |
| Stakeholder artifact | existing client/founder report route and evidence |

## Implementation shape

The migration is additive and presentation-first:

- `public/console-ui.css` — main visual system and responsive shell;
- `public/console-ui-polish.css` — compatibility layer for older Dev30 visual modules;
- `public/console-ui-preload.js` — read-only bridge that observes successful Dev30 API responses;
- `public/console-ui.js` — console navigation, scanner visual, report decoration, journal timeline and Free/Pro presentation;
- existing application scripts remain responsible for all business actions.

No `src/`, server, Netlify Function, database schema, entitlement, RevenueCat/Paddle, scheduler or email implementation is changed by this checkpoint.

## Deployment gate

Do **not** merge this branch to `main` merely because implementation is complete.

Before production deployment:

1. Full automated test / syntax / smoke / Docker checks must pass on the final branch head.
2. Visually review desktop and mobile for Landing, loading, Report, Workspace Free, Workspace Pro, Pricing and shared stakeholder report.
3. Verify GitHub Connect, public Analyze, private gating, Export, Workspace journal, billing CTA and Weekly controls still call the existing Dev30 endpoints.
4. Verify Free users cannot interact with the Pro weekly schedule form.
5. Verify no Stitch mock telemetry, Gemini dependency or browser-visible provider secret is present.
6. Only after explicit approval, merge once and allow a single production deployment.

This gate exists both to protect production behavior and to avoid unnecessary hosting deploy usage during the redesign batch.
