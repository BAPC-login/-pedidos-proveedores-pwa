import {$,esc,setBusy,toast} from './app-core.js';

export function openModal({eyebrow='PEDIDOS PRO',title,subtitle='',body,submitLabel='Guardar',onSubmit}){
  $('#modalEyebrow').textContent=eyebrow;
  $('#modalTitle').textContent=title;
  $('#modalSubtitle').textContent=subtitle;
  $('#modalBody').innerHTML=body;
  $('#modalFoot').innerHTML='<button class="btn" value="cancel">Cancelar</button><button class="btn primary" type="button" id="modalSubmit">'+esc(submitLabel)+'</button>';
  const dialog=$('#modal');
  if(dialog.open)dialog.close();
  dialog.showModal();
  $('#modalSubmit').onclick=async()=>{
    const button=$('#modalSubmit');
    setBusy(button,true);
    try{
      await onSubmit(new FormData($('#modalFrame')));
      if(dialog.open)dialog.close();
    }catch(error){toast(error.message,'error')}
    finally{setBusy(button,false)}
  };
  return dialog;
}
