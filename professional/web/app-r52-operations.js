import {$,$$,state,api,toast,seedResponseCache} from './app-core.js';
import {ensureOrderDocument} from './app-file-actions.js';
import {openRoute} from './app-router-v14.js';

let initialized=false,queued=false,historyPrimePromise=null,lastPrimeAt=0,editPreparedKey='';
const networkMetrics=[];
const responseCache=new Map(),inflight=new Map();
const CACHE_LIMIT=72;
const downstreamFetch=window.fetch.bind(window);
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const cloneResponse=entry=>new Response(entry.body,{status:entry.status,statusText:entry.statusText,headers:new Headers(entry.headers)});
const authKey=(input,init)=>{const h=new Headers(init?.headers||input?.headers||{});return h.get('Authorization')||''};
function requestUrl(input){try{return new URL(typeof input==='string'?input:input?.url,location.href)}catch{return null}}
function ttlFor(path){
  if(/^\/api\/(categories|cost-centers|suppliers|products|locations|supplier-assets|master-list-ordering-v42)/.test(path))return 10*60*1000;
  if(/^\/api\/(orders|invoices|documents|audit)(?:\/|$)/.test(path))return 5*60*1000;
  if(/^\/api\/(dashboard|notifications|receptions\/work-queue|finance\/payments)/.test(path))return 90*1000;
  if(path==='/api/me')return 5*60*1000;
  if(path==='/api/screen-bootstrap-v52')return 5*60*1000;
  return 0;
}
function cacheKey(input,init){const url=requestUrl(input);return url?`${url.pathname}${url.search}|${authKey(input,init).slice(-18)}`:''}
function trimCache(){while(responseCache.size>CACHE_LIMIT){const key=responseCache.keys().next().value;if(key===undefined)break;responseCache.delete(key)}}
function invalidateNetworkCache(){responseCache.clear();inflight.clear()}
async function snapshot(response){return{body:await response.clone().arrayBuffer(),status:response.status,statusText:response.statusText,headers:[...response.headers.entries()],at:Date.now()}}
function installRequestShield(){
  if(window.__nuvastoR52FetchShield)return;window.__nuvastoR52FetchShield=true;
  window.fetch=async(input,init={})=>{
    const method=String(init?.method||input?.method||'GET').toUpperCase(),url=requestUrl(input),path=url?.pathname||'';
    if(method!=='GET'){if(path.startsWith('/api/'))invalidateNetworkCache();return downstreamFetch(input,init)}
    const ttl=ttlFor(path);if(!ttl)return downstreamFetch(input,init);
    const key=cacheKey(input,init),cached=responseCache.get(key),age=cached?Date.now()-cached.at:Infinity;
    if(cached&&age<ttl)return cloneResponse(cached);
    if(inflight.has(key))return (await inflight.get(key)).clone();
    const task=downstreamFetch(input,init).then(async response=>{if(response.ok){responseCache.set(key,await snapshot(response));trimCache()}return response}).finally(()=>inflight.delete(key));
    inflight.set(key,task);return (await task).clone();
  };
}

function injectStyles(){if($('#r52Styles'))return;const style=document.createElement('style');style.id='r52Styles';style.textContent=`
.r52-edit-intro{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin:0 0 10px;padding:11px 13px;border:1px solid color-mix(in srgb,var(--primary) 32%,var(--line));border-radius:14px;background:color-mix(in srgb,var(--primary) 5%,var(--card))}.r52-edit-intro strong,.r52-edit-intro small{display:block}.r52-edit-intro strong{font-size:12px}.r52-edit-intro small{margin-top:4px;color:var(--muted);font-size:8px}.r52-supplier-master{display:grid!important;gap:9px!important}.r52-edit-category{overflow:hidden;border:1px solid var(--line);border-radius:14px;background:var(--card)}.r52-edit-category>header{padding:9px 12px;border-bottom:1px solid var(--line);background:var(--soft);font-size:8px;font-weight:950;letter-spacing:.06em;text-transform:uppercase}.r52-edit-category-list{display:grid}.r52-supplier-master .v30-item-card{display:grid;grid-template-columns:minmax(180px,1fr) 115px 135px 110px;grid-template-areas:'identity qty unit pack' 'identity remove remove remove';gap:7px;align-items:end;margin:0!important;padding:9px 11px!important;border:0!important;border-bottom:1px solid var(--line)!important;border-radius:0!important;background:var(--card)!important}.r52-supplier-master .v30-item-card:last-child{border-bottom:0!important}.r52-supplier-master .v30-item-card>header{grid-area:identity;align-self:center}.r52-supplier-master .v30-item-card>header h4{margin:0;font-size:11px}.r52-supplier-master .v30-item-card>header small{display:block;margin-top:3px;font-size:7px;color:var(--muted)}.r52-supplier-master .v30-field-grid{display:contents}.r52-supplier-master .v30-field-grid>.field:nth-child(1){grid-area:qty}.r52-supplier-master .v30-field-grid>.field:nth-child(2){grid-area:unit}.r52-supplier-master .v30-field-grid>.field:nth-child(3){grid-area:pack}.r52-supplier-master .v30-field-grid>.field span{font-size:6px}.r52-supplier-master .v30-field-grid input,.r52-supplier-master .v30-field-grid select{min-height:42px}.r52-supplier-master .r51-remove-line{grid-area:remove;justify-self:end;width:auto!important;min-height:34px!important;margin:0!important;padding:0 12px;font-size:8px}.r52-supplier-master .v30-item-card.r51-existing:before{display:none!important}
.r52-status-wrap{display:inline-flex;flex-wrap:wrap;gap:5px;align-items:center}.r52-alert{display:inline-flex;align-items:center;min-height:25px;padding:4px 8px;border-radius:999px;background:color-mix(in srgb,var(--warning) 15%,var(--card));color:color-mix(in srgb,var(--warning) 80%,var(--text));font-size:7px;font-weight:950}.r52-alert.danger{background:color-mix(in srgb,var(--danger) 12%,var(--card));color:var(--danger)}.r52-alert.info{background:color-mix(in srgb,var(--primary) 10%,var(--card));color:var(--primary)}
.r52-ops-health{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:0 0 12px;padding:11px;border:1px solid var(--line);border-radius:16px;background:var(--card)}.r52-health-title{grid-column:1/-1;display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.r52-health-title strong{font-size:11px}.r52-health-title small{display:block;margin-top:3px;color:var(--muted);font-size:7px}.r52-health-card{padding:10px;border:1px solid var(--line);border-radius:11px;background:var(--soft);cursor:pointer}.r52-health-card b,.r52-health-card span{display:block}.r52-health-card b{font-size:19px}.r52-health-card span{margin-top:3px;color:var(--muted);font-size:7px}.r52-perf-chip{display:inline-flex;gap:6px;align-items:center;padding:6px 8px;border-radius:999px;background:var(--soft);font-size:7px;font-weight:850}.r52-history-more{width:100%;min-height:46px;margin-top:10px}.r52-history-hidden{display:none!important}
@media(max-width:720px){.r52-supplier-master .v30-item-card{grid-template-columns:minmax(0,1fr) 98px 105px;grid-template-areas:'identity qty unit' 'pack pack remove'}.r52-supplier-master .v30-field-grid>.field:nth-child(3){max-width:160px}.r52-ops-health{grid-template-columns:1fr 1fr}.r52-health-title{grid-column:1/-1}.r52-edit-intro{grid-template-columns:1fr}.r52-supplier-master .r51-remove-line{justify-self:stretch}.r52-edit-category>header{position:sticky;top:0;z-index:2}}
@media(max-width:430px){.r52-supplier-master .v30-item-card{grid-template-columns:minmax(0,1fr) 94px;grid-template-areas:'identity qty' 'unit pack' 'remove remove';align-items:center}.r52-supplier-master .v30-field-grid>.field:nth-child(3){max-width:none}.r52-ops-health{grid-template-columns:1fr 1fr}}
`;document.head.append(style)}

function orderForId(id){return(state.cache.orders||[]).find(order=>String(order.id)===String(id))}
function nodeOrderId(node){return node.querySelector?.('[data-order-id]')?.dataset.orderId||node.querySelector?.('[data-open-order]')?.dataset.openOrder||node.dataset?.v18Card||node.querySelector?.('[data-r51-order]')?.dataset.r51Order||''}
function paid(order){return Boolean(order?.paidAt||order?.paid_at||String(order?.paymentStatus||order?.payment_status||order?.financeStatus||'').toLowerCase()==='paid'||String(order?.status||'').toLowerCase()==='closed'||(Number(order?.invoiceCount||0)>0&&order?.outstandingAmount!==undefined&&Number(order.outstandingAmount)<=0))}
function received(order){return order?.publicState==='received'||['received','reconciled','closed'].includes(String(order?.status||''))}
function partial(order){if(String(order?.status||'')==='partially_received')return true;const items=order?.items||[];if(!items.length)return false;const ordered=items.reduce((sum,item)=>sum+Number(item.quantityOrdered||item.quantity_ordered||0),0),got=items.reduce((sum,item)=>sum+Number(item.quantityReceived||item.quantity_received||0),0);return got>0&&got<ordered}
function primaryStatus(order){if(order?.publicState==='editing'||String(order?.status||'')==='draft')return'En edición';if(received(order)&&paid(order))return'Recibido y pagado';if(received(order))return'Recibido';return'Emitido'}
function alerts(order){const result=[];if(partial(order))result.push({label:'Recibido parcialmente',kind:'info'});const delivery=String(order?.deliveryDate||order?.delivery_date||'').slice(0,10);if(order?.publicState!=='editing'&&delivery&&delivery<=today()&&Number(order?.invoiceCount||0)===0)result.push({label:'Atrasado · factura pendiente',kind:'danger'});return result}
function applyStatuses(){
  const map=new Map((state.cache.orders||[]).map(order=>[String(order.id),order]));
  for(const node of $$('.history-order-row,.history-v18-card,.editable-supplier-row,.simple-order-card')){
    const id=nodeOrderId(node),order=map.get(String(id));if(!order)continue;
    const badge=node.querySelector('.simple-state,.history-v18-status');if(badge){badge.textContent=primaryStatus(order);badge.dataset.r52Primary='1'}
    let wrap=node.querySelector('.r52-status-wrap');const issues=alerts(order);if(!issues.length){wrap?.remove();continue}if(!wrap){wrap=document.createElement('div');wrap.className='r52-status-wrap';const identity=node.querySelector('.simple-order-identity,.history-v18-card-head,.editable-supplier-main,.history-title')||node.firstElementChild;identity?.append(wrap)}wrap.innerHTML=issues.map(issue=>`<span class="r52-alert ${issue.kind||''}">${issue.label}</span>`).join('')
  }
}

function regroupEditMaster(root){
  const cards=[...root.querySelectorAll('[data-product]')];if(!cards.length)return;
  const groups=new Map();for(const card of cards){const category=card.querySelector('header small')?.textContent?.trim()||'Sin categoría';if(!groups.has(category))groups.set(category,[]);groups.get(category).push(card)}
  root.innerHTML='';for(const[category,list]of groups){const section=document.createElement('section');section.className='r52-edit-category';section.innerHTML=`<header>${category} · ${list.length}</header><div class="r52-edit-category-list"></div>`;const host=section.querySelector('.r52-edit-category-list');list.forEach(card=>host.append(card));root.append(section)}
}
function findEditingOrder(){const subtitle=$('#modalSubtitle')?.textContent||'';return(state.cache.orders||[]).find(order=>subtitle.includes(order.folio))||null}
function schedulePdfRegeneration(order){
  const originalRevision=Number(order?.revision||0),id=order?.id;if(!id)return;
  let attempts=0;const timer=setInterval(async()=>{attempts++;const modalOpen=$('#modal')?.open;if(modalOpen&&attempts<50)return;if(modalOpen){clearInterval(timer);return}clearInterval(timer);try{const payload=await api(`/api/orders/${encodeURIComponent(id)}`,{fresh:true,persist:true,timeout:12000}),current=payload.order||order;if(Number(current.revision||0)<originalRevision)return;const document=await ensureOrderDocument(current,{force:true});const summary=orderForId(id);if(summary){summary.pdfKey=document.key;summary.pdfName=document.name;summary.revision=current.revision;summary.updatedAt=current.updatedAt||summary.updatedAt}toast('Cambios guardados y PDF actualizado')}catch(error){console.warn('r52_pdf_regeneration_failed',error);toast('El pedido se guardó. El PDF se regenerará al abrirlo o compartirlo.','error')}},300)
}
function enhanceEditOrder(){
  const root=$('#v30EditProducts'),eyebrow=$('#modalEyebrow')?.textContent||'',subtitle=$('#modalSubtitle')?.textContent||'';if(!root||(!eyebrow.includes('PEDIDO')&&!subtitle.includes('BORRADOR-')))return;
  root.classList.add('r52-supplier-master');const key=`${$('#modalTitle')?.textContent}|${subtitle}`;
  if(!root.previousElementSibling?.classList?.contains('r52-edit-intro')){const intro=document.createElement('section');intro.className='r52-edit-intro';intro.innerHTML='<div><strong>Lista maestra del proveedor</strong><small>Solo aparecen productos asociados a este proveedor. Cambia cantidades, formatos o elimina líneas; al guardar se genera nuevamente el PDF con la revisión actual.</small></div><span class="r52-perf-chip">Edición directa · autoguardado</span>';root.before(intro)}
  if(root.dataset.r52Grouped!==String(root.childElementCount)){regroupEditMaster(root);root.dataset.r52Grouped=String(root.querySelectorAll('[data-product]').length)}
  const submit=$('#modalSubmit'),order=findEditingOrder();if(submit){submit.textContent='Guardar y actualizar PDF';if(!submit.dataset.r52Pdf){submit.dataset.r52Pdf='1';submit.addEventListener('click',()=>{const current=findEditingOrder();if(current)schedulePdfRegeneration(current)},{capture:true})}}
  editPreparedKey=key;
}

function operationalHealth(){
  if(state.view!=='operations'||$('#r52OpsHealth'))return;const host=$('#mainContent'),anchor=host?.querySelector('.view-header,.ops-header');if(!host)return;
  const products=state.cache.products||[],suppliers=state.cache.suppliers||[],categories=state.cache.categories||[];
  if(!products.length&&!suppliers.length)return;
  const noCategory=products.filter(p=>p.active!==false&&!p.categoryId&&!p.category_id).length,noSupplier=products.filter(p=>p.active!==false&&!(p.suppliers||[]).length).length,noCenter=products.filter(p=>p.active!==false&&!(p.costCenters||[]).length).length,categoryNoCenter=categories.filter(c=>c.active!==false&&!c.costCenterId&&!c.cost_center_id).length,incompleteSuppliers=suppliers.filter(s=>s.active!==false&&(!s.email||!s.phone||!s.paymentTerms&&!s.payment_terms)).length;
  const recent=networkMetrics.slice(-60),avg=recent.length?Math.round(recent.reduce((sum,m)=>sum+Number(m.duration||0),0)/recent.length):0,slow=recent.filter(m=>Number(m.duration||0)>1500).length,cancelled=recent.filter(m=>String(m.status||'').includes('superseded')||String(m.status||'').includes('timeout')).length;
  const panel=document.createElement('section');panel.id='r52OpsHealth';panel.className='r52-ops-health';panel.innerHTML=`<div class="r52-health-title"><div><strong>Salud operativa</strong><small>Excepciones que pueden provocar listas incompletas, pedidos lentos o errores de abastecimiento.</small></div><span class="r52-perf-chip">API ${avg||'—'} ms · ${slow} lentas · ${cancelled} canceladas</span></div><button class="r52-health-card" data-r52-health="catalog"><b>${noCategory}</b><span>Productos sin categoría</span></button><button class="r52-health-card" data-r52-health="catalog"><b>${noSupplier}</b><span>Productos sin proveedor</span></button><button class="r52-health-card" data-r52-health="catalog"><b>${noCenter}</b><span>Productos sin centro</span></button><button class="r52-health-card" data-r52-health="operations"><b>${categoryNoCenter}</b><span>Categorías sin centro</span></button><button class="r52-health-card" data-r52-health="suppliers"><b>${incompleteSuppliers}</b><span>Proveedores incompletos</span></button>`;
  (anchor||host.firstElementChild)?.insertAdjacentElement('afterend',panel);panel.querySelectorAll('[data-r52-health]').forEach(button=>button.onclick=()=>openRoute(button.dataset.r52Health,button.dataset.r52Health==='operations'?'home':'').catch(error=>toast(error.message,'error')))
}

function virtualizeHistory(){
  if(state.view!=='history')return;const feed=$('#historyFeed')||$('.history-v18-list');if(!feed)return;const rows=[...feed.querySelectorAll(':scope > .history-row,:scope > .history-v18-card')];if(rows.length<=70)return;let shown=Number(feed.dataset.r52Shown||70);rows.forEach((row,index)=>row.classList.toggle('r52-history-hidden',index>=shown));let button=$('#r52HistoryMore');if(!button){button=document.createElement('button');button.id='r52HistoryMore';button.className='btn r52-history-more';button.type='button';feed.after(button);button.onclick=()=>{shown+=70;feed.dataset.r52Shown=String(shown);virtualizeHistory()}}button.textContent=shown>=rows.length?'Todos los pedidos visibles':`Mostrar ${Math.min(70,rows.length-shown)} más`;button.disabled=shown>=rows.length
}

function applyBootstrap(payload){const cache=payload?.cache||{};for(const[path,value]of Object.entries(cache)){if(value)seedResponseCache(path,value)}if(cache['/api/orders']?.orders)state.cache.orders=cache['/api/orders'].orders;if(cache['/api/invoices']?.invoices)state.cache.invoices=cache['/api/invoices'].invoices;if(cache['/api/audit']?.events)state.cache.audit=cache['/api/audit'].events}
async function primeHistory(){if(!state.token)return null;if(historyPrimePromise)return historyPrimePromise;if(Date.now()-lastPrimeAt<4*60*1000)return null;historyPrimePromise=api('/api/screen-bootstrap-v52?screen=history',{persist:true,ttl:5*60*1000,timeout:12000}).then(payload=>{lastPrimeAt=Date.now();applyBootstrap(payload);return payload}).catch(error=>{if(!error?.silent)console.warn('r52_history_prime_failed',error)}).finally(()=>historyPrimePromise=null);return historyPrimePromise}
function schedulePrime(){const run=()=>primeHistory();if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1800});else setTimeout(run,500)}

function enhance(){applyStatuses();enhanceEditOrder();operationalHealth();virtualizeHistory()}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance()})}
export function initializeR52Operations(){if(initialized)return;initialized=true;installRequestShield();injectStyles();window.addEventListener('nuvasto:api-metric',event=>{networkMetrics.push(event.detail||{});if(networkMetrics.length>200)networkMetrics.splice(0,networkMetrics.length-200)});window.addEventListener('pedidos:view-rendered',event=>{editPreparedKey='';schedule();if(event.detail?.view==='dashboard'||state.view==='dashboard')schedulePrime()});document.addEventListener('pointerdown',event=>{const target=event.target.closest?.('[data-experience-view="history"],[data-view="history"],[data-experience-view="receiving"]');if(target)primeHistory().catch(()=>{})},{capture:true,passive:true});new MutationObserver(records=>{if(records.some(record=>record.addedNodes.length))schedule()}).observe(document.body,{subtree:true,childList:true});setTimeout(()=>{schedule();if(state.token)schedulePrime()},450)}

initializeR52Operations();
