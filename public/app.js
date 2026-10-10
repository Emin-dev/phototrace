import { validateManifest, validateFiles, validateInput } from './validation.js';
const $=id=>document.getElementById(id);
const statuses={verified:'Bytes verified',missing:'Missing',changed:'Changed',ambiguous:'Ambiguous',reported:'Reported hash',unverified:'Path only'};
const state={source:null,destination:null,report:null,sourceManifest:null,destinationManifest:null,observations:null,samplePayloads:null,worker:null,version:0,filter:'all',query:'',selected:null,reviews:new Map(),sample:true,pending:{source:0,destination:0},replacementPending:null};
let sample;
// Geometric, decorative icons never rely on installed symbol fonts or HTML parsing.
function decorativeIcon(kind){
 const paths={check:'M5 12l4 4L19 6',chevron:'M9 5l7 7-7 7'};
 if(!Object.hasOwn(paths,kind))throw new Error('Unknown decorative icon');
 const ns='http://www.w3.org/2000/svg',icon=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
 for(const [name,value]of Object.entries({class:'ui-icon','data-icon':kind,viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))icon.setAttribute(name,value);
 path.setAttribute('d',paths[kind]);icon.append(path);return icon;
}
function text(id,value){$(id).textContent=value;}
function showError(message){text('error',message);$('error').hidden=false;text('status','');}
function clearError(){$('error').hidden=true;}
function finishReplacement(allow, announce = false) {
  const pending = state.replacementPending;
  if (!pending) return;
  state.replacementPending = null;
  if ($('replace-dialog').open) $('replace-dialog').close();
  const accepted = Boolean(allow && pending.guard());
  pending.resolve(accepted);
  if (!accepted && announce) text('status', 'Kept the current comparison and human review.');
}
function confirmReplacement(description, guard) {
  if (!guard()) return Promise.resolve(false);
  const reviews = [...state.reviews.values()];
  const notes = reviews.filter(review => review.note.length > 0).length;
  const acknowledged = reviews.filter(review => review.acknowledged).length;
  if (!notes && !acknowledged) return Promise.resolve(true);
  finishReplacement(false);
  text('replace-summary', `${description} will clear ${notes} note(s) and ${acknowledged} acknowledgement(s) from your current comparison.`);
  text('replace-export-status', '');
  $('replace-export').disabled = !state.report;
  return new Promise(resolve => {
    state.replacementPending = { resolve, guard };
    try { $('replace-dialog').showModal(); $('replace-keep').focus(); }
    catch (error) { state.replacementPending = null; resolve(false); showError('Could not open the replacement confirmation. Your current review is unchanged.'); }
  });
}
function exportBeforeReplacement() {
  if (!state.replacementPending) return;
  try {
    exportAudit();
    text('replace-export-status', 'Audit download requested. Check that your copy was saved, then choose whether to replace. Your current review is still here.');
  } catch (error) {
    text('replace-export-status', 'The audit could not be prepared. Keep the current review and try exporting again.');
  }
}
function stop(){finishReplacement(false);state.version++;if(state.worker)state.worker.terminate();state.worker=null;$('cancel').hidden=true;$('compare').disabled=false;text('status','');}
function invalidate(){stop();state.report=null;state.selected=null;state.reviews.clear();$('results').hidden=true;$('empty').hidden=false;clearError();}
function sideLabel(side){const data=state[side];if(!data){text(side+'-label','Choose a '+side);text(side+'-meta','Manifest or up to 100 local files');return;}
 text(side+'-label',data.mode==='files'?`${data.files.length} selected files`:data.manifest.label||'Imported manifest');
 text(side+'-meta',data.mode==='files'?'Bytes will be hashed locally':`${data.manifest.records?.length??'?'} records · ${data.mode==='sample'?'synthetic fixture':'reported evidence'}`);
}
function setMode(){text('mode-tag',state.sample?'SYNTHETIC DEMO':'PRIVATE LOCAL SESSION');text('input-note',state.sample?'The sample includes intentional gaps. Its “photo” bytes are synthetic text, not real media.':'Selecting files replaces that side’s inventory. Metadata stays unknown. Refreshing clears your review.');}
async function loadSample() {
  finishReplacement(false);
  const sourceTicket = ++state.pending.source, destinationTicket = ++state.pending.destination;
  try {
    if (!sample) {
      const response = await fetch('./sample.json');
      if (!response.ok) throw new Error('Sample fixtures could not load.');
      sample = await response.json();
    }
    if (sourceTicket !== state.pending.source || destinationTicket !== state.pending.destination) return;
    validateManifest(sample.source); validateManifest(sample.destination);
    const current = () => sourceTicket === state.pending.source && destinationTicket === state.pending.destination;
    if (!await confirmReplacement('Loading the sample', current) || !current()) return;
    invalidate();
    state.sample = true; state.samplePayloads = sample.synthetic_payloads;
    state.source = { mode: 'sample', manifest: sample.source };
    state.destination = { mode: 'sample', manifest: sample.destination };
    sideLabel('source'); sideLabel('destination'); setMode();
    await compare();
  } catch (error) {
    if (sourceTicket === state.pending.source && destinationTicket === state.pending.destination) showError(error.message);
  }
}
async function importManifest(side, file) {
  if (!file) return;
  finishReplacement(false);
  const ticket = ++state.pending[side];
  try {
    if (file.size > 4 * 1024 * 1024) throw new Error('Manifest exceeds the 4 MiB limit.');
    const raw = await file.text();
    if (ticket !== state.pending[side]) return;
    const data = validateManifest(JSON.parse(raw));
    // Stage valid input, then obtain explicit permission before losing human review.
    const current = () => ticket === state.pending[side];
    if (!await confirmReplacement(`Replacing the ${side} manifest with “${data.label}”`, current) || !current()) return;
    invalidate();
    state[side] = { mode: 'manifest', manifest: data };
    state.sample = false; state.samplePayloads = null;
    sideLabel(side); setMode();
    text('status', `Loaded and validated ${side} manifest. Run the comparison when ready.`);
  } catch (error) {
    if (ticket === state.pending[side]) showError(error instanceof SyntaxError ? 'This file is not valid JSON. Your previous comparison and review are unchanged.' : `${error.message} Your previous comparison and review are unchanged.`);
  }
}
async function selectFiles(side, files) {
  if (!files.length) return;
  finishReplacement(false);
  const ticket = ++state.pending[side];
  try {
    validateFiles(files);
    const current = () => ticket === state.pending[side];
    if (!await confirmReplacement(`Replacing the ${side} with ${files.length} selected file(s)`, current) || !current()) return;
    invalidate();
    state[side] = { mode: 'files', files };
    state.sample = false; state.samplePayloads = null;
    sideLabel(side); setMode();
    text('status', `Selected ${files.length} ${side} files. Nothing has been uploaded.`);
  } catch (error) { showError(`${error.message} Your previous comparison and review are unchanged.`); }
}
async function compare() {
  finishReplacement(false);
  ++state.pending.source; ++state.pending.destination;
  let worker = null;
  let revision = state.version;
  const finish = () => {
    if (worker) worker.terminate();
    if (state.worker === worker) state.worker = null;
    $('compare').disabled = false; $('cancel').hidden = true;
  };
  const failed = error => {
    finish();
    showError(error instanceof Error ? error.message : 'The local comparison could not complete.');
    $('empty').hidden = Boolean(state.report);
    $('results').hidden = !state.report;
  };
  try {
    validateInput(state.source); validateInput(state.destination);
    stop(); clearError(); revision = state.version;
    $('empty').hidden = true; $('compare').disabled = true; $('cancel').hidden = false;
    text('status', 'Starting the local Rust engine…');
    worker = new Worker('./worker.js', { type: 'module' }); state.worker = worker;
    worker.onerror = () => { if (revision === state.version) failed(new Error('The local engine could not start. Please try again.')); };
    worker.onmessage = ({ data }) => {
      if (revision !== state.version) return;
      try {
        if (data.type === 'progress') { text('status', data.text); return; }
        if (data.type === 'error') throw new Error(data.error);
        finish();
        if (state.report && state.report.manifest_fingerprint !== data.report.manifest_fingerprint) state.reviews.clear();
        state.report = data.report; state.sourceManifest = data.source;
        state.destinationManifest = data.destination; state.observations = data.observations;
        state.filter = 'all'; state.query = ''; $('search').value = ''; $('more-filter').value = '';
        text('status', `Comparison complete. ${state.report.source_count} source records; ${state.report.summary.verified} byte-verified; ${state.report.summary.needs_review} need review.`); $('results').hidden = false;
        render();
        const first = state.report.findings.find(f => f.status === 'missing') || state.report.findings[0];
        if (first) selectFinding(first.id, false);
        else { state.selected = null; $('detail-content').hidden = true; $('detail-empty').hidden = false; }
      } catch (error) { failed(error); }
    };
    // Worker construction and structured cloning can both fail synchronously.
    worker.postMessage({ source: state.source, destination: state.destination, samplePayloads: state.sample ? state.samplePayloads : null });
  } catch (error) { failed(error); }
}
function reviewFor(id){return state.reviews.get(id)||{acknowledged:false,note:''};}
function attention(f){return f.status!=='verified'||f.issues.length>0;}
function filtered(){return state.report.findings.filter(f=>{const review=reviewFor(f.id);const match=state.filter==='all'||(state.filter==='attention'?attention(f):state.filter==='reviewed'?review.acknowledged:f.status===state.filter);return match&&f.path.toLowerCase().includes(state.query.toLowerCase());});}
function render(){const r=state.report;if(!r)return;text('stat-total',r.source_count);text('stat-verified',r.summary.verified);text('stat-review',r.summary.needs_review);text('stat-reviewed',[...state.reviews.values()].filter(v=>v.acknowledged).length);text('stat-review-denom',`/ ${r.source_count}`);text('all-count',r.source_count);renderList();const ul=$('unknowns-list');ul.replaceChildren();for(const item of r.unknowns){const li=document.createElement('li');li.textContent=item;ul.append(li);}text('extra-records',`${r.destination_only.length} destination-only record(s) are outside source matching: ${r.destination_only.join(', ')||'none'}.`);text('audit-note',`Evidence fingerprint ${r.manifest_fingerprint.slice(0,16)}… · ${state.sample?'Synthetic fixture audit':'Current session only'}.`);}
function renderList(){const list=$('file-list');list.replaceChildren();const rows=filtered();document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter===state.filter);b.setAttribute('aria-pressed',String(b.dataset.filter===state.filter));});
 for(const f of rows){const index=state.report.findings.indexOf(f),button=document.createElement('button');button.className=`file-row${state.selected===f.id?' selected':''}`;button.setAttribute('aria-pressed',String(state.selected===f.id));button.setAttribute('aria-label',`${f.path}, ${statuses[f.status]}, inspect evidence`);button.dataset.id=f.id;
 const thumb=document.createElement('span');thumb.className=`thumb t${index%6}`;thumb.setAttribute('aria-hidden','true');
 const info=document.createElement('span');info.className='file-info';const name=document.createElement('span');name.className='file-name';name.textContent=f.path.split('/').pop();const sub=document.createElement('span');sub.className='file-sub';sub.textContent=f.status==='verified'?f.issues.length?`${f.issues.length} association / metadata exception(s)`:'Both file contents checked':f.status==='reported'?'Imported SHA-256 · not read here':f.status==='unverified'?'Path match · bytes unknown':f.status==='missing'?'Not found in supplied destination':f.status==='ambiguous'?`${f.candidate_count} possible destination records`:'Size or SHA-256 disagreement';info.append(name,sub);
 const end=document.createElement('span');end.className='row-end';if(reviewFor(f.id).acknowledged){const reviewed=document.createElement('span');reviewed.className='review-mark';reviewed.append(decorativeIcon('check'));reviewed.title='Human reviewed';end.append(reviewed);}const badge=document.createElement('span');badge.className=`status-badge ${f.status}`;badge.textContent=statuses[f.status];const arrow=document.createElement('span');arrow.className='row-chevron';arrow.append(decorativeIcon('chevron'));arrow.setAttribute('aria-hidden','true');end.append(badge,arrow);button.append(thumb,info,end);button.addEventListener('click',()=>selectFinding(f.id,true));list.append(button);}
 if(!rows.length){const p=document.createElement('p');p.className='no-files';p.textContent='No files match this view. Try another filter or search.';list.append(p);}text('list-footer',`Showing ${rows.length} of ${state.report.source_count} source records · read-only comparison`);
}
function markSelection(){document.querySelectorAll('.file-row').forEach(button=>{button.classList.toggle('selected',button.dataset.id===state.selected);button.setAttribute('aria-pressed',String(button.dataset.id===state.selected));});}
function selectFinding(id,scroll){state.selected=id;const f=state.report.findings.find(f=>f.id===id);if(!f)return;$('detail-empty').hidden=true;$('detail-content').hidden=false;text('detail-title',f.path);text('detail-status',statuses[f.status]);$('detail-status').className=`status-badge ${f.status}`;text('detail-reason',f.reason);const list=$('evidence-list');list.replaceChildren();const rows=[['Byte evidence',f.byte_evidence],['Destination',f.destination_path||`${f.candidate_count} candidate(s)`],['Candidate IDs',(f.candidates.join(', ')||'None')+(f.candidate_count>20?' (first 20 shown)':'')],['Metadata',f.metadata],['Albums',f.albums],['Original / edit',f.relationship]];for(const [label,value]of rows){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;row.append(dt,dd);list.append(row);}const issues=$('detail-issues');issues.replaceChildren();issues.className=f.issues.length?'detail-issues':'';for(const issue of f.issues){const p=document.createElement('p');p.textContent=issue;issues.append(p);}text('record-json',JSON.stringify({source:state.sourceManifest.records.find(r=>r.id===id),destination_candidates:state.destinationManifest.records.filter(r=>f.candidates.includes(r.id)),local_source_observation:state.observations?.source.find(r=>r.id===id)||null},null,2));const review=reviewFor(id);$('review-note').value=review.note;$('acknowledge').checked=review.acknowledged;markSelection();if(scroll){if(matchMedia('(max-width:970px)').matches)$('detail-content').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});$('detail-title').setAttribute('tabindex','-1');$('detail-title').focus({preventScroll:true});}}
function saveReview(renderRows=false){if(!state.selected)return;state.reviews.set(state.selected,{note:$('review-note').value.slice(0,500),acknowledged:$('acknowledge').checked});text('stat-reviewed',[...state.reviews.values()].filter(v=>v.acknowledged).length);if(renderRows)renderList();}
function exportAudit(){if(!state.report)return;const audit={format:'phototrace-audit-v1',created_at:new Date().toISOString(),synthetic_demo:state.sample,contains_synthetic_fixture:state.source.mode==='sample'||state.destination.mode==='sample',input_modes:{source:state.source.mode,destination:state.destination.mode},scope:'User-supplied inventories only. Browser-local read-only comparison.',report:state.report,manifests:{source:state.sourceManifest,destination:state.destinationManifest},local_byte_observations:state.observations,human_review:state.report.findings.map(f=>({source_id:f.id,...reviewFor(f.id)})),review_warning:'Human acknowledgements are not verification and never authorize source deletion.'};const blob=new Blob([JSON.stringify(audit,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='phototrace-audit.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);text('status','Audit download requested with filenames, notes, and all uncertainty preserved. Share it carefully.');}
for(const side of ['source','destination']){const manifestInput=$(side+'-manifest-input'),filesInput=$(side+'-files-input');$(side+'-import').addEventListener('click',()=>manifestInput.click());$(side+'-files').addEventListener('click',()=>filesInput.click());manifestInput.addEventListener('change',()=>{const file=manifestInput.files[0];manifestInput.value='';importManifest(side,file);});filesInput.addEventListener('change',()=>{const files=[...filesInput.files];filesInput.value='';selectFiles(side,files);});}
$('replace-keep').addEventListener('click',()=>finishReplacement(false,true));$('replace-confirm').addEventListener('click',()=>finishReplacement(true));$('replace-export').addEventListener('click',exportBeforeReplacement);$('replace-dialog').addEventListener('cancel',event=>{event.preventDefault();finishReplacement(false,true);});$('replace-dialog').addEventListener('close',()=>{if(!$('replace-dialog').open)finishReplacement(false);});$('back-to-list').addEventListener('click',()=>{const row=[...document.querySelectorAll('.file-row')].find(row=>row.dataset.id===state.selected);(row||$('search')).focus();});$('compare').addEventListener('click',compare);$('cancel').addEventListener('click',()=>{++state.pending.source;++state.pending.destination;stop();$('empty').hidden=Boolean(state.report);$('results').hidden=!state.report;text('status','Comparison cancelled. No files were changed.');});$('load-sample').addEventListener('click',loadSample);$('empty-sample').addEventListener('click',loadSample);$('export').addEventListener('click',exportAudit);$('review-note').addEventListener('input',()=>saveReview(false));$('acknowledge').addEventListener('change',()=>saveReview(true));$('search').addEventListener('input',()=>{state.query=$('search').value;renderList();});document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;$('more-filter').value='';renderList();}));$('more-filter').addEventListener('change',()=>{state.filter=$('more-filter').value||'all';renderList();});for(const id of ['about-button','limits-button'])$(id).addEventListener('click',()=>$('scope-dialog').showModal());$('close-dialog').addEventListener('click',()=>$('scope-dialog').close());$('scope-dialog').addEventListener('click',e=>{if(e.target===$('scope-dialog')){const r=$('scope-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('scope-dialog').close();}});window.addEventListener('pagehide',stop);loadSample();
