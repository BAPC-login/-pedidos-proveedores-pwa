import {state} from './app-core.js';

const urls=new Map(),inflight=new Map();

export async function protectedAssetUrl(key){
  const value=String(key||'');if(!value)return '';
  if(urls.has(value))return urls.get(value);
  if(inflight.has(value))return inflight.get(value);
  const request=fetch(`/api/files/${encodeURIComponent(value)}`,{headers:{Authorization:`Bearer ${state.token}`},cache:'force-cache'}).then(async response=>{
    if(!response.ok)return '';
    const url=URL.createObjectURL(await response.blob());urls.set(value,url);inflight.delete(value);return url;
  }).catch(()=>{inflight.delete(value);return ''});
  inflight.set(value,request);return request;
}

export async function hydrateProtectedImages(root=document){
  const images=[...root.querySelectorAll('img[data-protected-key]')];
  await Promise.all(images.map(async image=>{const url=await protectedAssetUrl(image.dataset.protectedKey);if(url){image.src=url;image.classList.add('loaded')}else image.closest('[data-logo-shell]')?.classList.add('missing')}));
}

export function clearProtectedAssets(){for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();inflight.clear()}
