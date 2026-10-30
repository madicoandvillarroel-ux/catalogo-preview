// Orders sent from the catalog go straight into ORDERS (Google Apps Script connector, STATUS = CHECK).
// The crew sees the status of each line in "My orders". Only that order's lines are returned (id + token).
const KEY='tss-crew-orders-v1';
const URL_RE=/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
export function ordersUrlFrom(config){const u=String(config?.ordersUrl||'').trim();return URL_RE.test(u)?u:'';}
export function savedOrders(){try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?v.filter(o=>o&&/^W-\d{4}-\d{6}-\d{2}$/.test(o.id)&&typeof o.t==='string'):[];}catch{return [];}}
function store(list){try{localStorage.setItem(KEY,JSON.stringify(list.slice(0,20)));}catch{}}
export function rememberOrder(order){const list=savedOrders().filter(o=>o.id!==order.id);list.unshift(order);store(list);}
export function updateOrder(id,patch){store(savedOrders().map(o=>o.id===id?{...o,...patch}:o));}
async function withTimeout(promise,ms){let timer;try{return await Promise.race([promise,new Promise((_,r)=>{timer=setTimeout(()=>r(Error('timeout')),ms);})]);}finally{clearTimeout(timer);}}
export async function sendOrder(url,payload){
 const r=await withTimeout(fetch(url,{method:'POST',body:JSON.stringify({action:'order',...payload}),headers:{'Content-Type':'text/plain;charset=utf-8'},redirect:'follow',credentials:'omit'}),25000);
 if(!r.ok)throw Error('Order connector unavailable');const j=await r.json();if(!j.ok||!/^W-\d{4}-\d{6}-\d{2}$/.test(j.id))throw Error(j.error||'Order not registered');return j;
}
export async function fetchStatus(url,order){
 const r=await withTimeout(fetch(url+'?id='+encodeURIComponent(order.id)+'&t='+encodeURIComponent(order.t),{credentials:'omit',redirect:'follow'}),20000);
 if(!r.ok)throw Error('Status unavailable');const j=await r.json();if(!j.ok||!Array.isArray(j.lines))throw Error('Status unavailable');return j;
}
export const STATUS_TEXT={
 'CHECK':['Checking','info'],
 'NO STOCK CHECK':['Checking','info'],
 'ALEX':['Checking','info'],
 'PREPARED':['Ready ✓','ok'],
 'ORDER ON THE WAY':['On the way','pending'],
 'SPECIAL ORDER':['On the way','pending'],
 'REPLACEMENT':['On the way','pending'],
 'DELIVERED':['Delivered ✓','ok'],
 'NO STOCK':['Not available','bad'],
 'CANCEL':['Cancelled','bad']
};
export function statusText(s){return STATUS_TEXT[String(s||'').trim().toUpperCase()]||['Checking','info'];}
export async function cancelLine(url,order,art,reason,desc){
 const r=await withTimeout(fetch(url,{method:'POST',body:JSON.stringify({action:'cancel',id:order.id,t:order.t,art,reason,desc}),headers:{'Content-Type':'text/plain;charset=utf-8'},redirect:'follow',credentials:'omit'}),20000);
 if(!r.ok)throw Error('Unavailable');const j=await r.json();if(!j.ok)throw Error('Not cancelled');return j.result;
}
export const STATUS_HELP='<p class="status-help"><b>Received</b> We have your order and are checking stock.<br><b>Prepared ✓</b> Packed and ready for delivery on board.<br><b>On the way 🚚</b> Ordered from our supplier. It should arrive before your vessel; we will tell you if anything changes.<br><b>Delivered ✓</b> Handed over on board.<br>🎁 <b>Free gifts</b> show at $0 and travel with your order.<br><b>Not available ✗</b> We cannot supply it for this call. Please choose something else.<br><b>Special orders</b> We look for it and send you a price. Once you accept the price and we order it, it cannot be cancelled.<br><b>Want to cancel?</b> Tap Cancel and tell us why; the shop confirms it (some items are ordered specially for you). <b>Add more</b> any time: add products to your list and tap Send order; they join your vessel\'s order.</p>';
export async function sendSpecial(url,payload){
 const r=await withTimeout(fetch(url,{method:'POST',body:JSON.stringify({action:'special',...payload}),headers:{'Content-Type':'text/plain;charset=utf-8'},redirect:'follow',credentials:'omit'}),25000);
 if(!r.ok)throw Error('Unavailable');const j=await r.json();if(!j.ok||!/^W-\d{4}-\d{6}-\d{2}$/.test(j.id))throw Error(j.error||'Not registered');return j;
}
export function specialStatusText(s){s=String(s||'').trim().toUpperCase();
 if(s==='PREPARED'||s==='DELIVERED')return ['Ready ✓','ok'];
 if(s==='NO STOCK'||s==='CANCEL')return ['Not available ✗','bad'];
 if(s==='SPECIAL ORDER'||s==='ORDER ON THE WAY'||s==='REPLACEMENT')return ['Ordered 🚚 · cannot be cancelled','pending'];
 return ['Looking for it · we will send you a price ⏳','info'];}
// Customer session (no password): email + token from the emailed sign-in link. Stays on this device.
const SKEY='tss-crew-session-v1';
export function session(){try{const s=JSON.parse(localStorage.getItem(SKEY)||'null');return s&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)&&typeof s.te==='string'?s:null;}catch{return null;}}
export function setSession(s){try{if(s)localStorage.setItem(SKEY,JSON.stringify(s));else localStorage.removeItem(SKEY);}catch{}}
export function importLoginHash(){const m=location.hash.match(/#login=([\w=-]+)\.([\w-]{10,40})/);if(!m)return false;let email='';try{email=atob(m[1].replace(/-/g,'+').replace(/_/g,'/')).trim().toLowerCase();}catch{}if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return false;setSession({email,te:m[2],since:new Date().toISOString()});history.replaceState(history.state,'',location.pathname+location.search);return true;}
export function siteUrl(){return location.origin+location.pathname.replace(/\/[^/]*$/,'');}
export async function loginWithCode(url,email,code){const r=await withTimeout(fetch(url+'?email='+encodeURIComponent(email)+'&code='+encodeURIComponent(code),{credentials:'omit',redirect:'follow'}),20000);if(!r.ok)throw Error('Unavailable');const j=await r.json();if(!j.ok||typeof j.te!=='string')throw Error(j.error||'code');return j;}
export async function requestLogin(url,email){const r=await withTimeout(fetch(url,{method:'POST',body:JSON.stringify({action:'login',email,site:siteUrl()}),headers:{'Content-Type':'text/plain;charset=utf-8'},redirect:'follow',credentials:'omit'}),20000);if(!r.ok)throw Error('Unavailable');const j=await r.json();if(!j.ok)throw Error(j.error||'Not sent');return j;}
export async function fetchMine(url,s){const r=await withTimeout(fetch(url+'?email='+encodeURIComponent(s.email)+'&te='+encodeURIComponent(s.te),{credentials:'omit',redirect:'follow'}),20000);if(!r.ok)throw Error('Unavailable');const j=await r.json();if(!j.ok||!Array.isArray(j.orders))throw Error('Session expired');return j;}
