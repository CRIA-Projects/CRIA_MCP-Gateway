# Tasks — CRIA visual refresh for the MCP Gateway admin

## Frontend

### T1 — Add branded document structure and resilient assets

- **Domain:** frontend
- **Priority:** P0
- **Parallel:** no
- **Depends on:** none
- **Files:** `public/index.html`
- **Work:** Add CRIA logo, textual fallback, tagline, font loading, and semantic wrappers needed for the administrative visual hierarchy. Preserve all current form IDs, field names, data attributes, response containers, and script imports.
- **Validation:** With images disabled, the CRIA name/tagline and login form remain visible; existing JavaScript selectors still resolve in the browser console.

### T2 — Apply CRIA design tokens and authenticated/unauthenticated styling

- **Domain:** frontend
- **Priority:** P0
- **Parallel:** no
- **Depends on:** T1
- **Files:** `public/styles.css`
- **Work:** Establish the CRIA dark palette, typography fallbacks, surface layering, authentication/notice/message states, buttons, controls, and focus styles. Reserve magenta for the primary action and use blue for product/information accents.
- **Validation:** Inspect login and dashboard-ready states at desktop width; keyboard navigation shows a visible focus indicator and primary/secondary/destructive actions remain distinct without color alone.

### T3 — Restyle operational dashboard content without contract changes

- **Domain:** frontend
- **Priority:** P0
- **Parallel:** no
- **Depends on:** T2
- **Files:** `public/styles.css`, `public/app.js` (only if rendering markup needs semantic status labels)
- **Work:** Style user/MCP cards, assignment rows, tester, result payload, audit entries, status chips, endpoints, and action groups as a clear operational B2B dashboard. Preserve API request paths, request bodies, and session-storage key behavior.
- **Validation:** Locally complete create, edit, assign, revoke, policy-test, and log-refresh flows; confirm the browser network requests match the current API contract.

### T4 — Ensure narrow-screen, long-content, and motion resilience

- **Domain:** frontend
- **Priority:** P1
- **Parallel:** no
- **Depends on:** T3
- **Files:** `public/styles.css`
- **Work:** Tune responsive rules for 320px, safe wrapping/scrolling of IDs/endpoints/JSON, readable audit summaries, usable action groups, and reduced-motion preferences.
- **Validation:** At 320px no controls create horizontal page overflow; long endpoint and JSON values remain contained; expanded logs stay readable; reduced-motion mode removes nonessential transitions.

### T5 — Run regression and visual acceptance checks

- **Domain:** frontend
- **Priority:** P0
- **Parallel:** no
- **Depends on:** T4
- **Files:** verification only
- **Work:** Verify all visual acceptance criteria against unauthenticated, authenticated, empty, error, long-value, desktop, and narrow-mobile states. Run the repository regression commands.
- **Validation:** `npm run check` and `npm test` pass; a manual browser pass confirms all current controls and audit rendering still work.

## Execution order

`T1 → T2 → T3 → T4 → T5`

All tasks are frontend-only and intentionally sequential because they affect the same static screen and visual-system foundation.
