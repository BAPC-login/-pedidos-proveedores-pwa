import {state} from './app-core.js';

export async function uploadFileDirectV45(file,{purpose='general',fileName=file?.name||'archivo',timeout=60000}={}){
  if(!(file instanceof Blob)||!file.size)throw new Error('Selecciona un archivo válido');
  const name=String(fileName||'archivo');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(5000,Number(timeout||60000)));
  try{
    const response=await fetch(`/api/files/direct-v45?purpose=${encodeURIComponent(purpose)}&name=${encodeURIComponent(name)}`,{
      method:'POST',
      headers:{Authorization:`Bearer ${state.token}`,'Content-Type':file.type||'application/octet-stream','X-File-Size':String(file.size),'X-File-Name':name},
      body:file,
      cache:'no-store',
      signal:controller.signal
    });
    const payload=await response.json().catch(()=>({}));
    if(response.ok&&payload.ok!==false&&payload.file)return payload.file;
    if(![404,405,501].includes(response.status))throw new Error(payload.error||'No se pudo subir el archivo');
  }catch(error){
    if(error?.name==='AbortError')throw new Error('La carga tardó demasiado. Intenta nuevamente.');
    if(!/No se pudo subir el archivo/.test(String(error?.message||'')))throw error;
  }finally{clearTimeout(timer)}

  const form=new FormData();form.append('file',file,name);
  const fallback=await fetch(`/api/files?purpose=${encodeURIComponent(purpose)}`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`},body:form,cache:'no-store'});
  const fallbackPayload=await fallback.json().catch(()=>({}));
  if(!fallback.ok||fallbackPayload.ok===false)throw new Error(fallbackPayload.error||'No se pudo subir el archivo');
  return fallbackPayload.file;
}
