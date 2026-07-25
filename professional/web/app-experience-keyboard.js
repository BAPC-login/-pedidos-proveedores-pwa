import {$,$$} from './app-core.js';
let active=null,lastPointerTarget=null,advancing=false;
const fields=()=>$$('[data-core-quantity],[data-edit-quantity]').filter(input=>input.offsetParent!==null&&!input.disabled);
function focusNext(input){const list=fields(),next=list[list.indexOf(input)+1];if(next){advancing=true;next.focus({preventScroll:true});next.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>{next.select();advancing=false},60)}else{$('#modalSubmit')?.focus();active=null}}
function sanitize(input){let value=input.value.replace(/[^0-9.,]/g,'').replace(',', '.');const parts=value.split('.');if(parts.length>2)value=`${parts.shift()}.${parts.join('')}`;if(input.value!==value)input.value=value}
export function initializeQuantityKeyboard(){
  document.body.classList.add('native-quantity-keyboard');
  document.addEventListener('pointerdown',event=>{lastPointerTarget=event.target},{capture:true,passive:true});
  document.addEventListener('focusin',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(!input)return;active=input;input.type='text';input.inputMode='decimal';input.enterKeyHint='next';input.autocomplete='off';input.setAttribute('pattern','[0-9.,]*')});
  document.addEventListener('keydown',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(!input||event.key!=='Enter')return;event.preventDefault();sanitize(input);focusNext(input)});
  document.addEventListener('input',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(input)sanitize(input)});
  document.addEventListener('focusout',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(!input||advancing)return;const pointerWasAnotherField=lastPointerTarget?.closest?.('[data-core-quantity],[data-edit-quantity]');const pointerWasControl=lastPointerTarget?.closest?.('button,select,a,[data-modal-close]');setTimeout(()=>{if(document.activeElement?.matches?.('[data-core-quantity],[data-edit-quantity]'))return;if(!pointerWasAnotherField&&!pointerWasControl&&active===input)focusNext(input);active=null;lastPointerTarget=null},80)});
}
