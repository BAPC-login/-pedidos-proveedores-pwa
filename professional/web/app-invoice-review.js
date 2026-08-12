import {$,$$,money,state,toast,clearResponseCache} from './app-core.js';
import {closeModal} from './app-modal.js';
import {openRoute} from './app-router-v14.js';

let initialized=false,scheduled=false,pendingSaved=null;
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const parseInteger=value=>Number(String(value??'').replace(/[^0-9-]/g,''))||0;
const menuSvg='<svg class="v34-icon v36-menu-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';

function injectStyles(){
  if($('#nuvastoV36Styles'))return;
  const style=document.createElement('style');style.id='nuvastoV36Styles';style.textContent=`
    .bottom-create{display:grid!important;place-items:center!important;padding:0!important;line-height:1!important;text-align:center!important}
    .bottom-create>.v34-icon{display:block!important;width:30px!important;height:30px!important;margin:0!important;transform:none!important;translate:none!important}
    .bottom-item[data-view="settings"]>span{display:grid!important;place-items:center!important}.v36-menu-icon{width:22px!important;height:22px!important}
    .v36-review-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 12px}.v36-review-summary article{min-width:0;padding:11px 12px;border:1px solid var(--line);border-radius:13px;background:var(--soft)}
    .v36-review-summary strong,.v36-review-summary small{display:block}.v36-review-summary strong{font-size:17px;line-height:1.05;overflow-wrap:anywhere}.v36-review-summary small{margin-top:5px;color:var(--muted);font-size:8px;text-transform:uppercase;letter-spacing:.08em}
    .v36-money-field{position:relative}.v36-money-field>input[type=hidden]+.v36-money-input{width:100%;font-variant-numeric:tabular-nums}.v36-money-input{text-align:left!important}.v36-money-input:disabled{opacity:.7;background:var(--soft)!important}
    .v36-saving-note{display:grid;gap:4px;margin:0 0 10px;padding:11px 13px;border:1px solid color-mix(in srgb,var(--success) 35%,var(--line));border-radius:13px;background:color-mix(in srgb,var(--success) 8%,var(--card))}.v36-saving-note strong{font-size:11px}.v36-saving-note small{color:var(--muted);font-size:8px;line-height:1.4}
    #v26InvoiceSummary.v36-legacy-summary-sentinel{display:none!important}
    @media(max-width:520px){.v36-review-summary{grid-template-columns:1fr 1fr}.v36-review-summary article:last-child{grid-column:1/-1}}
  `;document.head.append(style);
}

function isInvoiceReview(){const title=normalize($('#modalTitle')?.textContent);return Boolean($('#modal')?.open&&title.includes('linea')&&title.includes('confirmar')&&$('[data-invoice-line]'))}
function metricValue(label){const wanted=normalize(label);for(const small of $$('#modalBody small')){if(normalize(small.textContent)!==wanted)continue;const strong=small.closest('article,div')?.querySelector('strong');if(strong)return strong.textContent?.trim()||''}return''}
function legacySummarySentinel(body){
  let sentinel=body.querySelector('#v26InvoiceSummary');
  if(!sentinel){sentinel=document.createElement('span');sentinel.id='v26InvoiceSummary';body.append(sentinel)}
  if(!sentinel.classList.contains('v36-legacy-summary-sentinel')){sentinel.className='v36-legacy-summary-sentinel';sentinel.hidden=true;sentinel.replaceChildren()}
}
function removeLegacySummaries(body){
  legacySummarySentinel(body);
  body.querySelectorAll('.v26-invoice-summary:not(#v26InvoiceSummary),.v30-metrics,.v19-invoice-summary').forEach(node=>node.remove());
  [...body.children].forEach(node=>{
    if(node.id==='v26InvoiceSummary'||node.id==='v32PolicySummary'||node.matches('.v30-inline-notice,.v30-item-list,.v30-field-grid,.v32-policy-summary,.v36-review-summary'))return;
    const text=normalize(node.textContent),duplicate=(text.includes('numero de documento')&&text.includes('total documento'))||(text.includes('lineas leidas')&&text.includes('productos vinculados'));
    if(duplicate&&node.querySelectorAll('article,strong,small').length>=3)node.remove();
  });
}
function canonicalSummary(body,processing){
  const rows=$$('[data-invoice-line]'),linked=rows.filter(row=>row.querySelector('[name=productId]')?.value).length;
  let section=body.querySelector('.v36-review-summary');if(!section){section=document.createElement('section');section.className='v36-review-summary';section.setAttribute('aria-label','Resumen del cotejo')}
  const desired=`<article><strong>${rows.length}</strong><small>Líneas leídas</small></article><article><strong>${linked}/${rows.length}</strong><small>Productos vinculados</small></article><article><strong>${processing||'—'}</strong><small>Procesamiento</small></article>`;
  if(section.innerHTML!==desired)section.innerHTML=desired;
  const policy=body.querySelector('#v32PolicySummary');if(policy){if(policy.nextElementSibling!==section)policy.insertAdjacentElement('afterend',section)}else if(body.firstElementChild!==section)body.prepend(section);
}
function enhanceMoneyInput(raw){
  if(!raw||raw.dataset.v36Money)return;raw.dataset.v36Money='1';
  const display=document.createElement('input');display.type='text';display.inputMode='numeric';display.autocomplete='off';display.className='v36-money-input';display.setAttribute('aria-label',`${raw.closest('.field')?.querySelector('span')?.textContent||'Monto'} en pesos chilenos`);
  const sync=()=>{if(document.activeElement!==display)display.value=money(parseInteger(raw.value));display.disabled=raw.disabled};display.value=money(parseInteger(raw.value));raw.type='hidden';raw.insertAdjacentElement('afterend',display);raw.closest('.field')?.classList.add('v36-money-field');
  display.addEventListener('focus',()=>{display.value=String(parseInteger(raw.value));requestAnimationFrame(()=>display.select())});display.addEventListener('input',()=>{raw.value=String(parseInteger(display.value));raw.dispatchEvent(new Event('input',{bubbles:true}))});display.addEventListener('blur',sync);raw.addEventListener('input',sync);
  new MutationObserver(sync).observe(raw,{attributes:true,attributeFilter:['disabled']});raw.closest('[data-invoice-line]')?.querySelector('[name=isFree]')?.addEventListener('change',()=>setTimeout(sync,0));
}
function normalizeReview(){if(!isInvoiceReview())return;const body=$('#modalBody');if(!body)return;const processing=metricValue('Procesamiento');removeLegacySummaries(body);canonicalSummary(body,processing);body.querySelectorAll('input[name="net"],input[name="vat"],input[name="additionalTax"],input[name="total"],input[name="grossLineTotal"]').forEach(enhanceMoneyInput)}
function fixMobileIcons(){const more=$('.bottom-item[data-view="settings"]>span');if(more&&more.dataset.v36Icon!=='menu'){more.innerHTML=menuSvg;more.dataset.v36Icon='menu';more.dataset.v34Icon='settings'}const create=$('#mobileCreate');if(create){create.setAttribute('aria-label','Nuevo pedido');create.style.removeProperty('text-indent')}}
function requestInfo(input,init={}){let pathname='';try{pathname=new URL(typeof input==='string'?input:input.url,location.href).pathname}catch{}const method=String(init.method||(typeof input!=='string'?input.method:'GET')||'GET').toUpperCase();let body={};if(method==='POST'&&pathname==='/api/invoices'&&typeof init.body==='string'){try{body=JSON.parse(init.body)}catch{}}return{pathname,method,body}}
function installSaveConfirmation(){
  const upstream=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{const info=requestInfo(input,init),response=await upstream(input,init);if(info.method==='POST'&&info.pathname==='/api/invoices'&&response.ok){const payload=await response.clone().json().catch(()=>({})),invoice=payload.invoice||payload.result||payload;pendingSaved={invoiceId:invoice?.id||'',invoiceNumber:invoice?.invoiceNumber||info.body.invoiceNumber||'',orderId:info.body.orderIds?.[0]||'',createdAt:Date.now()};state.cache.dashboard=null;state.cache.orders=[];state.cache.invoices=[];clearResponseCache();const body=$('#modalBody');if(body&&!body.querySelector('.v36-saving-note')){const note=document.createElement('section');note.className='v36-saving-note';note.innerHTML='<strong>Factura registrada</strong><small>Confirmando el vínculo con el pedido y actualizando el historial…</small>';body.prepend(note)}setTimeout(()=>{if(pendingSaved&&isInvoiceReview())closeModal('saved')},1400)}return response};
  $('#modal')?.addEventListener('close',async()=>{if(!pendingSaved)return;const saved=pendingSaved;pendingSaved=null;try{await openRoute('history','',{replace:true})}catch(error){console.warn('v36_invoice_history_route_failed',error)}toast(`Factura N° ${saved.invoiceNumber||'registrada'} guardada y vinculada`)});
}
function enhanceAll(){fixMobileIcons();normalizeReview()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhanceAll()})}
export function initializeInvoiceReviewV36(){if(initialized)return;initialized=true;injectStyles();installSaveConfirmation();document.addEventListener('pedidos:view-rendered',schedule);new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['disabled']});schedule()}
