import {$,$$} from './app-core.js';

let initialized=false;
let toolbar=null;
let activeQuantity=null;
let baselineViewportHeight=0;
let syncTimers=[];

const quantitySelector='[data-core-quantity],[data-edit-quantity]';
const quantityFields=()=>$$(`${quantitySelector}`).filter(input=>!input.disabled&&input.offsetParent!==null);

const legalDocuments={
  privacy:{
    eyebrow:'PRIVACIDAD',
    title:'Política de privacidad',
    version:'Versión 1.0 · julio de 2026',
    sections:[
      ['Qué información utiliza Nuvasto','Datos de cuenta, empresa, locales, roles, pedidos, proveedores, facturas, recepciones, archivos y registros de auditoría necesarios para prestar el servicio.'],
      ['Para qué se utiliza','Autenticar usuarios, gestionar compras, cotejar documentos, conservar trazabilidad, prevenir errores, generar reportes y prestar soporte.'],
      ['Servicios tecnológicos','La organización puede habilitar Cloudflare, Google, Gemini y almacenamiento R2. Cada integración se usa únicamente para ejecutar las funciones configuradas por la organización.'],
      ['Conservación y eliminación','La organización administradora define los plazos operativos y legales. Los usuarios autorizados pueden solicitar corrección, exportación o eliminación cuando no exista una obligación de conservación.'],
      ['Responsabilidad','Cada empresa controla sus usuarios, permisos y documentos. Nuvasto no vende información personal ni la utiliza para publicidad de terceros.']
    ]
  },
  terms:{
    eyebrow:'CONDICIONES',
    title:'Términos de uso',
    version:'Versión 1.0 · julio de 2026',
    sections:[
      ['Cuentas individuales','Cada persona debe utilizar su propia cuenta y mantener sus credenciales protegidas. No se permite compartir accesos ni suplantar a otro usuario.'],
      ['Pedidos y autorizaciones','La creación, aprobación, emisión y recepción de pedidos debe ajustarse a las facultades otorgadas por la organización. El usuario debe revisar cantidades, proveedores, precios y fechas antes de confirmar.'],
      ['Inteligencia artificial','El cotejo con IA es una asistencia operativa. Los resultados deben revisarse antes de guardar una factura, modificar precios o cerrar una conciliación.'],
      ['Disponibilidad','Nuvasto busca mantener continuidad y respaldo, pero pueden existir interrupciones por conectividad, proveedores externos, mantenimiento o fuerza mayor.'],
      ['Uso permitido','No se permite vulnerar controles, extraer datos sin autorización, automatizar portales de terceros sin permiso ni utilizar la plataforma para operaciones ilícitas.']
    ]
  },
  security:{
    eyebrow:'SEGURIDAD',
    title:'Seguridad y acceso',
    version:'Controles operativos de Nuvasto',
    sections:[
      ['Acceso protegido','Las conexiones utilizan HTTPS. La plataforma admite cuentas individuales, sesiones controladas y acceso mediante Google y Cloudflare Access cuando la organización lo habilita.'],
      ['Permisos y trazabilidad','Los roles, empresas, locales y centros de costo limitan las acciones disponibles. Las operaciones relevantes pueden quedar registradas en auditoría.'],
      ['Archivos','Facturas, imágenes, logos y documentos deben almacenarse en el repositorio configurado por la organización. R2 es el almacenamiento recomendado para producción.'],
      ['Buenas prácticas','Usa contraseñas únicas, activa MFA cuando esté disponible, revisa los usuarios periódicamente y elimina accesos que ya no correspondan.'],
      ['Incidentes','Ante un acceso sospechoso, cierra sesión, cambia las credenciales y contacta al administrador de tu organización mediante su canal de soporte.']
    ]
  }
};

function injectStyles(){
  if($('#nuvastoV23Styles'))return;
  const style=document.createElement('style');
  style.id='nuvastoV23Styles';
  style.textContent=`
  :root{--v23-ease:cubic-bezier(.22,.8,.22,1)}
  .auth-screen{isolation:isolate;overflow-x:hidden}
  .auth-card{max-width:500px}
  .auth-assurance{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:17px}
  .auth-assurance span{display:flex;align-items:center;justify-content:center;min-height:35px;padding:6px 8px;border:1px solid var(--line);border-radius:10px;background:color-mix(in srgb,var(--soft) 76%,transparent);color:var(--muted);font-size:8px;font-weight:800;text-align:center}
  .auth-assurance span::before{content:'✓';margin-right:5px;color:var(--success);font-weight:950}
  .auth-legal{display:grid;gap:9px;margin-top:16px;padding-top:15px;border-top:1px solid var(--line);text-align:center}
  .auth-legal p{margin:0;color:var(--muted);font-size:8px;line-height:1.5}
  .auth-legal-links{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px 12px}
  .auth-legal-links button{padding:2px;border:0;background:transparent;color:var(--primary);font-size:8px;font-weight:850;text-decoration:underline;text-decoration-color:color-mix(in srgb,var(--primary) 35%,transparent);text-underline-offset:3px}
  .auth-legal-version{color:var(--muted);font-size:7px;letter-spacing:.04em}
  .btn.primary,.bottom-create{border:0!important;border-inline:0!important;background-clip:border-box!important;background-origin:border-box!important;outline:0;overflow:hidden;isolation:isolate}
  html[data-theme=dark] .btn.primary,html[data-theme=dark] .bottom-create{background-image:linear-gradient(120deg,#2f1b82 0%,#5048df 60%,#25c9ae 100%)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),0 12px 30px rgba(32,27,106,.34)!important}
  @media(prefers-color-scheme:dark){html[data-theme=system] .btn.primary,html[data-theme=system] .bottom-create{background-image:linear-gradient(120deg,#2f1b82 0%,#5048df 60%,#25c9ae 100%)!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),0 12px 30px rgba(32,27,106,.34)!important}}
  .public-legal-modal{width:min(720px,calc(100vw - 24px));max-height:min(82dvh,780px);padding:0;border:1px solid var(--line);border-radius:22px;background:var(--card);color:var(--text);box-shadow:0 28px 90px rgba(0,0,0,.35)}
  .public-legal-modal::backdrop{background:rgba(3,8,18,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
  .public-legal-frame{display:grid;grid-template-rows:auto minmax(0,1fr) auto;max-height:min(82dvh,780px)}
  .public-legal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:22px 22px 17px;border-bottom:1px solid var(--line)}
  .public-legal-head h2{margin:5px 0 0;font-size:24px;letter-spacing:-.04em}
  .public-legal-close{flex:0 0 auto;width:40px;height:40px;border:1px solid var(--line);border-radius:12px;background:var(--card);font-size:20px}
  .public-legal-body{display:grid;gap:10px;padding:18px 22px 24px;overflow:auto;overscroll-behavior:contain}
  .public-legal-section{padding:14px;border:1px solid var(--line);border-radius:13px;background:var(--soft)}
  .public-legal-section h3{margin:0 0 6px;font-size:11px}
  .public-legal-section p{margin:0;color:var(--muted);font-size:10px;line-height:1.65}
  .public-legal-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 22px;border-top:1px solid var(--line);color:var(--muted);font-size:8px}
  .public-legal-foot button{min-height:38px;padding:0 15px;border:1px solid var(--line);border-radius:11px;background:var(--card);font-weight:850}
  .v18-master-nav,.v22-master-nav{display:none!important}
  .v23-master-nav{position:fixed;z-index:2147483646;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));display:grid;grid-template-columns:82px minmax(0,1fr) 82px;gap:7px;padding:8px;border:1px solid color-mix(in srgb,var(--primary) 42%,var(--line));border-radius:18px;background:color-mix(in srgb,var(--card) 96%,transparent);box-shadow:0 18px 52px rgba(4,10,24,.38);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);opacity:0;visibility:hidden;pointer-events:none;transform:translateY(12px);transition:opacity .16s var(--v23-ease),transform .18s var(--v23-ease),visibility 0s linear .18s}
  .v23-master-nav.keyboard-open{opacity:1;visibility:visible;pointer-events:auto;transform:none;transition:opacity .16s var(--v23-ease),transform .18s var(--v23-ease),visibility 0s}
  .v23-master-nav button{min-height:52px;border:1px solid color-mix(in srgb,var(--primary) 24%,var(--line));border-radius:13px;background:var(--soft);color:var(--text);font-size:11px;font-weight:900;touch-action:manipulation;-webkit-user-select:none;user-select:none}
  .v23-master-nav [data-v23-next]{border:0;background:linear-gradient(135deg,#31510f,#335b44 52%,#326c69);color:#fff;font-size:16px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
  .v23-master-nav button:disabled{opacity:.34}
  @media(max-width:760px){
    .auth-screen{min-height:100dvh!important;display:flex!important;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:18px;padding:calc(env(safe-area-inset-top) + 92px) 22px calc(env(safe-area-inset-bottom) + 28px)!important}
    .auth-brand{top:calc(env(safe-area-inset-top) + 16px)!important;left:22px!important;right:22px!important;width:auto;z-index:3}
    .auth-brand .brand-mark{width:56px;height:56px}
    .auth-copy{display:block!important;margin:2px 0 0}
    .auth-copy h1{margin:9px 0;font-size:clamp(30px,9vw,40px)!important;line-height:1.04}
    .auth-copy p{font-size:13px!important;line-height:1.55}
    .auth-card{width:100%;max-width:none;margin-top:auto;padding:22px!important;border-radius:24px!important}
    .auth-assurance{grid-template-columns:1fr 1fr 1fr}
    .public-legal-modal{max-height:88dvh;border-radius:20px}
    .public-legal-frame{max-height:88dvh}
    .v23-master-nav{grid-template-columns:72px minmax(0,1fr) 72px;padding:7px;gap:6px}
    .v23-master-nav button{min-height:50px}
    .v23-master-nav [data-v23-next]{font-size:15px}
  }
  @media(max-width:420px){.auth-assurance{grid-template-columns:1fr}.auth-assurance span{min-height:31px}.auth-copy p{font-size:12px!important}}
  @media(prefers-reduced-motion:reduce){.v23-master-nav{transition:none}.public-legal-modal{scroll-behavior:auto}}
  `;
  document.head.append(style);
}

function installLegalExperience(){
  const authCard=$('#authScreen .auth-card');
  if(authCard&&!authCard.querySelector('.auth-assurance')){
    const assurance=document.createElement('div');
    assurance.className='auth-assurance';
    assurance.innerHTML='<span>Sesión cifrada</span><span>Acceso individual</span><span>Roles auditables</span>';
    const legal=document.createElement('div');
    legal.className='auth-legal';
    legal.innerHTML='<p>Al ingresar confirmas que estás autorizado por tu organización y aceptas las condiciones vigentes.</p><div class="auth-legal-links"><button type="button" data-public-legal="privacy">Política de privacidad</button><button type="button" data-public-legal="terms">Términos de uso</button><button type="button" data-public-legal="security">Seguridad</button></div><span class="auth-legal-version">Nuvasto · Procurement OS · versión legal 1.0</span>';
    const note=authCard.querySelector('.auth-note');
    note?.insertAdjacentElement('beforebegin',assurance);
    authCard.append(legal);
  }
  if(!$('#publicLegalModal')){
    const dialog=document.createElement('dialog');
    dialog.id='publicLegalModal';
    dialog.className='public-legal-modal';
    dialog.innerHTML='<article class="public-legal-frame"><header class="public-legal-head"><div><span class="eyebrow" id="publicLegalEyebrow">NUVASTO</span><h2 id="publicLegalTitle">Información legal</h2></div><button class="public-legal-close" type="button" data-public-legal-close aria-label="Cerrar">×</button></header><div class="public-legal-body" id="publicLegalBody"></div><footer class="public-legal-foot"><span id="publicLegalVersion"></span><button type="button" data-public-legal-close>Entendido</button></footer></article>';
    document.body.append(dialog);
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
    dialog.querySelectorAll('[data-public-legal-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
  }
  document.addEventListener('click',event=>{
    const trigger=event.target.closest?.('[data-public-legal]');
    if(!trigger)return;
    const documentKey=trigger.dataset.publicLegal,content=legalDocuments[documentKey];
    if(!content)return;
    const dialog=$('#publicLegalModal');
    $('#publicLegalEyebrow').textContent=content.eyebrow;
    $('#publicLegalTitle').textContent=content.title;
    $('#publicLegalVersion').textContent=content.version;
    $('#publicLegalBody').innerHTML=content.sections.map(([title,text])=>`<section class="public-legal-section"><h3>${title}</h3><p>${text}</p></section>`).join('');
    dialog.showModal();
  });
}

function installLegacyKeyboardBlock(){
  const original=document.addEventListener;
  document.addEventListener=function(type,listener,options){
    const source=typeof listener==='function'?String(listener):'';
    const legacyQuantityListener=(type==='focusin'&&(source.includes('focusQuantity(input)')||source.includes("activeInput=input;input.enterKeyHint='next'")))||(type==='keydown'&&(source.includes('moveQuantity(1)')||source.includes('activeInput=input;move(1)')))||(type==='input'&&(source.includes('sanitizeQuantity(input)')||source.includes('sanitize(input)')));
    if(legacyQuantityListener)return;
    return original.call(this,type,listener,options);
  };
  queueMicrotask(()=>{document.addEventListener=original});
}

function prepareQuantity(input){
  if(!input)return;
  input.inputMode='decimal';
  input.enterKeyHint='next';
  input.autocomplete='off';
  input.setAttribute('pattern','[0-9.,]*');
}

function sanitizeQuantity(input){
  if(!input)return;
  let value=String(input.value||'').replace(/[^0-9.,]/g,'').replace(',','.');
  const parts=value.split('.');
  if(parts.length>2)value=`${parts.shift()}.${parts.join('')}`;
  if(input.value!==value)input.value=value;
}

function ensureToolbar(){
  const dialog=$('#modal');
  if(!dialog)return null;
  if(toolbar&&toolbar.isConnected&&toolbar.parentElement===dialog)return toolbar;
  toolbar?.remove();
  toolbar=document.createElement('div');
  toolbar.className='v23-master-nav';
  toolbar.setAttribute('role','toolbar');
  toolbar.setAttribute('aria-label','Navegación de cantidades');
  toolbar.setAttribute('aria-hidden','true');
  toolbar.innerHTML='<button type="button" tabindex="-1" data-v23-prev>Anterior</button><button type="button" tabindex="-1" data-v23-next>Enter ↵</button><button type="button" tabindex="-1" data-v23-done>Listo</button>';
  dialog.append(toolbar);
  bindToolbarAction(toolbar.querySelector('[data-v23-prev]'),()=>moveQuantity(-1));
  bindToolbarAction(toolbar.querySelector('[data-v23-next]'),()=>moveQuantity(1));
  bindToolbarAction(toolbar.querySelector('[data-v23-done]'),finishNavigation);
  return toolbar;
}

function bindToolbarAction(button,action){
  button.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();action()});
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation()});
}

function currentLayoutHeight(){
  const viewport=window.visualViewport;
  return Math.max(window.innerHeight||0,document.documentElement.clientHeight||0,viewport?.height||0);
}

function keyboardInset(){
  const viewport=window.visualViewport;
  if(!viewport)return 0;
  const layoutHeight=Math.max(baselineViewportHeight,currentLayoutHeight());
  return Math.max(0,layoutHeight-(viewport.height+viewport.offsetTop));
}

function keyboardIsOpen(){
  return Boolean(activeQuantity&&document.activeElement===activeQuantity&&keyboardInset()>110);
}

function updateToolbarButtons(){
  const bar=ensureToolbar();
  if(!bar||!activeQuantity)return;
  const list=quantityFields(),index=list.indexOf(activeQuantity);
  bar.querySelector('[data-v23-prev]').disabled=index<=0;
  bar.querySelector('[data-v23-next]').textContent=index>=list.length-1?'Finalizar ↵':'Enter ↵';
}

function positionToolbar(){
  const bar=ensureToolbar(),viewport=window.visualViewport;
  if(!bar||!bar.classList.contains('keyboard-open')||!viewport)return;
  const height=bar.offsetHeight||68;
  const top=Math.max(viewport.offsetTop+8,viewport.offsetTop+viewport.height-height-8);
  bar.style.top=`${top}px`;
  bar.style.bottom='auto';
}

function syncToolbar(){
  const bar=ensureToolbar();
  if(!bar)return;
  const open=keyboardIsOpen()&&$('#modal')?.open&&$('#modalTitle')?.textContent?.trim()==='Lista maestra';
  bar.classList.toggle('keyboard-open',open);
  bar.setAttribute('aria-hidden',open?'false':'true');
  if(open){updateToolbarButtons();positionToolbar()}
  else if(!activeQuantity||document.activeElement!==activeQuantity)baselineViewportHeight=currentLayoutHeight();
}

function scheduleToolbarSync(){
  syncTimers.forEach(clearTimeout);
  syncTimers=[0,40,120,260].map(delay=>setTimeout(syncToolbar,delay));
}

function focusQuantity(input){
  if(!input||!input.isConnected)return finishNavigation();
  activeQuantity=input;
  prepareQuantity(input);
  input.focus({preventScroll:true});
  requestAnimationFrame(()=>{
    const bar=ensureToolbar(),rect=input.getBoundingClientRect(),limit=bar?.classList.contains('keyboard-open')?bar.getBoundingClientRect().top-10:(window.visualViewport?.height||window.innerHeight)-12;
    if(rect.top<110||rect.bottom>limit)input.scrollIntoView({behavior:'auto',block:'center'});
    scheduleToolbarSync();
  });
}

function moveQuantity(direction){
  if(!activeQuantity)return;
  const current=activeQuantity;
  sanitizeQuantity(current);
  const list=quantityFields(),index=list.indexOf(current),target=list[index+direction];
  if(target){
    focusQuantity(target);
    return;
  }
  if(direction>0)finishNavigation();
  else updateToolbarButtons();
}

function finishNavigation(){
  sanitizeQuantity(activeQuantity);
  const current=activeQuantity;
  activeQuantity=null;
  current?.blur();
  const bar=ensureToolbar();
  bar?.classList.remove('keyboard-open');
  bar?.setAttribute('aria-hidden','true');
  baselineViewportHeight=currentLayoutHeight();
}

function enhanceQuantityFields(root=document){
  root.querySelectorAll?.(quantitySelector).forEach(prepareQuantity);
}

function installKeyboardNavigation(){
  baselineViewportHeight=currentLayoutHeight();
  ensureToolbar();
  document.addEventListener('focusin',event=>{
    const input=event.target.closest?.(quantitySelector);
    if(!input)return;
    activeQuantity=input;
    prepareQuantity(input);
    scheduleToolbarSync();
  },true);
  document.addEventListener('focusout',event=>{
    if(!event.target.matches?.(quantitySelector))return;
    setTimeout(()=>{
      const next=document.activeElement?.closest?.(quantitySelector);
      if(next){activeQuantity=next;prepareQuantity(next)}
      else activeQuantity=null;
      syncToolbar();
    },30);
  },true);
  document.addEventListener('keydown',event=>{
    const input=event.target.closest?.(quantitySelector);
    if(!input||event.key!=='Enter')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activeQuantity=input;
    moveQuantity(1);
  },true);
  document.addEventListener('input',event=>{
    const input=event.target.closest?.(quantitySelector);
    if(input)sanitizeQuantity(input);
  },true);
  window.visualViewport?.addEventListener('resize',()=>{if(!activeQuantity)baselineViewportHeight=currentLayoutHeight();scheduleToolbarSync()});
  window.visualViewport?.addEventListener('scroll',syncToolbar);
  window.addEventListener('orientationchange',()=>{setTimeout(()=>{baselineViewportHeight=currentLayoutHeight();syncToolbar()},300)});
  $('#modal')?.addEventListener('close',finishNavigation);
  new MutationObserver(records=>{
    if(records.some(record=>record.addedNodes.length))requestAnimationFrame(()=>{enhanceQuantityFields(document);syncToolbar()});
  }).observe(document.body,{subtree:true,childList:true});
  enhanceQuantityFields(document);
}

export function initializeNuvastoV23(){
  if(initialized)return;
  initialized=true;
  injectStyles();
  installLegalExperience();
  installKeyboardNavigation();
  installLegacyKeyboardBlock();
}
