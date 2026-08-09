import {$,$$} from './app-core.js';
let active=null,lastPointerTarget=null,advancing=false;
const selector='[data-core-quantity],[data-edit-quantity]';
const fields=()=>$$(`${selector}`).filter(input=>input.offsetParent!==null&&!input.disabled);
function prepare(input){if(!input)return;input.readOnly=false;input.disabled=false;input.type='text';input.inputMode='decimal';input.enterKeyHint='next';input.autocomplete='off';input.setAttribute('pattern','[0-9.,]*');input.setAttribute('aria-label',input.getAttribute('aria-label')||'Cantidad')}
function focusNext(input){const list=fields(),next=list[list.indexOf(input)+1];if(next){advancing=true;prepare(next);next.focus({preventScroll:true});next.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{try{next.select()}catch{}advancing=false},70)}else{$('#modalSubmit')?.focus();active=null}}
function sanitize(input){let value=String(input.value||'').replace(/[^0-9.,]/g,'').replace(',', '.');const parts=value.split('.');if(parts.length>2)value=`${parts.shift()}.${parts.join('')}`;if(input.value!==value){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}))}}
export function initializeQuantityKeyboard(){
  document.body.classList.add('native-quantity-keyboard');
  document.addEventListener('pointerdown',event=>{lastPointerTarget=event.target;const input=event.target.closest?.(selector);if(!input)return;prepare(input);requestAnimationFrame(()=>{if(document.activeElement!==input)input.focus({preventScroll:true})})},{capture:true,passive:true});
  document.addEventListener('touchstart',event=>{const input=event.target.closest?.(selector);if(input)prepare(input)},{capture:true,passive:true});
  document.addEventListener('focusin',event=>{const input=event.target.closest?.(selector);if(!input)return;prepare(input);active=input;setTimeout(()=>{try{input.select()}catch{}},0)});
  document.addEventListener('keydown',event=>{const input=event.target.closest?.(selector);if(!input||event.key!=='Enter')return;event.preventDefault();event.stopPropagation();sanitize(input);focusNext(input)},true);
  document.addEventListener('input',event=>{const input=event.target.closest?.(selector);if(input)sanitize(input)});
  document.addEventListener('focusout',event=>{const input=event.target.closest?.(selector);if(!input||advancing)return;const pointerWasAnotherField=lastPointerTarget?.closest?.(selector);const pointerWasControl=lastPointerTarget?.closest?.('button,select,a,[data-modal-close]');setTimeout(()=>{if(document.activeElement?.matches?.(selector))return;if(!pointerWasAnotherField&&!pointerWasControl&&active===input)active=null;lastPointerTarget=null},100)});
  new MutationObserver(records=>{if(!records.some(record=>record.addedNodes.length))return;requestAnimationFrame(()=>fields().forEach(prepare))}).observe(document.body,{subtree:true,childList:true});
  fields().forEach(prepare);
}
