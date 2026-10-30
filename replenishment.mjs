// Owner-approved catalogue overlay; source inventory is never written.
// Static build: the decisions table is passed in (data/replenishment.json) instead of a Worker global.
export function applyReplenishment(products,decisions){
 const key=s=>String(s??'').trim().toUpperCase().replace(/^0+(?=\d)/,'');
 const entries=new Map(Object.entries(decisions?.articles||{}).map(([k,v])=>[key(k),v]));
 return products.map(original=>{const p=structuredClone(original),decision=entries.get(key(p.art));
  const apply=(s,d)=>({...s,replenishment:p.outlet?'NO SE REPONE':d?.policy||(s?.policy==='NO REPONER'?'NO SE REPONE':'PENDIENTE')});
  p.stock=apply(p.stock,decision);p.stock.variants=(original.stock?.variants||[]).map(v=>apply(v,entries.get(key(p.art+' '+v.label))||decision));
  if(decision?.channel==='SOLO TIENDA')p.storeOnly=true;
  if(p.category==='SIM cards'||decision?.channel==='SIEMPRE DISPONIBLE')p.stock={...p.stock,status:'unlimited',quantity:null,variants:[]};
  return p;
 });
}
