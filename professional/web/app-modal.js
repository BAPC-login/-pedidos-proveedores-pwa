import {$,$$,esc,setBusy,toast} from './app-core.js';

export function closeModal(reason='cancel'){
  const dialog=$('#modal');
  if(dialog?.open)dialog.close(reason);
}

export function openModal({eyebrow='PEDIDOS PRO',title,subtitle='',body,submitLabel='Guardar',onSubmit,size='medium',hideSubmit=false}){
  const dialog=$('#modal');
  const frame=$('#modalFrame');
  frame.noValidate=true;
  frame.dataset.size=size;
  $('#modalEyebrow').textContent=eyebrow;
  $('#modalTitle').textContent=title;
  $('#modalSubtitle').textContent=subtitle;
  $('#modalBody').innerHTML=body;
  $('#modalFoot').innerHTML=`
    <button class="btn" type="button" data-modal-close>Cancelar</button>
    ${hideSubmit?'':`<button class="btn primary" type="button" id="modalSubmit">${esc(submitLabel)}</button>`}
  `;
  if(dialog.open)dialog.close('replace');
  dialog.showModal();

  $$('[data-modal-close]').forEach(button=>button.onclick=()=>closeModal('cancel'));
  if($('#modalClose'))$('#modalClose').onclick=()=>closeModal('cancel');
  dialog.oncancel=event=>{event.preventDefault();closeModal('cancel')};
  dialog.onclick=event=>{if(event.target===dialog)closeModal('backdrop')};

  if(!hideSubmit){
    $('#modalSubmit').onclick=async()=>{
      if(!frame.reportValidity())return;
      const button=$('#modalSubmit');
      setBusy(button,true,'Guardando…');
      try{
        await onSubmit(new FormData(frame),frame);
        closeModal('saved');
      }catch(error){toast(error.message,'error')}
      finally{setBusy(button,false)}
    };
  }
  return dialog;
}
