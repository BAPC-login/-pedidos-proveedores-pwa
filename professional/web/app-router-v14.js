import {$,state,beginViewRequestScope} from './app-core.js';
const renderers=new Map();
let current={view:'dashboard',subview:'',depth:0};
let scrollTimer=0,running=false,activeKey='',activePromise=null,pending=null;
const key=route=>`${route.view}:${route.subview||'root'}`;
const scrollTop=()=>Number(document.scrollingElement?.scrollTop||window.scrollY||0);
function saveScroll(){const y=scrollTop();sessionStorage.setItem(`pp:scroll:${key(current)}`,String(y));if(history.state?.pp&&history.state.view===current.view&&String(history.state.subview||'')===String(current.subview||''))history.replaceState({...history.state,scrollY:y},'',location.href)}
function updateBack(){const button=$('#routeBack');if(button)button.classList.toggle('hidden',!(current.depth>0||current.subview))}
function path(route){return `#/${route.view}${route.subview?`/${route.subview}`:''}`}
export function registerRouteRenderer(view,renderer){renderers.set(view,renderer)}
export function routeState(){return {...current}}

async function performRoute(view,subview,options){
  const renderer=renderers.get(view);if(!renderer)throw new Error(`Vista no registrada: ${view}`);
  beginViewRequestScope();
  if(!options.fromHistory)saveScroll();
  const oldDepth=Number(history.state?.depth||0),same=current.view===view&&current.subview===subview;
  const route={pp:true,view,subview,depth:options.fromHistory?Number(options.depth||0):(options.replace?oldDepth:same?oldDepth:oldDepth+1),scrollY:Number(options.scrollY??sessionStorage.getItem(`pp:scroll:${key({view,subview})}`)??0)};
  if(!options.fromHistory)history[options.replace||!history.state?.pp?'replaceState':'pushState'](route,'',path(route));
  current=route;state.view=view;state.subview=subview;updateBack();document.documentElement.classList.add('route-loading');document.documentElement.setAttribute('aria-busy','true');
  try{await renderer(route);window.dispatchEvent(new CustomEvent('pedidos:view-rendered',{detail:route}));requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,options.restore||options.fromHistory?route.scrollY:0)));return route}
  finally{document.documentElement.classList.remove('route-loading');document.documentElement.removeAttribute('aria-busy')}
}

async function pump(){
  if(running)return;running=true;
  try{
    while(pending){
      const request=pending;pending=null;activeKey=request.key;
      activePromise=performRoute(request.view,request.subview,request.options);
      try{const result=await activePromise;request.waiters.forEach(waiter=>waiter.resolve(result))}
      catch(error){if(error?.code==='request_superseded'||error?.silent)request.waiters.forEach(waiter=>waiter.resolve({superseded:true}));else request.waiters.forEach(waiter=>waiter.reject(error))}
      finally{activePromise=null;activeKey=''}
    }
  }finally{running=false}
}

export function openRoute(view,subview='',options={}){
  const routeKey=key({view,subview});
  if(activePromise&&activeKey===routeKey&&!pending)return activePromise;
  if(activePromise&&activeKey!==routeKey)beginViewRequestScope();
  return new Promise((resolve,reject)=>{
    if(pending&&pending.key===routeKey){pending.waiters.push({resolve,reject});return}
    if(pending){pending.waiters.forEach(waiter=>waiter.resolve({superseded:true}));pending=null}
    pending={key:routeKey,view,subview,options,waiters:[{resolve,reject}]};void pump();
  });
}

export function goBack(){saveScroll();if(current.depth>0)return history.back();if(current.subview)return openRoute(current.view,'home',{replace:true,restore:true});return openRoute('dashboard','',{replace:true,restore:true})}
export function initializeRouter(){
  $('#routeBack')?.addEventListener('click',goBack);
  window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(saveScroll,120)},{passive:true});
  window.addEventListener('popstate',event=>{const route=event.state?.pp?event.state:{view:'dashboard',subview:'',depth:0};openRoute(route.view,route.subview||'',{fromHistory:true,restore:true,depth:route.depth,scrollY:route.scrollY}).catch(console.error)});
  window.addEventListener('pagehide',saveScroll);updateBack();
}
export function initialRoute(){const stateRoute=history.state?.pp?history.state:null;if(stateRoute)return stateRoute;const parts=location.hash.replace(/^#\/?/,'').split('/').filter(Boolean);return {view:parts[0]||'dashboard',subview:parts[1]||'',depth:0,scrollY:Number(sessionStorage.getItem(`pp:scroll:${parts[0]||'dashboard'}:${parts[1]||'root'}`)||0)}}
