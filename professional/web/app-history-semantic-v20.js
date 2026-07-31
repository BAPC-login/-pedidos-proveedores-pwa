import {$,$$,money,state} from './app-core.js';

let initialized=false;
function orderById(id){return(state.cache.orders||[]).find(order=>String(order.id)===String(id))}
function totalText(order){if(Number(order?.invoiceCount||0)>0&&Number(order?.invoicedGrossTotal||0)>0)return money(order.invoicedGrossTotal);if(Number(order?.grossTotal||0)>0)return money(order.grossTotal);return Number(order?.invoiceCount||0)>0?'Precio en revisión':'Pendiente de factura'}
function enhanceCards(){$$('[data-v18-card]').forEach(card=>{const order=orderById(card.dataset.v18Card),target=card.querySelector('.history-v18-line.total span');if(target&&order)target.textContent=totalText(order)})}
function enhanceDetail(orderId){const order=orderById(orderId);if(!order)return;for(const metric of $$('.v18-detail-metric')){const label=metric.querySelector('small');if(label?.textContent?.trim()==='Total estimado'){const value=metric.querySelector('strong');if(value)value.textContent=totalText(order);label.textContent=Number(order.invoiceCount||0)>0?'Total facturado':'Estado del precio';break}}}
export function initializeHistorySemanticV20(){if(initialized)return;initialized=true;window.addEventListener('pedidos:view-rendered',event=>{if(event.detail?.view==='history')requestAnimationFrame(enhanceCards)});document.addEventListener('click',event=>{const button=event.target.closest?.('[data-v18-detail]');if(!button)return;setTimeout(()=>enhanceDetail(button.dataset.v18Detail),180)},true);if(state.view==='history')requestAnimationFrame(enhanceCards)}
