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
  const reference=outletOriginalPrice(product.art),compareAt=reference>base?reference:null;
  const datedActive=!!offer&&(!offer.startsOn||day>=offer.startsOn)&&(!offer.endsOn||day<=offer.endsOn);
  return{price:base,compareAt,active:datedActive||compareAt!==null,expired:false,...(datedActive&&offer.endsOn?{endsOn:offer.endsOn}:{}),label:'Outlet price'};
 }
 const fixed=PROMO_PRICES[String(Number(product.art))];
 if(!offer&&fixed&&Number(base)===fixed.from)return{price:fixed.price,compareAt:fixed.from,active:true,expired:false,label:'Special offer'};
 if(!offer)return{price:base,compareAt:null,active:false,expired:false};
 const active=(!offer.startsOn||day>=offer.startsOn)&&(!offer.endsOn||day<=offer.endsOn);
 const expired=!!offer.endsOn&&day>offer.endsOn;
 if(active){const price=Number(offer.price),compareAt=Number(offer.compareAt);return{price:Number.isFinite(price)&&price>0?price:base,compareAt:Number.isFinite(compareAt)&&compareAt>price?compareAt:null,active:true,expired:false,endsOn:offer.endsOn,label:offer.label||'Special offer'};}
 if(offer.requireConfirmationOutsideOffer){base=Number(offer.basePrice)>0?Number(offer.basePrice):null;}
 return{price:base,compareAt:null,active:false,expired};
}

// Approved mixed-model offers. Only these caps and $3 noodle/magnet products qualify.
const PAIR_PROMOS=[
 {id:'tss-tshirt',arts:['493'],unit:12,amount:18,label:"2 Seaman's Shop T-shirts for $18"},
 {id:'tss-bottle',arts:['4459'],unit:12,amount:22,label:"2 Seaman's Shop bottles for $22"},
 {id:'hs-1l',arts:['3932'],unit:16,amount:25,label:'2 H&S 1 L for $25'},
 {id:'puma-leadcat',arts:['5060','13842'],unit:25,amount:42,label:'2 Puma Leadcat for $42'},
 {id:'ny-sidebag',arts:['2176','2177'],unit:20,amount:32,label:'2 New Era Yankees side bags for $32'},
 {id:'k4r',arts:['261'],unit:35,amount:45,label:'2 Ledlenser K4R for $45'},
 {id:'ksix-urban',arts:['6037','6038'],unit:75,amount:120,label:'2 Ksix Urban Move for $120'},
 {id:'ksix-charger',arts:['5732'],unit:49,amount:70,label:'2 Ksix wireless chargers for $70'},
 {id:'benyar',arts:['5225','5226'],unit:89,amount:150,label:'2 Benyar watches for $150'},
 {id:'puma-smash',arts:['3989'],unit:65,amount:110,label:'2 Puma Smash 3.0L for $110'},
 {id:'haribo',arts:['8514','8515','8516','8517'],unit:3,amount:5,label:'2 Haribo for $5'},
 {id:'skittles',arts:['8518','8519'],unit:6,amount:10,label:'2 Skittles for $10'}
];
// Fixed promo prices (shown as an offer with the old price crossed out).
const PROMO_PRICES={'168':{from:7,price:6}};
// Gift with a speaker or a laptop over $300 (while stocks last).
export function giftPromotion(p){
 if(!p||p.outlet||!(Number(p.price)>300))return null;
 const sub=String(p.subfamily||'').toUpperCase(),name=String(p.name||'').toUpperCase();
 const speaker=p.category==='Audio'&&(sub==='SPEAKERS'||/PARTYBOX|SPEAKER/.test(name)),laptop=sub==='LAPTOPS'||/LAPTOP/.test(name);
 return speaker||laptop?{label:'FREE GIFT: Sony MDR-ZX310L headphones or Grundig alarm clock (your choice) · while stocks last'}:null;
}
export function bundlePromotion(p){
 if(!p||p.outlet)return null;
 const art=String(Number(p.art)),price=Number(p.price);
 // Source of truth: ARTICULOS BD:BG (PROMO GRUPO / UNIDADES / PRECIO PACK / TEXTO). Without those columns: the fixed rules below.
 if(p.promo!==undefined){const x=p.promo;if(!x||!(x.size*price>x.amount))return null;const deal=`${x.size} for $${x.amount}`;return{id:'promo-'+x.group+(x.mix?'':'-'+art),same:!x.mix,size:x.size,amount:x.amount,label:x.text||deal,headline:`1 for $${price} · ${deal}`};}
 if(p.category==='Souvenirs'&&price===3&&/\bmagnet\b|\bim[aá]n\b/i.test(p.name||''))return{id:'magnets',size:4,amount:10,label:'4 magnets for $10'};
 if(['8336','4633','6239','5633','4593','4602','4681','5634','5604','4640','4597','4594','4589','4631'].includes(art)&&price>=25)return{id:'caps',size:2,amount:50,label:'2 New Era caps for $50'};
 if(['3067','2010'].includes(art)&&price===3)return{id:'noodles',size:2,amount:5,label:'2 noodles for $5'};
 // Promos Madico 29/10/2026: single price unchanged; "2 for X" mixes within the same group.
 const g=PAIR_PROMOS.find(x=>x.arts.includes(art)&&price===x.unit);
 if(g)return{id:g.id,size:2,amount:g.amount,label:g.label,headline:`1 for $${g.unit} · 2 for $${g.amount}`};
 return null;
}
export function priceBasket(lines,getProduct,port='Valencia',now=new Date()){
 const groups=new Map(),rows=lines.map((line,index)=>{const p=getProduct(line),price=p?quote(p,port,now).price:null,valid=Number.isFinite(price)&&price>0&&Number.isInteger(line.qty)&&line.qty>0;const row={id:line.id,index,qty:line.qty,subtotal:valid?Math.round(price*100)*line.qty:null,total:valid?Math.round(price*100)*line.qty:null,discount:0,promotion:null};const offer=valid?bundlePromotion(p):null;if(offer){if(!groups.has(offer.id))groups.set(offer.id,{offer,rows:[]});groups.get(offer.id).rows.push({...row,unit:Math.round(price*100)});}return row;});
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
  promotions.push({id:offer.id,label:offer.label,bundles,quantity,needed:offer.size-quantity%offer.size,discount:discount/100});
 }
 return{rows:rows.map(r=>({...r,subtotal:r.subtotal===null?null:r.subtotal/100,total:r.total===null?null:r.total/100,discount:r.discount/100})),total:rows.reduce((n,r)=>n+(r.total||0),0)/100,discount:rows.reduce((n,r)=>n+r.discount,0)/100,promotions};
}
