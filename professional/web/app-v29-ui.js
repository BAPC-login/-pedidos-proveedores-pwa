import {$} from './app-core.js';

function inject(){
  if($('#nuvastoInvoiceV29Styles'))return;
  const style=document.createElement('style');style.id='nuvastoInvoiceV29Styles';style.textContent=`
    .v29-invoice-lines{display:grid;gap:12px;margin-top:14px}.v29-invoice-line{display:grid;gap:11px;padding:14px;border:1px solid var(--line);border-radius:15px;background:var(--card)}
    .v29-invoice-line>header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.v29-invoice-line>header>div{min-width:0}.v29-invoice-line>header strong{display:block;margin-top:4px;overflow-wrap:anywhere}.v29-conversion{padding:10px 12px;border-radius:11px;background:color-mix(in srgb,var(--success) 8%,var(--soft));color:var(--text);font-size:9px;line-height:1.45}.v29-conversion.review{background:color-mix(in srgb,var(--warning) 12%,var(--soft));color:var(--warning)}
    .v29-line-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.v29-line-grid output{display:flex;align-items:center;min-height:44px;padding:0 10px;border:1px solid var(--line);border-radius:10px;background:var(--soft);font-weight:850}.v29-invoice-line .full{grid-column:1/-1}
    @media(max-width:720px){.v29-line-grid{grid-template-columns:1fr 1fr}.v29-invoice-line>header{flex-direction:column}.v29-invoice-line>header .status{align-self:flex-start}}
    @media(max-width:460px){.v29-line-grid{grid-template-columns:1fr}}
  `;document.head.append(style);
}
inject();

new MutationObserver(records=>{
  for(const record of records){
    if(record.type!=='attributes'||record.target?.id!=='modalSubmit'||record.attributeName!=='disabled')continue;
    const button=record.target,title=$('#modalTitle')?.textContent||'';
    if(!button.disabled&&/Adjuntar documento al pedido|Analizar documento/i.test(title))window.NuvastoV29?.stopProgress?.();
  }
}).observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['disabled']});
