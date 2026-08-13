import {$,state,api} from './app-core.js';

let initialized=false,brandSynced=false,scheduled=false,scheduledRoot=document,modalObserver=null;
const BRAND={name:'Nuvasto',tagline:'Compras claras. Abastecimiento inteligente.',descriptor:'PROCUREMENT OS',primary:'#4031B8',secondary:'#178F73',accent:'#2BD6A0',navy:'#08111F'};
const exactReplacements=new Map([
  ['Pedidos Pro','Nuvasto'],
  ['PEDIDOS PRO','NUVASTO'],
  ['Pedidos Pro Platform','Nuvasto'],
  ['Documento generado por Pedidos Pro','Documento generado por Nuvasto'],
  ['Documento de compra generado por la plataforma','Documento generado por Nuvasto']
]);
function replaceText(root=document){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;if(!parent||['SCRIPT','STYLE','TEXTAREA','INPUT','OPTION'].includes(parent.tagName))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){const value=node.nodeValue;if(exactReplacements.has(value?.trim()))node.nodeValue=value.replace(value.trim(),exactReplacements.get(value.trim()));else if(value?.includes('Pedidos Pro')||value?.includes('pedidos-pro-files'))node.nodeValue=value.replaceAll('Pedidos Pro','Nuvasto').replaceAll('pedidos-pro-files','nuvasto-files')}
  for(const input of root.querySelectorAll?.('input,textarea')||[]){if(input.placeholder?.includes('Pedidos Pro'))input.placeholder=input.placeholder.replaceAll('Pedidos Pro','Nuvasto');if(input.name==='footerText'&&(!input.value||['Documento generado por Pedidos Pro','Documento de compra generado por la plataforma'].includes(input.value)))input.value='Documento generado por Nuvasto'}
}
function mountMarks(root=document){for(const mark of root.querySelectorAll?.('.brand-mark')||[]){if(mark.querySelector('img[data-nuvasto-mark]'))continue;mark.textContent='';const image=document.createElement('img');image.src='./nuvasto-mark.svg';image.alt='';image.dataset.nuvastoMark='1';mark.append(image)}}
function applyMetadata(){document.title='Nuvasto';document.querySelector('meta[name=description]')?.setAttribute('content','Nuvasto: compras, abastecimiento, proveedores, recepción y facturas con trazabilidad.');document.querySelector('meta[name=theme-color]')?.setAttribute('content',BRAND.navy);document.documentElement.dataset.productBrand='nuvasto'}
function enhanceBrandWorkspace(root=document){const cards=[...root.querySelectorAll?.('.v20-card')||[]],card=cards.find(item=>item.textContent.includes('Marca del producto'));if(card&&!card.querySelector('.nuvasto-brand-panel')){card.querySelector('.metric')?.remove();card.querySelector('small')?.remove();card.querySelector('header')?.insertAdjacentHTML('afterend',`<div class="nuvasto-brand-panel"><img src="./nuvasto-mark.svg" alt="Isotipo Nuvasto"><div><h3>Nuvasto</h3><p>${BRAND.tagline}<br>Identidad seleccionada y aplicada en la PWA, documentos y comunicaciones.</p></div></div>`)}}
function enhance(root=document){scheduled=false;applyMetadata();replaceText(root);mountMarks(root);enhanceBrandWorkspace(root);const eyebrow=$('#modalEyebrow');if(eyebrow&&eyebrow.textContent.trim()==='PEDIDOS PRO')eyebrow.textContent='NUVASTO'}
function schedule(root=document){scheduledRoot=root||document;if(scheduled)return;scheduled=true;requestAnimationFrame(()=>enhance(scheduledRoot))}
async function syncWorkspace(){if(brandSynced||!state.token||!['owner','admin'].includes(state.me?.user?.role))return;brandSynced=true;try{const payload=await api('/api/professional/brand',{fresh:true}),brand=payload.brand||payload;if(brand.productName!=='Nuvasto'||brand.status==='exploring')await api('/api/professional/brand',{method:'PUT',json:{productName:'Nuvasto',tagline:BRAND.tagline,status:'selected',palette:{navy:BRAND.navy,primary:BRAND.primary,secondary:BRAND.secondary,accent:BRAND.accent,cloud:'#F4F7FB'},candidates:[{name:'Nuvasto',tagline:BRAND.tagline,status:'selected'}]}})}catch(error){console.warn('nuvasto_brand_sync_failed',error)}}
export function initializeNuvastoV21(){
  if(initialized)return;initialized=true;applyMetadata();enhance(document);
  const modalBody=$('#modalBody');if(modalBody){modalObserver=new MutationObserver(()=>schedule(modalBody));modalObserver.observe(modalBody,{subtree:true,childList:true})}
  window.addEventListener('pedidos:view-rendered',()=>{schedule($('#mainContent')||document);syncWorkspace()});
  window.addEventListener('pageshow',()=>{schedule(document);syncWorkspace()});
  setTimeout(syncWorkspace,1200);
}
export {BRAND as NUVASTO_BRAND};
