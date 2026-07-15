const APP_VERSION='4.0.0';
const SCHEMA_VERSION=4;
const SEED=window.SEED||[];
const UNITS=['UNIDAD','CAJA (4)','CAJA (6)','CAJA (12)','DISPLAY','KG'];
const CATEGORIES=['GIN','LICORES','PISCO','RON','TEQUILA','VODKA','WHISKY','VINOS','ESPUMANTES','BEBIDAS SIN ALCOHOL','CERVEZAS','MIXERS','BARRILES','INSUMOS','PULPAS Y CONGELADOS','ABARROTES','OTROS'];
const DEF_PROFILE={companyName:'COMERCIALIZADORA E INVERSIONES CASTELLÓN 176 SPA',rut:'77.375.227-3',address:'CAMINO EL VENADO 1075, SAN PEDRO DE LA PAZ',location:'MADRIGUERA CLUBHAUS',logo:null,logo2:null,logoPosition:'left',logoSize:42,logo2Size:28,tableHeaderColor:'#48484c'};
const KEY='pedidos-proveedores:v1';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');
const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
let state=load();
let currentQtyInput=null;
let profileSaveTimer=null;

function inferCategory(description=''){
  const d=norm(description);
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
  if(d.startsWith('CREMA')||d.startsWith('AZUCAR'))return 'ABARROTES';
  if(/^(LATA |REDBULL |PORVENIR |JUGO |TONICA |AGUA )/.test(d))return 'BEBIDAS SIN ALCOHOL';
  return 'OTROS';
}

function seedKey(description,provider){return `${norm(description)}|${norm(provider)}`}
function fresh(){
  return{
    schemaVersion:SCHEMA_VERSION,
    profile:{...DEF_PROFILE},
    settings:{theme:'light'},
    items:SEED.map((x,i)=>({id:'i'+(i+1),description:String(x[0]).trim(),provider:String(x[1]).trim(),unit:x[2],category:inferCategory(x[0]),sortOrder:i,enabled:true})),
    order:{}
  };
}
function migrate(raw){
  if(!raw?.items)return fresh();
  const seedMap=new Map(SEED.map((x,i)=>[seedKey(x[0],x[1]),{index:i,category:inferCategory(x[0])}]));
  const providerNames=new Set(raw.items.map(x=>norm(x.provider)).filter(Boolean));
  const items=raw.items.map((x,i)=>{
    const description=String(x.description||'').trim();
    const provider=String(x.provider||'').trim();
    const seed=seedMap.get(seedKey(description,provider));
    let category=String(x.category||'').trim();
    const categoryLooksLikeProvider=providerNames.has(norm(category))||norm(category)===norm(provider);
    if(seed)category=seed.category;
    else if(!category||categoryLooksLikeProvider)category=inferCategory(description);
    const sortOrder=seed?seed.index:(Number.isFinite(Number(x.sortOrder))?Number(x.sortOrder):SEED.length+i);
    return{...x,id:x.id||`i${Date.now()}-${i}`,description,provider,unit:UNITS.includes(x.unit)?x.unit:'UNIDAD',category:category||'OTROS',sortOrder,enabled:x.enabled!==false};
  });
  return{
    ...raw,
    schemaVersion:SCHEMA_VERSION,
    profile:{...DEF_PROFILE,...raw.profile},
    settings:{theme:'light',...raw.settings},
    items,
    order:raw.order||{}
  };
}
function load(){
  try{
    const raw=JSON.parse(localStorage.getItem(KEY)||'null');
    const migrated=migrate(raw);
    localStorage.setItem(KEY,JSON.stringify(migrated));
    return migrated;
  }catch{return fresh()}
}
function persist(){state.schemaVersion=SCHEMA_VERSION;localStorage.setItem(KEY,JSON.stringify(state))}
function save(){persist();renderAll()}
function providers(){return [...new Set(state.items.map(x=>x.provider).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'))}
function categoryRank(c){const i=CATEGORIES.indexOf(c);return i<0?999:i}
function availableCategories(){return [...new Set(state.items.map(x=>x.category).filter(Boolean))].sort((a,b)=>categoryRank(a)-categoryRank(b)||a.localeCompare(b,'es'))}
function toast(text){const e=$('#toast');e.textContent=text;e.classList.add('show');clearTimeout(e._timer);e._timer=setTimeout(()=>e.classList.remove('show'),1800)}
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
function groupedByCategory(items){
  const groups={};
  items.forEach(x=>(groups[x.category||'OTROS']??=[]).push(x));
  return Object.entries(groups).sort(([a],[b])=>categoryRank(a)-categoryRank(b)||a.localeCompare(b,'es'));
}
function renderOrder(){
  const q=$('#search').value.trim().toLowerCase(),p=$('#providerFilter').value,c=$('#categoryFilter').value;
  const items=state.items.filter(x=>x.enabled&&(!p||x.provider===p)&&(!c||x.category===c)&&(!q||`${x.description} ${x.provider} ${x.category}`.toLowerCase().includes(q))).sort((a,b)=>categoryRank(a.category)-categoryRank(b.category)||a.sortOrder-b.sortOrder);
  $('#orderList').innerHTML=groupedByCategory(items).map(([cat,arr])=>`<section class="card category" data-category="${esc(cat)}"><div class="categoryhead"><h3>${esc(cat)}</h3><span class="pill">${arr.filter(x=>qty(x.id)>0).length} seleccionados</span></div>${arr.map(x=>`<div class="row"><div class="desc">${esc(x.description)}<small>${esc(x.provider)}</small></div><input class="qty" type="text" inputmode="decimal" enterkeyhint="next" autocomplete="off" value="${qty(x.id)||''}" data-qty="${x.id}" placeholder="0" aria-label="Cantidad ${esc(x.description)}"><select data-unit="${x.id}" aria-label="Unidad ${esc(x.description)}">${UNITS.map(u=>`<option ${u===(state.order[x.id]?.unit||x.unit)?'selected':''}>${u}</option>`).join('')}</select></div>`).join('')}</section>`).join('')||'<div class="card empty">No hay productos para este filtro.</div>';
  updateMetrics();
}
function updateMetrics(){const rows=orderRows();$('#mItems').textContent=rows.length;$('#mProviders').textContent=new Set(rows.map(x=>x.provider)).size}
function groupOrder(){return orderRows().reduce((a,x)=>((a[x.provider]??=[]).push(x),a),{})}
function renderFiles(){
  const groups=groupOrder();
  $('#files').innerHTML=Object.entries(groups).map(([p,rows])=>`<div class="card file"><div><h3>${esc(p)}</h3><span class="muted">${rows.length} ítems</span></div><div class="fileactions"><button class="btn" data-preview="${esc(p)}">Vista previa</button><button class="btn primary" data-pdf="${esc(p)}">Descargar PDF</button><button class="btn" data-share="${esc(p)}">Compartir</button></div></div>`).join('')||'<div class="card empty">Aún no hay productos con cantidad.</div>';
}
function renderDb(){
  const q=$('#dbSearch').value.trim().toLowerCase(),p=$('#dbProvider').value,c=$('#dbCategory').value;
  const rows=state.items.filter(x=>(!p||x.provider===p)&&(!c||x.category===c)&&(!q||`${x.description} ${x.provider} ${x.category}`.toLowerCase().includes(q))).sort((a,b)=>categoryRank(a.category)-categoryRank(b.category)||a.sortOrder-b.sortOrder);
  $('#dbList').innerHTML=groupedByCategory(rows).map(([cat,arr])=>`<section class="dbgroup"><h3 class="dbgroup-title">${esc(cat)}</h3>${arr.map(x=>`<div class="dbrow ${x.enabled?'':'off'}"><div><b>${esc(x.description)}</b><div class="dbmeta">${esc(x.provider)} · ${esc(x.unit)} · ${x.enabled?'Habilitado':'Deshabilitado'}</div></div><div><button class="iconbtn" data-toggle="${x.id}" aria-label="Habilitar o deshabilitar">${x.enabled?'◉':'○'}</button> <button class="iconbtn" data-edit="${x.id}" aria-label="Editar">✎</button> <button class="iconbtn" data-delete="${x.id}" aria-label="Eliminar">⌫</button></div></div>`).join('')}</section>`).join('')||'<div class="empty">Sin resultados</div>';
}
function contrastColor(hex){const [r,g,b]=hexToRgb(hex);return (r*299+g*587+b*114)/1000>150?'#111111':'#ffffff'}
function logoPreviewHtml(p){
  const images=[];
  if(p.logo)images.push(`<img src="${p.logo}" style="width:${clamp((Number(p.logoSize)||42)*1.65,42,118)}px" alt="Logo principal">`);
  if(p.logo2)images.push(`<img src="${p.logo2}" style="width:${clamp((Number(p.logo2Size)||28)*1.65,36,96)}px" alt="Logo secundario">`);
  return `<div class="preview-logo-pane">${images.join('')}</div>`;
}
function profileTableHtml(p){
  const rows=[['RAZÓN SOCIAL',p.companyName],['RUT',p.rut],['DIRECCIÓN',p.address],['LOCAL',p.location],['FECHA DE EMISIÓN',new Date().toLocaleDateString('es-CL',{dateStyle:'full'})]];
  return `<table class="profile-preview-table"><tbody>${rows.map(([a,b])=>`<tr><th>${a}</th><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`;
}
function renderProfilePreview(){
  const p=state.profile,pos=p.logoPosition||'left';
  $('#preview').innerHTML=`<div class="pdf-header-preview logo-${pos} ${p.logo||p.logo2?'':'no-logo'}">${logoPreviewHtml(p)}${profileTableHtml(p)}</div><div class="table-color-sample" style="background:${p.tableHeaderColor};color:${contrastColor(p.tableHeaderColor)}">DESCRIPCIÓN <span>CANTIDAD</span> <span>UNIDAD</span></div>`;
  $$('#colorSwatches button').forEach(b=>b.classList.toggle('active',b.dataset.color.toLowerCase()===(p.tableHeaderColor||'').toLowerCase()));
}
function renderProfile(){
  const p=state.profile;
  $('#company').value=p.companyName||'';$('#rut').value=p.rut||'';$('#address').value=p.address||'';$('#location').value=p.location||'';
  $('#logoPosition').value=p.logoPosition||'left';$('#logoSize').value=p.logoSize||42;$('#logo2Size').value=p.logo2Size||28;$('#logoSizeValue').textContent=p.logoSize||42;$('#logo2SizeValue').textContent=p.logo2Size||28;$('#theme').value=state.settings.theme||'light';$('#tableHeaderColor').value=p.tableHeaderColor||'#48484c';
  [['logo1Preview',p.logo],['logo2Preview',p.logo2]].forEach(([id,src])=>{const e=$('#'+id);e.src=src||'';e.classList.toggle('hidden',!src)});
  renderProfilePreview();
}
function applyTheme(){
  const t=state.settings.theme==='dark'?'dark':'light';document.documentElement.dataset.theme=t;
  const meta=$('#themeColorMeta');if(meta)meta.content=t==='dark'?'#0d1118':'#f5f7fb';
}
function renderAll(){applyTheme();fillSelects();renderOrder();renderFiles();renderDb();renderProfile();$('#buildVersion').textContent=`v${APP_VERSION}`}
function switchView(v){
  $$('.view').forEach(x=>x.classList.toggle('active',x.id==='v-'+v));$$('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
  const map={order:['PEDIDO ACTUAL','Preparar pedido'],files:['DOCUMENTOS','Archivos PDF'],db:['CATÁLOGO','Base de datos'],profile:['CONFIGURACIÓN','Perfil']};
  $('#eyebrow').textContent=map[v][0];$('#pageTitle').textContent=map[v][1];window.scrollTo({top:0,behavior:'smooth'});
}
function cleanName(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_')}
function hexToRgb(hex){const h=String(hex||'#48484c').replace('#','').padEnd(6,'0').slice(0,6);return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]}
function imageDims(doc,src,width,maxHeight=28){try{const pr=doc.getImageProperties(src);let h=width*pr.height/pr.width;if(h>maxHeight){width*=maxHeight/h;h=maxHeight}return{w:width,h}}catch{return{w:width,h:Math.min(maxHeight,width*.45)}}}
function addLogo(doc,src,x,y,w,maxH){if(!src)return null;const d=imageDims(doc,src,w,maxH);try{doc.addImage(src,undefined,x,y,d.w,d.h,undefined,'FAST');return d}catch{return null}}
function fitFontSize(doc,text,maxWidth,start=7.2,min=5.2){let size=start;doc.setFontSize(size);while(size>min&&doc.getTextWidth(String(text||''))>maxWidth){size-=.2;doc.setFontSize(size)}return size}
function drawInfoTable(doc,x,y,w,info){
  const rowH=6,labelW=clamp(w*.27,30,36),valueW=w-labelW;
  doc.setDrawColor(25);doc.setLineWidth(.25);
  info.forEach(([label,value],i)=>{
    const yy=y+i*rowH;doc.rect(x,yy,labelW,rowH);doc.rect(x+labelW,yy,valueW,rowH);
    doc.setFont('helvetica','bold');doc.setFontSize(6.7);doc.text(label,x+1.4,yy+4.05);
    doc.setFont('helvetica','normal');fitFontSize(doc,String(value||''),valueW-3,7.1,5.1);doc.text(String(value||''),x+labelW+1.5,yy+4.05);
  });
  return y+info.length*rowH;
}
function drawLogoGroup(doc,p,x,y,w,h,mode='horizontal'){
  const parts=[];
  if(p.logo)parts.push({src:p.logo,w:Number(p.logoSize)||42});
  if(p.logo2)parts.push({src:p.logo2,w:Number(p.logo2Size)||28});
  if(!parts.length)return;
  if(mode==='horizontal'){
    const dims=parts.map(z=>({...z,...imageDims(doc,z.src,Math.min(z.w,w*.46),h-4)}));
    const total=dims.reduce((s,z)=>s+z.w,0)+(dims.length-1)*5;let cx=x+(w-total)/2;
    dims.forEach(z=>{addLogo(doc,z.src,cx,y+(h-z.h)/2,z.w,h-4);cx+=z.w+5});
  }else{
    const eachH=(h-4-(parts.length-1)*2)/parts.length;
    const dims=parts.map(z=>({...z,...imageDims(doc,z.src,Math.min(z.w,w-6),eachH)}));
    const total=dims.reduce((s,z)=>s+z.h,0)+(dims.length-1)*2;let cy=y+(h-total)/2;
    dims.forEach(z=>{addLogo(doc,z.src,x+(w-z.w)/2,cy,z.w,eachH);cy+=z.h+2});
  }
}
function drawHeader(doc,p,yStart=10){
  const x=15,w=180,pos=p.logoPosition||'left';
  const info=[['RAZÓN SOCIAL',p.companyName],['RUT',p.rut],['DIRECCIÓN',p.address],['LOCAL',p.location],['FECHA DE EMISIÓN',new Date().toLocaleDateString('es-CL',{dateStyle:'full'})]];
  const hasLogo=!!(p.logo||p.logo2),tableH=30;
  if(!hasLogo){drawInfoTable(doc,x,yStart,w,info);return yStart+tableH}
  doc.setDrawColor(25);doc.setLineWidth(.25);
  if(pos==='top'||pos==='bottom'){
    const maxSize=Math.max(p.logo?Number(p.logoSize)||42:0,p.logo2?Number(p.logo2Size)||28:0);
    const bandH=clamp(maxSize*.52,18,36);const totalH=bandH+tableH;
    doc.rect(x,yStart,w,totalH);
    if(pos==='top'){
      drawLogoGroup(doc,p,x,yStart,w,bandH,'horizontal');doc.line(x,yStart+bandH,x+w,yStart+bandH);drawInfoTable(doc,x,yStart+bandH,w,info);
    }else{
      drawInfoTable(doc,x,yStart,w,info);doc.line(x,yStart+tableH,x+w,yStart+tableH);drawLogoGroup(doc,p,x,yStart+tableH,w,bandH,'horizontal');
    }
    return yStart+totalH;
  }
  const maxSize=Math.max(p.logo?Number(p.logoSize)||42:0,p.logo2?Number(p.logo2Size)||28:0);
  const logoW=clamp(maxSize+9,34,68),tableW=w-logoW;
  doc.rect(x,yStart,w,tableH);
  if(pos==='left'){
    drawLogoGroup(doc,p,x,yStart,logoW,tableH,'vertical');doc.line(x+logoW,yStart,x+logoW,yStart+tableH);drawInfoTable(doc,x+logoW,yStart,tableW,info);
  }else{
    drawInfoTable(doc,x,yStart,tableW,info);doc.line(x+tableW,yStart,x+tableW,yStart+tableH);drawLogoGroup(doc,p,x+tableW,yStart,logoW,tableH,'vertical');
  }
  return yStart+tableH;
}
async function makePdf(provider){
  if(!window.jspdf)throw Error('No se pudo cargar el generador PDF');
  const {jsPDF}=window.jspdf,doc=new jsPDF({unit:'mm',format:'a4'}),p=state.profile,rows=groupOrder()[provider]||[];
  doc.setProperties({title:`Pedido ${provider}`,subject:'Pedido a proveedor',creator:'Pedidos Proveedores PWA'});
  let y=drawHeader(doc,p,10)+8;
  doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(0);doc.text('PROVEEDOR: '+provider,105,y,{align:'center',maxWidth:180});y+=9;
  const [r,g,b]=hexToRgb(p.tableHeaderColor),headerText=contrastColor(p.tableHeaderColor)==='#ffffff'?[255,255,255]:[17,17,17];
  function head(){doc.setFillColor(r,g,b);doc.rect(15,y,180,8,'F');doc.setTextColor(...headerText);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('DESCRIPCIÓN',18,y+5.3);doc.text('CANTIDAD',151,y+5.3,{align:'center'});doc.text('UNIDAD',171,y+5.3);doc.setTextColor(0);y+=8}
  head();doc.setFont('helvetica','normal');
  rows.forEach(row=>{const descLines=doc.splitTextToSize(String(row.description),122),unitLines=doc.splitTextToSize(String(row.unit),25),h=Math.max(7,Math.max(descLines.length,unitLines.length)*3.2+2.2);if(y+h>286){doc.addPage();y=15;head()}doc.rect(15,y,128,h);doc.rect(143,y,22,h);doc.rect(165,y,30,h);doc.setFontSize(8);doc.text(descLines,18,y+4.6);doc.text(String(row.qty),161,y+4.8,{align:'right'});doc.text(unitLines,168,y+4.6);y+=h});
  return doc;
}
async function downloadPdf(provider,share=false,preview=false){
  try{
    syncProfileFromControls(false);
    const doc=await makePdf(provider),name=`PEDIDO_${cleanName(provider)}.pdf`;
    if(preview){window.open(doc.output('bloburl'),'_blank');return}
    if(share&&navigator.share){const file=new File([doc.output('blob')],name,{type:'application/pdf'});await navigator.share({title:'Pedido '+provider,files:[file]});return}
    doc.save(name);
  }catch(e){toast(e.message||'Error al generar PDF')}
}
function openItem(id=''){const x=state.items.find(i=>i.id===id);$('#itemTitle').textContent=x?'Editar ítem':'Nuevo ítem';$('#itemId').value=x?.id||'';$('#itemDesc').value=x?.description||'';$('#itemCategory').value=x?.category||'OTROS';$('#itemProv').value=x?.provider||'';$('#itemUnit').value=x?.unit||'UNIDAD';$('#itemEnabled').checked=x?.enabled??true;$('#itemDialog').showModal()}
function fileToData(file){return new Promise((res,rej)=>{const r=new FileReader;r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)})}
function normalizeQty(v){const n=Number(String(v||'').replace(',','.').replace(/[^0-9.]/g,''));return Number.isFinite(n)?Math.max(0,n):0}
function visibleQtyInputs(){return $$('#orderList .qty').filter(x=>x.offsetParent!==null)}
function focusRelative(step){
  const list=visibleQtyInputs();if(!list.length)return;
  let i=list.indexOf(currentQtyInput);if(i<0)i=0;
  const next=list[clamp(i+step,0,list.length-1)];
  if(next){currentQtyInput=next;next.scrollIntoView({block:'center',behavior:'smooth'});setTimeout(()=>{next.focus({preventScroll:true});next.select();positionQtyToolbar()},120)}
}
function positionQtyToolbar(){
  const bar=$('#qtyToolbar');if(bar.classList.contains('hidden'))return;
  const vv=window.visualViewport;
  requestAnimationFrame(()=>{
    if(vv&&vv.height<window.innerHeight*.9){bar.style.top=Math.max(8,vv.offsetTop+vv.height-bar.offsetHeight-8)+'px';bar.style.bottom='auto'}
    else{bar.style.top='auto';bar.style.bottom='calc(86px + env(safe-area-inset-bottom))'}
  });
}
function showQtyToolbar(input){currentQtyInput=input;const bar=$('#qtyToolbar');bar.classList.remove('hidden');document.body.classList.add('qty-editing');setTimeout(positionQtyToolbar,50)}
function hideQtyToolbar(){setTimeout(()=>{const active=document.activeElement;if(!$('#qtyToolbar').contains(active)&&!active?.dataset?.qty){$('#qtyToolbar').classList.add('hidden');document.body.classList.remove('qty-editing')}},180)}
function setSaveStatus(text){const e=$('#saveStatus');if(e)e.textContent=text}
function syncProfileFromControls(announce=true){
  if(!$('#profileForm'))return;
  Object.assign(state.profile,{companyName:$('#company').value.trim(),rut:$('#rut').value.trim(),address:$('#address').value.trim(),location:$('#location').value.trim(),logoPosition:$('#logoPosition').value,logoSize:Number($('#logoSize').value)||42,logo2Size:Number($('#logo2Size').value)||28,tableHeaderColor:$('#tableHeaderColor').value||'#48484c'});
  state.settings.theme=$('#theme').value==='dark'?'dark':'light';
  persist();applyTheme();$('#logoSizeValue').textContent=state.profile.logoSize;$('#logo2SizeValue').textContent=state.profile.logo2Size;renderProfilePreview();setSaveStatus('Cambios guardados');if(announce)toast('Diseño actualizado');
}
function scheduleProfileSave(){setSaveStatus('Guardando…');clearTimeout(profileSaveTimer);profileSaveTimer=setTimeout(()=>syncProfileFromControls(false),250)}

$$('.nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('#search').oninput=renderOrder;$('#providerFilter').onchange=renderOrder;$('#categoryFilter').onchange=renderOrder;$('#dbSearch').oninput=renderDb;$('#dbProvider').onchange=renderDb;$('#dbCategory').onchange=renderDb;
$('#orderList').addEventListener('focusin',e=>{if(e.target.matches('[data-qty]'))showQtyToolbar(e.target)});
$('#orderList').addEventListener('pointerdown',e=>{if(e.target.matches('[data-qty]'))showQtyToolbar(e.target)});
$('#orderList').addEventListener('focusout',hideQtyToolbar);
$('#orderList').addEventListener('keydown',e=>{if(e.target.matches('[data-qty]')&&e.key==='Enter'){e.preventDefault();focusRelative(1)}});
$('#orderList').oninput=e=>{const id=e.target.dataset.qty;if(!id)return;const q=normalizeQty(e.target.value);state.order[id]={qty:q,unit:state.order[id]?.unit||state.items.find(x=>x.id===id).unit};persist();renderFiles();updateMetrics();const card=e.target.closest('.category');if(card){const cat=card.dataset.category;const arr=state.items.filter(x=>x.category===cat&&x.enabled);card.querySelector('.pill').textContent=arr.filter(x=>qty(x.id)>0).length+' seleccionados'}};
$('#orderList').onchange=e=>{const id=e.target.dataset.unit;if(id){state.order[id]={qty:qty(id),unit:e.target.value};persist();renderFiles()}};
$('#qtyPrev').onclick=()=>focusRelative(-1);$('#qtyNext').onclick=()=>focusRelative(1);$('#qtyDone').onclick=()=>{currentQtyInput?.blur();$('#qtyToolbar').classList.add('hidden');document.body.classList.remove('qty-editing')};
window.visualViewport?.addEventListener('resize',positionQtyToolbar);window.visualViewport?.addEventListener('scroll',positionQtyToolbar);window.addEventListener('scroll',positionQtyToolbar,{passive:true});
$('#files').onclick=e=>{const p=e.target.dataset.pdf||e.target.dataset.share||e.target.dataset.preview;if(p)downloadPdf(p,!!e.target.dataset.share,!!e.target.dataset.preview)};
$('#generate').onclick=()=>{if(!orderRows().length)return toast('Agrega cantidades primero');renderFiles();switchView('files')};
$('#clear').onclick=()=>{if(confirm('¿Limpiar todas las cantidades del pedido?')){state.order={};save();toast('Pedido limpio')}};
$('#addItem').onclick=()=>openItem();
$('#dbList').onclick=e=>{const id=e.target.dataset.toggle||e.target.dataset.edit||e.target.dataset.delete;if(!id)return;const x=state.items.find(i=>i.id===id);if(e.target.dataset.toggle){x.enabled=!x.enabled;save()}else if(e.target.dataset.edit)openItem(id);else if(confirm('¿Eliminar este ítem?')){state.items=state.items.filter(i=>i.id!==id);delete state.order[id];save()}};
$('#itemForm').onsubmit=e=>{e.preventDefault();const id=$('#itemId').value,x=id&&state.items.find(i=>i.id===id),data={description:$('#itemDesc').value.trim(),category:$('#itemCategory').value,provider:$('#itemProv').value.trim(),unit:$('#itemUnit').value,enabled:$('#itemEnabled').checked};if(x)Object.assign(x,data);else state.items.push({id:'i'+Date.now(),sortOrder:Math.max(-1,...state.items.map(i=>Number(i.sortOrder)||0))+1,...data});$('#itemDialog').close();save();toast('Ítem guardado')};
$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#profileForm').onsubmit=e=>{e.preventDefault();syncProfileFromControls(true)};
$('#profileForm').addEventListener('input',e=>{if(e.target.type!=='file')scheduleProfileSave()});
$('#profileForm').addEventListener('change',e=>{if(e.target.type!=='file')syncProfileFromControls(false)});
$('#logo1').onchange=async e=>{if(e.target.files[0]){state.profile.logo=await fileToData(e.target.files[0]);persist();renderProfile();setSaveStatus('Logo guardado')}};
$('#logo2').onchange=async e=>{if(e.target.files[0]){state.profile.logo2=await fileToData(e.target.files[0]);persist();renderProfile();setSaveStatus('Logo guardado')}};
$('#colorSwatches').onclick=e=>{const c=e.target.closest('button')?.dataset.color;if(c){$('#tableHeaderColor').value=c;syncProfileFromControls(false)}};
$('#exportData').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='respaldo-pedidos.json';a.click();URL.revokeObjectURL(a.href)};
$('#importData').onchange=async e=>{try{const x=JSON.parse(await e.target.files[0].text());if(!x.items)throw 0;state=migrate(x);persist();renderAll();toast('Respaldo importado')}catch{toast('Archivo no válido')}};
$('#reset').onclick=()=>{if(confirm('¿Reiniciar toda la aplicación?')){state=fresh();save();toast('Aplicación reiniciada')}};
$('#install').onclick=()=>$('#installDialog').showModal();

async function registerServiceWorker(){
  if(!('serviceWorker'in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register('./sw.js?v=4');await reg.update();
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!sessionStorage.getItem('pwa-reloaded-v4')){sessionStorage.setItem('pwa-reloaded-v4','1');location.reload()}});
  }catch{}
}
registerServiceWorker();renderAll();
