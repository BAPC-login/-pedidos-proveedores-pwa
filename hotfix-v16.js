(function(root){
  'use strict';
  if(root.__PEDIDOS_HOTFIX_V16__)return;
  root.__PEDIDOS_HOTFIX_V16__=true;

  const State=root.PedidosState;
  const Orders=root.PedidosOrders;
  const DB=root.PedidosDB;
  const $=selector=>document.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[character]));
  const formatDate=value=>{try{return new Date(value).toLocaleDateString('es-CL')}catch{return'—'}};
  let previewRevision=0;

  function profile(){return State?.value?.profile||{}}
  function providerName(id,fallback=''){return State?.provider?.(id)?.name||fallback||'Proveedor'}
  function statusText(value){return value==='complete'?'Completo':value==='partial'?'Parcial':'Pendiente'}

  function syncAlignmentInputs(){
    const current=profile();
    const horizontal=$('#logoAlignX');
    const vertical=$('#logoAlignY');
    if(horizontal)horizontal.value=current.logoAlignX||'center';
    if(vertical)vertical.value=current.logoAlignY||'center';
  }

  async function renderHeaderPreview(){
    const container=$('#headerPreview');
    if(!container||!DB?.assetDataUrl)return;
    const revision=++previewRevision;
    const current=profile();
    const [logo1,logo2]=await Promise.all([DB.assetDataUrl('profile:logo1'),DB.assetDataUrl('profile:logo2')]);
    if(revision!==previewRevision)return;
    const justify={left:'flex-start',center:'center',right:'flex-end'}[current.logoAlignX||'center'];
    const align={top:'flex-start',center:'center',bottom:'flex-end'}[current.logoAlignY||'center'];
    const logos=[logo1&&`<img src="${logo1}" alt="Logo principal" style="max-width:${Number(current.logoSize)||42}mm;max-height:76px;object-fit:contain">`,logo2&&`<img src="${logo2}" alt="Logo secundario" style="max-width:${Number(current.logo2Size)||28}mm;max-height:58px;object-fit:contain">`].filter(Boolean).join('');
    const logoBox=`<div class="preview-logo-area" style="display:flex;gap:9px;justify-content:${justify};align-items:${align};min-height:105px;padding:10px">${logos||'<span style="color:#667085;font-size:12px">Sin logos</span>'}</div>`;
    const info=`<table style="width:100%;border-collapse:collapse;font-size:10px"><tr><th style="border:1px solid #222;text-align:left">RAZÓN SOCIAL</th><td style="border:1px solid #222">${esc(current.companyName||'')}</td></tr><tr><th style="border:1px solid #222;text-align:left">RUT</th><td style="border:1px solid #222">${esc(current.rut||'')}</td></tr><tr><th style="border:1px solid #222;text-align:left">DIRECCIÓN</th><td style="border:1px solid #222">${esc(current.address||'')}</td></tr><tr><th style="border:1px solid #222;text-align:left">LOCAL</th><td style="border:1px solid #222">${esc(current.location||'')}</td></tr></table>`;
    let header;
    if(current.logoPosition==='top')header=`<div style="border:1px solid #222;background:#fff;color:#111">${logoBox}${info}</div>`;
    else if(current.logoPosition==='bottom')header=`<div style="border:1px solid #222;background:#fff;color:#111">${info}${logoBox}</div>`;
    else if(current.logoPosition==='right')header=`<div style="border:1px solid #222;background:#fff;color:#111;display:grid;grid-template-columns:minmax(0,1fr) 145px;align-items:stretch">${info}${logoBox}</div>`;
    else header=`<div style="border:1px solid #222;background:#fff;color:#111;display:grid;grid-template-columns:145px minmax(0,1fr);align-items:stretch">${logoBox}${info}</div>`;
    const color=current.tableHeaderColor||'#48484c';
    container.innerHTML=`${header}<div style="background:${color};color:#fff;padding:9px 12px;font-weight:800;margin-top:8px;border-radius:8px">DESCRIPCIÓN　 CANTIDAD　 UNIDAD</div>`;
  }

  function saveAlignment(){
    const horizontal=$('#logoAlignX');
    const vertical=$('#logoAlignY');
    if(!horizontal||!vertical)return;
    profile().logoAlignX=horizontal.value||'center';
    profile().logoAlignY=vertical.value||'center';
    State.persist();
    renderHeaderPreview();
  }

  function providerRowsFor(order){
    const ids=order.providerIds?.length?order.providerIds:[...new Set((order.rows||[]).map(row=>row.providerId).filter(Boolean))];
    return ids.map(id=>({
      id,
      name:providerName(id,(order.rows||[]).find(row=>row.providerId===id)?.providerName),
      count:(order.rows||[]).filter(row=>row.providerId===id).length
    })).sort((a,b)=>a.name.localeCompare(b.name,'es'));
  }

  async function renderHistoryFallback(){
    const container=$('#historyList');
    if(!container||$('#historySearch')?.value||$('#historyStatus')?.value)return;
    const orders=await Orders.list();
    if(!orders.length){container.innerHTML='<div class="card empty">No hay pedidos guardados.</div>';return}
    if(container.querySelector('.order-card'))return;
    container.innerHTML=orders.map(order=>{
      const providers=providerRowsFor(order).map(provider=>`<div class="provider-order-row"><div><b>${esc(provider.name)}</b><small>${provider.count} ítems</small></div><div class="provider-order-actions"><button class="btn small" data-history-edit="${esc(order.folio)}" data-provider="${esc(provider.id)}">Editar</button><button class="btn small" data-history-reception="${esc(order.folio)}" data-provider="${esc(provider.id)}">Recepción</button><button class="btn small" data-history-pdf="${esc(order.folio)}" data-provider="${esc(provider.id)}">PDF</button></div></div>`).join('');
      return`<article class="card order-card"><div class="order-top"><div><div class="folio">${esc(order.folio)}</div><div>${formatDate(order.createdAt)} · ${order.totalItems||order.rows?.length||0} productos</div></div><span class="status ${esc(order.status||'pending')}">${statusText(order.status)}</span></div><div class="provider-order-list">${providers||'<div class="muted">Sin proveedores</div>'}</div><div class="manage-actions"><button class="btn small" data-history-add-provider="${esc(order.folio)}">Agregar proveedor</button><button class="btn small" data-history-load="${esc(order.folio)}">Cargar como pedido actual</button><button class="btn small danger" data-history-delete="${esc(order.folio)}">Eliminar pedido</button></div></article>`;
    }).join('');
  }

  async function guaranteeCurrentOrder(){
    const rows=State.draftRows();
    if(!rows.length)return;
    const currentFolio=State.value.currentOrderFolio;
    let stored=currentFolio?await Orders.get(currentFolio):null;
    if(!stored||!(stored.rows||[]).length)stored=await Orders.saveDraft();
    if(!stored||!(stored.rows||[]).length)throw new Error('No se pudo registrar el pedido en el historial');
  }

  function keepActiveTabVisible(button){
    const tabs=button?.closest('.tabs');
    if(!tabs)return;
    requestAnimationFrame(()=>button.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'}));
  }

  function initialize(){
    const current=profile();
    if(!current.logoAlignX)current.logoAlignX='center';
    if(!current.logoAlignY)current.logoAlignY='center';
    State.persist();
    syncAlignmentInputs();
    renderHeaderPreview();
    const marker=$('#buildVersion');if(marker)marker.textContent='v8.2.0';
  }

  document.addEventListener('change',event=>{
    if(event.target.matches('#logoAlignX,#logoAlignY'))saveAlignment();
    if(event.target.matches('#logoPosition,#companyLogoSize,#companyLogo2Size'))setTimeout(renderHeaderPreview,20);
  });
  document.addEventListener('input',event=>{
    if(event.target.matches('#companyLogoSize,#companyLogo2Size'))setTimeout(renderHeaderPreview,20);
  });
  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-management-tab]');
    if(tab){keepActiveTabVisible(tab);if(tab.dataset.managementTab==='history')setTimeout(renderHistoryFallback,180)}
    const profileNav=event.target.closest('[data-view="profile"]');
    if(profileNav)setTimeout(()=>{syncAlignmentInputs();renderHeaderPreview()},120);
    const managementNav=event.target.closest('[data-view="management"]');
    if(managementNav)setTimeout(()=>{const active=$('[data-management-tab].active');keepActiveTabVisible(active);if(active?.dataset.managementTab==='history')renderHistoryFallback()},180);
    if(event.target.closest('#generateOrder'))setTimeout(async()=>{try{await guaranteeCurrentOrder()}catch(error){console.error(error)}},250);
  },true);
  window.addEventListener('pageshow',()=>setTimeout(()=>{syncAlignmentInputs();renderHeaderPreview()},80));
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',initialize,{once:true}):initialize();
})(globalThis);
