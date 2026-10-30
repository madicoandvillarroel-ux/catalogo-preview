// Customer meanings confirmed by the shop owner on 24 October 2026.
export const ORDER_STATUSES={
 'NO STOCK CHECK':{label:'In preparation',tone:'review',explanation:'We’re reviewing your item. Availability is not confirmed yet.'},
 'CHECK':{label:'Checking your item',tone:'review',explanation:'We’re checking the details of this item. Availability is not confirmed yet.'},
 'NO STOCK':{label:'Not available · not charged',tone:'unavailable',explanation:'Not available for this call. You will not be charged. Ask us about your next visit.'},
 'ORDER ON THE WAY':{label:'Ordered',tone:'ordered',explanation:'We’ve ordered this item for your order. We expect it to arrive, subject to carrier delivery.'},
 'PREPARED':{label:'Prepared',tone:'ready',explanation:'Your item is prepared.'},
 'SPECIAL ORDER':{label:'Special order',tone:'ordered',explanation:'The shop is arranging this special order and will confirm availability and timing.'},
 'DELIVERED':{label:'Delivered',tone:'ready',explanation:'This item has been delivered.'},
 'CANCEL':{label:'Cancelled',tone:'muted',explanation:'This item has been cancelled.'},
 'REPLACEMENT':{label:'Replacement to confirm',tone:'review',explanation:'The shop will confirm a replacement and the next steps with you.'},
 'ALEX':{label:'Shop review',tone:'review',explanation:'The shop is reviewing this item. Availability is not confirmed yet.'}
};
export function customerStatus(code){return ORDER_STATUSES[code]||{label:'In preparation',tone:'review',explanation:'The shop has not confirmed this item’s availability yet.'};}
export function orderProgress(items){
 const active=items.filter(i=>i.status!=='CANCEL'),prepared=active.filter(i=>['PREPARED','DELIVERED'].includes(i.status)).length;
 if(!active.length)return 'Cancelled';
 if(active.every(i=>i.status==='DELIVERED'))return 'Delivered';
 if(prepared===active.length)return 'All items prepared';
 if(prepared)return `Partially prepared · ${prepared} of ${active.length} lines ready`;
 if(active.every(i=>i.status==='NO STOCK'))return 'Items out of stock';
 return 'In preparation';
}
