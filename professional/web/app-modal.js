import {$,$$,esc,setBusy,toast} from './app-core.js';

let modalSequence=0;
const replaceTimers=new WeakMap();

function normalizeModalButtons(frame){
  frame.querySelectorAll('button:not([type])').forEach(button=>{button.type='button'});
}

function clearReplaceAnimation(dialog){
  const timer=replaceTimers.get(dialog);if(timer)clearTimeout(timer);replaceTimers.delete(dialog);dialog.classList.remove('modal-replacing');
}

function animateReplacement(dialog,frame){
  clearReplaceAnimation(dialog);
  void frame.offsetWidth;
  dialog.classList.add('modal-replacing');
  const finish=event=>{if(event&&event.target!==frame)return;clearReplaceAnimation(dialog);frame.removeEventListener('animationend',finish)};
  frame.addEventListener('animationend',finish);
  replaceTimers.set(dialog,setTimeout(()=>finish(),420));
}

export function closeModal(reason='cancel'){
  const dialog=$('#modal');
  if(dialog){clearReplaceAnimation(dialog);dialog.classList.remove('invoice-analysis-transition');dialog.removeAttribute('aria-busy')}
  if(dialog?.open)dialog.close(reason);
}

export function openModal({eyebrow='PEDIDOS PRO',title,subtitle='',body,submitLabel='Guardar',onSubmit,size='medium',hideSubmit=false,closeOnSuccess=true}){
  const dialog=$('#modal');
  const frame=$('#modalFrame');
  const sequence=++modalSequence;
  dialog.dataset.modalSequence=String(sequence);
  frame.noValidate=true;
  frame.dataset.size=size;
  $('#modalEyebrow').textContent=eyebrow;
  $('#modalTitle').textContent=title;
  $('#modalSubtitle').textContent=subtitle;
  $('#modalBody').innerHTML=body;
  $('#modalFoot').innerHTML=`
    <button class="btn" type="button" data-modal-close>Cancelar</button>
    ${hideSubmit?'':`<button class="btn primary" type="submit" id="modalSubmit">${esc(submitLabel)}</button>`}
  `;
  normalizeModalButtons(frame);
  if(!dialog.open){clearReplaceAnimation(dialog);dialog.showModal()}
  else animateReplacement(dialog,frame);

  $$('[data-modal-close]').forEach(button=>button.onclick=()=>closeModal('cancel'));
  if($('#modalClose'))$('#modalClose').onclick=()=>closeModal('cancel');
  dialog.oncancel=event=>{event.preventDefault();closeModal('cancel')};
  dialog.onclick=event=>{if(event.target===dialog)closeModal('backdrop')};

  frame.onsubmit=async event=>{
    event.preventDefault();
    event.stopPropagation();
    if(hideSubmit)return;
    if(!frame.reportValidity())return;
    const button=$('#modalSubmit');
    if(!button||button.disabled)return;
    const ownerSequence=sequence;
    setBusy(button,true,title==='Lista maestra'?'Creando documento…':/Analizar documento|Adjuntar documento/i.test(title)?'Leyendo y cotejando…':'Guardando…');
    try{
      if(typeof onSubmit!=='function')throw new Error('La acción de guardado no está disponible');
      await onSubmit(new FormData(frame),frame);
      const sameStep=dialog.open&&dialog.dataset.modalSequence===String(ownerSequence);
      if(closeOnSuccess&&sameStep)closeModal('saved');
    }catch(error){
      console.error('modal_submit_failed',error);
      toast(error?.message||'No se pudo completar la operación','error');
    }finally{
      if(button.isConnected&&dialog.dataset.modalSequence===String(ownerSequence))setBusy(button,false);
    }
  };
  return dialog;
}
