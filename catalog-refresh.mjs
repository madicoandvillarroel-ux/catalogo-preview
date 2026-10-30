// Static catalog: bundled products.json, refreshed in the browser from a published Google Sheets CSV.
// Catalog updates never read or write the customer's order draft.
import {compileCatalog} from './compile-catalog.mjs';
import {applyReplenishment} from './replenishment.mjs';
import {parseCSV,prepareRows} from './csv.mjs';
import {isListed} from './catalog-visibility.mjs';
export const CACHE_NAME='tss-catalog-v2';
export const NETWORK_ONLY={'X-TSS-Network-Only':'1'};
export const CSV_PLACEHOLDER='PENDIENTE_URL_CSV';
const LIVE_KEY='live-catalog.json';

async function request(path,fetcher,networkOnly=true){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{const response=await fetcher(path,{cache:'no-store',signal:controller.signal,...(networkOnly?{headers:NETWORK_ONLY}:{})});
  if(!response.ok||response.redirected)throw Error('Catalog connection unavailable');return response;
 }finally{clearTimeout(timer);}
}
const readJSON=async(path,fetcher,networkOnly)=>(await request(path,fetcher,networkOnly)).json();
function validProducts(products){return Array.isArray(products)&&products.length>0&&!products.some(p=>!p||typeof p.art!=='string'||typeof p.name!=='string');}
function hash(text){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (h2>>>0).toString(16).padStart(8,'0')+(h1>>>0).toString(16).padStart(8,'0');}

// config.json → {"csvUrl":"..."}; the placeholder or an empty value means "use the bundled catalog".
export async function readConfig(fetcher=fetch){
 try{const config=await readJSON('config.json',fetcher,false),url=String(config?.csvUrl??'').trim();return {csvUrl:url&&url!==CSV_PLACEHOLDER?url:''};}catch{return {csvUrl:''};}
}
async function openCache(){try{return 'caches' in globalThis?await caches.open(CACHE_NAME):null;}catch{return null;}}
async function savedLive(){
 try{const cache=await openCache(),hit=cache&&await cache.match(LIVE_KEY);if(!hit)return null;const s=await hit.json();return validProducts(s?.products)&&typeof s.revision==='string'?s:null;}catch{return null;}
}
async function bundledSnapshot(fetcher,status,networkOnly){
 const products=await readJSON('products.json',fetcher,networkOnly);
 if(!validProducts(products))throw Error('Incomplete catalog');
 return {products,revision:status.revision,sourceReadAt:status.sourceReadAt,assetRevision:status.assetRevision,buildRevision:status.buildRevision,source:'bundled'};
}
let inputs=null;
function compileInputs(fetcher){
 if(!inputs)inputs=(async()=>{
  const [base,enrichment,pdfPages,replenishment]=await Promise.all(['data/catalog-base.json','data/enrichment.json','data/pdf-pages.json','data/replenishment.json'].map(p=>readJSON(p,fetcher,false)));
  if(!validProducts(base)||!enrichment||typeof enrichment!=='object'||!pdfPages||typeof pdfPages!=='object'||!replenishment?.articles)throw Error('Catalog build data incomplete');
  return {base,enrichment,pdfPages,replenishment};
 })().catch(e=>{inputs=null;throw e;});
 return inputs;
}
async function fetchCSV(url,fetcher){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
 try{
  // Cross-origin, no custom headers (no CORS preflight). Google redirects published CSVs; redirects are allowed here.
  const response=await fetcher(url,{cache:'no-store',credentials:'omit',redirect:'follow',signal:controller.signal});
  if(!response.ok)throw Error('CSV unavailable');
  const text=await response.text();
  if(text.length<50||text.length>30000000||/^\s*</.test(text))throw Error('CSV response is not a sheet export');
  return text;
 }finally{clearTimeout(timer);}
}
// Same compiler as the former Worker sync (compileCatalog + applyReplenishment). It throws on incomplete sources.
export async function compileFromCSV(text,{fetcher=fetch,status,checkedAt=new Date().toISOString()}){
 const rows=prepareRows(parseCSV(text)),data=await compileInputs(fetcher);
 const result=compileCatalog(data.base,rows,checkedAt,{enrichment:data.enrichment,pdfPages:data.pdfPages});
 const products=applyReplenishment(result.products,data.replenishment);
 if(!validProducts(products)||!products.some(isListed))throw Error('Compiled catalog is empty');
 return {products,revision:'csv-'+hash(text)+'-'+status.buildRevision,sourceReadAt:checkedAt,assetRevision:status.assetRevision,buildRevision:status.buildRevision,source:'csv',report:result.report};
}
// First load: last good catalog saved on this device, otherwise the bundled products.json.
export async function readSnapshot(fetcher=fetch,networkOnly=false){
 const saved=await savedLive();if(saved)return saved;
 const status=await readJSON('catalog-status.json',fetcher,networkOnly);
 return bundledSnapshot(fetcher,status,networkOnly);
}
export function createCatalogUpdater({fetcher=fetch,onSnapshot,onStatus=()=>{},onState=()=>{},isOnline=()=>true,now=Date.now,minimumInterval=60000}){
 let revision=null,inFlight=null,lastCheck=-Infinity;
 return {
  setRevision(value){revision=value;},
  check({force=false}={}){
   if(inFlight)return inFlight;
   if(!isOnline()||(!force&&now()-lastCheck<minimumInterval))return Promise.resolve(false);
   lastCheck=now();onState('checking');
   inFlight=(async()=>{
    try{
     const status=await readJSON('catalog-status.json',fetcher,true);
     if(typeof status.revision!=='string'||!status.revision)throw Error('Missing catalog revision');
     const {csvUrl}=await readConfig(fetcher);
     let changed=false;
     if(csvUrl){
      const text=await fetchCSV(csvUrl,fetcher),next='csv-'+hash(text)+'-'+status.buildRevision;
      if(next!==revision){
       const snapshot=await compileFromCSV(text,{fetcher,status});
       await onSnapshot(snapshot);revision=snapshot.revision;changed=true;onStatus({...status,...snapshot});
      }else onStatus({...status,revision,sourceReadAt:new Date(now()).toISOString()});
     }else if(status.revision!==revision){
      const snapshot=await bundledSnapshot(fetcher,status,true);
      await onSnapshot(snapshot);revision=snapshot.revision;changed=true;onStatus({...status,...snapshot});
     }else onStatus(status);
     onState('current');return changed;
    }catch(error){try{console.warn('Catalog update skipped; last good catalog kept.',error?.message||error);}catch{}onState('saved');return false;}
    finally{inFlight=null;}
   })();
   return inFlight;
  }
 };
}

export async function savedOfflineCopy(cache){const response=await cache.match('offline-complete');return response?response.json().catch(()=>null):null;}
export async function persistSnapshot(cache,snapshot){
 const {products,revision,sourceReadAt,assetRevision,buildRevision,source}=snapshot;
 await cache.put(LIVE_KEY,new Response(JSON.stringify({products,revision,sourceReadAt,assetRevision,buildRevision,source}),{headers:{'Content-Type':'application/json'}}));
}
const OFFLINE_FILE=/^(\.\/|[a-zA-Z0-9_-]+(\/[a-zA-Z0-9_-]+)?\.(html|css|m?js|json|webmanifest)|assets\/[a-zA-Z0-9_./-]+\.(webp|png|jpe?g|svg|woff2))$/;
const PACK_FILE=/^assets\/[a-zA-Z0-9_./-]+\.(webp|png|jpe?g)$/;
const IMAGE_TYPES={webp:'image/webp',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
// offline-pack.bin = "TSSPACK1" + uint32 (big endian) header length + header JSON {files:[[path,size],...]} + file bytes in order.
export function unpack(buffer){
 const bytes=new Uint8Array(buffer),magic=new TextDecoder().decode(bytes.subarray(0,8));
 if(magic!=='TSSPACK1')throw Error('Invalid offline pack');
 const len=new DataView(bytes.buffer,bytes.byteOffset+8,4).getUint32(0);
 const header=JSON.parse(new TextDecoder().decode(bytes.subarray(12,12+len)));
 if(!Array.isArray(header?.files))throw Error('Invalid offline pack');
 let offset=12+len;const files=[];
 for(const [path,size] of header.files){
  if(typeof path!=='string'||path.includes('..')||!PACK_FILE.test(path)||!Number.isInteger(size)||size<0||offset+size>bytes.length)throw Error('Invalid offline pack');
  files.push({path,bytes:bytes.subarray(offset,offset+size)});offset+=size;
 }
 if(offset!==bytes.length)throw Error('Offline pack incomplete');
 return {files,revision:header.revision||''};
}
// Download one file with progress (loaded / total bytes).
async function downloadWithProgress(path,fetcher,expected,onProgress){
 const controller=new AbortController();let timer=setTimeout(()=>controller.abort(),120000);
 const kick=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),60000);};
 try{
  const response=await fetcher(path,{cache:'no-store',signal:controller.signal,headers:NETWORK_ONLY});
  if(!response.ok||response.redirected)throw Error('Offline pack unavailable');
  const total=Number(response.headers.get('content-length'))||expected||0;
  if(!response.body?.getReader){const b=await response.arrayBuffer();onProgress({loaded:b.byteLength,total:total||b.byteLength});return b;}
  const reader=response.body.getReader(),chunks=[];let loaded=0;
  for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.length;kick();onProgress({loaded,total:Math.max(total,loaded)});}
  const out=new Uint8Array(loaded);let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}
  return out.buffer;
 }finally{clearTimeout(timer);}
}
// ONE download: offline-pack.bin (small photo per product). The app files are already saved by the service worker;
// any missing one is fetched. Stock and prices are saved from the live snapshot. Large photos stay online only.
export async function syncOfflineCopy({cache,snapshot,version,packBytes=0,packRevision='',fetcher=fetch,onProgress=()=>{}}){
 const staticFiles=await readJSON('offline-assets.json',fetcher,true);
 if(!Array.isArray(staticFiles)||staticFiles.some(f=>typeof f!=='string'||f.includes('..')||!OFFLINE_FILE.test(f)))throw Error('Invalid offline file list');
 for(const file of staticFiles){
  if(file==='offline-assets.json')continue;
  if(file!=='config.json'&&file!=='delivery-rules.json'&&await cache.match(file))continue;
  await cache.put(file,await request(file,fetcher));
 }
 const buffer=await downloadWithProgress('offline-pack.bin?r='+encodeURIComponent(packRevision||Date.now()),fetcher,packBytes,onProgress);
 const pack=unpack(buffer);
 for(const f of pack.files){const ext=f.path.split('.').pop().toLowerCase();await cache.put(f.path,new Response(f.bytes,{status:200,headers:{'Content-Type':IMAGE_TYPES[ext]||'application/octet-stream','X-TSS-Thumb':'1'}}));}
 await cache.put('offline-assets.json',new Response(JSON.stringify(staticFiles),{headers:{'Content-Type':'application/json'}}));
 await persistSnapshot(cache,snapshot);
 const marker={version,revision:snapshot.revision,assetRevision:snapshot.assetRevision,buildRevision:snapshot.buildRevision,pack:true,packRevision:packRevision||pack.revision,photos:pack.files.length,date:new Date().toISOString()};
 await cache.put('offline-complete',new Response(JSON.stringify(marker)));
 return marker;
}
