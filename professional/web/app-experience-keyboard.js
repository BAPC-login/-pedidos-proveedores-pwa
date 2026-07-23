import {$,$$} from './app-core.js';
let toolbar=null,active=null;
const fields=()=>$$('[data-core-quantity],[data-edit-quantity]').filter(input=>input.offsetParent!==null&&!input.disabled);
function position(){if(!toolbar||toolbar.classList.contains('hidden'))return;const viewport=window.visualViewport;toolbar.style.bottom=`${viewport?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0}px`}
function focus(direction){const list=fields(),next=list[list.indexOf(active)+direction];if(next){next.focus({preventScroll:true});next.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>next.select(),80)}else if(direction>0){active?.blur();$('#modalSubmit')?.focus()}}
function hide(){toolbar?.classList.add('hidden');document.body.classList.remove('quantity-keyboard-open');active=null}
export function initializeQuantityKeyboard(){
  toolbar=document.createElement('div');toolbar.className='quantity-keyboard-toolbar hidden';toolbar.innerHTML='<button type="button" data-qty-previous>↑ Anterior</button><button type="button" class="quantity-return" data-qty-next>↵ Siguiente</button><button type="button" data-qty-done>Ocultar</button>';document.body.append(toolbar);
  toolbar.querySelector('[data-qty-previous]').onclick=()=>focus(-1);toolbar.querySelector('[data-qty-next]').onclick=()=>focus(1);toolbar.querySelector('[data-qty-done]').onclick=()=>{active?.blur();hide()};
  document.addEventListener('focusin',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(!input)return;active=input;input.type='text';input.inputMode='decimal';input.enterKeyHint='next';input.autocomplete='off';toolbar.classList.remove('hidden');document.body.classList.add('quantity-keyboard-open');position()});
  document.addEventListener('focusout',()=>setTimeout(()=>{if(!document.activeElement?.matches?.('[data-core-quantity],[data-edit-quantity]'))hide()},120));
  document.addEventListener('input',event=>{const input=event.target.closest?.('[data-core-quantity],[data-edit-quantity]');if(!input)return;let value=input.value.replace(/[^0-9.,]/g,'').replace(',', '.');const parts=value.split('.');if(parts.length>2)value=`${parts.shift()}.${parts.join('')}`;if(input.value!==value)input.value=value});
  window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
}
