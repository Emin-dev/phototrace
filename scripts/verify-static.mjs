// Intentionally no Rust compiler, npm install, or external network is needed here.
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url), get=path=>readFile(new URL(path,root));
for(const path of ['public/index.html','public/app.js','public/validation.js','public/worker.js','public/style.css','public/icon.svg','public/sample.json','public/manifest-guide.json','public/LICENSE.txt','public/third-party-licenses.txt'])assert.ok((await stat(new URL(path,root))).size>0,`${path} missing or empty`);
const wasm=await get('public/phototrace_core.wasm');
assert.ok(WebAssembly.validate(wasm),'The prebuilt WASM must validate');
const {instance}=await WebAssembly.instantiate(wasm,{});
for(const name of ['allocate','release','run','hash_bytes'])assert.equal(typeof instance.exports[name],'function',`Missing WASM export ${name}`);
const notices=(await get('public/third-party-licenses.txt')).toString();
const index=JSON.parse(await get('licenses/index.json'));
const lock=(await get('Cargo.lock')).toString();
const pinned=[...lock.matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"\nsource = /g)].map(m=>`${m[1]}@${m[2]}`);
assert.deepEqual(index.map(p=>`${p.name}@${p.version}`).sort(),pinned.sort(),'Every pinned third-party Cargo crate must have packaged licenses');
for(const packageInfo of index)for(const file of packageInfo.files){const content=await get(file.path);assert.equal(createHash('sha256').update(content).digest('hex'),file.sha256,`License changed: ${file.path}`);assert.ok(notices.includes(content.toString()),`License absent from served bundle: ${file.path}`);}
assert.equal((await get('LICENSE')).toString(),(await get('public/LICENSE.txt')).toString());
const rustSource=await get('third-party/rust-1.99.0/COPYRIGHT-library.html');
const rustServed=await get('public/RUST-STANDARD-LIBRARY-NOTICES.html');
assert.equal(createHash('sha256').update(rustSource).digest('hex'),'5647be074c8edf7339fd863055923a8fc80bc5610a8d4661ec3b767b9d392c27','Pinned Rust 1.99.0 library notice must match');
assert.deepEqual(rustServed,rustSource,'Served Rust standard-library notice must be verbatim');
const config=JSON.parse(await get('vercel.json'));assert.equal(config.framework,null);assert.equal(config.buildCommand,'node scripts/verify-static.mjs');assert.equal(config.outputDirectory,'public');
console.log(`PASS: prebuilt WASM (${wasm.length} bytes), static assets, ${index.length} pinned crate license packages, exact Rust 1.99.0 library notice, and explicit static Vercel build.`);
