# Exact-revision Chromium correction

2026-10-10: GitHub Actions run 38010531143 executed the first real Chromium suite for commit 222e264730f343e1c349fc97d6ba9f1bce8cfbe3. All Rust, WASM, syntax, static and source regression steps passed. Chromium revealed a repeated local-file replacement defect: a queued `close` event from an earlier dialog could dismiss a newly reopened confirmation.

The close callback now clears a pending replacement only when the dialog is actually closed. A deterministic exact-source regression dispatches the delayed old event after a newer replacement has opened and verifies that the new confirmation remains active. A companion test verifies that closing the active dialog still preserves the prior report and notes. The delayed-event test was observed failing before the application correction, then passing afterward. All 40 Node/WASM/control-flow/contrast tests pass locally.

The unchanged end-to-end Chromium sequence exercises Keep current review followed immediately by selecting the same local file again and confirming replacement. Remote CI for the corrective commit must pass before browser verification is considered complete. This record does not assert a hosted preview or visual acceptance pass.

Initial failing run: https://github.com/Emin-dev/phototrace/actions/runs/38010531143

## Font-independent decorative icons

Hosted Chromium review of the earlier exact head showed missing-glyph boxes for some decorative symbols. The icons now use local inline SVG paths with inherited colors and bounded sizing. All decorative SVGs are `aria-hidden="true"` and `focusable="false"`; action labels and accessible names remain unchanged. The dynamic row check/chevron also use SVG nodes created with the SVG namespace, without parsing HTML or requesting external images/fonts.

Two added exact-source tests verify the 20 static SVGs, no embedded text/external references/active content, absence of the replaced decorative Unicode characters, preserved control names, and the bounded dynamic icon helper. All 42 Node/WASM/control-flow/contrast tests pass locally. The real Chromium suite additionally checks visible SVG path bounds, rendered dimensions, namespace and decorative accessibility attributes for source/destination/privacy/limits/sidebar privacy icons. Hosted visual acceptance belongs to a separate post-deployment review.
