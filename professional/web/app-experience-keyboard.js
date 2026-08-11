import {$,$$} from './app-core.js';

let initialized=false;
const selector='[data-core-quantity],[data-edit-quantity]';
const fields=()=>$$(`${selector}`).filter(input=>input.offsetParent!==null&&!input.disabled);

function prepare(input){
  if(!(input instanceof HTMLInputElement))return;
  input.readOnly=false;
  input.disabled=false;
  input.type='text';
  input.inputMode='decimal';
  input.enterKeyHint='next';
  input.autocomplete='off';
  input.setAttribute('pattern','[0-9.,]*');
  input.setAttribute('aria-label',input.getAttribute('aria-label')||'Cantidad');
}
function sanitize(input){
  let value=String(input.value||'').replace(/[^0-9.,]/g,'').replace(',', '.');
  const parts=value.split('.');if(parts.length>2)value=`${parts.shift()}.${parts.join('')}`;
  if(input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}
}
function focusNext(input){
  const list=fields(),index=list.indexOf(input),next=index>=0?list[index+1]:null;
  if(next){prepare(next);next.focus({preventScroll:true});next.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{try{next.select()}catch{}},0)}
  else $('#modalSubmit')?.focus();
}
function prepareAll(root=document){
  if(root instanceof HTMLInputElement&&root.matches(selector))prepare(root);
  root.querySelectorAll?.(selector).forEach(prepare);
}

export function initializeQuantityKeyboard(){
  if(initialized)return;initialized=true;
  document.body.classList.add('native-quantity-keyboard');
  prepareAll();
  document.addEventListener('focusin',event=>{const input=event.target.closest?.(selector);if(input)prepare(input)},true);
  document.addEventListener('input',event=>{const input=event.target.closest?.(selector);if(input)sanitize(input)},true);
  document.addEventListener('keydown',event=>{const input=event.target.closest?.(selector);if(!input||event.key!=='Enter')return;event.preventDefault();event.stopPropagation();sanitize(input);focusNext(input)},true);
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element)prepareAll(node)}).observe(document.body,{subtree:true,childList:true});
}
