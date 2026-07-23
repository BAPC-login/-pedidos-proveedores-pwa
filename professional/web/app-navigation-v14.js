import {$,$$,state} from './app-core.js';

let initialized=false,restoring=false,decorating=false,routeIndex=0;
let currentRoute={view:'dashboard',subview:''};
const snapshots=new Map();
const routeKey=route=>`${route.view}:${route.subview||''}`;
const routeHash=route=>`#/${encodeURIComponent(route.view)}${route.subview?`/${encodeURIComponent(route.subview)}`:''}`;

function routeFromElement(element){
  if(element?.dataset?.operationsTab)return {view:'operations',subview:element.dataset.operationsTab};
  if(element?.dataset?.experienceView)return {view:element.dataset.experienceView,subview:element.dataset.experienceView==='operations'?'categories':''};
  if(element?.dataset?.viewLink)return {view:element.dataset.viewLink,subview:''};
  if(element?.dataset?.view)return {view:element.dataset.view,subview:''};
  return null;
}
function activeSubview(){return state.view==='operations'?($('.operations-tabs .active')?.dataset.operationsTab||currentRoute.subview||'categories'):''}
function snapshotMeta(){return {eyebrow:$('#pageEyebrow')?.textContent||'',title:$('#pageTitle')?.textContent||''}}
function saveCurrentState(){
  if(!history.state?.pp)return;
  history.replaceState({...history.state,route:{...currentRoute,subview:activeSubview()},scrollY:window.scrollY},'',routeHash({...currentRoute,subview:activeSubview()}));
}
function capture(route=currentRoute){
  const main=$('#mainContent');if(!main||!main.childNodes.length)return;
  const fragment=document.createDocumentFragment();while(main.firstChild)fragment.append(main.firstChild);
  snapshots.set(routeKey({...route,subview:route.view==='operations'?activeSubview():route.subview}),{fragment,scrollY:window.scrollY,...snapshotMeta(),createdAt:Date.now()});
  while(snapshots.size>10)snapshots.delete(snapshots.keys().next().value);
}
function syncNavigation(view){
  $$('.nav-item[data-view],.bottom-item[data-view],.nav-item[data-experience-view],.bottom-item[data-experience-view]').forEach(button=>button.classList.toggle('active',(button.dataset.experienceView||button.dataset.view)===view));
}
function addBackButton(){
  if(decorating)return;decorating=true;
  try{
    const header=$('#mainContent .view-header');
    if(!header||header.querySelector('[data-app-back]')||routeIndex<=0)return;
    const button=document.createElement('button');button.type='button';button.className='btn app-back-button';button.dataset.appBack='1';button.innerHTML='<span>←</span><span>Volver</span>';
    header.prepend(button);
  }finally{decorating=false}
}
function restore(route,requestedScroll){
  const snap=snapshots.get(routeKey(route));if(!snap)return false;
  snapshots.delete(routeKey(route));const main=$('#mainContent');main.replaceChildren();main.append(snap.fragment);state.view=route.view;syncNavigation(route.view);
  if($('#pageEyebrow'))$('#pageEyebrow').textContent=snap.eyebrow;if($('#pageTitle'))$('#pageTitle').textContent=snap.title;
  requestAnimationFrame(()=>{window.scrollTo({top:Number(requestedScroll??snap.scrollY||0),behavior:'instant'});addBackButton()});
  return true;
}
async function renderRoute(route,scrollY=0){
  restoring=true;
  try{
    if(route.view==='operations'){const module=await import('./app-experience-admin.js');await module.renderOperationsAdmin(route.subview||'categories')}
    else if(route.view==='receiving'){const module=await import('./app-experience-operations.js');await module.renderReceiving()}
    else if(route.view==='history'){const module=await import('./app-experience-operations.js');await module.renderHistory()}
    else{const module=await import('./app-views.js');await module.navigate(route.view)}
    requestAnimationFrame(()=>{window.scrollTo({top:Number(scrollY||0),behavior:'instant'});addBackButton()});
  }finally{restoring=false}
}
function pushRoute(route){
  const normalized={view:route.view,subview:route.view==='operations'?(route.subview||'categories'):''};
  if(routeKey(normalized)===routeKey({...currentRoute,subview:activeSubview()}))return;
  saveCurrentState();capture({...currentRoute,subview:activeSubview()});routeIndex+=1;currentRoute=normalized;
  history.pushState({pp:true,index:routeIndex,route:normalized,scrollY:0},'',routeHash(normalized));
}
function adoptProgrammaticRoute(){
  if(restoring||!state.view||state.view===currentRoute.view)return;
  saveCurrentState();routeIndex+=1;currentRoute={view:state.view,subview:state.view==='operations'?activeSubview():''};
  history.pushState({pp:true,index:routeIndex,route:currentRoute,scrollY:0},'',routeHash(currentRoute));addBackButton();
}

export function initializeNavigationV14(){
  if(initialized)return;initialized=true;history.scrollRestoration='manual';
  const initialHash=location.hash.match(/^#\/([^/]+)(?:\/(.+))?$/),initial={view:initialHash?decodeURIComponent(initialHash[1]):'dashboard',subview:initialHash?.[2]?decodeURIComponent(initialHash[2]):''};
  currentRoute=initial;routeIndex=Number(history.state?.pp?history.state.index:0)||0;history.replaceState({pp:true,index:routeIndex,route:currentRoute,scrollY:window.scrollY},'',routeHash(currentRoute));
  const style=document.createElement('style');style.textContent='.app-back-button{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;margin-bottom:10px}.view-header>.app-back-button+div{min-width:0}@media(min-width:761px){.view-header:has(.app-back-button){grid-template-columns:auto minmax(0,1fr) auto}.view-header>.app-back-button{margin:0}}';document.head.append(style);
  document.addEventListener('click',event=>{
    const back=event.target.closest?.('[data-app-back]');if(back){event.preventDefault();event.stopImmediatePropagation();history.back();return}
    const target=event.target.closest?.('[data-operations-tab],[data-experience-view],[data-view-link],[data-view]');if(!target||target.disabled)return;
    const route=routeFromElement(target);if(route)pushRoute(route);
  },true);
  window.addEventListener('popstate',event=>{
    if(!event.state?.pp)return;saveCurrentState();capture({...currentRoute,subview:activeSubview()});routeIndex=Number(event.state.index||0);currentRoute=event.state.route||{view:'dashboard',subview:''};
    if(!restore(currentRoute,event.state.scrollY))renderRoute(currentRoute,event.state.scrollY).catch(console.error);
  });
  let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{adoptProgrammaticRoute();addBackButton()},40)}).observe($('#mainContent')||document.body,{childList:true,subtree:true});
  window.addEventListener('pagehide',saveCurrentState);window.addEventListener('beforeunload',saveCurrentState);
}
