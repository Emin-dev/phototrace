// Source-color regression, not screenshot sampling or a complete WCAG audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const css=await fs.readFile(new URL('../public/style.css',import.meta.url),'utf8');
const rules=selector=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].trim()===selector).map(match=>match[2]);
function declaration(bodies,name){let value;for(const body of bodies)for(const item of body.split(';')){const [key,...rest]=item.split(':');if(key.trim()===name)value=rest.join(':').trim();}return value;}
function resolve(value){const variable=/^var\((--[^)]+)\)$/.exec(value);if(variable){const root=rules(':root');return declaration(root,variable[1]);}return value;}
function luminance(color){let hex=color.replace('#','');if(hex.length===3)hex=[...hex].map(c=>c+c).join('');assert.match(hex,/^[a-f0-9]{6}$/i);const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb.reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);}
function ratio(a,b){const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const normal=rules('.button-primary');
for(const state of ['normal','hover','focus','active'])test(`primary button ${state} text contrast meets 4.5:1`,()=>{const stateRules=state==='normal'?[]:rules(`.button-primary:${state}`);const foreground=resolve(declaration([...normal,...stateRules],'color'));const background=resolve(declaration([...normal,...stateRules],'background'));const contrast=ratio(foreground,background);assert.ok(contrast>=4.5,`${foreground} on ${background}: ${contrast.toFixed(3)}:1`);console.log(`${state}: ${foreground} on ${background} = ${contrast.toFixed(3)}:1`);});
