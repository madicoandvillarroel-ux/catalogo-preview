import {applyArticleRows,artKey,headerKey,parseUSD,stockFromRows} from './catalog-data.mjs';
export const SAFE_HEADERS=['S','ARTICULO','PRICE','DISPONIBLE','EN CATALOGO PDF','OUTLET','REPOSICIÓN','CATÁLOGO','TALLAS (padre / talla)','WEB DESCRIPCION FINAL','WEB ESTADO CATÁLOGO','FAMILIA','SUBFAMILIA','WEB NOMBRE','WEB VISIBLE',...[1,2,3,4,5,6].map(n=>'WEB FOTO '+n)];
// ARTICULOS BD:BJ. Matched by the start of the header, so the notes in brackets can change.
export const PROMO_HEADERS=['PROMO GRUPO','PROMO UNIDADES','PROMO PRECIO PACK','PROMO TEXTO','PRECIO ANTES','REGALO ARTS','REGALO'];
export function compileCatalog(current,rows,checkedAt,{enrichment={},pdfPages={}}={}){
 if(!Array.isArray(rows)||rows.length<2||rows.length>10000)throw Error('Invalid article rows');
 const headers=rows[0].map(headerKey),allowed=new Set(SAFE_HEADERS.map(headerKey));
 if(headers.some(h=>!allowed.has(h)&&!PROMO_HEADERS.some(x=>h.startsWith(x)))||new Set(headers).size!==headers.length)throw Error('Only customer-facing columns are accepted');
 for(const name of ['S','ARTICULO','PRICE','DISPONIBLE','WEB DESCRIPCION FINAL'])if(!headers.includes(headerKey(name)))throw Error('Missing '+name);
 if(rows.some(r=>!Array.isArray(r)||r.length>headers.length||r.some(c=>typeof c==='object'||String(c??'').length>12000)))throw Error('Invalid article cell');
 const col=name=>headers.indexOf(headerKey(name)),index=new Map();for(const row of rows.slice(1)){const key=artKey(row[col('S')]);if(key&&!index.has(key))index.set(key,row);}
 if(index.size<Math.min(500,current.length*.6))throw Error('Source appears incomplete; previous catalog retained');
 const originals=current.map(p=>structuredClone(p)),existing=new Set(originals.map(p=>artKey(p.art))),added=[];
 const listedRow=row=>{const state=headerKey(row[col('WEB ESTADO CATÁLOGO')]);return state==='EN CATALOGO'||(!state&&(headerKey(row[col('EN CATALOGO PDF')])==='SI'||headerKey(row[col('OUTLET')])==='SI'));};
 const validReference=key=>/^(?:\d+|[A-Z]{1,4}\d{1,6})$/.test(key);
 const categoryVotes=new Map();
 const familyKey=row=>headerKey(row[col('FAMILIA')])+'|'+headerKey(row[col('SUBFAMILIA')]);
 for(const p of originals){const row=index.get(artKey(p.art));if(!row||!p.page)continue;for(const key of [familyKey(row),headerKey(row[col('FAMILIA')])+'|']){if(!categoryVotes.has(key))categoryVotes.set(key,new Map());const votes=categoryVotes.get(key);votes.set(p.category,(votes.get(p.category)||0)+1);}}
 const sourceCategory=row=>{const family=headerKey(row[col('FAMILIA')]);const known={'CLOTHES':'Clothing','SHOES':'Footwear','TRAVEL BAGS':'Travel & bags','HEADWEAR':'Caps & accessories'};if(known[family])return known[family];for(const key of [familyKey(row),family+'|']){const votes=categoryVotes.get(key);if(votes?.size)return [...votes].sort((a,b)=>b[1]-a[1])[0][0];}return 'Everyday gear';};
 const newProduct=(art,row,name=String(row[col('ARTICULO')]).trim())=>({art,name,addedAt:checkedAt,price:parseUSD(row[col('PRICE')]),category:sourceCategory(row),page:null,image:null,outlet:headerKey(row[col('OUTLET')])==='SI',byRequest:false});
 for(const [key,row] of index){
  if(existing.has(key)||!validReference(key)||!row[col('ARTICULO')]||!listedRow(row)||!(parseUSD(row[col('PRICE')])>0))continue;
  if(/^TALLA DE/i.test(String(row[col('TALLAS (padre / talla)')])))continue;
  const product=newProduct(String(row[col('S')]).trim(),row);
  originals.push(product);existing.add(key);added.push(product.art);
 }
 // A garment may have only size rows in the source. Publish one parent card,
 // using its real child rows for price, stock, sizes, shared copy and visibility.
 const children=new Map(),generationWarnings=[];
 for(const row of rows.slice(1)){const linked=String(row[col('TALLAS (padre / talla)')]??'').match(/^TALLA DE\s+(\S+)/i),code=String(row[col('S')]??'').trim().match(/^(\S+)\s+.+$/),key=artKey(linked?.[1]||code?.[1]||'');if(!validReference(key)||!row[col('ARTICULO')])continue;if(!children.has(key))children.set(key,[]);children.get(key).push(row);}
 for(const [key,allSizes] of children){if(existing.has(key))continue;const group=allSizes.filter(listedRow);if(!group.length)continue;const prices=[...new Set(group.map(row=>parseUSD(row[col('PRICE')])).filter(price=>price>0))];if(prices.length!==1){generationWarnings.push('Size rows need one verified parent price for ART '+key);continue;}
  const names=group.map(row=>String(row[col('ARTICULO')]).trim()),first=names[0];let prefix=first;for(const name of names.slice(1)){while(prefix&&!name.startsWith(prefix))prefix=prefix.slice(0,-1);}const name=prefix===first?first:prefix.replace(/\s+\S*$/,'').trim().replace(/[\s,;/\-]+$/,'');
  const product={...newProduct(key,group[0],name.length>=8?name:first),price:prices[0],visible:true};originals.push(product);existing.add(key);added.push(product.art);
 }
 const result=applyArticleRows(originals,rows,{enrichment});
 // Promo per article: same PROMO GRUPO = units can be mixed. No promo columns = keep old behaviour (p.promo undefined).
 const promoCol=Object.fromEntries(PROMO_HEADERS.map(x=>[x,headers.findIndex(h=>h.startsWith(x)&&!PROMO_HEADERS.some(y=>y.length>x.length&&y.startsWith(x)&&h.startsWith(y)))])),hasPromo=promoCol['PROMO GRUPO']>=0;
 const promoGroups=new Map();if(hasPromo)for(const r of index.values()){const g=headerKey(r[promoCol['PROMO GRUPO']]);if(g)promoGroups.set(g,(promoGroups.get(g)||0)+1);}
 const promoFrom=r=>{const g=headerKey(r[promoCol['PROMO GRUPO']]),size=Number(r[promoCol['PROMO UNIDADES']]),amount=parseUSD(r[promoCol['PROMO PRECIO PACK']]);if(!g||!Number.isInteger(size)||size<2||size>99||!(amount>0))return null;return{group:g,size,amount,text:String(r[promoCol['PROMO TEXTO']]??'').trim().slice(0,120),mix:(promoGroups.get(g)||0)>1};};
 for(const p of result.products){
  const row=index.get(artKey(p.art));
  // Articles listed only by size (e.g. 493 S, 493 M…): promo, crossed price and gift come from the first size row that has them.
  const sizes=row?null:children.get(artKey(p.art)),pick=i=>row||(i>=0&&sizes?.find(r=>String(r[i]??'').trim()))||sizes?.[0];
  if(hasPromo){const r=pick(promoCol['PROMO GRUPO']);p.promo=r?promoFrom(r):null;}
  // BH = crossed-out "was" price (PRICE stays the price charged); BI = free-gift text. Missing column = old rules (undefined).
  if(promoCol['PRECIO ANTES']>=0){const r=pick(promoCol['PRECIO ANTES']),was=r?parseUSD(r[promoCol['PRECIO ANTES']]):null;p.wasPrice=was>0?was:null;}
  // BJ = ART numbers of the gift options (e.g. "1024 2347"); the crew chooses one in the list.
  if(promoCol['REGALO ARTS']>=0)p.giftArts=pick(promoCol['REGALO ARTS'])?String(pick(promoCol['REGALO ARTS'])[promoCol['REGALO ARTS']]??'').split(/[^0-9A-Za-z]+/).filter(a=>/^(?:[0-9]{1,5}|[A-Za-z]{1,4}[0-9]{1,6})$/.test(a)).slice(0,4):[];
  if(promoCol['REGALO']>=0)p.gift=pick(promoCol['REGALO'])?String(pick(promoCol['REGALO'])[promoCol['REGALO']]??'').trim().slice(0,160)||null:null;
  if(p.category==='SIM cards')p.stock={quantity:null,status:'unlimited',variants:[],checkedAt};
  else p.stock=stockFromRows(rows,p.art,{checkedAt,byRequest:p.byRequest,previousStock:p.stock});
  if(!row){const allSizes=children.get(artKey(p.art));if(allSizes?.length){const group=allSizes.filter(listedRow);p.visible=group.length>0;p.outlet=group.some(row=>headerKey(row[col('OUTLET')])==='SI');if(group.length){if(!p.page)p.category=sourceCategory(group[0]);for(const [field,header] of [['family','FAMILIA'],['subfamily','SUBFAMILIA']])if(col(header)>=0)p[field]=String(group[0][col(header)]??'').trim().slice(0,200);}}if(!p.page&&pdfPages[artKey(p.art)])p.page=pdfPages[artKey(p.art)];continue;}
  if(p.category==='Everyday gear')p.category=sourceCategory(row);
  if(!p.page&&pdfPages[artKey(p.art)])p.page=pdfPages[artKey(p.art)];
  if(p.sourceRecordMissing&&parseUSD(row[col('PRICE')])>0){delete p.sourceRecordMissing;p.detail='';}
  const price=parseUSD(row[col('PRICE')]);if(price>0){p.price=price;if(p.outlet&&p.offer)p.offer.price=price;}
  if(p.offer?.compareAt&&p.offer.compareAt<=p.price)p.offer.compareAt=null;
  for(const [field,header] of [['family','FAMILIA'],['subfamily','SUBFAMILIA']])if(col(header)>=0)p[field]=String(row[col(header)]??'').trim().slice(0,200);
  const decision=headerKey(row[col('CATÁLOGO')]),flag=headerKey(row[col('EN CATALOGO PDF')]),outletFlag=headerKey(row[col('OUTLET')]);
  if(['RETIRADO','QUITAR AGOTADO'].includes(decision)||(flag==='NO'&&outletFlag!=='SI'))p.visible=false;
  else if(flag==='SI'||outletFlag==='SI')p.visible=true;
  // The owner's explicit web state takes priority over historical PDF flags.
  const webState=headerKey(row[col('WEB ESTADO CATÁLOGO')]);
  if(webState&&!['EN CATALOGO','ELIMINADO'].includes(webState))throw Error('Invalid WEB ESTADO CATÁLOGO for '+p.art);
  if(webState)p.visible=webState==='EN CATALOGO';
  // Madico 29/10: CATÁLOGO = RETIRADO / QUITAR AGOTADO always removes the product, whatever the web state says.
  if(['RETIRADO','QUITAR AGOTADO'].includes(decision))p.visible=false;
  const outlet=headerKey(row[col('OUTLET')]);if(outlet==='SI')p.outlet=true;else if(outlet==='NO'){if(p.outlet)delete p.offer;p.outlet=false;}
  // After a dated offer ends, a newly checked PRICE is the current confirmed source price.
  const dateParts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(checkedAt));const localDate=['year','month','day'].map(type=>dateParts.find(p=>p.type===type).value).join('-');
  if(p.outlet&&p.offer?.endsOn&&localDate>p.offer.endsOn)delete p.offer;
 }
 return{products:result.products,report:{...result.report,warnings:[...result.report.warnings,...generationWarnings],added,pendingPhotos:result.products.filter(p=>p.visible!==false&&p.category!=='SIM cards'&&!p.image).map(p=>p.art)}};
}
