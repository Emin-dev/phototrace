# Exact-revision Chromium correction

2026-10-10: GitHub Actions run 38010531143 executed the first real Chromium suite for commit 222e264730f343e1c349fc97d6ba9f1bce8cfbe3. All Rust, WASM, syntax, static and source regression steps passed. Chromium revealed a repeated local-file replacement defect: a queued `close` event from an earlier dialog could dismiss a newly reopened confirmation.

The close callback now clears a pending replacement only when the dialog is actually closed. A deterministic exact-source regression dispatches the delayed old event after a newer replacement has opened and verifies that the new confirmation remains active. A companion test verifies that closing the active dialog still preserves the prior report and notes. The delayed-event test was observed failing before the application correction, then passing afterward. All 40 Node/WASM/control-flow/contrast tests pass locally.

The unchanged end-to-end Chromium sequence exercises Keep current review followed immediately by selecting the same local file again and confirming replacement. Remote CI for the corrective commit must pass before browser verification is considered complete. This record does not assert a hosted preview or visual acceptance pass.

Initial failing run: https://github.com/Emin-dev/phototrace/actions/runs/38010531143
