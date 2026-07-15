const SEED=window.SEED||[];
const UNITS=['UNIDAD','CAJA (4)','CAJA (6)','CAJA (12)','DISPLAY','KG'];
const CATEGORIES=['GIN','LICORES','PISCO','RON','TEQUILA','VODKA','WHISKY','VINOS','ESPUMANTES','BEBIDAS SIN ALCOHOL','CERVEZAS','MIXERS','BARRILES','INSUMOS','PULPAS Y CONGELADOS','ABARROTES','OTROS'];
const DEF_PROFILE={companyName:'COMERCIALIZADORA E INVERSIONES CASTELLÓN 176 SPA',rut:'77.375.227-3',address:'CAMINO EL VENADO 1075, SAN PEDRO DE LA PAZ',location:'MADRIGUERA CLUBHAUS',logo:null,logo2:null,logoPosition:'left',logoSize:34,logo2Size:24,tableHeaderColor:'#48484c'};
const KEY='pedidos-proveedores:v1';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=load(),pdfs=[],currentQtyInput=null;

function inferCategory(description=''){
  const d=description.trim().toUpperCase();
  if(d.startsWith('GIN '))return 'GIN';
  if(d.startsWith('LICOR '))return 'LICORES';
  if(d.startsWith('PISCO '))return 'PISCO';
  if(d.startsWith('RON '))return 'RON';
  if(d.startsWith('TEQUILA '))return 'TEQUILA';
  if(d.startsWith('VOD '))return 'VODKA';
  if(d.startsWith('WHIS '))return 'WHISKY';
  if(d.startsWith('VINO ')||d.startsWith('CLOSS '))return 'VINOS';
  if(d.startsWith('ESP '))return 'ESPUMANTES';
  if(d.startsWith('CERV '))return 'CERVEZAS';
  if(d.startsWith('FENTIMANS '))return 'MIXERS';
  if(d.startsWith('BARRIL '))return 'BARRILES';
  if(d.startsWith('TANQUE '))return 'INSUMOS';
  if(d.startsWith('PULPA ')||d.includes('CONGELAD'))return 'PULPAS Y CONGELADOS';
  if(d.startsWith('CREMA')||d.startsWith('AZÚCAR'))return 'ABARROTES';
  if(/^(LATA |REDBULL |PORVENIR |JUGO |TONICA |AGUA )/.test(d))return 'BEBIDAS SIN ALCOHOL';
  return 'OTROS';
}
function fresh(){return{profile:{...DEF_PROFILE},settings:{theme:'light'},items:SEED.map((x,i)=>({id:'i'+(i+1),description:String(x[0]).trim(),provider:String(x[1]).trim(),unit:x[2],category:inferCategory(x[0]),sortOrder:i,enabled:true})),order:{}}}
function load(){try{const raw=JSON.parse(localStorage.getItem(KEY)||'null');if(!raw?.items)return fresh();raw.profile={...DEF_PROFILE,...raw.profile};raw.settings={theme:'light',...raw.settings};raw.order=raw.order||{};raw.items=raw.items.map((x,i)=>({...x,description:String(x.description||'').trim(),provider:String(x.provider||'').trim(),category:x.category||inferCategory(x.description),sortOrder:Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):i,enabled:x.enabled!==false}));return raw}catch{return fresh()}}
function persist(){localStorage.setItem(KEY,JSON.stringify(state))}
function save(){persist();renderAll()}
function providers(){return [...new Set(state.items.map(x=>x.provider).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))}
function availableCategories(){const own=[...new Set(state.items.map(x=>x.category).filter(Boolean))];return own.sort((a,b)=>categoryRank(a)-categoryRank(b)||a.localeCompare(b,'es'))}
function categoryRank(c){const i=CATEGORIES.indexOf(c);return i<0?999:i}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
function qty(id){return Number(state.order[id]?.qty||0)}
function orderRows(){return state.items.filter(x=>x.enabled&&qty(x.id)>0).sort((a,b)=>a.sortOrder-b.sortOrder).map(x=>({...x,...state.order[x.id]}))}
function setSelectOptions(el,html){const old=el.value;el.innerHTML=html;if([...el.options].some(o=>o.value===old))el.value=old}
function fillSelects(){
  const ps=providers(),cs=availableCategories();
  const po='<option value="">Todos los proveedores</option>'+ps.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  const co='<option value="">Todas las categorías</option>'+cs.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  setSelectOptions($('#providerFilter'),po);setSelectOptions($('#dbProvider'),po);setSelectOptions($('#categoryFilter'),co);setSelectOptions($('#dbCategory'),co);
  $('#providers').innerHTML=ps.map(x=>`<option value="${esc(x)}">`).join('');
  $('#itemUnit').innerHTML=UNITS.map(x=>`<option>${x}</option>`).join('');
  $('#itemCategory').innerHTML=[...new Set([...CATEGORIES,...cs])].map(x=>`<option>${esc(x)}</option>`).join('');
}
function groupedByCategory(items){const groups={};items.forEach(x=>(groups[x.category||'OTROS']??=[]).push(x));return Object.entries(groups).sort(([a],[b])=>categoryRank(a)-categoryRank(b)||a.localeCompare(b,'es'))}
function renderOrder(){
  const q=$('#search').value.trim().toLowerCase(),p=$('#providerFilter').value,c=$('#categoryFilter').value;
  const items=state.items.filter(x=>x.enabled&&(!p||x.provider===p)&&(!c||x.category===c)&&(!q||`${x.description} ${x.provider} ${x.category}`.toLowerCase().includes(q))).sort((a,b)=>a.sortOrder-b.sortOrder);
  $('#orderList').innerHTML=groupedByCategory(items).map(([cat,arr])=>`<div class="card category"><div class="categoryhead"><h3>${esc(cat)}</h3><span class="pill">${arr.filter(x=>qty(x.id)>0).length} seleccionados</span></div>${arr.map(x=>`<div class="row"><div class="desc">${esc(x.description)}<small>${esc(x.provider)}</small></div><input class="qty" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off" value="${qty(x.id)||''}" data-qty="${x.id}" placeholder="0" aria-label="Cantidad ${esc(x.description)}"><select data-unit="${x.id}" aria-label="Unidad ${esc(x.description)}">${UNITS.map(u=>`<option ${u===(state.order[x.id]?.unit||x.unit)?'selected':''}>${u}</option>`).join('')}</select></div>`).join('')}</div>`).join('')||'<div class="card empty">No hay productos para este filtro.</div>';
  updateMetrics();
}
function updateMetrics(){const rows=orderRows();$('#mItems').textContent=rows.length;$('#mProviders').textContent=new Set(rows.map(x=>x.provider)).size}
function groupOrder(){return orderRows().reduce((a,x)=>((a[x.provider]??=[]).push(x),a),{})}
function renderFiles(){const groups=groupOrder();$('#files').innerHTML=Object.entries(groups).map(([p,rows])=>`<div class="card file"><div><h3>${esc(p)}</h3><span class="muted">${rows.length} ítems</span></div><div class="fileactions"><button class="btn" data-preview="${esc(p)}">Vista previa</button><button class="btn primary" data-pdf="${esc(p)}">Descargar PDF</button><button class="btn" data-share="${esc(p)}">Compartir</button></div></div>`).join('')||'<div class="card empty">Aún no hay productos con cantidad.</div>'}
function renderDb(){
  const q=$('#dbSearch').value.trim().toLowerCase(),p=$('#dbProvider').value,c=$('#dbCategory').value;
  const rows=state.items.filter(x=>(!p||x.provider===p)&&(!c||x.category===c)&&(!q||`${x.description} ${x.provider} ${x.category}`.toLowerCase().includes(q))).sort((a,b)=>a.sortOrder-b.sortOrder);
  $('#dbList').innerHTML=groupedByCategory(rows).map(([cat,arr])=>`<section class="dbgroup"><h3 class="dbgroup-title">${esc(cat)}</h3>${arr.map(x=>`<div class="dbrow ${x.enabled?'':'off'}"><div><b>${esc(x.description)}</b><div class="dbmeta">${esc(x.provider)} · ${esc(x.unit)} · ${x.enabled?'Habilitado':'Deshabilitado'}</div></div><div><button class="iconbtn" data-toggle="${x.id}" aria-label="Habilitar o deshabilitar">${x.enabled?'◉':'○'}</button> <button class="iconbtn" data-edit="${x.id}" aria-label="Editar">✎</button> <button class="iconbtn" data-delete="${x.id}" aria-label="Eliminar">⌫</button></div></div>`).join('')}</section>`).join('')||'<div class="empty">Sin resultados</div>';
}
function contrastColor(hex){const [r,g,b]=hexToRgb(hex);return (r*299+g*587+b*114)/1000>150?'#111111':'#ffffff'}
function renderProfile(){
  const p=state.profile;
  $('#company').value=p.companyName||'';$('#rut').value=p.rut||'';$('#address').value=p.address||'';$('#location').value=p.location||'';
  $('#logoPosition').value=p.logoPosition||'left';$('#logoSize').value=p.logoSize||34;$('#logo2Size').value=p.logo2Size||24;$('#logoSizeValue').textContent=p.logoSize||34;$('#logo2SizeValue').textContent=p.logo2Size||24;$('#theme').value=state.settings.theme||'light';$('#tableHeaderColor').value=p.tableHeaderColor||'#48484c';
  [['logo1Preview',p.logo],['logo2Preview',p.logo2]].forEach(([id,src])=>{const e=$('#'+id);e.src=src||'';e.classList.toggle('hidden',!src)});
  const logos=`<div class="previewlogos">${p.logo?`<img src="${p.logo}" style="width:${Math.max(45,(p.logoSize||34)*1.8)}px">`:''}${p.logo2?`<img src="${p.logo2}" style="width:${Math.max(40,(p.logo2Size||24)*1.8)}px">`:''}</div>`;
  const info=`<table><tr><td>RAZÓN SOCIAL</td><td>${esc(p.companyName)}</td></tr><tr><td>RUT</td><td>${esc(p.rut)}</td></tr><tr><td>DIRECCIÓN</td><td>${esc(p.address)}</td></tr><tr><td>LOCAL</td><td>${esc(p.location)}</td></tr><tr><td>FECHA DE EMISIÓN</td><td>${new Date().toLocaleDateString('es-CL',{dateStyle:'full'})}</td></tr></table>`;
  const pos=p.logoPosition||'left';$('#preview').innerHTML=`<div class="pdf-header-preview logo-${pos}">${logos}${info}</div><div class="table-color-sample" style="background:${p.tableHeaderColor};color:${contrastColor(p.tableHeaderColor)}">DESCRIPCIÓN &nbsp;&nbsp;&nbsp; CANTIDAD &nbsp;&nbsp;&nbsp; UNIDAD</div>`;
  $$('#colorSwatches button').forEach(b=>b.classList.toggle('active',b.dataset.color.toLowerCase()===(p.tableHeaderColor||'').toLowerCase()));
}
function applyTheme(){const t=state.settings.theme==='dark'?'dark':'light';document.documentElement.dataset.theme=t;const meta=$('#themeColorMeta');if(meta)meta.content=t==='dark'?'#0d1118':'#f5f7fb'}
function renderAll(){applyTheme();fillSelects();renderOrder();renderFiles();renderDb();renderProfile()}
function switchView(v){$$('.view').forEach(x=>x.classList.toggle('active',x.id==='v-'+v));$$('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));const map={order:['PEDIDO ACTUAL','Preparar pedido'],files:['DOCUMENTOS','Archivos PDF'],db:['CATÁLOGO','Base de datos'],profile:['CONFIGURACIÓN','Perfil']};$('#eyebrow').textContent=map[v][0];$('#pageTitle').textContent=map[v][1];window.scrollTo({top:0,behavior:'smooth'})}
function cleanName(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_')}
function hexToRgb(hex){const h=String(hex||'#48484c').replace('#','').padEnd(6,'0').slice(0,6);return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function imageDims(doc,src,width,maxHeight=28){try{const pr=doc.getImageProperties(src);let h=width*pr.height/pr.width;if(h>maxHeight){width*=maxHeight/h;h=maxHeight}return{w:width,h}}catch{return{w:width,h:width*.45}}}
function addLogo(doc,src,x,y,w,maxH){if(!src)return null;const d=imageDims(doc,src,w,maxH);try{doc.addImage(src,undefined,x,y,d.w,d.h,undefined,'FAST');return d}catch{return null}}
function drawInfoTable(doc,x,y,w,info){const labelW=34,valueW=w-labelW;doc.setDrawColor(30);doc.setLineWidth(.25);for(const [label,value] of info){doc.setFont('helvetica','normal');doc.setFontSize(7.4);const lines=doc.splitTextToSize(String(value||''),valueW-3);const rowH=Math.max(6,lines.length*3.1+2.2);doc.rect(x,y,labelW,rowH);doc.rect(x+labelW,y,valueW,rowH);doc.setFont('helvetica','bold');doc.text(label,x+1.5,y+4);doc.setFont('helvetica','normal');doc.text(lines,x+labelW+1.5,y+3.8);y+=rowH}return y}
function drawHeader(doc,p,yStart=10){
  const x=15,w=180,pos=p.logoPosition||'left';
  const info=[['RAZÓN SOCIAL',p.companyName],['RUT',p.rut],['DIRECCIÓN',p.address],['LOCAL',p.location],['FECHA DE EMISIÓN',new Date().toLocaleDateString('es-CL',{dateStyle:'full'})]];
  const hasLogo=!!(p.logo||p.logo2);let yEnd=yStart;
  if(!hasLogo){yEnd=drawInfoTable(doc,x,yStart,w,info);return yEnd}
  if(pos==='top'||pos==='bottom'){
    const logoH=Math.max(20,Math.min(34,Math.max(Number(p.logoSize)||34,Number(p.logo2Size)||24)*.62));
    const tableStart=pos==='top'?yStart+logoH:yStart;
    const tableEnd=drawInfoTable(doc,x,tableStart,w,info);
    const logoY=pos==='top'?yStart+2:tableEnd+2;
    const parts=[];if(p.logo)parts.push({src:p.logo,w:Number(p.logoSize)||34});if(p.logo2)parts.push({src:p.logo2,w:Number(p.logo2Size)||24});
    const dims=parts.map(z=>({...z,...imageDims(doc,z.src,z.w,logoH-4)}));const total=dims.reduce((s,z)=>s+z.w,0)+(dims.length-1)*6;let cx=x+(w-total)/2;
    dims.forEach(z=>{addLogo(doc,z.src,cx,logoY+(logoH-z.h)/2,z.w,logoH-4);cx+=z.w+6});
    yEnd=pos==='top'?tableEnd:tableEnd+logoH;
  }else{
    const maxSize=Math.max(p.logo?Number(p.logoSize)||34:0,p.logo2?Number(p.logo2Size)||24:0);const logoW=Math.min(62,Math.max(42,maxSize+16));const gap=3;const tableW=w-logoW-gap;const tableX=pos==='left'?x+logoW+gap:x;const logoX=pos==='left'?x:x+tableW+gap;
    const tableEnd=drawInfoTable(doc,tableX,yStart,tableW,info);const tableH=tableEnd-yStart;
    const parts=[];if(p.logo)parts.push({src:p.logo,w:Math.min(Number(p.logoSize)||34,logoW-6)});if(p.logo2)parts.push({src:p.logo2,w:Math.min(Number(p.logo2Size)||24,logoW-8)});
    const dims=parts.map(z=>({...z,...imageDims(doc,z.src,z.w,Math.max(12,tableH/parts.length-4))}));const totalH=dims.reduce((s,z)=>s+z.h,0)+(dims.length-1)*3;let cy=yStart+Math.max(2,(tableH-totalH)/2);
    dims.forEach(z=>{addLogo(doc,z.src,logoX+(logoW-z.w)/2,cy,z.w,Math.max(12,tableH));cy+=z.h+3});
    yEnd=tableEnd;
  }
  doc.setDrawColor(30);doc.setLineWidth(.25);doc.rect(x,yStart,w,yEnd-yStart);return yEnd;
}
async function makePdf(provider){
  if(!window.jspdf)throw Error('No se pudo cargar el generador PDF');
  const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'}),p=state.profile,rows=groupOrder()[provider]||[];let y=drawHeader(doc,p,10)+8;
  doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(0);doc.text('PROVEEDOR: '+provider,105,y,{align:'center',maxWidth:180});y+=9;
  const [r,g,b]=hexToRgb(p.tableHeaderColor),headerText=contrastColor(p.tableHeaderColor)==='#ffffff'?[255,255,255]:[17,17,17];
  function head(){doc.setFillColor(r,g,b);doc.rect(15,y,180,8,'F');doc.setTextColor(...headerText);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('DESCRIPCIÓN',18,y+5.3);doc.text('CANTIDAD',151,y+5.3,{align:'center'});doc.text('UNIDAD',171,y+5.3);doc.setTextColor(0);y+=8}
  head();doc.setFont('helvetica','normal');
  rows.forEach(row=>{const descLines=doc.splitTextToSize(String(row.description),122),unitLines=doc.splitTextToSize(String(row.unit),25),h=Math.max(7,Math.max(descLines.length,unitLines.length)*3.2+2.2);if(y+h>286){doc.addPage();y=15;head()}doc.rect(15,y,128,h);doc.rect(143,y,22,h);doc.rect(165,y,30,h);doc.setFontSize(8);doc.text(descLines,18,y+4.6);doc.text(String(row.qty),161,y+4.8,{align:'right'});doc.text(unitLines,168,y+4.6);y+=h});
  return doc;
}
async function downloadPdf(provider,share=false,preview=false){try{const doc=await makePdf(provider),name=`PEDIDO_${cleanName(provider)}.pdf`;if(preview){window.open(doc.output('bloburl'),'_blank');return}if(share&&navigator.share){const file=new File([doc.output('blob')],name,{type:'application/pdf'});await navigator.share({title:'Pedido '+provider,files:[file]});return}doc.save(name)}catch(e){toast(e.message||'Error al generar PDF')}}
function openItem(id=''){const x=state.items.find(i=>i.id===id);$('#itemTitle').textContent=x?'Editar ítem':'Nuevo ítem';$('#itemId').value=x?.id||'';$('#itemDesc').value=x?.description||'';$('#itemCategory').value=x?.category||'OTROS';$('#itemProv').value=x?.provider||'';$('#itemUnit').value=x?.unit||'UNIDAD';$('#itemEnabled').checked=x?.enabled??true;$('#itemDialog').showModal()}
function fileToData(file){return new Promise((res,rej)=>{const r=new FileReader;r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
function normalizeQty(v){const n=Number(String(v||'').replace(',','.').replace(/[^0-9.]/g,''));return Number.isFinite(n)?Math.max(0,n):0}
function visibleQtyInputs(){return $$('#orderList .qty').filter(x=>x.offsetParent!==null)}
function focusRelative(step){const list=visibleQtyInputs();let i=list.indexOf(currentQtyInput);if(i<0)i=0;const next=list[Math.min(list.length-1,Math.max(0,i+step))];if(next){next.focus();next.select();currentQtyInput=next}}
function updateToolbarPosition(){const bar=$('#qtyToolbar');if(bar.classList.contains('hidden'))return;let bottom=96;if(window.visualViewport){bottom=Math.max(8,window.innerHeight-window.visualViewport.height-window.visualViewport.offsetTop+8)}bar.style.bottom=bottom+'px'}
function showQtyToolbar(input){currentQtyInput=input;$('#qtyToolbar').classList.remove('hidden');updateToolbarPosition()}
function hideQtyToolbar(){setTimeout(()=>{if(!$('#qtyToolbar').contains(document.activeElement)&&document.activeElement?.dataset?.qty===undefined){$('#qtyToolbar').classList.add('hidden')}},120)}

$$('.nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('#search').oninput=renderOrder;$('#providerFilter').onchange=renderOrder;$('#categoryFilter').onchange=renderOrder;$('#dbSearch').oninput=renderDb;$('#dbProvider').onchange=renderDb;$('#dbCategory').onchange=renderDb;
$('#orderList').addEventListener('focusin',e=>{if(e.target.dataset.qty)showQtyToolbar(e.target)});$('#orderList').addEventListener('focusout',hideQtyToolbar);
$('#orderList').addEventListener('keydown',e=>{if(e.target.dataset.qty&&e.key==='Enter'){e.preventDefault();focusRelative(1)}});
$('#orderList').oninput=e=>{const id=e.target.dataset.qty;if(!id)return;const q=normalizeQty(e.target.value);state.order[id]={qty:q,unit:state.order[id]?.unit||state.items.find(x=>x.id===id).unit};persist();renderFiles();updateMetrics();const card=e.target.closest('.category');if(card){const cat=card.querySelector('.categoryhead h3')?.textContent;const arr=state.items.filter(x=>x.category===cat&&x.enabled);card.querySelector('.pill').textContent=arr.filter(x=>qty(x.id)>0).length+' seleccionados'}};
$('#orderList').onchange=e=>{const id=e.target.dataset.unit;if(id){state.order[id]={qty:qty(id),unit:e.target.value};persist();renderFiles()}};
$('#qtyPrev').onclick=()=>focusRelative(-1);$('#qtyNext').onclick=()=>focusRelative(1);$('#qtyDone').onclick=()=>{currentQtyInput?.blur();$('#qtyToolbar').classList.add('hidden')};
window.visualViewport?.addEventListener('resize',updateToolbarPosition);window.visualViewport?.addEventListener('scroll',updateToolbarPosition);
$('#files').onclick=e=>{const p=e.target.dataset.pdf||e.target.dataset.share||e.target.dataset.preview;if(p)downloadPdf(p,!!e.target.dataset.share,!!e.target.dataset.preview)};
$('#generate').onclick=()=>{if(!orderRows().length)return toast('Agrega cantidades primero');renderFiles();switchView('files')};
$('#clear').onclick=()=>{if(confirm('¿Limpiar todas las cantidades del pedido?')){state.order={};save();toast('Pedido limpio')}};
$('#addItem').onclick=()=>openItem();
$('#dbList').onclick=e=>{const id=e.target.dataset.toggle||e.target.dataset.edit||e.target.dataset.delete;if(!id)return;const x=state.items.find(i=>i.id===id);if(e.target.dataset.toggle){x.enabled=!x.enabled;save()}else if(e.target.dataset.edit)openItem(id);else if(confirm('¿Eliminar este ítem?')){state.items=state.items.filter(i=>i.id!==id);delete state.order[id];save()}};
$('#itemForm').onsubmit=e=>{e.preventDefault();const id=$('#itemId').value,x=id&&state.items.find(i=>i.id===id),data={description:$('#itemDesc').value.trim(),category:$('#itemCategory').value,provider:$('#itemProv').value.trim(),unit:$('#itemUnit').value,enabled:$('#itemEnabled').checked};if(x)Object.assign(x,data);else state.items.push({id:'i'+Date.now(),sortOrder:Math.max(-1,...state.items.map(i=>Number(i.sortOrder)||0))+1,...data});$('#itemDialog').close();save();toast('Ítem guardado')};
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#profileForm').onsubmit=e=>{e.preventDefault();Object.assign(state.profile,{companyName:$('#company').value.trim(),rut:$('#rut').value.trim(),address:$('#address').value.trim(),location:$('#location').value.trim(),logoPosition:$('#logoPosition').value,logoSize:Number($('#logoSize').value),logo2Size:Number($('#logo2Size').value),tableHeaderColor:$('#tableHeaderColor').value});state.settings.theme=$('#theme').value;save();toast('Perfil y diseño guardados')};
$('#logo1').onchange=async e=>{if(e.target.files[0]){state.profile.logo=await fileToData(e.target.files[0]);save()}};$('#logo2').onchange=async e=>{if(e.target.files[0]){state.profile.logo2=await fileToData(e.target.files[0]);save()}};
['logoPosition','logoSize','logo2Size','tableHeaderColor'].forEach(id=>$('#'+id).oninput=()=>{state.profile.logoPosition=$('#logoPosition').value;state.profile.logoSize=Number($('#logoSize').value);state.profile.logo2Size=Number($('#logo2Size').value);state.profile.tableHeaderColor=$('#tableHeaderColor').value;$('#logoSizeValue').textContent=state.profile.logoSize;$('#logo2SizeValue').textContent=state.profile.logo2Size;persist();renderProfile()});
$('#theme').onchange=()=>{state.settings.theme=$('#theme').value;persist();applyTheme()};
$('#colorSwatches').onclick=e=>{const c=e.target.dataset.color;if(c){state.profile.tableHeaderColor=c;$('#tableHeaderColor').value=c;persist();renderProfile()}};
$('#exportData').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='respaldo-pedidos.json';a.click();URL.revokeObjectURL(a.href)};
$('#importData').onchange=async e=>{try{const x=JSON.parse(await e.target.files[0].text());if(!x.items)throw 0;localStorage.setItem(KEY,JSON.stringify(x));state=load();renderAll();toast('Respaldo importado')}catch{toast('Archivo no válido')}};
$('#reset').onclick=()=>{if(confirm('¿Reiniciar toda la aplicación?')){state=fresh();save();toast('Aplicación reiniciada')}};$('#install').onclick=()=>$('#installDialog').showModal();
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});renderAll();
