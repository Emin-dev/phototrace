# Phototrace verification record

Verification dated 2026-10-09. Browser and deployment verification remain pending.

## Executed and passing

- `cargo test --locked`: 24 tests passed.
- `cargo build --locked --release --target wasm32-unknown-unknown`: compiled actual release WASM.
- `cargo clippy --all-targets --locked -- -D warnings`: clean.
- `node --test tests/wasm.test.mjs`: 14 tests passed. This executes the actual built WASM plus worker code in a Node VM with controlled static-asset loading. Real Node File objects exercise local-byte reads. This is not a DOM/browser substitute.
- `node --test tests/glue.test.mjs`: 20 exact-source control-flow/DOM-shim tests passed; no actual browser claim.
- Syntax checks for all app, script and test JavaScript files passed.
- `node scripts/verify-static.mjs`: actual WASM exports, static assets, all 21 pinned dependency license packages and served texts, and explicit static-only Vercel configuration passed.
- Worst-case 2,000 source × 2,000 destination duplicate candidates: total counts retained; per-finding candidate IDs capped at 20; serialized result bounded under 3 MiB by test.
- No app runtime external hosts, upload endpoints, credentials, analytics, localStorage, or remote resources.
- All user strings render with textContent; safe JSON download rather than HTML/CSV. Full local observations included for audit reproducibility. Manifest-import extra fields are denied by Rust. No imported claims of local verification.
- Local data limits checked before reads; backend validation repeats record/schema/hash/field bounds. Worker is terminated on cancel or input change. Generation counters reject stale completion.
- Synthetic fixtures show real intentional absence, changed bytes, ambiguity, reported hashes, unverified paths, album/metadata differences, and a broken original/edit link.
- Source hashes for this build are in `qa/SHA256SUMS`. Cargo lockfile retained.

## Blocked / not yet executed

Actual browser rendering and DOM interaction checks, screenshots, accessibility behavior and visual QA are pending. The build environment could not create Chromium IPC sockets or provide a reachable browser preview. No screenshot or browser-based pass is claimed.

Serve `public/` from a local server or reachable QA preview, then run `tests/browser.mjs` in a browser-capable environment.

## Required browser acceptance before release

1. Open the page and confirm no console errors, WASM loads, and all default counts match the sample oracle. Capture actual desktop and mobile screenshots.
2. At 320, 390, 768, 1024 and 1440 px: no horizontal overflow; readable filters, records, inspector, buttons and dialog. Confirm decorative CSS thumbnails are not represented as file previews.
3. Keyboard-only: skip link; tab to all inputs/actions; native dialog traps focus and Escape closes; finding buttons are accessible and selection announced; search and aria-live/error states work. Check contrast with an accessibility tool.
4. Import valid manifests, invalid JSON, unknown schema fields, 2,001 records, >4 MiB files, unsupported hash formats, path traversal. Invalid replacements must retain the prior valid comparison and review notes; successful replacements invalidate prior results.
5. Select identical local files on both sides: verified bytes plus unknown metadata/relationships. Select same filename with different bytes: changed. Source duplicate bytes: ambiguous.
6. Review a missing record, add a note, acknowledge it, export audit: missing status remains missing, notes included, all unknowns retained, both local observations and evidence fingerprint included, no deletion permission.
7. Filter/search/empty search; restore all; inspect supplied record details. Check candidate truncation is marked and destination-only IDs are visible.
8. Cancel while hashing/loading; change an input during work; repeated compare; load sample during an import; reload. No superseded result or error should reappear. Notes survive failed or cancelled replacements and repeated same-input compare. Valid new input and sample loading require an explicit replacement confirmation whenever notes or acknowledgements exist. Export-first must retain the current session and not silently commit. Refresh still clears session-only state.
9. Monitor network with local file inputs. Only same-origin static asset requests are expected; no filenames, metadata, bytes, or notes in requests. Verify hosted CSP and other headers.
10. Deployment must serve WASM with a suitable content type, correct relative paths, and immutable source parity to the reviewed artifact.

## Remaining product validation

Real iOS/Safari/Android/file-picker behavior has not been tested. No production-scale scan or full Photos library completeness is claimed. Switching benefit versus existing migration/integrity tools needs operator trials; this demo does not establish demand or differentiation.

Current review corrections are detailed in `qa/REVIEW-FIXES.md`. The stable source manifest covers every source/build/deployment/test/fixture/license input; generated QA records and dependency/build caches are excluded. Rust and development-only Playwright are lockfile/toolchain-pinned. Browser verification remains pending.
