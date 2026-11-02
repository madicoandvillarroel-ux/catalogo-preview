// node pdf/secciones.mjs <pdf-data.json>
// Puts each product in the section of the catalog Madico approved (PDF review 30/10, boceto v14: pdf/secciones.json).
// New products keep the section that comes from ARTICULOS.
import fs from 'node:fs';
const [file]=process.argv.slice(2);
const d=JSON.parse(fs.readFileSync(file,'utf8'));
const S=JSON.parse(fs.readFileSync(new URL('./secciones.json',import.meta.url),'utf8'));
let n=0;
for(const p of d.products){const s=S[p.art];if(!s)continue;
 if(p.outlet&&s.outlet){if(s.outletGroup){p.outletGroup=s.outletGroup;n++;}}
 else if(!p.outlet&&!s.outlet){Object.assign(p,s);n++;}}
// New products whose family has another name than in the approved catalog go to the approved family (Madico 01/11: suitcases together).
const OK=new Set(Object.values(S).filter(s=>!s.outlet).map(s=>s.category));
const ALIAS=p=>{const n=String(p.name||'').toUpperCase(),tss=/SAMSONITE|AMERICAN TOURISTER/.test(n);
 if(p.category==='SAMSONITE')return 'SAMSONITE & AMERICAN TOURISTER';
 if(['BAGS','BACKPACKS'].includes(p.category))return tss?'SAMSONITE & AMERICAN TOURISTER':'BAGS & BACKPACKS';
 return null;};
let m=0;
for(const p of d.products){if(p.outlet||OK.has(p.category))continue;const f=ALIAS(p);if(f&&OK.has(f)){p.category=f;m++;}}
// Madico 01/11: one family for trainers. «PUMA SHOES» becomes «SHOES & TRAINERS» (it has Adidas, Skechers…), and every trainer goes there.
const SHOE=d.products.find(p=>!p.outlet&&p.category==='PUMA SHOES');
for(const p of d.products){if(p.outlet){if(p.outletGroup)p.outletGroup=String(p.outletGroup).replace('PUMA SHOES','SHOES & TRAINERS');continue;}
 if(p.category==='PUMA SHOES')p.category='SHOES & TRAINERS';
 else if(SHOE&&String(p.subfamily||p.group||'').toUpperCase()==='SHOES & TRAINERS'){p.category='SHOES & TRAINERS';for(const k of ['secpage','ord'])if(SHOE[k]!==undefined)p[k]=SHOE[k];}}
fs.writeFileSync(file,JSON.stringify(d));
console.log('secciones aprobadas',n,'familia unificada',m);
