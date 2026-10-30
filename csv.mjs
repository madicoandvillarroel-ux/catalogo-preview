// RFC 4180 CSV parser: quoted fields may contain commas, quotes ("") and line breaks.
export function parseCSV(text){
 if(typeof text!=='string')throw Error('CSV must be text');
 if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
 const rows=[];let row=[],field='',i=0,quoted=false;const n=text.length;
 while(i<n){
  const c=text[i];
  if(quoted){
   if(c==='"'){if(text[i+1]==='"'){field+='"';i+=2;continue;}quoted=false;i++;continue;}
   field+=c;i++;continue;
  }
  if(c==='"'&&field===''){quoted=true;i++;continue;}
  if(c===','){row.push(field);field='';i++;continue;}
  if(c==='\r'){if(text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';i++;continue;}
  if(c==='\n'){row.push(field);rows.push(row);row=[];field='';i++;continue;}
  field+=c;i++;
 }
 if(quoted)throw Error('Unterminated quoted CSV field');
 if(field!==''||row.length)row.push(field),rows.push(row);
 return rows;
}
const SHEET_ERROR=/^#(?:REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!|SPILL!|CALC!)$/i;
// Header row first; trailing unnamed columns and fully blank rows are dropped.
export function prepareRows(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('Empty CSV');
 const header=rows[0].map(h=>String(h??'').trim());
 let width=header.length;while(width&&!header[width-1])width--;
 if(width<5)throw Error('CSV header row is incomplete');
 const out=[header.slice(0,width)];
 for(const r of rows.slice(1)){
  // Sheet errors (#REF!, #N/A, #VALUE!…) count as empty cells.
  const cells=r.slice(0,width).map(c=>SHEET_ERROR.test(String(c).trim())?'':c);
  if(!cells.some(c=>String(c).trim()))continue;
  out.push(cells);
 }
 return out;
}
