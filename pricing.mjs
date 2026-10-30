import {outletOriginalPrice} from './outlet-reference-prices.mjs';
export function madridDay(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));return `${parts.year}-${parts.month}-${parts.day}`;
}
export function quote(product,port='Valencia',now=new Date()){
 let base=product.art==='001'&&port!=='Valencia'?20:product.price;
 const offer=product.offer,day=madridDay(now);
 // The current sheet price remains authoritative even when a dated PDF promotion ends.
 // A historical crossed price is display metadata, never the amount to charge.
 if(product.outlet){
  const reference=outletOriginalPrice(product.art),fallback=Number(offer?.compareAt),compareAt=reference>base?reference:fallback>base?fallback:null;
  const datedActive=!!offer&&(!offer.startsOn||day>=offer.startsOn)&&(!offer.endsOn||day<=offer.endsOn);
  return{price:base,compareAt,active:datedActive||compareAt!==null,expired:false,...(datedActive&&offer.endsOn?{endsOn:offer.endsOn}:{}),label:'Outlet price'};
 }
 if(!offer&&product.wasPrice!==undefined)return Number(product.wasPrice)>Number(base)?{price:base,compareAt:Number(product.wasPrice),active:true,expired:false,label:'Special offer'}:{price:base,compareAt:null,active:false,expired:false};
 const fixed=PROMO_PRICES[String(Number(product.art))];
 if(!offer&&fixed&&Number(base)===fixed.from)return{price:fixed.price,compareAt:fixed.from,active:true,expired:false,label:'Special offer'};
 if(!offer)return{price:base,compareAt:null,active:false,expired:false};
 const active=(!offer.startsOn||day>=offer.startsOn)&&(!offer.endsOn||day<=offer.endsOn);
 const expired=!!offer.endsOn&&day>offer.endsOn;
 if(active){const price=Number(offer.price),compareAt=Number(offer.compareAt);return{price:Number.isFinite(price)&&price>0?price:base,compareAt:Number.isFinite(compareAt)&&compareAt>price?compareAt:null,active:true,expired:false,endsOn:offer.endsOn,label:offer.label||'Special offer'};}
 if(offer.requireConfirmationOutsideOffer){base=Number(offer.basePrice)>0?Number(offer.basePrice):null;}
 return{price:base,compareAt:null,active:false,expired};
}

// Transition only, while CATALOGO PUBLICO has no PRECIO ANTES column (wasPrice undefined).
const PROMO_PRICES={'168':{from:7,price:6}};
// Free gift: ARTICULOS BI REGALO. The speaker/laptop rule below is only the transition while that column is missing.
export function giftPromotion(p){
 if(p&&p.gift!==undefined)return p.gift&&!p.outlet?{label:p.gift}:null;
 if(!p||p.outlet||!(Number(p.price)>300))return null;
 const sub=String(p.subfamily||'').toUpperCase(),name=String(p.name||'').toUpperCase();
 const speaker=p.category==='Audio'&&(sub==='SPEAKERS'||/PARTYBOX|SPEAKER/.test(name)),laptop=sub==='LAPTOPS'||/LAPTOP/.test(name);
 return speaker||laptop?{label:'FREE GIFT: Sony MDR-ZX310L headphones or Grundig alarm clock (your choice) · while stocks last'}:null;
}
// Transition only: used while CATALOGO PUBLICO has no PROMO columns (p.promo undefined). Same as VENTA TIENDA col G on 30/10/2026.
const SHOP_BUNDLES=[
 {id:'magnets',size:4,amount:10,label:'4 magnets for $10',arts:'491 2792 2793 2794 2803 3126 3328 4040 4221 4222 4223 4224 4225 4226 4453 4454 4525 4526 4599 4617 4618 4672 4674 4731 4788 4789 4918 4921 4922 4986 5259 7624'.split(' ')},
 {id:'caps',size:2,amount:50,label:'2 New Era caps for $50',arts:'4589 4593 4594 4597 4602 4631 4633 4640 4681 5604 5633 5634 6239 8336 8335 7745 5304 1382 2715 4104 4351 4507 4637 5050 5103 5558 7262 7266 7473 7554 8877 8900 8901 8902 8903 8904 8905 8906'.split(' ')},
 {id:'noodles',size:2,amount:5,label:'2 noodles for $5',arts:['2010','3067']}
];
// Chocolate bars: 6 of the same bar for $10 (no mixing).
const SAME_BUNDLES={'8446':'Mars','8445':'Snickers','5764':'KitKat White','2163':'KitKat'};
export function bundlePromotion(p){
 if(!p)return null;
 const art=String(Number(p.art)),price=Number(p.price);
 // Source of truth: ARTICULOS BD:BG (PROMO GRUPO / UNIDADES / PRECIO PACK / TEXTO).
 if(p.promo!==undefined){const x=p.promo;if(!x||!(x.size*price>x.amount))return null;const deal=`${x.size} for $${x.amount}`;return{id:'promo-'+x.group,size:x.size,amount:x.amount,same:x.mix===false,deal,label:x.text||deal,headline:`1 for $${price} · ${deal}`};}
 const shop=SHOP_BUNDLES.find(x=>x.arts.includes(art));
 if(shop)return shop.size*price>shop.amount?{id:shop.id,size:shop.size,amount:shop.amount,label:shop.label,deal:`${shop.size} for $${shop.amount}`,headline:`1 for $${price} · ${shop.size} for $${shop.amount}`}:null;
 if(SAME_BUNDLES[art])return 6*price>10?{id:'bar-'+art,size:6,amount:10,same:true,deal:'6 for $10',label:`6 ${SAME_BUNDLES[art]} for $10`,headline:`1 for $${price} · 6 for $10`}:null;
 return null;
}
export function priceBasket(lines,getProduct,port='Valencia',now=new Date()){
 const groups=new Map(),rows=lines.map((line,index)=>{const p=getProduct(line),price=p?quote(p,port,now).price:null,valid=Number.isFinite(price)&&price>0&&Number.isInteger(line.qty)&&line.qty>0;const row={id:line.id,index,qty:line.qty,subtotal:valid?Math.round(price*100)*line.qty:null,total:valid?Math.round(price*100)*line.qty:null,discount:0,promotion:null};const offer=valid?bundlePromotion(p):null;if(offer){if(!groups.has(offer.id))groups.set(offer.id,{offer:{...offer,title:offer.same?String(p.name).slice(0,28).trim()+': '+offer.deal+' (same product)':offer.label},rows:[]});groups.get(offer.id).rows.push({...row,unit:Math.round(price*100)});}return row;});
 const promotions=[];
 for(const {offer,rows:group} of groups.values()){
  const quantity=group.reduce((n,r)=>n+r.qty,0),bundles=Math.floor(quantity/offer.size);let remaining=bundles*offer.size,discount=0,value=0,last=null;
  // Pair the most expensive eligible units first; keep leftover units at their normal price.
  for(const entry of group.sort((a,b)=>b.unit-a.unit||a.index-b.index)){
   const promoted=Math.min(remaining,entry.qty),row=rows[entry.index];remaining-=promoted;
   row.discount=promoted*Math.max(0,entry.unit-Math.round(offer.amount*100/offer.size));row.total-=row.discount;row.promotion=offer.id;discount+=row.discount;value+=promoted*entry.unit;if(promoted)last=row;
  }
  // Bundles cost exactly their price (6 for $10 is $10.00, not 6 × $1.67).
  const exact=Math.max(0,value-bundles*Math.round(offer.amount*100));if(last&&exact!==discount){last.discount+=exact-discount;last.total=last.subtotal-last.discount;discount=exact;}
  promotions.push({id:offer.id,label:offer.title,deal:offer.deal,size:offer.size,bundles,quantity,needed:offer.size-quantity%offer.size,discount:discount/100});
 }
 return{rows:rows.map(r=>({...r,subtotal:r.subtotal===null?null:r.subtotal/100,total:r.total===null?null:r.total/100,discount:r.discount/100})),total:rows.reduce((n,r)=>n+(r.total||0),0)/100,discount:rows.reduce((n,r)=>n+r.discount,0)/100,promotions};
}
