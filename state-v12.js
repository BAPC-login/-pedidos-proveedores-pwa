(function(root){
  'use strict';
  const KEY='pedidos-proveedores:v1';
  const VERSION=17;
  const UNITS=['UNIDAD','CAJA (4)','CAJA (6)','CAJA (12)','DISPLAY','KG'];
  const DEFAULT_CATEGORIES=['GIN','LICORES','PISCO','RON','TEQUILA','VODKA','WHISKY','VINOS','ESPUMANTES','BEBIDAS SIN ALCOHOL','CERVEZAS','MIXERS','BARRILES','INSUMOS','PULPAS Y CONGELADOS','ABARROTES','OTROS'];
  const DEFAULT_PROFILE={companyName:'COMERCIALIZADORA E INVERSIONES CASTELLÓN 176 SPA',rut:'77.375.227-3',address:'CAMINO EL VENADO 1075, SAN PEDRO DE LA PAZ',location:'MADRIGUERA CLUBHAUS',folioPrefix:'MDR',logoPosition:'left',logoAlignX:'center',logoAlignY:'center',logoSize:42,logo2Size:28,tableHeaderColor:'#48484c'};
  const DEFAULT_AI={enabled:true,endpoint:'https://pedidos-pro-ai.botreservasmultilocal.workers.dev'};
  const core=()=>root.PedidosCore;

  function idFor(prefix,name,index=0){const compact=core().normalizeText(name).replace(/[^A-Z0-9]/g,'').slice(0,18).toLowerCase();return`${prefix}-${compact||index+1}-${index+1}`}
  function uniqueByName(entries){const map=new Map();for(const entry of entries||[]){if(!entry?.name)continue;const key=core().normalizeText(entry.name);if(!map.has(key))map.set(key,entry)}return[...map.values()]}
  function fresh(){
    const categories=DEFAULT_CATEGORIES.map((name,index)=>({id:idFor('cat',name,index),name,enabled:true,sortOrder:index}));
    const providerNames=[...new Set((root.SEED||[]).map(row=>String(row[1]||'').trim()).filter(Boolean))];
    const providers=providerNames.map((name,index)=>({id:idFor('prov',name,index),name,enabled:true,sortOrder:index,logoSize:24}));
    const categoryByName=name=>categories.find(entry=>entry.name===name)||categories.at(-1),providerByName=name=>providers.find(entry=>core().normalizeText(entry.name)===core().normalizeText(name));
    const items=(root.SEED||[]).map((row,index)=>{const description=String(row[0]||'').trim(),providerName=String(row[1]||'').trim(),categoryName=core().inferCategory(description);return{id:`item-${index+1}`,description,providerId:providerByName(providerName)?.id||'',categoryId:categoryByName(categoryName).id,unit:UNITS.includes(row[2])?row[2]:'UNIDAD',enabled:true,sortOrder:index}});
    return{version:VERSION,profile:{...DEFAULT_PROFILE},settings:{theme:'light',ai:{...DEFAULT_AI}},catalog:{categories,providers},items,draft:{},currentOrderFolio:null};
  }
  function migrate(raw){
    if(!raw||!Array.isArray(raw.items))return fresh();
    const legacyCategories=uniqueByName((raw.catalog?.categories||[]).map((entry,index)=>typeof entry==='string'?{name:entry,sortOrder:index}:entry));
    const itemCategoryNames=raw.items.map(item=>String(item.category||'').trim()).filter(Boolean);
    const categoryNames=uniqueByName([...legacyCategories,...DEFAULT_CATEGORIES.map((name,index)=>({name,sortOrder:100+index})),...itemCategoryNames.map((name,index)=>({name,sortOrder:300+index}))]);
    const categories=categoryNames.map((entry,index)=>({id:entry.id||idFor('cat',entry.name,index),name:entry.name,enabled:entry.enabled!==false,sortOrder:Number(entry.sortOrder??index)}));
    const legacyProviders=uniqueByName((raw.catalog?.providers||[]).map((entry,index)=>typeof entry==='string'?{name:entry,sortOrder:index}:entry));
    const itemProviderNames=raw.items.map(item=>String(item.provider||item.providerName||'').trim()).filter(Boolean);
    const providerNames=uniqueByName([...legacyProviders,...itemProviderNames.map((name,index)=>({name,sortOrder:200+index}))]);
    const providers=providerNames.map((entry,index)=>({id:entry.id||idFor('prov',entry.name,index),name:entry.name,enabled:entry.enabled!==false,sortOrder:Number(entry.sortOrder??index),logoSize:Number(entry.logoSize||raw.providerLogoSizes?.[entry.name]||24),logo:entry.logo||null}));
    const categoryFor=item=>{let name=String(item.category||'').trim();if(!name||providers.some(provider=>core().normalizeText(provider.name)===core().normalizeText(name)))name=core().inferCategory(item.description);return categories.find(entry=>core().normalizeText(entry.name)===core().normalizeText(name))||categories.find(entry=>entry.name==='OTROS')||categories[0]};
    const providerFor=item=>providers.find(entry=>core().normalizeText(entry.name)===core().normalizeText(item.provider||item.providerName))||providers[0];
    const items=raw.items.map((item,index)=>({id:String(item.id||`item-${Date.now()}-${index}`),description:String(item.description||'').trim(),providerId:item.providerId||providerFor(item)?.id||'',categoryId:item.categoryId||categoryFor(item)?.id||'',unit:UNITS.includes(item.unit)?item.unit:'UNIDAD',enabled:item.enabled!==false,sortOrder:Number(item.sortOrder??index)})).filter(item=>item.description);
    const draft={};for(const [itemId,value] of Object.entries(raw.draft||raw.order||{})){const quantity=Number(value?.qty??value)||0;if(quantity>0)draft[itemId]={qty:quantity,unit:UNITS.includes(value?.unit)?value.unit:items.find(item=>item.id===itemId)?.unit||'UNIDAD'}}
    const profile={...DEFAULT_PROFILE,...raw.profile,folioPrefix:raw.profile?.folioPrefix||core().sanitizePrefix(raw.profile?.location||'MDR'),logoAlignX:raw.profile?.logoAlignX||'center',logoAlignY:raw.profile?.logoAlignY||'center'};
    return{...raw,version:VERSION,profile,settings:{theme:'light',...raw.settings,ai:{...DEFAULT_AI,...raw.settings?.ai}},catalog:{categories,providers},items,draft,currentOrderFolio:raw.currentOrderFolio||raw.currentFolio||null};
  }
  function load(){try{return migrate(JSON.parse(localStorage.getItem(KEY)||'null'))}catch(error){console.warn('Estado local dañado; se usará la base inicial',error);return fresh()}}
  let state=load();
  function persist(){state.version=VERSION;const safe=structuredClone(state);delete safe.providerLogos;delete safe.providerLogoSizes;if(safe.profile){delete safe.profile.logo;delete safe.profile.logo2}for(const provider of safe.catalog.providers)delete provider.logo;localStorage.setItem(KEY,JSON.stringify(safe))}
  function provider(id){return state.catalog.providers.find(entry=>entry.id===id)}
  function category(id){return state.catalog.categories.find(entry=>entry.id===id)}
  function item(id){return state.items.find(entry=>entry.id===id)}
  function enabledProviders(){return state.catalog.providers.filter(entry=>entry.enabled!==false).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'es'))}
  function enabledCategories(){return state.catalog.categories.filter(entry=>entry.enabled!==false).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'es'))}
  function draftRows(){return state.items.filter(entry=>entry.enabled!==false&&Number(state.draft[entry.id]?.qty)>0).sort((a,b)=>a.sortOrder-b.sortOrder).map(entry=>({productId:entry.id,description:entry.description,providerId:entry.providerId,providerName:provider(entry.providerId)?.name||'',category:category(entry.categoryId)?.name||'OTROS',categoryId:entry.categoryId,unit:state.draft[entry.id]?.unit||entry.unit,orderedQty:Number(state.draft[entry.id]?.qty)||0}))}
  function setState(next){state=next;root.appState=state;persist()}
  async function init(){await root.PedidosDB.open();await root.PedidosDB.migrateLegacyAssets(state,core().normalizeText);await root.PedidosDB.migrateLegacyOrders(state);if(state.profile){delete state.profile.logo;delete state.profile.logo2}delete state.providerLogos;delete state.providerLogoSizes;state.catalog.providers.forEach(entry=>delete entry.logo);persist();root.appState=state;return state}
  root.PedidosState={KEY,VERSION,UNITS,DEFAULT_CATEGORIES,DEFAULT_PROFILE,DEFAULT_AI,get value(){return state},fresh,migrate,persist,setState,provider,category,item,enabledProviders,enabledCategories,draftRows,init};root.appState=state;
})(globalThis);
