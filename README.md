# Phototrace

A careful second look at a photo migration. A bounded, read-only browser demo with a real Rust/WASM reconciliation engine.

## What works

- Import independent source and destination JSON manifests (schema v1), or select local files on each side.
- SHA-256 hashing of actual selected file bytes inside the Rust WebAssembly engine, in a cancellable worker.
- Distinguish locally verified equal bytes, reported hash agreement, missing records, changed size/hash, ambiguous duplicate candidates, and path-only matches.
- Compare supplied metadata fields, album membership, and original/edit links separately. Unknown fields remain unknown.
- Filter/search findings, inspect evidence and candidate records, write a bounded human-review note, acknowledge findings, and download a portable JSON audit.
- Export includes source/destination manifests, exact evidence fingerprint, unsigned human review, provenance modes, unknowns, and an unconditional no-source-deletion flag.
- Session-only processing. No analytics, remote library connection, uploads, accounts, or data persistence. Static assets are requested from the same origin; file contents and manifests are never transmitted.

The default synthetic fixture deliberately has 8 source records, 9 destination records, 3 locally hashed byte matches, 1 missing record, 1 changed pair, 1 ambiguous pair, 1 path-only match, and 1 reported hash match. Seven source records need review due to missing evidence or association/metadata exceptions. “Photo” fixture payloads are explicitly synthetic text, not actual HEIC/JPEG/MOV data. Thumbnails are decorative CSS illustrations.

## Boundaries

This cannot establish a complete iPhone Photos inventory. Pickers and exports can omit or transform originals, edits, cloud-only files, Live Photo companions, or sidecars. Only supplied records and selected bytes are checked. Equal bytes do not prove durable storage, backup health, provenance of the original device, media usability, or safe source deletion.

The demo does **not** parse EXIF, HEIC, video, or image metadata. Metadata, album membership, and original/edit relations come from manifests and are labelled supplied claims. It does not migrate files. The public UI has no deletion, upload, rename, or filesystem-writing API; downloads require the user's export action. JSON audit files contain filenames, metadata and notes, so share them carefully. The audit fingerprint binds the evidence snapshot; it is not a signature, identity attestation, or tamper-proof review.

Both selected files must actually be hashed during the current session for “Bytes verified.” An imported SHA-256 never receives that label, even if a manifest tries to claim local verification. The importer accepts only the record schema, not observations. In the Rust library, observations are a trusted caller API: use them only for bytes your caller actually read and hashed. The browser worker is that caller here.

Path matches are exact, case-sensitive relative paths. No basename guessing or automatic path normalization. Hash matches take precedence over exact path. Duplicate source content/paths or multiple destination hash/path candidates are ambiguous; one destination file cannot silently prove multiple source records migrated. Candidate IDs shown/exported in each finding are capped at 20 with the total retained. Full manifests remain in the audit.

Source and destination file selection creates fresh partial inventories, replacing that side in memory. A metadata-capable scanner beside an archive, live Immich integration, incremental large-library scan, durable projects, authenticated/signable reviews, and real mobile/desktop device verification remain future work, not simulated features.

## Limits

- 2,000 records and 4 MiB per imported manifest; 8 MiB combined Rust request
- 100 local files per side; 32 MiB each; 256 MiB total per side
- Unique IDs ≤128 bytes; relative paths ≤512 bytes; 64 album names ≤128 bytes
- 32 metadata fields per record; keys ≤64 bytes and nonempty values ≤512 bytes
- Human notes ≤500 characters; no HTML rendering or spreadsheet export
- Worker termination cancels reads/processing; a generation guard discards superseded results

## Build and run

Requires Rust supporting edition 2024, `wasm32-unknown-unknown`, and Node 20+ for tests. The recorded checks used Rust 1.99.0 and Node 24.19.0. Dependencies are pinned in `Cargo.lock`; `rust-toolchain.toml` pins Rust 1.99.0, rustfmt, Clippy, and the WASM target. Development-only Playwright 1.62.1 is pinned in `package.json` and `package-lock.json`.

```sh
# Install the official Rust toolchain, then:
rustup target add wasm32-unknown-unknown
./scripts/build.sh
cargo clippy --all-targets --locked -- -D warnings
npm test
python3 -m http.server 4303 --directory public
```

Open `http://localhost:4303`. `public/phototrace_core.wasm` is a real prebuilt release artifact so the demo can be deployed without compiling Rust on Vercel. Rebuild it after Rust changes with `scripts/build.sh`, which also remaps machine-specific build paths out of the distributed binary. `vercel.json` explicitly sets `framework: null` and runs `node scripts/verify-static.mjs` on the prebuilt files, with no Rust compilation or deployment-time dependency/browser installation. It publishes only `public/`, with a strict same-origin CSP and privacy headers.

## Tests and verification

- 24 Rust unit tests: hash known vector, verified/reported distinction, missing/changed/ambiguous/path-only, duplicate multiplicity, malformed schema/provenance, original/edit links, unknown metadata, album gaps, destination extras, size/count bounds.
- 14 Node/WASM integration tests execute the exact built WASM and the actual worker source, including real `File` reads, a 1 MiB hash oracle, both selection limits, hostile filenames-as-data, synthetic fixture truth, and 2,000 × 2,000 duplicate candidate stress with bounded output.
- 20 exact-source DOM/Worker-shim control-flow regression tests cover transactional replacement, 10,000-level unknown input, worker construction/clone cleanup, stale sample success/failure, superseded import, completion announcements, distinct action names, and stable row selection. These are not browser or accessibility-tree execution.
- `tests/browser.mjs` is a browser verification runner. It covers fixture display, search/filter, review/export, actual local file selection, malformed imports, cancellation/stale results, rerun, reload, no external app requests, console errors, dialog keyboard behavior, and viewport overflow at 320/390/768/1024/1440px.
- Browser execution is **pending**. The build environment did not support browser IPC or a reachable preview. No screenshot or pixel-based UI pass is claimed.

To run browser checks in an environment where Chromium is supported, install the lockfile-pinned development dependencies and Chromium, then run:

```sh
npm ci --ignore-scripts
npx playwright install chromium
BASE_URL=https://your-qa-preview npm run test:browser
# Or use local host and an installed binary:
BASE_URL=http://localhost:4303 CHROMIUM_PATH=/usr/bin/chromium node tests/browser.mjs
```

See `qa/VERIFICATION.md` for the executed checks and remaining browser acceptance tests.

## Manifest format

Download `public/manifest-guide.json` from the “Limits & scope” dialog, or inspect `fixtures/source.json` and `fixtures/destination.json`. Completeness is one of `unknown`, `partial`, `supplied_export`; there is deliberately no “complete device” option. `null` means unknown, while an empty album array or metadata object is an explicit claim of no supplied associations/fields. SHA-256 values are 64 hexadecimal characters. `path_hash` is accepted as unverified provenance but is never used for byte matching.

## Provenance and licensing

First-party HTML, CSS, JavaScript, Rust, and fixture generators are newly authored for Phototrace. The demo fixtures contain synthetic data. Decorative images are local CSS and SVG. No external fonts, images, trackers, or runtime frontend dependencies.

Rust dependencies: serde/serde_json (MIT OR Apache-2.0), sha2 (MIT OR Apache-2.0), with exact transitive versions in `Cargo.lock`. Actual pinned third-party license/copyright texts for all 21 Cargo dependency packages are in `licenses/` and the served `public/third-party-licenses.txt`; see `THIRD-PARTY-NOTICES.md`. The exact pinned Rust 1.99.0 standard-library copyright/license notice is retained in `third-party/rust-1.99.0/COPYRIGHT-library.html` and served verbatim as `public/RUST-STANDARD-LIBRARY-NOTICES.html`. `node scripts/verify-static.mjs` checks package completeness, text hashes, and served-bundle inclusion without requiring Cargo. First-party code: MIT.

## Review-fix traceability

The current source fixes independently reproduced mixed hash/path destination double-claims by applying a shared one-to-one candidate-claim check. Edited records only get covered relationships when both referenced records are true original roots and are themselves uniquely paired. Cyclic edits and original-with-parent chains remain explicit exceptions.

Manifest/local-file replacement is transactional: bounds and schema are validated before replacing inputs or clearing review. Invalid replacements retain the last valid comparison and notes. Valid manifest/file/sample replacements are staged first; when notes or acknowledgements exist, a confirmation dialog offers Keep current review, Export audit first, or Replace and clear review. Exporting does not commit the replacement. Stale confirmation outcomes are ignored. Strict shallow schema validation rejects unknown/nested fields before worker structured cloning; synchronous Worker/clone failures clean up controls and worker state. Both success and failure continuations of sample loads are guarded against newer input/compare requests.

Selection keeps row nodes stable and moves user-triggered focus to the inspector at every viewport, with a Back to file list action. Side actions have distinct accessible names. Completion and filtered counts use live status channels. Pixel/AT validation is still pending; source regression checks alone are not a UI pass.

`python3 scripts/source-manifest.py` generates `qa/SHA256SUMS` covering every source, fixture, test, static asset, license, lockfile and deployment/build input. It excludes only generated `qa/` evidence, Cargo `target/`, `node_modules/`, `.git/` and `.vercel/`. This avoids self-hashing evidence while identifying the entire shipped snapshot.
