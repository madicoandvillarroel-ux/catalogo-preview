import {availability,availableVariants} from './availability.mjs';
import {isListed} from './catalog-visibility.mjs';

// Match explicit names only. Device compatibility is not a product's brand.
const brandNames=['Samsung','Apple','Samsonite','American Tourister','New Era','Puma','Nike','Adidas','Jordan','Under Armour','G-Star Raw','G-Star','Crocs','Havaianas','Scholl','Skechers','Wilson','Casio','G-SHOCK','Seiko','Citizen','Swiss Military','Benyar','Fossil','JBL','Sony','Bose','Marshall','Soundcore','Xiaomi','KSIX','Garmin','Mibro','Huawei','LG','HP','Dell','Lenovo','Oppo','TCL','AGM','SanDisk','Kingston','Toshiba','TP-Link','Tapo','Alcatel','ZTE','Kodak','Fujifilm','Agfaphoto','Vieta Pro','Energy Sistem','Philips','Logitech','Grundig','JETech','FOGARI','EasyAcc','Benfei','LANHIEM','MOSISO','LEICKE','Syncwire','Ugreen','Otadug','Oivo','Refoss','Lovevook','DCU','Cecotec','The Seamans Shop','Calvin Klein','Tommy Hilfiger','Guess','Versace','Shakira','Revlon','Elizabeth Arden','Carolina Herrera','Davidoff','Prada','Antonio Banderas','Guy Laroche','Hugo Boss','Giorgio Armani','Dolce Gabbana','Ralph Lauren','Paco Rabanne','Dior','Victoria Secret','Hawkers','Northweek','Rockbros','Victorinox','Zippo','Ledlenser','Solidline','Morpilot','Nivea','Pantene','Gillette','Garnier','Oral-B','Listerine','CeraVe','Dove','Sanex','Wahl','Beurer','Medisana','Vaseline','Babaria','Heno de Pravia','Palmolive','Zenement','American Nutrition','Optimum Nutrition','Amix','Multicentrum','Milka','Oreo','Toblerone','Pringles','Doritos','Haribo','Halls','Lindt','Mars','Snickers','Kitkat','Skittles','Red Bull','Monster','Nescafe','Lavazza','Starbucks','Vodafone','Orange'];
const plain=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[’']/g,'').replace(/[^A-Z0-9]+/g,' ').trim();
const brands=brandNames.map(name=>({name,token:plain(name)}));
const deviceBrands=new Set(['Samsung','Apple','Xiaomi','Huawei','Nokia','Oppo']);
const cached=new WeakMap();
// Collections confirmed on the original catalog's watch pages. Some ARTICULOS
// names only say CASIO, so use these exact model codes rather than guessing.
const watchModels={
 'G-SHOCK':['DW-5600UBB-1ER','GM-2100-1AER','GBM-2100-1AER','GM-2100CB-3AER'],
 'Baby-G':['BGD-565SJ-7ER','BGD-565SJ-9ER'],
 'Pro Trek':['PRG-340-3ER','PRG-270-1ER']
};
export function watchCollection(p){
 if(p.category!=='Watches'||plain(p.subfamily)==='ACCESSORIES')return '';
 const name=' '+plain(p.name)+' ';
 // Baby-G takes priority when a source title also includes G-Shock.
 for(const [label,pattern] of [['Baby-G',/\bBABY G\b/],['G-SHOCK',/\bG SHOCK\b/],['Edifice',/\bEDIFICE\b/],['Pro Trek',/\bPRO TREK\b/]]){
  if(pattern.test(name)||(watchModels[label]||[]).some(model=>name.includes(' '+plain(model)+' ')))return label;
 }
 if(/\bPRECISION\b/.test(name))return 'Precision';
 return '';
}
export function productBrand(p){
 const collection=watchCollection(p);if(collection)return collection;
 const name=plain(p.name),matches=brands.map(b=>({...b,index:(' '+name+' ').indexOf(' '+b.token+' ')})).filter(b=>b.index>=0).sort((a,b)=>a.index-b.index||b.token.length-a.token.length);
 const accessory=/\b(CASE|COVER|PROTECTOR|SLEEVE|FUNDA|CARCASA|TEMPERED GLASS)\b/.test(name);
 const compatible=/\b(COMPATIBLE|COMPATIBILITY|FOR|PARA)\b/.test(name);
 const electronics=p.category==='Electronics'||p.category==='Smartwatches'||/ELECTRONIC|PHONE|SMARTWATCH|COMPUT/.test(plain(p.family));
 for(const b of matches){if(deviceBrands.has(b.name)&&((accessory&&!(b.index===0&&name.startsWith(b.token+' CASE ')))||compatible||!electronics))continue;if(b.name==='Orange'&&p.category!=='SIM cards')continue;return b.name;}
 return '';
}
export function sizeLabel(raw){return String(raw??'').trim().toUpperCase().replace(/^S\.\s*(?=\d)/,'').replace(/(\d),(\d)/g,'$1.$2').replace(/^XXL$/,'2XL').replace(/^XXXL$/,'3XL').replace(/^XXXXL$/,'4XL');}
const title=s=>String(s).toLowerCase().replace(/(^|[\s&/-])\w/g,c=>c.toUpperCase()).replace(/T-Shirts/g,'T-shirts');
export function productFacets(p){
 if(cached.has(p))return cached.get(p);
 const family=plain(p.family),subfamily=plain(p.subfamily),type=p.subfamily?title(p.subfamily):'',variants=availableVariants(p);
 const footwear=family==='SHOES'||p.category==='Footwear',clothing=family==='CLOTHES'||p.category==='Clothing'||(family==='SOUVENIRS'&&subfamily==='CLOTHING CAPS');
 const sizeKind=footwear?'footwear':clothing?'clothing':'';
 const sizes=sizeKind?variants.map(variant=>({value:sizeKind+':'+sizeLabel(variant.label),label:sizeLabel(variant.label),variant})).filter(x=>x.label):[];
 const luggage=[];
 if(family==='TRAVEL BAGS'&&subfamily==='LUGGAGE'){
  const name=String(p.name).toUpperCase();
  const pair=name.match(/\b\d{2,3}\s*(?:CM|INCH(?:ES)?)?\s*\/\s*\d{2,3}\s*(?:CM|INCH(?:ES)?)?\b/);
  if(pair)luggage.push(pair[0].trim().replace(/\s*\/\s*/g,' / '));
  else {const explicit=name.match(/\b\d{2,3}(?:[.,]\d+)?\s*(?:CM|INCH(?:ES)?)\b/);if(explicit)luggage.push(explicit[0].trim());}
 }
 const brand=productBrand(p),watchType=p.category==='Watches'&&subfamily!=='ACCESSORIES'?(brand||'Other watches'):type;
 const result={brand,type:watchType,sizes,luggage};cached.set(p,result);return result;
}
export function matchesFacets(p,filters={},omit=''){
 const f=productFacets(p);
 if(omit!=='brand'&&filters.brand&&f.brand!==filters.brand)return false;
 if(omit!=='type'&&filters.type&&f.type!==filters.type)return false;
 if(omit!=='luggage'&&filters.luggage&&!f.luggage.includes(filters.luggage))return false;
 const matchingSizes=f.sizes.filter(s=>omit==='size'||!filters.size||s.value===filters.size);
 if(omit!=='size'&&filters.size&&!matchingSizes.length)return false;
 // Availability must belong to the selected size, rather than another size's stock.
 if(filters.availability){const candidates=filters.size&&omit!=='size'?matchingSizes.map(s=>({stock:s.variant})):[p];if(!candidates.some(v=>availability(v).status===filters.availability))return false;}
 return true;
}
export function compareSize(a,b){const order=['XS','S','M','L','XL','2XL','3XL','4XL'];const ai=order.indexOf(a.label),bi=order.indexOf(b.label);if(ai>=0&&bi>=0)return ai-bi;return a.label.localeCompare(b.label,'en',{numeric:true});}

// Choose a section first, then reveal only the refinements for its products.
export function catalogContext(products,category,type=''){
 const scope=products.filter(p=>isListed(p)&&(category==='All products'||(category==='Outlet'?p.outlet:p.category===category)));
 const counts=new Map();for(const p of scope){const value=productFacets(p).type;if(value)counts.set(value,(counts.get(value)||0)+1);}
 const types=[...counts].map(([value,count])=>({value,count})).sort((a,b)=>a.value.localeCompare(b.value,'en',{numeric:true}));
 const ready=category!=='All products';
 const selected=type?scope.filter(p=>productFacets(p).type===type):scope;
 return{scope,types,ready,selected};
}
