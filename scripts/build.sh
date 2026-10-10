#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo test --locked
# Avoid embedding machine-specific paths in the distributed WASM binary.
RUSTFLAGS="${RUSTFLAGS:-} --remap-path-prefix=$PWD=. --remap-path-prefix=${CARGO_HOME:-$HOME/.cargo}=cargo-cache --remap-path-prefix=${RUSTUP_HOME:-$HOME/.rustup}=rust-toolchain" \
  cargo build --locked --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/phototrace_core.wasm public/phototrace_core.wasm
node scripts/verify-static.mjs
