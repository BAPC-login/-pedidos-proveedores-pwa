import {$,$$,esc,state,api,toast} from './app-core.js';
import {openModal} from './app-modal.js';

let initialized=false;
let settingsCache=null;

const BAR_UNITS=[['UNIDAD',1],['CAJA(6)',6],['CAJA(12)',12],['DISPLAY(6)',6],['DISPLAY(12)',12],['DISPLAY(24)',24]];
const KITCHEN_UNITS=[['UNIDAD',1],['KG',1],['BIDÓN',1],['CAJA(6)',6],['CAJA(12)',12]];
const LIQUOR_CATEGORIES=['Cervezas','Espumantes','Gin','Licores','Pisco','Ron','Tequila','Vinos','Vodka','Whisky'];
const BEVERAGE_CATEGORIES=['Aguas','Bebidas','Bebidas sin alcohol','Energéticas','Energeticas','Gaseosas','Jugos'];

function slug(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase()||crypto.randomUUID()}
function normalizedName(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
function alpha(left,right){return String(left||'').localeCompare(String(right||''),'es',{sensitivity:'base'})}
function clone(value){return JSON.parse(JSON.stringify(value))}

function categoryObject(value,index=0){
  if(typeof value==='string')return{name:value,sortOrder:index};
  return{name:String(value?.name||''),sortOrder:Number(value?.sortOrder??index)};
}

function centerKind(center){
  const name=normalizedName(center?.name);
  if(name==='barra'||name.includes('barra'))return'bar';
  if(name==='cocina'||name.includes('cocina'))return'kitchen';
  if(name==='salon'||name.includes('salon'))return'salon';
  return'other';
}

function looksLikeLegacyBarConfig(center,config){
  if(centerKind(center)==='bar')return false;
  const names=(config?.warehouses||[]).map(item=>normalizedName(item.name));
  return names.includes('bodega licores')&&names.includes('bodega bebidas');
}

function defaultConfig(center,categoryNames=[]){
  const kind=centerKind(center);
  const available=[...new Set(categoryNames.filter(Boolean))].sort(alpha);
  if(kind==='bar'){
    const used=new Set([...LIQUOR_CATEGORIES,...BEVERAGE_CATEGORIES].map(normalizedName));
    const extra=available.filter(name=>!used.has(normalizedName(name)));
    return{
      orderMode:'alphabetical',
      units:BAR_UNITS.map(([name,unitsPerFormat],index)=>({id:slug(name),name,unitsPerFormat,sortOrder:index,active:true})),
      warehouses:[
        {id:'licores',name:'Bodega licores',sortOrder:0,categories:LIQUOR_CATEGORIES.map((name,index)=>({name,sortOrder:index})),active:true},
        {id:'bebidas',name:'Bodega bebidas',sortOrder:1,categories:BEVERAGE_CATEGORIES.map((name,index)=>({name,sortOrder:index})),active:true},
        {id:'insumos',name:'Bodega insumos',sortOrder:2,categories:extra.map((name,index)=>({name,sortOrder:index})),active:true}
      ]
    };
  }
  if(kind==='kitchen'){
    return{
      orderMode:'alphabetical',
      units:KITCHEN_UNITS.map(([name,unitsPerFormat],index)=>({id:slug(name),name,unitsPerFormat,sortOrder:index,active:true})),
      warehouses:[{id:'cocina',name:'Bodega cocina',sortOrder:0,categories:available.map((name,index)=>({name,sortOrder:index})),active:true}]
    };
  }
  return{
    orderMode:'alphabetical',
    units:[{id:'unidad',name:'UNIDAD',unitsPerFormat:1,sortOrder:0,active:true}],
    warehouses:[{id:slug(`Bodega ${center?.name||'general'}`),name:`Bodega ${center?.name||'general'}`,sortOrder:0,categories:available.map((name,index)=>({name,sortOrder:index})),active:true}]
  };
}

function normalizeConfig(center,raw,categoryNames=[]){
  if(!raw||looksLikeLegacyBarConfig(center,raw))return defaultConfig(center,categoryNames);
  const units=(raw.units||[]).filter(item=>item.active!==false).map((item,index)=>({
    id:String(item.id||slug(item.name)),name:String(item.name||'UNIDAD').toUpperCase(),unitsPerFormat:Math.max(.001,Number(item.unitsPerFormat||1)),sortOrder:Number(item.sortOrder??index),active:true
  }));
  const warehouses=(raw.warehouses||[]).filter(item=>item.active!==false).map((item,index)=>({
    id:String(item.id||slug(item.name)),name:String(item.name||`Bodega ${index+1}`),sortOrder:Number(item.sortOrder??index),active:true,
    categories:(item.categories||[]).map(categoryObject).filter(item=>item.name)
  }));
  const fallback=defaultConfig(center,categoryNames);
  return{
    orderMode:raw.orderMode==='custom'?'custom':'alphabetical',
    units:units.length?units:fallback.units,
    warehouses:warehouses.length?warehouses:fallback.warehouses
  };
}

export async function loadProcurementSettings(force=false){
  if(settingsCache&&!force)return settingsCache;
  settingsCache=await api('/api/settings');
  return settingsCache;
}

export function configForCenter(center,categoryNames=[],settings=settingsCache){
  const raw=settings?.organization?.procurement?.costCenters?.[center?.id];
  return normalizeConfig(center,raw,categoryNames);
}

export function orderedWarehouses(config){
  const mode=config.orderMode||'alphabetical';
  return [...config.warehouses].sort((a,b)=>mode==='custom'
    ?Number(a.sortOrder||0)-Number(b.sortOrder||0)||alpha(a.name,b.name)
    :alpha(a.name,b.name));
}

export function orderedCategories(warehouse,config){
  const mode=config.orderMode||'alphabetical';
  return [...(warehouse.categories||[])].map(categoryObject).sort((a,b)=>mode==='custom'
    ?Number(a.sortOrder||0)-Number(b.sortOrder||0)||alpha(a.name,b.name)
    :alpha(a.name,b.name));
}

export function warehouseForCategory(config,categoryName){
  const target=normalizedName(categoryName||'Sin categoría');
  return orderedWarehouses(config).find(warehouse=>(warehouse.categories||[]).some(category=>normalizedName(categoryObject(category).name)===target))||null;
}

export function groupProductsByConfiguredOrder(products,config){
  const warehouses=orderedWarehouses(config);
  const result=[];
  const assigned=new Set();
  for(const warehouse of warehouses){
    const categories=[];
    for(const category of orderedCategories(warehouse,config)){
      const items=products.filter(product=>normalizedName(product.categoryName||'Sin categoría')===normalizedName(category.name)).sort((a,b)=>alpha(a.name,b.name));
      if(items.length){categories.push({category:category.name,items});items.forEach(item=>assigned.add(item.id));}
    }
    if(categories.length)result.push({warehouse,categories});
  }
  const unassigned=products.filter(product=>!assigned.has(product.id));
  if(unassigned.length){
    const map=new Map();
    for(const product of unassigned){const category=product.categoryName||'Sin categoría';if(!map.has(category))map.set(category,[]);map.get(category).push(product)}
    result.push({warehouse:{id:'unassigned',name:'Sin bodega asignada',sortOrder:9999},categories:[...map.entries()].sort((a,b)=>alpha(a[0],b[0])).map(([category,items])=>({category,items:items.sort((a,b)=>alpha(a.name,b.name))}))});
  }
  return result;
}

export function unitsForCenter(config){
  return [...config.units].sort((a,b)=>Number(a.sortOrder||0)-Number(b.sortOrder||0)||alpha(a.name,b.name));
}

function injectStyles(){
  if($('#procurementSettingsStyles'))return;
  const style=document.createElement('style');style.id='procurementSettingsStyles';style.textContent=`
    .proc-settings{display:grid;gap:14px}.proc-top{display:grid;grid-template-columns:minmax(220px,1fr) minmax(180px,.6fr);gap:10px}.proc-columns{display:grid;grid-template-columns:minmax(270px,.7fr) minmax(0,1.3fr);gap:12px}.proc-panel{padding:14px;border:1px solid var(--line);border-radius:15px;background:var(--card)}.proc-panel h3{margin:0 0 5px}.proc-help{margin:0 0 12px;color:var(--muted);font-size:10px;line-height:1.5}.proc-list{display:grid;gap:8px}.proc-row{display:grid;grid-template-columns:auto minmax(0,1fr) 90px auto;gap:7px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:11px}.proc-row input{min-width:0;min-height:38px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--text);padding:0 9px}.proc-move{display:grid;grid-template-columns:1fr 1fr;gap:4px}.proc-move .btn{min-width:32px;padding:0}.warehouse-card{padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}.warehouse-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center}.warehouse-head input{min-width:0;min-height:40px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);padding:0 9px}.category-order{display:grid;gap:6px;margin-top:10px}.category-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:7px;align-items:center;padding:7px 8px;border:1px solid var(--line);border-radius:9px;background:var(--card);font-size:10px}.category-picker{margin-top:9px}.category-picker summary{cursor:pointer;color:var(--primary);font-size:10px;font-weight:850}.category-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:8px}.category-option{display:flex;gap:7px;align-items:center;padding:7px;border:1px solid var(--line);border-radius:9px;background:var(--card);font-size:9px}.proc-empty{padding:12px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:10px;text-align:center}
    @media(max-width:760px){.proc-top,.proc-columns{grid-template-columns:1fr}.category-options{grid-template-columns:1fr}.proc-row{grid-template-columns:auto minmax(0,1fr) 76px}.proc-row>[data-remove-unit]{grid-column:1/-1}.warehouse-head{grid-template-columns:auto minmax(0,1fr)}.warehouse-head>[data-remove-warehouse]{grid-column:1/-1}}
  `;document.head.append(style);
}

function move(array,index,direction){const next=index+direction;if(next<0||next>=array.length)return;[array[index],array[next]]=[array[next],array[index]];array.forEach((item,position)=>item.sortOrder=position)}

export async function openProcurementSettings(initialCenterId=''){
  injectStyles();
  const [settings,locationsPayload,centersPayload,categoriesPayload]=await Promise.all([
    loadProcurementSettings(true),api('/api/locations'),api('/api/cost-centers'),api('/api/categories')
  ]);
  state.cache.locations=locationsPayload.locations||[];state.cache.costCenters=centersPayload.costCenters||[];state.cache.categories=categoriesPayload.categories||[];
  const categoryNames=state.cache.categories.map(item=>item.name).filter(Boolean).sort(alpha);
  const availableCenters=state.cache.costCenters.filter(center=>center.active!==false&&state.cache.locations.some(location=>location.id===center.locationId));
  if(!availableCenters.length)return toast('No hay centros de costo disponibles','error');
  let centerId=availableCenters.some(center=>center.id===initialCenterId)?initialCenterId:availableCenters[0].id;
  const drafts=new Map();
  const getDraft=id=>{if(!drafts.has(id)){const center=availableCenters.find(item=>item.id===id);drafts.set(id,clone(configForCenter(center,categoryNames,settings)))}return drafts.get(id)};

  openModal({eyebrow:'AJUSTES · COMPRAS',title:'Bodegas, categorías y unidades',subtitle:'Se configura fuera de la operación. Cada centro conserva su propio recorrido, bodegas y unidades de compra.',size:'large',body:`<div class="proc-settings"><div class="proc-top"><label class="field"><span>Centro de costo</span><select id="procCenter">${availableCenters.map(center=>{const location=state.cache.locations.find(item=>item.id===center.locationId);return`<option value="${esc(center.id)}">${esc(location?.name||'Local')} · ${esc(center.name)}</option>`}).join('')}</select></label><label class="field"><span>Orden de recorrido</span><select id="procOrderMode"><option value="alphabetical">Alfabético</option><option value="custom">Personalizado</option></select></label></div><div id="procEditor"></div></div>`,submitLabel:'Guardar ajustes del centro',onSubmit:async()=>{
    syncInputs();
    const center=availableCenters.find(item=>item.id===centerId);const draft=getDraft(centerId);
    if(!draft.units.length)throw new Error('Crea al menos una unidad de compra');if(!draft.warehouses.length)throw new Error('Crea al menos una bodega');
    const current=settingsCache?.organization?.procurement||settings.organization.procurement||{costCenters:{}};
    const procurement={costCenters:{...(current.costCenters||{}),[centerId]:draft}};
    settingsCache=await api('/api/settings',{method:'PATCH',json:{procurement}});
    toast(`Ajustes guardados para ${center.name}`);
  }});
  $('#procCenter').value=centerId;

  function assignedNames(draft){const set=new Set();draft.warehouses.forEach(warehouse=>(warehouse.categories||[]).forEach(category=>set.add(normalizedName(categoryObject(category).name))));return set}
  function render(){
    const center=availableCenters.find(item=>item.id===centerId);const draft=getDraft(centerId);$('#procOrderMode').value=draft.orderMode;
    const assigned=assignedNames(draft);
    $('#procEditor').innerHTML=`<div class="proc-columns"><section class="proc-panel"><h3>Unidades de compra · ${esc(center.name)}</h3><p class="proc-help">Solo aparecen en este centro. Ejemplo: CAJA(12) equivale a 12 unidades.</p><div class="proc-list">${draft.units.map((unit,index)=>`<div class="proc-row" data-unit-index="${index}"><div class="proc-move"><button class="btn small" type="button" data-unit-up>↑</button><button class="btn small" type="button" data-unit-down>↓</button></div><input data-unit-name value="${esc(unit.name)}" placeholder="CAJA(12)"><input data-unit-pack type="number" min="0.001" step="0.001" value="${Number(unit.unitsPerFormat||1)}"><button class="btn small danger" type="button" data-remove-unit>×</button></div>`).join('')}</div><button class="btn wide-action" type="button" id="procAddUnit">＋ Agregar unidad</button></section><section class="proc-panel"><h3>Bodegas y categorías</h3><p class="proc-help">Una categoría solo puede pertenecer a una bodega. En orden personalizado puedes mover bodegas y categorías según el recorrido físico.</p><div class="proc-list">${draft.warehouses.map((warehouse,index)=>{const categories=(warehouse.categories||[]).map(categoryObject);const unused=categoryNames.filter(name=>!assigned.has(normalizedName(name)));return`<article class="warehouse-card" data-warehouse-index="${index}"><div class="warehouse-head"><div class="proc-move"><button class="btn small" type="button" data-warehouse-up ${draft.orderMode!=='custom'?'disabled':''}>↑</button><button class="btn small" type="button" data-warehouse-down ${draft.orderMode!=='custom'?'disabled':''}>↓</button></div><input data-warehouse-name value="${esc(warehouse.name)}" placeholder="Bodega bebidas"><button class="btn small danger" type="button" data-remove-warehouse>Eliminar</button></div><div class="category-order">${categories.length?categories.map((category,categoryIndex)=>`<div class="category-item" data-category-index="${categoryIndex}"><div class="proc-move"><button class="btn small" type="button" data-category-up ${draft.orderMode!=='custom'?'disabled':''}>↑</button><button class="btn small" type="button" data-category-down ${draft.orderMode!=='custom'?'disabled':''}>↓</button></div><span>${esc(category.name)}</span><button class="btn small" type="button" data-remove-category>×</button></div>`).join(''):'<div class="proc-empty">Sin categorías asignadas</div>'}</div><details class="category-picker"><summary>＋ Agregar categorías disponibles</summary><div class="category-options">${unused.length?unused.map(name=>`<label class="category-option"><input type="checkbox" value="${esc(name)}" data-category-choice><span>${esc(name)}</span></label>`).join(''):'<div class="proc-empty">Todas las categorías ya están asignadas.</div>'}</div>${unused.length?'<button class="btn small" type="button" data-add-selected-categories>Agregar seleccionadas</button>':''}</details></article>`}).join('')}</div><button class="btn wide-action" type="button" id="procAddWarehouse">＋ Agregar bodega</button></section></div>`;
    bind();
  }
  function syncInputs(){
    const draft=getDraft(centerId);
    $$('[data-unit-index]').forEach(row=>{const unit=draft.units[Number(row.dataset.unitIndex)];unit.name=row.querySelector('[data-unit-name]').value.trim().toUpperCase();unit.id=slug(unit.name);unit.unitsPerFormat=Math.max(.001,Number(row.querySelector('[data-unit-pack]').value||1))});
    $$('[data-warehouse-index]').forEach(row=>{const warehouse=draft.warehouses[Number(row.dataset.warehouseIndex)];warehouse.name=row.querySelector('[data-warehouse-name]').value.trim()||warehouse.name;warehouse.id=slug(warehouse.name)});
  }
  function bind(){
    $('#procEditor').oninput=syncInputs;
    $('#procAddUnit').onclick=()=>{syncInputs();const draft=getDraft(centerId);draft.units.push({id:crypto.randomUUID(),name:'UNIDAD',unitsPerFormat:1,sortOrder:draft.units.length,active:true});render()};
    $('#procAddWarehouse').onclick=()=>{syncInputs();const draft=getDraft(centerId);draft.warehouses.push({id:crypto.randomUUID(),name:`Bodega ${draft.warehouses.length+1}`,sortOrder:draft.warehouses.length,categories:[],active:true});render()};
    $$('[data-unit-index]').forEach(row=>{const index=Number(row.dataset.unitIndex);row.querySelector('[data-unit-up]').onclick=()=>{syncInputs();move(getDraft(centerId).units,index,-1);render()};row.querySelector('[data-unit-down]').onclick=()=>{syncInputs();move(getDraft(centerId).units,index,1);render()};row.querySelector('[data-remove-unit]').onclick=()=>{getDraft(centerId).units.splice(index,1);render()}});
    $$('[data-warehouse-index]').forEach(row=>{const warehouseIndex=Number(row.dataset.warehouseIndex);const draft=getDraft(centerId);const warehouse=draft.warehouses[warehouseIndex];row.querySelector('[data-warehouse-up]').onclick=()=>{syncInputs();move(draft.warehouses,warehouseIndex,-1);render()};row.querySelector('[data-warehouse-down]').onclick=()=>{syncInputs();move(draft.warehouses,warehouseIndex,1);render()};row.querySelector('[data-remove-warehouse]').onclick=()=>{draft.warehouses.splice(warehouseIndex,1);render()};row.querySelector('[data-add-selected-categories]')?.addEventListener('click',()=>{syncInputs();const names=[...row.querySelectorAll('[data-category-choice]:checked')].map(input=>input.value);warehouse.categories.push(...names.map((name,index)=>({name,sortOrder:warehouse.categories.length+index})));render()});row.querySelectorAll('[data-category-index]').forEach(categoryRow=>{const categoryIndex=Number(categoryRow.dataset.categoryIndex);categoryRow.querySelector('[data-category-up]').onclick=()=>{move(warehouse.categories,categoryIndex,-1);render()};categoryRow.querySelector('[data-category-down]').onclick=()=>{move(warehouse.categories,categoryIndex,1);render()};categoryRow.querySelector('[data-remove-category]').onclick=()=>{warehouse.categories.splice(categoryIndex,1);render()}})});
  }
  $('#procCenter').onchange=()=>{syncInputs();centerId=$('#procCenter').value;render()};
  $('#procOrderMode').onchange=()=>{syncInputs();getDraft(centerId).orderMode=$('#procOrderMode').value;render()};
  render();
}

export function initializeProcurementSettings(){
  if(initialized)return;initialized=true;injectStyles();document.addEventListener('click',event=>{const button=event.target.closest('[data-procurement-settings]');if(!button)return;event.preventDefault();openProcurementSettings(button.dataset.centerId||'').catch(error=>toast(error.message,'error'))});
}
