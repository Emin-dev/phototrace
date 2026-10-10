# Third-party notices

Actual pinned Cargo package license texts are retained in `licenses/` and the served `public/third-party-licenses.txt`. `licenses/index.json` identifies package versions, declared SPDX expressions and copied-text SHA-256 values. The packaging script copies packaged LICENSE, LICENCE, COPYING, COPYRIGHT, NOTICE and UNLICENSE files from each installed crate.

This conservatively includes runtime, procedural macro, build-time and target-specific Cargo dependencies. The static app has no JavaScript runtime packages. Playwright is a pinned development-only test dependency, excluded from deployment installation and output. First-party code is MIT (`LICENSE`, served as `public/LICENSE.txt`).

Regenerate with `python3 scripts/package-licenses.py` after dependency changes, then run `node scripts/verify-static.mjs`. This is a concrete dependency-text packaging record, not a comprehensive legal or Rust toolchain licensing opinion.

- block-buffer 0.10.4: MIT OR Apache-2.0
- cfg-if 1.0.5: MIT OR Apache-2.0
- cpufeatures 0.2.17: MIT OR Apache-2.0
- crypto-common 0.1.7: MIT OR Apache-2.0
- digest 0.10.7: MIT OR Apache-2.0
- generic-array 0.14.7: MIT
- itoa 1.0.18: MIT OR Apache-2.0
- libc 0.2.190: MIT OR Apache-2.0
- memchr 2.8.3: Unlicense OR MIT
- proc-macro2 1.0.107: MIT OR Apache-2.0
- quote 1.0.47: MIT OR Apache-2.0
- serde 1.0.229: MIT OR Apache-2.0
- serde_core 1.0.229: MIT OR Apache-2.0
- serde_derive 1.0.229: MIT OR Apache-2.0
- serde_json 1.0.151: MIT OR Apache-2.0
- sha2 0.10.9: MIT OR Apache-2.0
- syn 3.0.6: MIT OR Apache-2.0
- typenum 1.20.1: MIT OR Apache-2.0
- unicode-ident 1.0.26: (MIT OR Apache-2.0) AND Unicode-3.0
- version_check 0.9.5: MIT/Apache-2.0
- zmij 1.0.23: MIT

## Rust standard library

The WASM binary also includes Rust standard-library code. The exact Rust 1.99.0 `COPYRIGHT-library.html` artifact is preserved at `third-party/rust-1.99.0/COPYRIGHT-library.html` and served verbatim as `public/RUST-STANDARD-LIBRARY-NOTICES.html`. SHA-256: `5647be074c8edf7339fd863055923a8fc80bc5610a8d4661ec3b767b9d392c27`. The static packaging check verifies both identity and source/distribution parity. This supplements Cargo dependency notices; packaging checks are not full legal clearance.
