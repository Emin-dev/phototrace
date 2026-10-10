#!/usr/bin/env python3
"""Hash every shipped source, build/deploy input, fixture, test, license and static asset.
Exclude generated QA records (including this output), target, node_modules, .git and .vercel.
"""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
excluded={'target','node_modules','.git','.vercel','qa','__pycache__'}
files=sorted(p for p in root.rglob('*') if p.is_file() and not any(part in excluded for part in p.relative_to(root).parts))
text=''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(root)}\n' for p in files)
(root/'qa/SHA256SUMS').write_text(text)
print(f'Hashed {len(files)} complete source/deployment inputs.')
