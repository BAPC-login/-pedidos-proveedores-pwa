import {$,toast} from './app-core.js';
import {closeModal} from './app-modal.js';

const VERSION='39';
const MAX_DOCUMENTS=5;
const MAX_DOCUMENT_BYTES=20*1024*1024;
let scheduled=false,replacing=false;

function sizeLabel(bytes){return `${(Number(bytes||0)/1024/1024).toFixed(2)} MB`}

function injectStyles(){
  if($('#nuvastoV39StabilityStyles'))return;
  const style=document.createElement('style');style.id='nuvastoV39StabilityStyles';style.textContent=`
    .v39-picker-help{display:block;margin-top:6px;color:var(--muted);font-size:9px;line-height:1.45}
    #v38Files{min-height:54px}
    .v39-release-chip{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:6px 9px;border:1px solid var(--line);border-radius:999px;color:var(--muted);font-size:8px;font-weight:800}
    html.route-loading .bottom-nav,html.route-loading .side-nav{pointer-events:none}
  `;document.head.append(style)
}

function enforcePicker(){
  const input=$('#v38Files');if(!input)return;
  input.multiple=true;input.setAttribute('multiple','');input.accept='image/*,application/pdf,.pdf';
  if(!input.dataset.v39SizeGuard){
    input.dataset.v39SizeGuard='1';
    input.addEventListener('change',()=>{
      const files=[...(input.files||[])];
      if(files.length>MAX_DOCUMENTS){input.value='';toast(`Selecciona hasta ${MAX_DOCUMENTS} documentos por vez`,'error');return}
      const oversized=files.find(file=>file.size>MAX_DOCUMENT_BYTES);
      if(oversized){input.value='';toast(`${oversized.name} pesa ${sizeLabel(oversized.size)}. El máximo es 20 MB por documento.`,'error');return}
    },true);
  }
  const copy=input.closest('.field')?.querySelector('.v38-upload-copy');
  if(copy&&!copy.querySelector('.v39-picker-help')){
    const help=document.createElement('small');help.className='v39-picker-help';help.textContent='En iPhone puedes marcar varios archivos en una misma selección. Máximo 5 documentos y 20 MB por archivo.';copy.append(help);
  }
}

function legacyOrderId(){return String($('#modalBody input[name="orderId"]')?.value||'')}

function upgradeLegacyInvoiceModal(){
  if(replacing)return;
  const title=String($('#modalTitle')?.textContent||'').trim();
  if(title!=='Adjuntar documento al pedido'||!window.NuvastoMultiInvoice?.open)return;
  replacing=true;const orderId=legacyOrderId();closeModal('multi-document-upgrade');
  setTimeout(async()=>{
    try{await window.NuvastoMultiInvoice.open(orderId?{orderId,returnToHistory:true}:{})}
    catch(error){toast(error?.message||'No se pudo abrir la carga múltiple','error')}
    finally{replacing=false}
  },0);
}

function enhance(){enforcePicker();upgradeLegacyInvoiceModal()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance()})}

export function initializeStabilityV39(){
  injectStyles();
  document.addEventListener('change',event=>{if(event.target?.matches?.('#v38Files'))enforcePicker()},true);
  new MutationObserver(schedule).observe(document.body||document.documentElement,{subtree:true,childList:true,characterData:true});
  document.addEventListener('pedidos:view-rendered',schedule);
  schedule();
  window.NuvastoStability=Object.freeze({version:VERSION,maxDocuments:MAX_DOCUMENTS,maxDocumentBytes:MAX_DOCUMENT_BYTES});
}

initializeStabilityV39();
