#!/usr/bin/env python3
"""Package actual pinned Cargo license texts; requires an available local cargo cache."""
import hashlib, json, pathlib, subprocess
root = pathlib.Path(__file__).resolve().parents[1]
metadata = json.loads(subprocess.check_output(['cargo','metadata','--locked','--offline','--format-version','1'], cwd=root))
packages = sorted((p for p in metadata['packages'] if p['source']), key=lambda p:(p['name'],p['version']))
index = []
bundle = ['Phototrace — Third-party license and copyright notices\n', 'Exact pinned Cargo package texts. Runtime, build-time and target-specific crates are included conservatively.\n']
for package in packages:
    origin = pathlib.Path(package['manifest_path']).parent
    name = package['name'] + '-' + package['version']
    entries = []
    for source in sorted(origin.iterdir()):
        if not source.is_file() or not source.name.upper().startswith(('LICENSE','LICENCE','COPYING','COPYRIGHT','NOTICE','UNLICENSE')):
            continue
        raw = source.read_bytes()
        dest = root / 'licenses' / name / source.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(raw)
        entries.append({'path': str(dest.relative_to(root)), 'sha256': hashlib.sha256(raw).hexdigest()})
        bundle.append(f'\n\n===== {name} / {source.name} =====\n\n' + raw.decode('utf8'))
    if not entries:
        raise RuntimeError(f'No packaged license found for {name}')
    index.append({'name':package['name'],'version':package['version'],'license':package['license'],'files':entries})
(root/'licenses/index.json').write_text(json.dumps(index,indent=2)+'\n')
(root/'public/third-party-licenses.txt').write_text(''.join(bundle))
(root/'public/LICENSE.txt').write_bytes((root/'LICENSE').read_bytes())
(root/'THIRD-PARTY-NOTICES.md').write_text('# Third-party notices\n\nActual pinned Cargo package license texts are retained in `licenses/` and the served `public/third-party-licenses.txt`. `licenses/index.json` identifies package versions, declared SPDX expressions and copied-text SHA-256 values. The packaging script copies packaged LICENSE, LICENCE, COPYING, COPYRIGHT, NOTICE and UNLICENSE files from each installed crate.\n\nThis conservatively includes runtime, procedural macro, build-time and target-specific Cargo dependencies. The static app has no JavaScript runtime packages. Playwright is a pinned development-only test dependency, excluded from deployment installation and output. First-party code is MIT (`LICENSE`, served as `public/LICENSE.txt`).\n\nRegenerate with `python3 scripts/package-licenses.py` after dependency changes, then run `node scripts/verify-static.mjs`. This is a concrete dependency-text packaging record, not a comprehensive legal or Rust toolchain licensing opinion.\n\n'+'\n'.join(f'- {p["name"]} {p["version"]}: {p["license"]}' for p in index)+'\n')
rust_notice = root/'third-party/rust-1.99.0/COPYRIGHT-library.html'
raw_notice = rust_notice.read_bytes()
if hashlib.sha256(raw_notice).hexdigest() != '5647be074c8edf7339fd863055923a8fc80bc5610a8d4661ec3b767b9d392c27':
    raise RuntimeError('Pinned Rust 1.99.0 library notice does not match.')
(root/'public/RUST-STANDARD-LIBRARY-NOTICES.html').write_bytes(raw_notice)
with (root/'THIRD-PARTY-NOTICES.md').open('a') as notices:
    notices.write('\n## Rust standard library\n\nThe WASM binary also includes Rust standard-library code. The exact Rust 1.99.0 `COPYRIGHT-library.html` artifact is preserved at `third-party/rust-1.99.0/COPYRIGHT-library.html` and served verbatim as `public/RUST-STANDARD-LIBRARY-NOTICES.html`. SHA-256: `5647be074c8edf7339fd863055923a8fc80bc5610a8d4661ec3b767b9d392c27`. The static packaging check verifies both identity and source/distribution parity. This supplements Cargo dependency notices; packaging checks are not full legal clearance.\n')
print(f'Packaged license texts for {len(index)} pinned Cargo packages and Rust 1.99.0 standard-library notices.')
