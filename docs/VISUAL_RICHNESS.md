# Dev30 visual richness pass

This pass responds to screenshot feedback that the warm-light editorial UI was clear and credible but still felt too dry and text-heavy.

## Product intent

Keep Dev30 reader-first and evidence-backed. Add visual rhythm only where it helps someone scan, understand, verify, or recognize product state faster.

The pass intentionally avoids a dashboard rewrite, generic AI gradients, decorative glass, chart libraries, and animation-heavy presentation.

## Intentional deltas

### Landing

- Keep one dominant action: `See their work`.
- Add a restrained accent line to the command surface.
- Enrich the example output with three product-value signals: analysis window, claim-level evidence, and snapshot comparison.
- Add numbered rhythm to the three product principles without turning them into cards.

### Report

- Keep the headline and narrative first, but reduce oversized headline dominance slightly.
- Add an at-a-glance metric rail for analysis window, meaningful projects, GitHub evidence, and comparable snapshots.
- Move snapshot state directly after the primary briefing so `Snapshot saved` / `No new snapshot` is visible instead of implicit.
- Add a lightweight work-mix visualization and repository pulse derived from already-rendered technical data.
- Give repository projects and observed patterns stronger entity grouping while avoiding a wall of equal cards.
- Preview the first three evidence sources before the full evidence drawer.
- Keep technical detail and the complete evidence set progressively disclosed.

### Workspace

- Make the developer-journal state visible with compact snapshot/report/schedule signals.
- Mark the latest activity surface with an explicit snapshot state.
- Add timeline dots to recent history without converting the workspace into an admin dashboard.

## Accessibility and responsive behavior

- Existing focus-visible behavior remains intact.
- New information is represented with text as well as color.
- Hover movement is disabled for users who prefer reduced motion.
- Layouts explicitly collapse at 1024px, 760px, and 420px; existing 375px behavior remains supported by the narrow rules.
- Long repository/evidence content retains the existing overflow and wrapping protections.

## Scope boundary

This pass does not change analysis logic, evidence generation, snapshot persistence, GitHub access, billing, quotas, background jobs, Supabase schema, or Netlify runtime behavior.
