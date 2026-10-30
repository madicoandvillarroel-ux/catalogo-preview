export function validateDeliveryRules(value){
 if(value?.version!==1||!Array.isArray(value.ports)||value.ports.length!==9)throw Error('Invalid delivery table');
 const names=['Valencia','Algeciras','Barcelona','Sagunto','Tarragona','Bilbao','Vigo','Cartagena','Castellón'];
 if(value.ports.some((r,i)=>r.port!==names[i]||!Number.isFinite(r.goodsUSD)||r.goodsUSD<=0||r.goodsUSD>100000||!Number.isInteger(r.sims)||r.sims<1||r.sims>1000))throw Error('Check port names, goods amounts and SIM quantities');
 for(const k of ['otherPortSIMs','storePickupUSD','storeTransportUSD'])if(!Number.isFinite(value[k])||value[k]<=0||value[k]>100000)throw Error('Invalid '+k);
 if(!Number.isInteger(value.otherPortSIMs))throw Error('SIM quantity must be a whole number');
 return {version:1,ports:value.ports.map(({port,goodsUSD,sims})=>({port,goodsUSD,sims})),otherPortSIMs:value.otherPortSIMs,storePickupUSD:value.storePickupUSD,storeTransportUSD:value.storeTransportUSD};
}
export function eligibleForMinimum(p){return !!p&&!p.specialOrder&&p.category!=='SIM cards'&&!/^SMARTPHONES?$/i.test(String(p.family||'').trim())&&!/^(NEW PHONES?|MOBILE PHONES?|SMARTPHONES?|PHONES?|TELEFONOS?|MOVILES?)$/i.test(String(p.subfamily||'').trim())&&!/^(SPECIAL ORDER|SPECIAL ORDERS)$/i.test(String(p.category||''));}
export function deliveryMinimum(rules,port){return rules?.ports.find(r=>r.port===port);}
