# Implementation plan — CRIA visual refresh for the MCP Gateway admin

## Architecture and scope

This is a presentation-only change inside `public/`:

```text
public/index.html  → semantic branded structure and fallback content
public/styles.css  → CRIA tokens, responsive layout, interaction/accessibility states
public/app.js      → existing behavior retained; only minor rendering markup changes if needed
```

No backend endpoint, JSON shape, authentication flow, session-storage behavior, or Netlify routing changes are required. The admin panel continues to use the existing Fetch calls and Spanish user-facing copy.

## Data model and API impact

- No new data model or persistence changes.
- No management API contract changes.
- The existing `config` and audit-event response shapes remain unchanged.
- The logo is an external visual asset; semantic CRIA text remains present as an in-page fallback if it cannot load.

## Phase 1 — Establish the CRIA visual foundation

**Milestone:** The unauthenticated panel reads as a CRIA product and remains accessible.

1. Add the official logo, textual brand fallback, tagline, and product context to the static header.
2. Add the approved display and UI font loading with resilient system-font fallbacks.
3. Replace the current generic color rules with named CRIA dark-theme tokens for base, surfaces, text, blue semantic accents, magenta primary actions, and state colors.
4. Restyle the authentication, notice, message, and hero states with visible keyboard focus and contrast-safe text.

**Quality gate:** Test the unauthenticated state at desktop and 320px widths; verify readable fallback branding with image loading disabled.

## Phase 2 — Rebuild the operational dashboard hierarchy

**Milestone:** Management tasks are visually prioritized without changing behavior.

1. Organize existing dashboard regions with a responsive administrative layout and preserve their IDs, forms, and event targets.
2. Restyle controls, form labels, primary/secondary/destructive buttons, cards, status chips, and counts using CRIA visual semantics.
3. Improve the visual scanning order of users, MCP servers, assignments, policy tester, and observability while retaining all current data fields.
4. Add long-content treatment for internal IDs, endpoints, result JSON, and audit metadata so they wrap or scroll safely.

**Quality gate:** Perform create/edit/assign/revoke/test/log interactions against the existing local gateway and confirm the outgoing requests are unchanged.

## Phase 3 — Accessibility, responsive polish, and verification

**Milestone:** The branded UI is usable across supported viewport sizes and states.

1. Add/validate clear focus, hover, disabled, success, error, enabled, disabled, remote, allowed, denied, and audit-error states that do not rely on color alone.
2. Tune mobile breakpoints for single-column forms, cards, assignment rows, action groups, and audit summaries.
3. Respect reduced-motion preferences for any decorative transitions.
4. Run the TypeScript and existing gateway test suite; visually inspect the static page at desktop and narrow mobile widths.

**Quality gate:** Acceptance criteria 1–9 are checked against authenticated, empty, error, long-value, and mobile states.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| External logo or font fails to load | Keep CRIA name/tagline and system-font fallbacks in the document. |
| Styling refactor breaks JavaScript selectors or form layout | Preserve all existing element IDs, form names, data attributes, and response containers. |
| Dark theme lowers contrast in muted or status copy | Verify all text/state combinations against WCAG AA before handoff. |
| A marketing-oriented brief causes scope expansion | Limit work to the operational admin surface; do not add lead-generation or commercial sections. |

## Assumptions

- CRIA's supplied brand reference is authoritative for palette, typography intent, logo, tagline, and primary CTA emphasis.
- The visual refresh can use a remote font provider, with local fallbacks for unavailable networks.
- No new screenshot approval is required before implementation; visual QA follows implementation.

## Completion criteria

- The visual acceptance criteria in `spec.md` pass.
- `npm run check` and `npm test` pass.
- No existing admin or gateway behavior changes.
