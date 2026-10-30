// "Ship order" bar: orders already registered for the same vessel (public tab SHIP ORDERS: VESSEL | DATE | TOTAL).
// Only vessel name, date and total are published. Special orders, no-stock and next-time lines are excluded in the sheet.
import {parseCSV} from './csv.mjs';
export const vesselKey=s=>String(s??'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
const toNumber=v=>{let t=String(v??'').replace(/[$\s€]/g,'');if(/,\d{1,2}$/.test(t))t=t.replace(/\./g,'').replace(',','.');else t=t.replace(/,/g,'');const n=Number(t);return Number.isFinite(n)?n:0;};
const toDay=v=>{const m=String(v??'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:'';};
export function parseShipOrders(text){
 const rows=parseCSV(text);if(!rows.length)return [];
 const head=rows[0].map(h=>h.trim().toUpperCase()),iv=head.indexOf('VESSEL'),id=head.indexOf('DATE'),it=head.indexOf('TOTAL');
 if(iv<0||id<0||it<0||head.length>3)throw Error('Unexpected ship orders columns');
 return rows.slice(1).map(r=>({vessel:vesselKey(r[iv]),day:toDay(r[id]),total:toNumber(r[it])})).filter(r=>r.vessel&&r.total>0);
}
// Same vessel, call date within 3 days of the crew's arrival day (or any date when no arrival day yet).
export function shipTotal(rows,vessel,eta){
 const key=vesselKey(vessel);if(!key||key.length<3)return null;
 const day=String(eta||'').slice(0,10),t=day?Date.parse(day):NaN;
 const hits=rows.filter(r=>r.vessel===key&&(!r.day||Number.isNaN(t)||Math.abs(Date.parse(r.day)-t)<=3*86400000));
 return hits.length?Math.round(hits.reduce((s,r)=>s+r.total,0)*100)/100:null;
}
