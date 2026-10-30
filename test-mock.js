// Test-only mock of the v11 connector (never published).
(function(){
const S=window.__srv=JSON.parse(sessionStorage.getItem('__srv')||'{"orders":{},"n":0}');
const persist=()=>sessionStorage.setItem('__srv',JSON.stringify(S));
const CLOSED=['DELIVERED','CANCEL','NO STOCK','NEXT TIME'];
const real=window.fetch.bind(window);
const reply=o=>Promise.resolve(new Response(JSON.stringify(o),{status:200,headers:{'Content-Type':'application/json'}}));
window.fetch=function(url,opts){url=String(url);if(!url.startsWith('https://script.google.com/macros/s/TESTMOCK/exec'))return real(url,opts);
 const q=new URL(url).searchParams;
 if(opts&&opts.method==='POST'){const b=JSON.parse(opts.body);
  if(b.action==='login')return reply({ok:true,sent:true});
  if(b.action!=='order')return reply({ok:false});
  let id=null;const j=b.join;if(j&&S.orders[j.id]&&j.t==='t-'+j.id&&S.orders[j.id].vessel===b.vessel.toUpperCase()&&S.orders[j.id].lines.some(l=>!CLOSED.includes(l.status)))id=j.id;
  const joined=!!id;if(!id){id='W-1031-10'+String(++S.n).padStart(4,'0')+'-11';S.orders[id]={vessel:b.vessel.toUpperCase(),eta:b.eta,email:b.email,lines:[]};}
  for(const it of b.items){S.orders[id].lines.push({art:it.art,desc:'ART '+it.art,qty:it.qty,total:null,status:'CHECK',gift:false});if(it.gift)S.orders[id].lines.push({art:it.gift.art,desc:'GIFT '+(it.gift.art||'(shop picks)'),qty:it.qty,total:0,status:'CHECK',gift:true});}
  persist();return reply({ok:true,id,t:'t-'+id,vessel:b.vessel.toUpperCase(),joined});}
 if(q.get('ship'))return reply({ok:true,total:0});
 if(q.get('email')&&q.get('code'))return reply(q.get('code').toUpperCase()==='ABCDEFGH'?{ok:true,email:q.get('email'),te:'te-test'}:{ok:false,error:'code'});
 if(q.get('email'))return reply({ok:true,email:q.get('email'),profile:null,orders:Object.entries(S.orders).filter(([k,o])=>o.email===q.get('email')).map(([k,o])=>({id:k,t:'t-'+k,vessel:o.vessel,eta:o.eta,lines:o.lines})),at:new Date().toISOString()});
 if(q.get('id')){const o=S.orders[q.get('id')];return reply(o?{ok:true,id:q.get('id'),lines:o.lines,at:new Date().toISOString()}:{ok:false});}
 return reply({ok:false});};
window.__setStatus=(id,status,price)=>{S.orders[id].lines.forEach(l=>{l.status=status;if(!l.gift&&price!=null)l.total=price*l.qty;});persist();};
})();
