// Stock and policy are independent from the port-call delivery check.
export function stockHidden(p,stock=p?.stock){
 if(stock?.status==='unlimited')return false;
 // E-026: a confirmed fast source outranks the legacy AP “No reponer”.
 // Explicit removal (visible=false), store-only and outlet keep their own rules.
 if(!p?.outlet&&stock?.replenishment==='RÁPIDA')return false;
 // Madico 01/11: what AP says can be ordered (Solo bajo pedido / Habitual) is never hidden, whatever the old status file says.
 if(!p?.outlet&&['SOLO BAJO PEDIDO','HABITUAL'].includes(stock?.policy))return false;
 return (p?.outlet||(stock?.replenishment?stock.replenishment==='NO SE REPONE':stock?.policy==='NO REPONER'))&&typeof stock?.quantity==='number'&&stock.quantity<=0;
}
// Keep known exhausted sizes visible, disabled by orderableLine.
export function availableVariants(p){return p?.stock?.variants||[];}
export function unavailableByStock(p){const variants=p?.stock?.variants||[];return !!p?.storeOnly||(variants.length?variants.every(v=>stockHidden(p,v)):stockHidden(p));}
// Madico 01/11: «Habitual» at stock 0 is on request, never sold out.
export function availability(p,requested=1){
 const stock=p?.stock,policy=stock?.replenishment||'PENDIENTE';
 if(stock?.status==='unlimited')return{status:'available',quantity:null,unlimited:true,sameDay:false};
 const quantity=typeof stock?.quantity==='number'?Math.max(0,stock.quantity):null;
 if(quantity>=requested)return{status:'available',quantity,sameDay:false};
 if(!p?.outlet&&(policy==='RÁPIDA'||stock?.status==='on_request'||stock?.policy==='SOLO BAJO PEDIDO'||stock?.policy==='HABITUAL'||stock?.status==='available_no_quantity'))return{status:'on_request',quantity,sameDay:false};
 return{status:'out_of_stock',quantity,sameDay:false};
}
export function orderableLine(p,label='',requested=1){
 if(!p||unavailableByStock(p))return false;
 const variants=p.stock?.variants||[];let stock=p.stock;
 if(variants.length){const normalized=String(label).trim().toUpperCase();const matched=variants.find(v=>{const l=String(v.label).trim().toUpperCase();return normalized===l||normalized.startsWith(l+' / ');});if(!matched)return false;stock=matched;}
 return availability({...p,stock},requested).status!=='out_of_stock';
}
export function arrivalMadridDay(now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now),get=t=>parts.find(p=>p.type===t).value;
 return `${get('year')}-${get('month')}-${get('day')}`;
}
export function arrivalDayOptions(selected='',now=Date.now()){
 const today=arrivalMadridDay(now),start=Date.parse(today+'T12:00Z');
 const days=Array.from({length:7},(_,i)=>{const date=new Date(start+i*86400000),value=date.toISOString().slice(0,10);return{value,label:i===0?'Today':i===1?'Tomorrow':new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',timeZone:'UTC'}).format(date)};});
 if(/^\d{4}-\d{2}-\d{2}$/.test(selected)&&!days.some(d=>d.value===selected))days.push({value:selected,label:new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(selected+'T12:00Z'))});
 return days;
}
// Delivery confirmation is separate from adding a request; never imply an unquoted arrival guarantee.
export function madridTimestamp(local){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local||''))return NaN;
 const target=Date.parse(local+'Z');let value=target;
 for(let i=0;i<3;i++){const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value),get=t=>parts.find(p=>p.type===t).value;const displayed=Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}Z`);value+=target-displayed;}
 return value;
}
export function callEligibility(p,label,requested,fields={},now=Date.now()){
 if(!fields.vessel?.trim()||!fields.port||!fields.eta)return{ok:false,text:'Add vessel, port and arrival first'};
 const dayOnly=/^\d{4}-\d{2}-\d{2}$/.test(fields.eta),eta=madridTimestamp(fields.eta+(dayOnly?'T00:00':''));if(!Number.isFinite(eta)||(dayOnly?fields.eta<arrivalMadridDay(now):eta<=now))return{ok:false,text:'Update your arrival day'};
 if(!orderableLine(p,label,requested))return{ok:false,text:'Not available for this call · Ask about your next visit'};
 const variants=p.stock?.variants||[],stock=variants.find(v=>String(label).toUpperCase()===String(v.label).toUpperCase()||String(label).toUpperCase().startsWith(String(v.label).toUpperCase()+' / '))||p.stock;
 if(availability({...p,stock},requested).status!=='on_request')return{ok:true,text:'In stock · Delivery time subject to confirmation'};
 const quote=p.deliveryQuotes?.find(q=>q.port===fields.port&&q.eta===fields.eta&&q.fullChainConfirmed===true&&q.maxQuantity>=requested&&Date.parse(q.expiresAt)>now&&Date.parse(q.arrivesBy)<=eta);
 if(quote)return{ok:true,text:'On request · Delivery checked for this call',deliveryConfirmed:true};
 if(fields.eta.slice(0,10)===arrivalMadridDay(now))return{ok:false,text:'No stock for today · Ask us about delivery'};
 return{ok:true,text:'On request · Availability and delivery to confirm',deliveryConfirmed:false};
}
