import {$,$$,api,esc,state,toast} from './app-core.js';
import {openModal} from './app-modal.js';
import {openRoute} from './app-router-v14.js';

let initialized=false,scheduled=false;
const iconPaths={
  home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9 20v-6h6v6"/>',
  orders:'<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  history:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2M4 6v4h4"/>',
  invoice:'<path d="M6 3h9l3 3v15H6z"/><path d="M15 3v4h4M9 11h6M9 15h6"/>',
  products:'<path d="m4 8 8-4 8 4-8 4z"/><path d="m4 8 8 4 8-4v8l-8 4-8-4z"/>',
  supplier:'<path d="M4 20V8l8-4 8 4v12"/><path d="M8 20v-6h8v6M8 9h.01M12 9h.01M16 9h.01"/>',
  users:'<circle cx="9" cy="8" r="3"/><path d="M3.5 20v-2.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.8M16 14a4.5 4.5 0 0 1 4.5 4.5V20"/>',
  audit:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/>',
  logout:'<path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  theme:'<path d="M12 3a9 9 0 1 0 9 9c-5 2-11-3-9-9z"/>',
  back:'<path d="m15 18-6-6 6-6M9 12h11"/>',
  close:'<path d="m7 7 10 10M17 7 7 17"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v6h14v-6"/>',
  sliders:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  export:'<path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  retry:'<path d="M20 7v5h-5"/><path d="M18.4 17A8 8 0 1 1 20 12"/>'
};
const svg=name=>`<svg class="v34-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]||iconPaths.products}</svg>`;

function injectStyles(){
  if($('#nuvastoV34Styles'))return;
  const style=document.createElement('style');style.id='nuvastoV34Styles';style.textContent=`
:root{--v34-radius:16px}html[data-theme=dark]{color-scheme:dark}.v34-icon{width:21px;height:21px;display:block;flex:0 0 auto}.nav-icon .v34-icon,.bottom-item .v34-icon{margin:auto}.bottom-create .v34-icon{width:28px;height:28px}.v34-action-icon{display:inline-grid;place-items:center}.v34-action-icon .v34-icon{width:18px;height:18px}
.route-loading #mainContent{opacity:.55;transform:translateY(3px);transition:opacity .16s ease,transform .16s ease}#mainContent{transition:opacity .16s ease,transform .16s ease}.modal-frame{transition:opacity .18s ease,transform .18s ease}.modal-replacing .modal-frame{opacity:.7;transform:translateY(4px)}
.v34-invoice-modal .modal-head{padding:18px 20px}.v34-invoice-modal .modal-head h2{font-size:clamp(25px,4vw,32px);line-height:1.08;letter-spacing:-.035em}.v34-invoice-modal .modal-head p{max-width:660px;font-size:13px;line-height:1.5}.v34-invoice-modal .modal-body{display:grid;align-content:start;gap:12px}.v34-invoice-modal .v30-field-grid{gap:12px}.v34-invoice-modal .v34-linked-order{padding:14px 16px;border-color:color-mix(in srgb,var(--primary) 24%,var(--line));background:color-mix(in srgb,var(--primary) 4%,var(--card))}.v34-linked-order h3{font-size:21px!important;line-height:1.15}.v34-linked-order p{font-size:12px!important}.v34-reading-note{padding:12px 14px!important;background:var(--soft)!important}.v34-reading-note strong{font-size:14px}.v34-reading-note p{font-size:12px!important;line-height:1.5!important}
.v34-file-field{position:relative;display:grid!important;gap:8px;padding:0!important;border:0!important;background:transparent!important}.v34-file-field>span{font-size:13px!important;font-weight:800;color:var(--text)!important}.v34-file-field input[type=file]{position:absolute!important;inset:28px 0 0!important;width:100%!important;height:86px!important;min-height:0!important;opacity:0!important;cursor:pointer!important;z-index:3}.v34-upload-zone{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:86px;padding:13px 15px;border:1.5px dashed color-mix(in srgb,var(--primary) 38%,var(--line));border-radius:16px;background:color-mix(in srgb,var(--primary) 4%,var(--card));transition:border-color .15s ease,background .15s ease}.v34-upload-zone:hover{border-color:var(--primary);background:color-mix(in srgb,var(--primary) 7%,var(--card))}.v34-upload-mark{display:grid;place-items:center;width:44px;height:44px;border-radius:13px;background:color-mix(in srgb,var(--primary) 12%,var(--card));color:var(--primary)}.v34-upload-zone strong,.v34-upload-zone small{display:block}.v34-upload-zone strong{font-size:14px}.v34-upload-zone small{margin-top:4px;color:var(--muted);font-size:11px}.v34-upload-zone b{font-size:12px;color:var(--primary)}
#v32InvoiceFilePreview:empty{display:none}.v34-file-preview{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 12px;border:1px solid var(--line);border-radius:15px;background:var(--soft)}.v34-file-thumb{display:grid;place-items:center;width:58px;height:58px;overflow:hidden;border:1px solid var(--line);border-radius:12px;background:var(--card);font-size:11px;font-weight:900}.v34-file-thumb img{width:100%;height:100%;object-fit:cover}.v34-file-copy{min-width:0}.v34-file-copy strong,.v34-file-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.v34-file-copy strong{font-size:14px}.v34-file-copy small{margin-top:4px;color:var(--muted);font-size:11px}.v34-file-change{min-height:42px!important;padding:0 13px!important}
.v34-invoice-modal .v30-inline-notice.error{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:center;padding:13px 14px;border-color:color-mix(in srgb,var(--danger) 45%,var(--line));background:color-mix(in srgb,var(--danger) 8%,var(--card))}.v34-invoice-modal .v30-inline-notice.error strong,.v34-invoice-modal .v30-inline-notice.error p{grid-column:1}.v34-invoice-modal .v30-inline-notice.error strong{font-size:13px}.v34-invoice-modal .v30-inline-notice.error p{font-size:12px;line-height:1.45}.v34-notice-actions{grid-column:2;grid-row:1/3}.v34-notice-actions .btn{min-height:42px}.v34-notice-hint{grid-column:1/-1!important;margin-top:4px!important;font-size:10px!important}
.v34-secondary-kpis{margin-top:12px;border:1px solid var(--line);border-radius:15px;background:var(--card);overflow:hidden}.v34-secondary-kpis summary{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 15px;cursor:pointer;font-size:12px;font-weight:850;list-style:none}.v34-secondary-kpis summary::-webkit-details-marker{display:none}.v34-secondary-kpis summary:after{content:'+';font-size:20px;color:var(--muted)}.v34-secondary-kpis[open] summary:after{content:'−'}.v34-secondary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:0 12px 12px}.v34-secondary-grid .heavy-kpi{min-height:95px}.heavy-kpi[data-v34-route]{cursor:pointer;transition:transform .15s ease,border-color .15s ease}.heavy-kpi[data-v34-route]:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--primary) 40%,var(--line))}.v34-layout-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.v34-layout-group{display:grid;gap:8px;padding:13px;border:1px solid var(--line);border-radius:14px;background:var(--soft)}.v34-layout-group h3{margin:0;font-size:14px}.v34-layout-group p{margin:0 0 4px;color:var(--muted);font-size:11px}.v34-layout-group .check-card{background:var(--card)}
.dashboard-command-actions .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px}.dashboard-command-actions #v34CustomizeDashboard{order:3}.dashboard-command-actions [data-view-link=enterprise]{order:4}
html[data-theme=dark] .v34-upload-zone{background:color-mix(in srgb,var(--primary) 7%,var(--card));border-color:color-mix(in srgb,var(--primary) 48%,var(--line))}html[data-theme=dark] .v34-file-preview,html[data-theme=dark] .v34-reading-note{background:color-mix(in srgb,var(--card) 88%,#000)}html[data-theme=dark] .v34-invoice-modal .modal-foot,html[data-theme=dark] .v34-invoice-modal .modal-head{background:var(--card)}
@media(max-width:900px){.topbar{min-height:0!important;padding:calc(8px + env(safe-area-inset-top)) 14px 8px!important;gap:7px!important}.mobile-workspace-button .nuvasto-wordmark-copy,.mobile-workspace-button>span{max-width:150px}.global-search{height:40px!important}.content{padding-top:13px!important}.v34-secondary-grid{grid-template-columns:1fr 1fr}.v34-secondary-kpis:not([open]) .v34-secondary-grid{display:none}.v34-invoice-modal .modal-head{padding:calc(12px + env(safe-area-inset-top)) 16px 12px!important}.v34-invoice-modal .modal-head h2{font-size:27px!important}.v34-invoice-modal .modal-head p{font-size:12px!important}.v34-invoice-modal .modal-body{padding:14px 16px!important;gap:10px!important}.v34-invoice-modal .modal-foot{padding:10px 16px max(10px,env(safe-area-inset-bottom))!important}.v34-invoice-modal .modal-foot .btn{min-height:50px}.v34-invoice-modal .v34-linked-order{padding:12px 14px}.v34-linked-order h3{font-size:19px!important}.v34-layout-grid{grid-template-columns:1fr}}
@media(max-width:520px){.v34-upload-zone{grid-template-columns:42px minmax(0,1fr)}.v34-upload-zone>b{display:none}.v34-file-preview{grid-template-columns:52px minmax(0,1fr)}.v34-file-thumb{width:52px;height:52px}.v34-file-change{grid-column:1/-1;width:100%}.v34-invoice-modal .v30-inline-notice.error{grid-template-columns:1fr}.v34-notice-actions{grid-column:1;grid-row:auto}.v34-notice-actions .btn{width:100%;margin-top:7px}.v34-secondary-grid{grid-template-columns:1fr 1fr}.dashboard-command-actions{grid-template-columns:1fr 1fr!important}}
@media(prefers-reduced-motion:reduce){#mainContent,.modal-frame,.heavy-kpi,.v34-upload-zone{transition:none!important}}
`;document.head.append(style);
}

function replaceIcon(node,name){if(!node||node.dataset.v34Icon===name)return;node.innerHTML=svg(name);node.dataset.v34Icon=name}
function decorateButton(button,name,label){if(!button)return;button.innerHTML=`<span class="v34-action-icon">${svg(name)}</span><span>${esc(label)}</span>`;button.dataset.v34Decorated='1'}

function enhanceIcons(){
  const nav={dashboard:'home',orders:'orders',history:'history',invoices:'invoice',catalog:'products',suppliers:'supplier',team:'users',audit:'audit',settings:'settings'};
  $$('.nav-item[data-view]').forEach(button=>replaceIcon(button.querySelector('.nav-icon'),nav[button.dataset.view]||'products'));
  $$('.bottom-item[data-view]').forEach(button=>replaceIcon(button.querySelector(':scope>span'),nav[button.dataset.view]||'products'));
  replaceIcon($('#mobileCreate'),'plus');replaceIcon($('#themeButton'),'theme');replaceIcon($('#routeBack'),'back');replaceIcon($('#modalClose'),'close');
  const logout=$('#logoutButton .nav-icon');replaceIcon(logout,'logout');
  const newOrder=$('[data-action="new-order"]');if(newOrder&&!newOrder.dataset.v34Decorated)decorateButton(newOrder,'plus','Pedido');
  const invoice=$('[data-action="analyze-invoice"]');if(invoice&&!invoice.dataset.v34Decorated)decorateButton(invoice,'invoice','Factura');
  const enterprise=$('[data-view-link="enterprise"]');if(enterprise&&!enterprise.dataset.v34Decorated)decorateButton(enterprise,'export','Exportar');
}

function formatBytes(value){const size=Number(value||0);return size<1024**2?`${Math.max(.1,size/1024).toFixed(0)} KB`:`${(size/1024**2).toFixed(2)} MB`}
function renderFilePreview(input,target){
  const file=input.files?.[0];if(!file||!target){if(target)target.innerHTML='';return}
  const previous=target.dataset.objectUrl;if(previous)URL.revokeObjectURL(previous);
  const image=String(file.type||'').startsWith('image/'),url=image?URL.createObjectURL(file):'';if(url)target.dataset.objectUrl=url;
  target.innerHTML=`<article class="v34-file-preview"><div class="v34-file-thumb">${image?`<img src="${url}" alt="Vista previa de ${esc(file.name)}">`:'PDF'}</div><div class="v34-file-copy"><strong>${esc(file.name)}</strong><small>${formatBytes(file.size)} · ${esc(file.type||'archivo')}</small></div><button class="btn v34-file-change" type="button">Cambiar archivo</button></article>`;
  target.querySelector('.v34-file-change').onclick=event=>{event.preventDefault();event.stopPropagation();input.click()};
}

function enhanceInvoiceModal(){
  const title=$('#modalTitle'),frame=$('#modalFrame');if(!title||!frame||!/Adjuntar documento al pedido/i.test(title.textContent||'')){frame?.classList.remove('v34-invoice-modal');return}
  frame.classList.add('v34-invoice-modal');
  const body=$('#modalBody'),input=body?.querySelector('input[type=file][name=file]');if(!input)return;
  const field=input.closest('.field');if(field&&!field.classList.contains('v34-file-field')){
    field.classList.add('v34-file-field');input.dataset.v32Preview='1';
    const zone=document.createElement('div');zone.className='v34-upload-zone';zone.innerHTML=`<span class="v34-upload-mark">${svg('upload')}</span><span><strong>Seleccionar documento</strong><small>PDF o fotografía completa, nítida y tomada de frente</small></span><b>Elegir</b>`;input.insertAdjacentElement('beforebegin',zone);
  }
  let target=$('#v32InvoiceFilePreview');if(!target){target=document.createElement('div');target.id='v32InvoiceFilePreview';field?.insertAdjacentElement('afterend',target)}
  if(!input.dataset.v34Preview){input.dataset.v34Preview='1';input.addEventListener('change',()=>renderFilePreview(input,target))}
  if(input.files?.[0])renderFilePreview(input,target);
  body?.querySelectorAll('.v30-section').forEach(section=>{if(section.querySelector('.eyebrow')?.textContent.includes('PEDIDO VINCULADO'))section.classList.add('v34-linked-order');else if(/Lectura vinculada/i.test(section.textContent||''))section.classList.add('v34-reading-note')});
  const notice=$('#v30InlineNotice.error');if(notice&&!notice.querySelector('.v34-notice-actions')){
    const actions=document.createElement('div');actions.className='v34-notice-actions';actions.innerHTML=`<button class="btn" type="button">${svg('retry')}<span>Reintentar</span></button>`;actions.querySelector('button').onclick=()=>$('#modalSubmit')?.click();notice.append(actions);
    const hint=document.createElement('p');hint.className='v34-notice-hint';hint.textContent='El archivo sigue seleccionado y el pedido permanece vinculado.';notice.append(hint);
  }
}

const KPI_LABELS={spend:'Gasto real',orders:'Pedidos',pending:'Pendientes',average:'Promedio factura',suppliers:'Proveedores',products:'Productos',documents:'Documentos',alerts:'Alertas'};
const CHART_LABELS={'spend-line':'Evolución de compras','status-donut':'Estado de pedidos','orders-bars':'Pedidos por mes',suppliers:'Principales proveedores',categories:'Gasto por categoría',alerts:'Alertas y oportunidades'};

async function openDashboardLayout(){
  let current={visible:Object.keys(KPI_LABELS),charts:Object.keys(CHART_LABELS)};
  try{const response=await api('/api/dashboard/layout',{fresh:true,timeout:15000});if(response.layout)current={...current,...response.layout}}catch{}
  const checks=(items,name,selected)=>Object.entries(items).map(([id,label])=>`<label class="check-card"><input type="checkbox" name="${name}" value="${esc(id)}" ${selected.includes(id)?'checked':''}><span><strong>${esc(label)}</strong><small>${name==='visible'?'Indicador':'Gráfico'}</small></span></label>`).join('');
  openModal({eyebrow:'PERSONALIZAR INICIO',title:'Indicadores del resumen',subtitle:'Elige qué información aparece y en qué nivel de detalle.',size:'large',submitLabel:'Guardar diseño',body:`<div class="v34-layout-grid"><section class="v34-layout-group"><h3>Indicadores</h3><p>Los cuatro primeros seleccionados se muestran como principales.</p>${checks(KPI_LABELS,'visible',current.visible||[])}</section><section class="v34-layout-group"><h3>Gráficos</h3><p>Activa solo los análisis que necesitas consultar.</p>${checks(CHART_LABELS,'charts',current.charts||[])}</section></div>`,onSubmit:async form=>{
    const visible=form.getAll('visible').map(String),charts=form.getAll('charts').map(String);if(!visible.length)throw new Error('Selecciona al menos un indicador.');
    await api('/api/dashboard/layout',{method:'PUT',json:{layout:{visible,charts}},timeout:15000});toast('Resumen personalizado');await openRoute('dashboard','',{replace:true});
  }});
}

function organizeDashboard(){
  if(state.view!=='dashboard')return;
  const command=$('.dashboard-command-actions');if(command&&!$('#v34CustomizeDashboard')){
    const button=document.createElement('button');button.id='v34CustomizeDashboard';button.className='btn';button.type='button';button.innerHTML=`<span class="v34-action-icon">${svg('sliders')}</span><span>Indicadores</span>`;button.onclick=openDashboardLayout;command.append(button);
  }
  const kpis=$('.dashboard-kpis');if(!kpis||kpis.dataset.v34Organized)return;kpis.dataset.v34Organized='1';
  const cards=[...kpis.children],secondary=cards.slice(4);if(secondary.length){
    const details=document.createElement('details');details.className='v34-secondary-kpis';details.open=matchMedia('(min-width:901px)').matches;details.innerHTML='<summary>Indicadores secundarios</summary><div class="v34-secondary-grid"></div>';const grid=details.querySelector('.v34-secondary-grid');secondary.forEach(card=>grid.append(card));
    const firstChart=$('.dashboard-grid');(firstChart||kpis).insertAdjacentElement('afterend',details);
  }
  const routes={documents:'documents',products:'catalog',suppliers:'suppliers',orders:'orders',pending:'orders',alerts:'history'};
  $$('.heavy-kpi[data-dashboard-kpi]').forEach(card=>{const route=routes[card.dataset.dashboardKpi];if(!route)return;card.dataset.v34Route=route;card.tabIndex=0;card.setAttribute('role','button');card.onclick=()=>openRoute(route);card.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();openRoute(route)}}});
  enhanceIcons();
}

function enhanceAll(){enhanceIcons();enhanceInvoiceModal();organizeDashboard()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhanceAll()})}

export function initializePolishV34(){
  if(initialized)return;initialized=true;injectStyles();document.addEventListener('pedidos:view-rendered',schedule);new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});window.addEventListener('resize',schedule,{passive:true});schedule();
}
