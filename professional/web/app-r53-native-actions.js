import {state,toast} from './app-core.js';
import {openOrderDetail} from './app-order-detail-v30.js';
import {prepareOrderShare,shareDocument} from './app-file-actions.js';

const PICKER_CLASS='nuvasto-native-order-picker';
const WRAPPER_CLASS='nuvasto-native-order-picker-wrap';
const PREPARED='nativePickerPrepared';

function cachedOrder(id){
  const pools=[state?.cache?.orders,state?.cache?.advancedOrders,state?.cache?.history,state?.cache?.orderList];
  for(const pool of pools){
    if(Array.isArray(pool)){
      const match=pool.find(item=>String(item?.id||'')===String(id));
      if(match)return match;
    }
    if(Array.isArray(pool?.orders)){
      const match=pool.orders.find(item=>String(item?.id||'')===String(id));
      if(match)return match;
    }
  }
  return null;
}

function orderMode(id,button){
  const order=cachedOrder(id),status=String(order?.status||'').toLowerCase();
  if(status==='draft')return'draft';
  if(['received','reconciled','closed'].includes(status))return'received';
  const card=button.closest?.('[data-v32-order-card],[data-v43-card],article,.order-card');
  const text=String(card?.textContent||'').toUpperCase();
  if(text.includes('BORRADOR')||text.includes('EN EDICIÓN'))return'draft';
  if(text.includes('RECIBIDO')||text.includes('CONCILIADO')||text.includes('CERRADO'))return'received';
  return'issued';
}

function optionsFor(mode){
  if(mode==='draft')return[
    ['view','Ver pedido'],['edit','Editar'],['emit','Emitir'],['duplicate','Duplicar']
  ];
  return[
    ['view','Ver pedido'],['documents','Documentos'],
    [mode==='received'?'reconcile':'receive',mode==='received'?'Conciliar':'Registrar recepción'],
    ['share','Compartir PDF']
  ];
}

async function openDetailAction(id,selector){
  await openOrderDetail(id);
  setTimeout(()=>document.querySelector(selector)?.click(),70);
}

async function shareNative(id){
  const prepared=await prepareOrderShare(id);
  if(navigator.share&&prepared?.file&&(!navigator.canShare||navigator.canShare({files:[prepared.file]}))){
    try{await navigator.share({title:prepared.document?.name||prepared.file.name,files:[prepared.file]});return}
    catch(error){if(error?.name==='AbortError')return;if(error?.name!=='NotAllowedError')throw error}
  }
  await shareDocument(prepared.document?.key,prepared.document?.name||prepared.file?.name||'pedido.pdf');
}

async function runAction(id,action){
  if(action==='view')return openOrderDetail(id);
  if(action==='edit')return openDetailAction(id,'#v30EditOrder');
  if(action==='emit')return openDetailAction(id,'#v30EmitOrder');
  if(action==='duplicate')return openDetailAction(id,'#v30Duplicate');
  if(action==='receive')return openDetailAction(id,'#v30Reception');
  if(action==='reconcile')return openDetailAction(id,'#v30Reconcile');
  if(action==='documents'){
    if(window.NuvastoMultiInvoice?.open)return window.NuvastoMultiInvoice.open({orderId:id,returnToHistory:true});
    return openOrderDetail(id);
  }
  if(action==='share')return shareNative(id);
}

function buildPicker(button){
  if(!button?.isConnected||button.dataset[PREPARED]==='1'||button.closest(`.${WRAPPER_CLASS}`))return;
  const id=button.dataset.v43OrderMenu;
  if(!id)return;
  button.dataset[PREPARED]='1';
  button.tabIndex=-1;
  button.setAttribute('aria-hidden','true');
  const wrapper=document.createElement('span');
  wrapper.className=WRAPPER_CLASS;
  const select=document.createElement('select');
  select.className=PICKER_CLASS;
  select.dataset.v43OrderMenu=id;
  select.setAttribute('aria-label','Más acciones del pedido');
  select.innerHTML='<option value="" selected>Más acciones</option>'+optionsFor(orderMode(id,button)).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  select.addEventListener('pointerdown',()=>{prepareOrderShare(id).catch(()=>{})},{passive:true});
  select.addEventListener('change',async()=>{
    const action=select.value;select.value='';if(!action)return;
    select.disabled=true;
    try{await runAction(id,action)}catch(error){toast(error?.message||'No se pudo completar la acción','error')}
    finally{select.disabled=false}
  });
  button.parentNode.insertBefore(wrapper,button);
  wrapper.append(button,select);
}

function scan(root=document){root.querySelectorAll?.('[data-v43-order-menu]').forEach(node=>{if(node.tagName!=='SELECT')buildPicker(node)})}

function removeLegacyContext(root=document){
  root.querySelectorAll?.('.v43-context-menu,.v43-context-backdrop').forEach(node=>node.remove());
}

function injectStyles(){
  if(document.getElementById('nuvastoNativeOrderPickerStyles'))return;
  const style=document.createElement('style');
  style.id='nuvastoNativeOrderPickerStyles';
  style.textContent=`.${WRAPPER_CLASS}{position:relative;display:block;min-width:0;min-height:100%}.${WRAPPER_CLASS}>[data-v43-order-menu]{width:100%;height:100%;pointer-events:none}.${PICKER_CLASS}{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:.001;cursor:pointer;border:0;background:transparent;color:transparent;-webkit-appearance:menulist;appearance:auto}`;
  document.head.append(style);
}

function initialize(){
  injectStyles();scan();removeLegacyContext();
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes){
      if(!(node instanceof Element))continue;
      if(node.matches?.('.v43-context-menu,.v43-context-backdrop')){node.remove();continue}
      scan(node);
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
