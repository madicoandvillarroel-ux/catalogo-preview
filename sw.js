'use strict';
// Large posters (info sheets, cover) are not pre-cached: they load online only.
// Static hosting build. Bump CACHE when the shell changes incompatibly.
const CACHE='tss-catalog-v5';
const SHELL=['./','index.html','styles.css','app.js','photo-framing.mjs','catalog-filters.mjs','catalog-discovery.mjs','catalog-discovery.json','pdf-product-notes.mjs','shop-info.mjs','delivery-rules.mjs','delivery-rules.json','home-screen.mjs','order-status.mjs','sim-plan.mjs','pricing.mjs','outlet-reference-prices.mjs','availability.mjs','catalog-visibility.mjs','ship-orders.mjs','web-orders.mjs','catalog-refresh.mjs','csv.mjs','catalog-data.mjs','compile-catalog.mjs','replenishment.mjs','config.json','products.json','catalog-status.json','data/catalog-base.json','data/enrichment.json','data/pdf-pages.json','data/replenishment.json','manifest.webmanifest','offline-assets.json','assets/fonts/inter-latin-variable.woff2','assets/fonts/league-spartan-latin-variable.woff2','assets/logo-2x.png','assets/app-icon.png','assets/sim-logo-vodafone.png','assets/sim-logo-orange.png','assets/sim-logo-lebara.png','assets/sim-logo-movistar.png','assets/app-icon-blue-192.png','assets/app-icon-blue-512.png','assets/app-icon-blue-maskable-512.png','assets/apple-touch-icon-blue.png','assets/info-cover-640.webp','assets/info-delivery-map.webp','assets/info-sim-preview.webp','assets/info-special-orders.webp'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const c=await caches.open(CACHE);for(const u of SHELL){const r=await fetch(u,{cache:'reload'});if(!r.ok||r.redirected)throw Error('Shell cache incomplete');await c.put(u,r);}await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('tss-catalog-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url);
 // The published Google Sheets CSV is cross-origin: it always goes to the network (never cached here).
 if(event.request.method!=='GET'||u.origin!==self.location.origin)return;
 // A same-origin CSV (tests/fixtures) is network-only as well.
 if(/\.(csv|pdf)$/i.test(u.pathname))return; // PDF and CSV: straight from the network (no timeout)
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),isDoc=event.request.mode==='navigate',networkOnly=event.request.headers?.get('X-TSS-Network-Only')==='1';
  const hit=await cache.match(event.request,{ignoreSearch:true});
  // Reuse saved photos and fonts. Explicit offline downloads can refresh them.
  // Small offline photos (X-TSS-Thumb) are replaced by the large photo when online.
  if(hit&&!networkOnly&&/\.(webp|jpe?g|png|woff2)$/.test(u.pathname)&&event.request.cache!=='reload'&&!hit.headers.get('X-TSS-Thumb'))return hit;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),hit?(hit.headers.get('X-TSS-Thumb')?5000:4000):20000);
  try{
   const r=await fetch(event.request,{signal:controller.signal});
   clearTimeout(timeout);
   if(r.status>=500&&hit&&!networkOnly)return hit;
   if(r.ok&&!r.redirected&&(isDoc||/\.(json|m?js|css|webp|jpg|png|woff2|webmanifest)$/.test(u.pathname)))await cache.put(event.request,r.clone());
   return r;
  }catch{
   clearTimeout(timeout);
   if(hit&&!networkOnly)return hit;
   if(isDoc&&!networkOnly){const shell=await cache.match('./');if(shell)return shell;}
   return new Response('Not saved for offline use. Connect and save the catalog first.',{status:503,headers:{'Content-Type':'text/plain'}});
  }
 })());
});
