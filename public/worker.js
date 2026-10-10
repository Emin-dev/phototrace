let wasm;
const encode = new TextEncoder();
const decode = new TextDecoder('utf-8', { fatal: true });
function invoke(name, bytes) {
  const ptr = wasm.allocate(bytes.length);
  if (!ptr && bytes.length) throw new Error('The browser could not allocate a bounded input.');
  let result;
  try { new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes); result = wasm[name](ptr, bytes.length); }
  finally { wasm.release(ptr, bytes.length); }
  const outPtr = Number(result & 0xffffffffn), outLen = Number(result >> 32n);
  try { return decode.decode(new Uint8Array(wasm.memory.buffer, outPtr, outLen)); }
  finally { wasm.release(outPtr, outLen); }
}
async function inventory(input, side) {
  if (input.mode === 'manifest' || input.mode === 'sample') return {manifest: input.manifest, observations: []};
  const files = input.files;
  if (!files.length || files.length > 100) throw new Error('Select between 1 and 100 files per side.');
  if (files.some(f => f.size > 32*1024*1024) || files.reduce((n,f)=>n+f.size,0)>256*1024*1024) throw new Error('Local limits: 32 MiB per file and 256 MiB per side.');
  const records=[], observations=[];
  for (let i=0;i<files.length;i++) {
    self.postMessage({type:'progress',text:`Hashing ${side} file ${i+1} of ${files.length}…`});
    const file=files[i], bytes=new Uint8Array(await file.arrayBuffer());
    if (bytes.length!==file.size) throw new Error('File size changed while reading. Please select it again.');
    const sha256=invoke('hash_bytes',bytes), id=`${side}-${i+1}`;
    records.push({id,path:file.name,size:file.size,sha256,path_hash:null,kind:'unknown',original_id:null,albums:null,metadata:null});
    observations.push({id,sha256,size:file.size});
  }
  return {manifest:{schema_version:1,label:`Selected ${side} files`,completeness:'partial',records},observations};
}
self.onmessage=async ({data})=>{
  try {
    const response=await fetch('./phototrace_core.wasm');
    if (!response.ok) throw new Error('The Rust engine could not load. Reload and try again.');
    wasm=(await WebAssembly.instantiate(await response.arrayBuffer(),{})).instance.exports;
    const source=await inventory(data.source,'source'), destination=await inventory(data.destination,'destination');
    if(data.samplePayloads) {
      for (const [side,target] of [['source',source],['destination',destination]]) {
        for(const [id,payload] of Object.entries(data.samplePayloads[side])) {
          const bytes=encode.encode(payload);
          target.observations.push({id,sha256:invoke('hash_bytes',bytes),size:bytes.length});
        }
      }
    }
    self.postMessage({type:'progress',text:'Comparing bytes, supplied metadata, and relationships…'});
    const input={source:source.manifest,destination:destination.manifest,source_observations:source.observations,destination_observations:destination.observations};
    const result=JSON.parse(invoke('run',encode.encode(JSON.stringify(input))));
    if(result.error) throw new Error(result.error);
    self.postMessage({type:'complete',report:result.report,source:source.manifest,destination:destination.manifest,observations:{source:source.observations,destination:destination.observations}});
  } catch(error) { self.postMessage({type:'error',error:error instanceof Error?error.message:'The comparison failed.'}); }
};
