// Only customer-facing fields enter the Site. Supplier URLs, costs and internal notes never do.
export function artKey(value){const t=String(value??'').trim().replace(/^art\.?\s*/i,'');return /^\d+$/.test(t)?String(Number(t)):t.toUpperCase();}
export function headerKey(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();}
export function parseUSD(value){if(typeof value==='number')return Number.isFinite(value)?value:null;let s=String(value??'').replace(/USD|US\$|\$/gi,'').trim();if(/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s))s=s.replace(/\./g,'');if(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s))s=s.replace(/,/g,'');if(s.includes(','))s=s.replace(',','.');return /^\d+(?:\.\d+)?$/.test(s)?Number(s):null;}
export function localImage(value){let s=String(value??'').trim();return /^assets\/[A-Za-z0-9][A-Za-z0-9_./-]*\.(?:webp|png|jpe?g)$/i.test(s)&&!s.includes('..')?s:null;}
function string(value,max=8000){return String(value??'').replace(/\r\n/g,'\n').trim().slice(0,max);}
function list(value){return Array.isArray(value)?value.map(x=>string(x,500)).filter(Boolean).slice(0,20):string(value).split(/\n/).map(x=>x.replace(/^[-•]\s*/,'').trim()).filter(Boolean).slice(0,20);}
function finalDescription(product,value){const parts=string(value).split(/\n\s*(?:Features|Caracteristicas|Características)\s*:\s*\n/i);product.description=parts[0].trim();product.features=parts.length>1?list(parts.slice(1).join('\n')):[];}
export function applyArticleRows(current,rows,{enrichment={},imageMap={}}={}){
 if(!Array.isArray(rows)||!Array.isArray(rows[0]))throw Error('Expected a row array with column headers.');
 const h=rows[0].map(headerKey),column=(...keys)=>{for(const key of keys){const n=h.indexOf(headerKey(key));if(n>=0)return n;}return -1;};
 const id=column('S','ART','REFERENCIA'),name=column('ARTICULO'),price=column('PRICE');
 if(id<0||name<0||price<0)throw Error('Required columns: S (ART), ARTICULO and PRICE.');
 const opt={name:column('WEB NOMBRE'),description:column('WEB DESCRIPCION'),finalDescription:column('WEB DESCRIPCION FINAL'),features:column('WEB CARACTERISTICAS'),visible:column('WEB VISIBLE'),before:column('WEB PRECIO ANTES'),sale:column('WEB PRECIO OFERTA'),start:column('WEB OFERTA DESDE'),end:column('WEB OFERTA HASTA')};
 const photoCols=[1,2,3,4,5,6].map(n=>column('WEB FOTO '+n,'WEB FOTO'+n));
 const index=new Map(),warnings=[];
 for(const row of rows.slice(1)){if(!row?.[id])continue;const key=artKey(row[id]);if(index.has(key)){warnings.push('Duplicate reference '+key+'; first row retained.');continue;}index.set(key,row);}
 const childDescriptions=new Map(),sizeCol=column('TALLAS (padre / talla)');
 if(opt.finalDescription>=0)for(const row of rows.slice(1)){const linked=String(row[sizeCol]??'').match(/^TALLA DE\s+(.+)$/i),code=String(row[id]??'').trim().match(/^(\S+)\s+.+$/),parent=linked?.[1]||code?.[1],text=string(row[opt.finalDescription]);if(parent&&text){const key=artKey(parent);if(!childDescriptions.has(key))childDescriptions.set(key,new Set());childDescriptions.get(key).add(text);}}
 const resolvePhoto=value=>{const raw=string(value,2000),asset=localImage(raw)||localImage(imageMap[raw]);if(raw&&!asset)warnings.push('Photo requires a locally prepared asset: '+raw);return asset;};
 let matched=0,enriched=0;
 const result=current.map(original=>{
  const p=structuredClone(original),extra=enrichment[p.art]||enrichment[artKey(p.art)];
  if(extra){if('name'in extra)p.name=string(extra.name,400)||p.name;if('description'in extra)p.description=string(extra.description);if('features'in extra)p.features=list(extra.features);if('visible'in extra)p.visible=extra.visible!==false;if(Array.isArray(extra.images))p.images=[...new Set(extra.images.map(resolvePhoto).filter(Boolean))].slice(0,6);if('image'in extra)p.image=extra.image?resolvePhoto(extra.image):null;enriched++;}
  const row=index.get(artKey(p.art));if(!row){if(opt.finalDescription>=0){const texts=[...(childDescriptions.get(artKey(p.art))||[])];if(texts.length<=1)finalDescription(p,texts[0]||'');else warnings.push('Different size-row descriptions for ART '+p.art+'; previous description retained.');}return p;}matched++;
  if(row[name])p.name=string(row[name],400);const usd=parseUSD(row[price]);
  // SIM plans have separate verified prices; don't overwrite them with activation bookkeeping rows.
  if(p.category!=='SIM cards'&&usd>0)p.price=usd;
  if(opt.name>=0&&row[opt.name])p.name=string(row[opt.name],400);
  if(opt.description>=0)p.description=string(row[opt.description]);
  if(opt.features>=0)p.features=list(row[opt.features]);
  if(opt.finalDescription>=0)finalDescription(p,row[opt.finalDescription]);
  if(opt.visible>=0&&String(row[opt.visible]??'').trim())p.visible=!['NO','FALSE','0','OCULTO'].includes(headerKey(row[opt.visible]));
  if(photoCols.some(n=>n>=0))p.images=[...new Set(photoCols.filter(n=>n>=0).map(n=>resolvePhoto(row[n])).filter(Boolean))].slice(0,6);
  if(opt.sale>=0){
   const sale=parseUSD(row[opt.sale]),before=opt.before>=0?parseUSD(row[opt.before]):null;
   const date=v=>{const t=string(v,30);if(!t)return '';if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;const m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);return m?`${m[3]}-${m[2]}-${m[1]}`:null;};
   const startsOn=opt.start>=0?date(row[opt.start]):'',endsOn=opt.end>=0?date(row[opt.end]):'';
   if(sale>0&&startsOn!==null&&endsOn!==null&&(!startsOn||!endsOn||startsOn<=endsOn)){
    const base=before>sale?before:p.price>sale?p.price:null;
    p.offer={price:sale,compareAt:base,basePrice:base,startsOn,endsOn,label:p.outlet?'Outlet offer':'Special offer',requireConfirmationOutsideOffer:base===null};
    if(base)p.price=base;
   }else if(!String(row[opt.sale]??'').trim()){delete p.offer;}
   else warnings.push('Invalid offer fields for ART '+p.art+'; existing price retained.');
  }
  const stock=stockFromRows(rows,p.art,{byRequest:p.byRequest,previousStock:p.stock});if(stock&&p.category!=='SIM cards')p.stock=stock;
  return p;
 });
 return {products:result,report:{matched,enriched,total:result.length,warnings}};
}

export function stockFromRows(rows,reference,{checkedAt=new Date().toISOString(),byRequest=false,previousStock=null}={}){
 const headers=rows[0].map(headerKey),id=headers.indexOf('S'),available=headers.indexOf('DISPONIBLE'),sizes=headers.indexOf('TALLAS PADRE TALLA'),replenishment=headers.indexOf('REPOSICION'),webState=headers.indexOf('WEB ESTADO CATALOGO');
 if(id<0||available<0)return null;
 const ref=artKey(reference),{parents,childrenOf}=rowIndex(rows,id,sizes,webState),parent=parents.get(ref);
 const quantity=row=>{const n=Number(String(row?.[available]??'').replace(',','.'));return row&&String(row[available]??'').trim()&&Number.isFinite(n)?Math.max(0,Math.floor(n)):null;};
 const children=childrenOf.get(ref)||[];
 const parentPolicy=replenishment>=0?headerKey(parent?.[replenishment]):previousStock?.policy||'';
 const state=(qty,policy)=>qty>0?'available':policy==='SOLO BAJO PEDIDO'?'on_request':qty===null?'unknown':policy==='HABITUAL'?'available_no_quantity':policy==='NO REPONER'?'out_of_stock':byRequest?'on_request':'out_of_stock';
 const variants=children.map(r=>{const label=String(r[id]).trim().replace(/^\S+\s+/,''),qty=quantity(r),policy=(replenishment>=0?headerKey(r[replenishment]):previousStock?.variants?.find(v=>v.label===label)?.policy||'')||parentPolicy;return{label,quantity:qty,status:state(qty,policy),policy};});
 const qty=children.length?(variants.every(v=>v.quantity===null)?null:variants.reduce((sum,v)=>sum+(v.quantity||0),0)):quantity(parent);
 let status=state(qty,parentPolicy);
 if(children.length&&!(qty>0)){status=variants.some(v=>v.status==='available_no_quantity')?'available_no_quantity':variants.some(v=>v.status==='on_request')?'on_request':variants.some(v=>v.status==='unknown')?'unknown':'out_of_stock';}
 return{quantity:qty,status,variants,checkedAt,policy:parentPolicy};
}
// Browser build: same parent/children selection as before, indexed once per row set (was O(products x rows)).
const ROW_INDEX=new WeakMap();
function rowIndex(rows,id,sizes,webState){
 const hit=ROW_INDEX.get(rows);if(hit)return hit;
 const parents=new Map(),childrenOf=new Map();
 for(const r of rows.slice(1)){
  const key=artKey(r[id]);if(!parents.has(key))parents.set(key,r);
  // Madico 01/11: a removed size that still has stock is still sold.
  if(webState>=0&&headerKey(r[webState])==='ELIMINADO'&&!(Number(String(r[rows[0].map(headerKey).indexOf('DISPONIBLE')]??'').replace(',','.'))>0))continue;
  const code=String(r[id]??'').trim(),parts=code.match(/^(\S+)\s+(.+)$/);const linked=sizes>=0?String(r[sizes]??'').match(/^TALLA DE\s+(.+)$/i):null;
  const owner=linked?artKey(linked[1]):parts?artKey(parts[1]):null;if(owner===null)continue;
  if(!childrenOf.has(owner))childrenOf.set(owner,[]);childrenOf.get(owner).push(r);
 }
 const index={parents,childrenOf};ROW_INDEX.set(rows,index);return index;
}
