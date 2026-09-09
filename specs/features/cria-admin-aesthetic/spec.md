# CRIA visual refresh for the MCP Gateway admin

## Summary

Refresh the MCP Gateway administrative panel so it carries CRIA — Inteligencia & Transformación's visual identity while preserving every current management, policy-test, and audit workflow. The panel remains an operational B2B admin interface, not a marketing landing page: client-logo, team, testimonial, pricing, and lead-capture sections from the supplied brand brief are out of scope.

## Actors

- **Gateway administrator:** signs in with the configured administration key and manages users, MCPs, assignments, tests, and logs.
- **CRIA operator:** needs a coherent, premium CRIA-branded interface during demos and day-to-day operation.

## User journeys

### Authenticate and orient

1. An administrator opens the panel without an active session.
2. They immediately recognize CRIA branding and understand that the product controls MCP access.
3. They enter the administration key and reach the dashboard without a visual or interaction regression.

### Manage access with a branded interface

1. An administrator creates or edits a user or MCP, then assigns or revokes access.
2. Form fields, status indicators, cards, and destructive actions remain unambiguous in the CRIA visual system.
3. Feedback after an action is readable and visibly distinguishes success, error, enabled, disabled, remote, and access decisions.

### Inspect gateway activity

1. An administrator scrolls to the policy tester and audit log.
2. They can clearly scan request outcome, user, internal MCP destination, timestamp, and expanded request details.
3. The audit UI remains legible on desktop and mobile without exposing sensitive values differently from the current product.

## Acceptance criteria

1. The panel uses CRIA's dark visual language: near-black base, layered dark surfaces/cards, white primary text, muted gray secondary text, blue information/identity accents, and magenta reserved for primary calls to action.
2. The login and dashboard display the official CRIA logo and the tagline `INTELIGENCIA & TRANSFORMACIÓN`; the logo remains readable at desktop and mobile widths.
3. Typography distinguishes editorial headings from operational UI text in a way consistent with the supplied CRIA brief: display treatment for the primary page title and a clean sans-serif treatment for controls, labels, and logs.
4. The visual hierarchy makes the page title, authentication state, primary save/enable action, secondary actions, and destructive actions independently recognizable without relying only on color.
5. User, MCP, assignment, tester, and audit sections preserve all existing information and controls, including IDs, remote endpoints, access status, gateway test results, redacted logs, and editing/deletion actions.
6. The page remains fully usable at a 320px viewport: controls do not overflow horizontally, touch targets remain operable, and audit entries can be expanded and read.
7. Text, borders, form inputs, status chips, and button states meet WCAG AA contrast for their intended text size; keyboard focus is clearly visible.
8. The branding refresh does not add external client logos, team photos, marketing lead forms, or commercial claims to this administrative product.
9. Existing admin API requests, session-only handling of the admin key, policy tester behavior, and audit-log rendering work unchanged after the refresh.

## Edge cases

- The official logo fails to load: the CRIA product name and tagline remain visible as text.
- The dashboard is empty or an API error is shown: the states remain clear against the dark background.
- Long user names, internal MCP IDs, URLs, JSON payloads, and timestamps wrap or scroll safely without breaking their cards or logs.
- Reduced-motion users do not require animation to understand state or interaction.

## Assumptions

- The supplied CRIA communication brief is the visual reference only; its instructions for producing a marketing email, landing page, or commercial proposal do not redefine the existing admin product.
- The existing functional structure and Spanish copy remain the source of truth unless a visual adjustment improves clarity.
- The official CRIA logo may be loaded from `https://cria.website/logo.png`; a textual fallback is required.

## Open questions

- None. The refresh can proceed with the current admin information architecture.

## Handoff

- Spec owner: Codex
- Plan agent: Codex
- Implementation agent: Codex
- Spec confidence: high
- Blocking questions: none
- Ready for /plan: yes
