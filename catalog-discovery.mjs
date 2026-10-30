import {isListed} from './catalog-visibility.mjs';
const discoveryKey=value=>String(value??'').trim().toUpperCase().replace(/^0+(?=\d)/,'');
export function discoveryCollections(products,config={},now=Date.now()){
 const eligible=products.filter(p=>isListed(p)&&!['VAPES','SMARTPHONES'].includes(String(p.family).toUpperCase())&&!/^AL\d+/i.test(p.art));
 const newIds=new Set((config.newArticles||[]).map(discoveryKey));
 const cutoff=now-(config.newWindowDays||45)*86400000;
 const ranked=(items,order)=>{const rank=new Map((order||[]).map((id,i)=>[discoveryKey(id),i]));return items.filter(p=>rank.has(discoveryKey(p.art))).sort((a,b)=>rank.get(discoveryKey(a.art))-rank.get(discoveryKey(b.art)));};
 const fresh=eligible.filter(p=>!p.outlet&&((p.addedAt&&Date.parse(p.addedAt)>=cutoff)||newIds.has(discoveryKey(p.art))&&Date.parse(config.updatedOn)>=cutoff));
 const bestEligible=eligible.filter(p=>!p.outlet&&Number.isFinite(p.price)&&p.price>=(config.bestsellerMinPrice||0)&&(p.stock?.quantity>0||p.stock?.status==='unlimited'||p.stock?.replenishment==='RÁPIDA'));
 const sold=ranked(bestEligible,config.bestsellerOrder),soldIds=new Set(sold.map(p=>discoveryKey(p.art)));
 // Shop picks are explicitly labelled; they do not imply recorded bestseller sales.
 const picks=ranked(bestEligible,config.bestsellerShopPicks).filter(p=>!soldIds.has(discoveryKey(p.art))).map(p=>({...p,discoveryShopPick:true}));
 let best=[...sold,...picks];
 if(config.bestsellerOnePerFamily){const seenFamilies=new Set();best=best.filter(p=>{const family=String(p.family||p.category).toUpperCase();if(seenFamilies.has(family))return false;seenFamilies.add(family);return true;});}
 const families=new Map((config.bestsellerFamilyOrder||[]).map((family,i)=>[family,i]));
 if(families.size)best.sort((a,b)=>(families.get(String(a.family).toUpperCase())??999)-(families.get(String(b.family).toUpperCase())??999));
 const outlet=eligible.filter(p=>p.outlet&&p.stock?.quantity>0);
 const orderedOutlet=ranked(outlet,config.outletOrder),seen=new Set(orderedOutlet.map(p=>discoveryKey(p.art)));
 return {new:fresh.sort((a,b)=>(Number(b.price)||0)-(Number(a.price)||0)||Date.parse(b.addedAt||config.updatedOn)-Date.parse(a.addedAt||config.updatedOn)),bestsellers:best,outlet:[...orderedOutlet,...outlet.filter(p=>!seen.has(discoveryKey(p.art))).sort((a,b)=>a.price-b.price)]};
}
