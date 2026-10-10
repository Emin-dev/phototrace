// Run against a served build: BASE_URL=https://your-qa-preview node tests/browser.mjs
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:4303';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1100},acceptDownloads:true});
const errors=[],remote=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin&&!r.url().startsWith('blob:'))remote.push(r.url());});
const waitResults=()=>page.locator('#results:not([hidden])').waitFor();
try{
 await page.goto(base);await waitResults();assert.equal(await page.locator('#stat-total').innerText(),'8');assert.equal(await page.locator('#stat-verified').innerText(),'3');assert.equal(await page.locator('#stat-review').innerText(),'7');assert.match(await page.locator('#status').innerText(),/Comparison complete/);
 const glyphIcons=await page.locator('.input-icon svg,.privacy-banner>span svg,#limits-button svg,.side-lock svg').evaluateAll(icons=>icons.map(icon=>{const box=icon.getBBox(),rect=icon.getBoundingClientRect();return{namespace:icon.namespaceURI,hidden:icon.getAttribute('aria-hidden'),focusable:icon.getAttribute('focusable'),path:icon.querySelector('path')?.getAttribute('d'),width:box.width,height:box.height,renderedWidth:rect.width,renderedHeight:rect.height};}));
 assert.equal(glyphIcons.length,5);for(const icon of glyphIcons){assert.equal(icon.namespace,'http://www.w3.org/2000/svg');assert.equal(icon.hidden,'true');assert.equal(icon.focusable,'false');assert.ok(icon.path&&icon.width>0&&icon.height>0&&icon.renderedWidth>0&&icon.renderedHeight>0);}
 await page.locator('[data-filter="missing"]').click();assert.equal(await page.locator('.file-row').count(),1);await page.locator('.file-row').click();assert.match(await page.locator('#detail-title').innerText(),/0423/);assert.equal(await page.locator('#detail-title').evaluate(e=>document.activeElement===e),true);await page.locator('#back-to-list').click();assert.equal(await page.locator('.file-row').evaluate(e=>document.activeElement===e),true);
 await page.locator('#review-note').fill('Original still missing; request export again.');await page.locator('#acknowledge').check();assert.equal(await page.locator('#stat-reviewed').innerText(),'1');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);const audit=JSON.parse(await fs.readFile(await download.path(),'utf8'));assert.equal(audit.report.can_recommend_source_deletion,false);assert.equal(audit.human_review.find(r=>r.source_id==='s3').acknowledged,true);assert.equal(audit.report.summary.missing,1);
 await page.locator('[data-filter="all"]').click();await page.locator('#search').fill('nonexistent');assert.equal(await page.locator('.file-row').count(),0);assert.match(await page.locator('#file-list').innerText(),/No files/);await page.locator('#search').fill('');
 await fs.mkdir(new URL('../qa/',import.meta.url),{recursive:true});await page.screenshot({path:new URL('../qa/desktop.png',import.meta.url).pathname,fullPage:true});
 for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`Horizontal overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:new URL('../qa/mobile.png',import.meta.url).pathname,fullPage:true});
 await page.locator('#limits-button').click();assert.equal(await page.locator('#scope-dialog').evaluate(e=>e.open),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#scope-dialog').evaluate(e=>e.open),false);
 // Valid replacements must not silently discard notes or acknowledgements.
 const replacementManifest={name:'source.json',mimeType:'application/json',buffer:await fs.readFile(new URL('../fixtures/source.json',import.meta.url))};
 await page.locator('#source-manifest-input').setInputFiles(replacementManifest);
 await page.locator('#replace-dialog[open]').waitFor();assert.equal(await page.locator('#stat-reviewed').innerText(),'1');
 await page.locator('#replace-keep').click();assert.equal(await page.locator('#stat-reviewed').innerText(),'1');assert.equal(await page.locator('#results').isHidden(),false);
 await page.locator('#source-manifest-input').setInputFiles(replacementManifest);await page.locator('#replace-confirm').click();assert.equal(await page.locator('#results').isHidden(),true);
 await page.locator('#load-sample').click();await waitResults();await page.locator('#review-note').fill('Keep this current audit.');await page.locator('#acknowledge').check();
 await page.locator('#load-sample').click();await page.locator('#replace-dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('#stat-reviewed').innerText(),'1');
 await page.locator('#load-sample').click();await page.locator('#replace-dialog[open]').waitFor();
 const [beforeReplacement]=await Promise.all([page.waitForEvent('download'),page.locator('#replace-export').click()]);
 const beforeAudit=JSON.parse(await fs.readFile(await beforeReplacement.path(),'utf8'));assert.ok(beforeAudit.human_review.some(r=>r.note==='Keep this current audit.'));assert.equal(await page.locator('#replace-dialog').evaluate(e=>e.open),true);assert.equal(await page.locator('#stat-reviewed').innerText(),'1');
 await page.locator('#replace-confirm').click();await waitResults();assert.equal(await page.locator('#stat-reviewed').innerText(),'0');await page.locator('#review-note').fill('Keep until replacement is confirmed.');await page.locator('#acknowledge').check();
 const files=[{name:'same.txt',mimeType:'text/plain',buffer:Buffer.from('local actual bytes')}];await page.locator('#source-files-input').setInputFiles(files);await page.locator('#replace-dialog[open]').waitFor();await page.locator('#replace-keep').click();assert.equal(await page.locator('#stat-reviewed').innerText(),'1');await page.locator('#source-files-input').setInputFiles(files);await page.locator('#replace-confirm').click();assert.equal(await page.locator('#results').isHidden(),true);await page.locator('#destination-files-input').setInputFiles(files);await page.locator('#compare').click();await waitResults();assert.equal(await page.locator('#stat-verified').innerText(),'1');assert.match(await page.locator('#evidence-list').innerText(),/unknown/);
 await page.locator('#source-manifest-input').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{bad')});await page.locator('#error:not([hidden])').waitFor();assert.match(await page.locator('#error').innerText(),/not valid JSON/);assert.equal(await page.locator('#results').isHidden(),false);assert.equal(await page.locator('#stat-verified').innerText(),'1');
 await page.locator('#load-sample').click();await waitResults();assert.equal(await page.locator('#stat-reviewed').innerText(),'0');
 await page.route('**/phototrace_core.wasm',async route=>{await new Promise(r=>setTimeout(r,500));await route.continue().catch(()=>{});});await page.locator('#compare').click();await page.locator('#cancel').click();await page.waitForTimeout(700);assert.equal(await page.locator('#results').isHidden(),false);assert.match(await page.locator('#status').innerText(),/cancelled/);await page.unroute('**/phototrace_core.wasm');
 await page.locator('#compare').click();await waitResults();assert.equal(await page.locator('#stat-total').innerText(),'8');
 await page.reload();await waitResults();assert.equal(await page.locator('#stat-reviewed').innerText(),'0');assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log('PASS: fixture, filters, review, export, safe manifest/file/sample replacement with keep/export-first/confirm, local File hashing, parse error, 5 viewport widths, dialog keyboard, cancellation, rerun, refresh, console, and no external app requests.');
}finally{await browser.close();}
