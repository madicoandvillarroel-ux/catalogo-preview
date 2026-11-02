// node pdf-data.mjs <site dir> <csv file|url> <out.json>
// 01/11 22:00: rebuilt with ARTICULOS closed (OUTLET 207 products).
// Compiles the live catalog exactly like the web does and writes the data the weekly PDF needs.
import fs from 'node:fs';
const [site,csvSrc,out]=process.argv.slice(2);
const imp=p=>import(new URL('file://'+site+'/'+p).href);
const {compileFromCSV}=await imp('catalog-refresh.mjs');
const {isListed}=await imp('catalog-visibility.mjs');
const {availability}=await imp('availability.mjs');
const {quote,bundlePromotion,giftPromotion}=await imp('pricing.mjs');
const fetcher=async p=>({ok:true,redirected:false,json:async()=>JSON.parse(fs.readFileSync(site+'/'+p,'utf8'))});
const status=JSON.parse(fs.readFileSync(site+'/catalog-status.json','utf8'));
const text=/^https:/.test(csvSrc)?await (await fetch(csvSrc)).text():fs.readFileSync(csvSrc,'utf8');
const snap=await compileFromCSV(text,{fetcher,status});
const order=["The Seaman's Shop",'SIM cards','Audio','Smartwatches','Electronics','Watches','Fragrances','Travel & bags','Clothing','Caps & accessories','Sunglasses','Footwear','Everyday gear','Personal care','Nutrition','Food & drinks','Souvenirs','Outlet'];
// Product type from the name, so e.g. all souvenir T-shirts / magnets / mugs go together (like the printed catalog).
const TYPES=[['T-SHIRTS',/\bt-?shirts?\b|\btshirt|camiseta/i],['SWEATSHIRTS & HOODIES',/sweatshirt|hoodie|sudadera/i],['CAPS',/\bcaps?\b|\bcapvalencia|gorra/i],['MAGNETS',/magnet|\bim[aá]n\b/i],['MUGS',/\bmugs?\b|\btaza/i],['FANS',/\bfan\b|abanico/i],['KEYCHAINS',/key ?chain|kaychain|llavero|keyring/i],['ROSARIES',/rosary/i],['METAL CASES',/metal.*case/i],['PHOTO FRAMES',/photo frame/i],['SOCKS',/\bsocks?\b/i]];
const typeOf=p=>{for(const [l,r] of TYPES)if(r.test(p.name))return l;return null;};
const groupRank=g=>{const i=TYPES.findIndex(x=>x[0]===g);return i>=0?i:/^OTHER/i.test(g)?999:500;};
// Madico 01/11: OUTLET cards say what is left (AA stock and sizes), e.g. «Only 1 left · size S».
const leftText=p=>{const v=(p.stock?.variants||[]).filter(x=>typeof x.quantity==='number'&&x.quantity>0);if(v.length){const n=v.reduce((s,x)=>s+x.quantity,0);return (n===1?'Only 1 left':n+' left')+' · size '+v.map(x=>x.label+(v.length>1&&x.quantity>1?' ×'+x.quantity:'')).join(', ');}const q=p.stock?.quantity;return typeof q==='number'&&q>0?(q===1?'Only 1 left':q<=10?'Only '+q+' left':''):'';};
const rows=[];
for(const p of snap.products){
 // Web simple (02/11): BH tachado and BI/BJ gift are read for the web only; the PDF keeps its previous rules until Madico says otherwise.
 delete p.wasPrice;delete p.gift;delete p.giftArts;
 if(!isListed(p))continue;const a=availability(p);if(a.status==='out_of_stock')continue;
 const q=quote(p,'Valencia'),b=bundlePromotion(p);
 rows.push({art:p.art,name:p.name,category:p.outlet?'Outlet':/seaman/i.test(p.name+' '+(p.brand||''))?"The Seaman's Shop":p.category,subfamily:p.subfamily||'',group:(p.category==='Souvenirs'&&!p.outlet?typeOf(p):null)||(p.subfamily||'').toUpperCase(),price:q.price,compareAt:q.compareAt||null,image:p.image||(p.images||[])[0]||null,status:a.status,offer:q.active&&!p.outlet?(q.compareAt?'SPECIAL OFFER · BEFORE $'+q.compareAt:(q.label||'Special offer'))+(q.endsOn?' · until '+q.endsOn.split('-').reverse().join('/'):''):null,bundle:b?b.label:null,gift:giftPromotion(p)?'FREE GIFT: SONY HEADPHONES OR GRUNDIG CLOCK':null,outlet:!!p.outlet,left:p.outlet?leftText(p):'',sizes:(p.stock?.variants||[]).filter(v=>availability({stock:v}).status!=='out_of_stock').map(v=>v.label).slice(0,8)});
}
// Sections and order exactly like the printed catalog (pdf/catalog-structure.json: page titles + where each Art. was).
const ST=JSON.parse(fs.readFileSync(site+'/pdf/catalog-structure.json','utf8'));
const FIX={'AT. SAMSONITE':'SAMSONITE','SUPLEMENTS':'VITAMINS & SUPPLEMENTS','VITAMINS':'VITAMINS & SUPPLEMENTS','CASIO BABY-G SHEEN':'CASIO','G-SHOCK':'CASIO','OTHERS':'NEW ERA CAPS'};
const sec=t=>FIX[t]||t;const key=a=>String(a).toUpperCase().replace(/^0+(?=.)/,'');
const VAPE=/\b(vape|vapes|oxva|vaporesso|insta ?puff|puff|gtx|xlim|pod|coil|nicotin|e-?liquid|just juice)\b/i;
const pos=new Map();
for(const r of rows){const m=ST.arts[key(r.art)];r.family=r.category;
 if(r.outlet){r.category='OUTLET';r.ord=m&&+m[0]>=118?m:[999,0,0];continue;}
 if(VAPE.test(r.name)&&!['Food & drinks','Footwear','Clothing'].includes(r.family)){r.category='VAPE AREA';r.ord=m&&ST.pages[m[0]]==='VAPE AREA'?m:[96,9999,0];continue;}
 if(m&&+m[0]<118&&ST.pages[m[0]]){r.category=sec(ST.pages[m[0]]);r.ord=m;}
}
// Name rules (Madico): fishing together; memory / hard drives by type; SAMSONITE only Samsonite + American Tourister.
const RULES=[[/dualsense|playstation/i,'PLAYSTATION',37],[/earbuds|airpods|headphones|headset|in-ear/i,'AUDIO HEADSET',21],[/work trousers|working trousers|work pants/i,'WORKING CLOTHES',83],[/table tennis|ping pong|dumbbell|basketball|football ball/i,'SPORTS EQUIPMENT',65],[/^(?!.*(charg|controller|dualsense|console|slim)).*\b(ps5|ps4|nintendo switch|switch 2)\b/i,'VIDEOGAMES',37.5],[/^(?!.*(backpack|bag|case|sleeve|mochila)).*\b(laptop|intel|omnibook|notebook|chromebook|macbook)\b/i,'LAPTOP',25],[/fishing|\blures?\b|\breel\b|\bhooks?\b|vicloon|mitchell|sougayilang/i,'FISHING',65.5],[/\b(hdd|ssd|hard ?drive|solid disk)\b/i,'HARDDRIVE',31],[/power ?bank|powerbank|\d{4,5} ?mah/i,'POWERBANK',33],[/\b(usb ?3|flash drive|micro ?sd|microsd|pendrive|otg)\b|dual type-c/i,'MEMORY',32],[/\b(cable|charger|adapter|adaptor|hub|earpods|gan)\b/i,'GADGET',34]];
for(const r of rows){if(r.category==='OUTLET'||r.category==='VAPE AREA')continue;
 for(const [re,s,pg] of RULES)if(s==='FISHING'||!(r.ord&&r.ord[0]<118))if(re.test(r.name)&&!['Food & drinks','Personal care'].includes(r.family)){r.category=s;if(!r.ord||ST.pages[r.ord[0]]!==s)r.ord=[pg,9999,0];break;}
 if(r.category==='SAMSONITE'&&!/samsonite|american tourister|flashline|essens|ecodiver/i.test(r.name)){r.category='BAGS';r.ord=[56.5,9999,0];}
}
// New products: same section as most mapped products of their subfamily (else family)
const vote=(f)=>{const c={};for(const r of rows)if(r.ord&&r.category!=='OUTLET'&&f(r))c[r.category]=(c[r.category]||0)+1;return Object.entries(c).sort((x,y)=>y[1]-x[1])[0]?.[0];};
for(const r of rows)if(!r.ord){r.category=vote(x=>x.family===r.family&&x.subfamily===r.subfamily)||vote(x=>x.family===r.family)||String(r.family).toUpperCase();r.ord=null;}
const first={};for(const r of rows)if(r.ord&&r.ord[0]<999)first[r.category]=Math.min(first[r.category]??1e9,+r.ord[0]);
const secRank=s=>s==='OUTLET'?1e6:(first[s]??5000);
const k=r=>r.ord?[+r.ord[0],Math.round(r.ord[1]/45),+r.ord[2]]:[1e5,0,0];
// Watches: the subfamily shown is the brand / line (G-SHOCK, EDIFICE…), and they go grouped by it.
const WATCH=[['BABY-G',/baby-?g/i],['G-SHOCK',/g-?shock|\bga-|\bgm-|\bgw-|\bgbd-|\bdw-/i],['EDIFICE',/edifice|\befr-|\becb-|\beqs-/i],['PRO TREK',/pro ?trek|\bprg-/i],['SHEEN',/sheen/i],['SWISS MILITARY',/swiss military|military alpine/i],['SEIKO',/seiko/i],['CITIZEN',/citizen/i],['FOSSIL',/fossil/i],['BENYAR',/benyar/i],['CASIO',/casio|\bmtp-|\bmrw-|\bae-|\bla-|\bw-\d|\bf-91|\bmq-|\bltp-|\bmw-|\bws-|\bhdc-/i]];
for(const r of rows)if(r.family==='Watches'&&!r.outlet){const w=WATCH.find(([,re])=>re.test(r.name));r.group=w?w[0]:String(r.name).split(/\s+/)[0].toUpperCase();r.wrank=w?WATCH.indexOf(w):50;}
for(const r of rows)if(r.family==='Watches'&&!r.outlet&&['SEIKO','CITIZEN','FOSSIL','BENYAR'].includes(r.group)&&r.category==='CASIO'){r.category='SEIKO, CITIZEN, FOSSIL';}
for(const r of rows)r.secpage=r.category==='OUTLET'?118:(first[r.category]??500);
rows.sort((x,y)=>(secRank(x.category)-secRank(y.category))||String(x.category).localeCompare(y.category)||((x.wrank??-1)-(y.wrank??-1))||(()=>{const a=k(x),b=k(y);return a[0]-b[0]||a[1]-b[1]||a[2]-b[2];})()||String(x.group).localeCompare(y.group)||String(x.name).localeCompare(y.name));
fs.writeFileSync(out,JSON.stringify({generatedAt:new Date().toISOString(),count:rows.length,products:rows}));
console.log('pdf data',rows.length);
