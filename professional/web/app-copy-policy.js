const INTERNAL_TOKEN=/\b(?:netLineTotal|grossLineTotal|freightLine|vatLine|additionalTaxLine|otherLineCharges|priceSource|taxAllocationMethod|reconciliationEngine|matchMethod|matchCandidateScore|matchSecondScore|invoice[-_ ]?column[-_ ]?matrix|invoice[-_ ]?line[-_ ]?matrix|proportional[-_ ]?invoice[-_ ]?totals|adaptive[-_ ]?price[-_ ]?matrix|printed[-_ ]?final[-_ ]?unit|column[-_ ]?total[-_ ]?reconciliation|document[-_ ]?line[-_ ]?fallback|worker_unavailable|indexeddb_[a-z_]+|request_timeout|offline_cache_miss)\b/i;
const HTTP_TOKEN=/\bHTTP\s+\d{3}\b/i;
const ENGLISH_ENGINE=/\b(?:VAT value|Freight line item|not mapped to specific product lines|invoice column|matrix reconciled|pricing matrix|engine|checksum|fallback)\b/i;

function plain(value){return String(value??'').replace(/\s+/g,' ').trim()}
export function sanitizeUserMessage(value){
  const text=plain(value);if(!text)return'';
  if(/request_timeout/i.test(text))return'La operación tardó demasiado. Intenta nuevamente.';
  if(/offline_cache_miss/i.test(text))return'No hay datos guardados para esta vista. Conéctate e intenta nuevamente.';
  if(/indexeddb_/i.test(text))return'No se pudo guardar la información localmente. Intenta nuevamente.';
  if(/worker_unavailable/i.test(text))return'No se pudo procesar la información. Intenta nuevamente.';
  if(HTTP_TOKEN.test(text))return'No se pudo completar la operación. Intenta nuevamente.';
  if(INTERNAL_TOKEN.test(text)||ENGLISH_ENGINE.test(text))return'La información fue procesada. Revisa los datos visibles antes de guardar.';
  return text.replace(/\boriginal en R2\b/ig,'original archivado de forma segura').replace(/\bR2\b/g,'almacenamiento seguro');
}
function replacePriceBreakdown(node){
  const review=node.classList.contains('review'),verified=!review;
  node.innerHTML=`<strong>${verified?'Precio verificado':'Precio por revisar'}</strong><p>${verified?'El total de esta línea fue contrastado con el total del documento.':'Confirma el total de esta línea antes de guardar.'}</p>`;
  node.dataset.copyPolicy='1';
}
function replacePricingAudit(node){
  const text=plain(node.textContent),verified=/verificado/i.test(text)&&!/por revisar/i.test(text);
  node.innerHTML=`<strong>${verified?'Totales verificados':'Totales por revisar'}</strong><p>${verified?'La suma de las líneas coincide con el total del documento.':'Revisa los totales antes de guardar el documento.'}</p>`;
  node.dataset.copyPolicy='1';
}
function normalizeConfidence(node){
  const text=plain(node.textContent);if(!/%|coincidencia|revisi[oó]n manual/i.test(text))return;
  node.textContent=node.classList.contains('ok')?'Vinculado':'Revisar';node.dataset.copyPolicy='1';
}
function removeTechnicalReadingNote(node){
  const title=plain(node.querySelector('strong,summary')?.textContent||'');if(!/observaciones de lectura/i.test(title))return;
  node.remove();
}
function sanitizeTextElement(node){
  if(!node?.isConnected)return;
  const original=plain(node.textContent);if(!original)return;
  if(/original en R2|\bR2\b/.test(original)){node.textContent=original.replace(/\boriginal en R2\b/ig,'original archivado de forma segura').replace(/\bR2\b/g,'almacenamiento seguro');return}
  if(INTERNAL_TOKEN.test(original)||HTTP_TOKEN.test(original)||ENGLISH_ENGINE.test(original))node.textContent=sanitizeUserMessage(original);
}
export function sanitizeUserFacing(root=document){
  if(!root)return;
  const scope=root.nodeType===1?root:root.parentElement;if(!scope)return;
  if(scope.matches?.('.v38-price-breakdown')&&!scope.dataset.copyPolicy)replacePriceBreakdown(scope);
  if(scope.matches?.('.v38-batch-note')&&!scope.dataset.copyPolicy&&/cierre matem[aá]tico|m[eé]todo:/i.test(scope.textContent||''))replacePricingAudit(scope);
  if(scope.matches?.('.v30-reconcile-status')&&!scope.dataset.copyPolicy)normalizeConfidence(scope);
  if(scope.matches?.('.v30-inline-notice,.v30-reading-details'))removeTechnicalReadingNote(scope);
  scope.querySelectorAll?.('.v38-price-breakdown:not([data-copy-policy])').forEach(replacePriceBreakdown);
  scope.querySelectorAll?.('.v38-batch-note:not([data-copy-policy])').forEach(node=>{if(/cierre matem[aá]tico|m[eé]todo:/i.test(node.textContent||''))replacePricingAudit(node)});
  scope.querySelectorAll?.('.v30-reconcile-status:not([data-copy-policy])').forEach(normalizeConfidence);
  scope.querySelectorAll?.('.v30-inline-notice,.v30-reading-details').forEach(removeTechnicalReadingNote);
  scope.querySelectorAll?.('.toast,.v38-progress-card small,.v38-batch-note p,.v30-inline-notice p,.v30-reading-details p').forEach(sanitizeTextElement);
}
let scheduled=false,observer=null;
function schedule(root){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sanitizeUserFacing(root||document)})}
export function initializeCopyPolicy(){
  sanitizeUserFacing(document);
  if(observer||!document.body)return;
  observer=new MutationObserver(records=>{for(const record of records){if(record.type==='characterData')schedule(record.target.parentElement);for(const node of record.addedNodes||[])if(node.nodeType===1)schedule(node)}});
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
}
initializeCopyPolicy();
