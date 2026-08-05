import './app-regression-guard-v28.js';

const VERSION='27-compat';
const nativeFetch=window.fetch.bind(window);

window.fetch=function(input,init={}){
  let pathname='';
  try{pathname=new URL(typeof input==='string'?input:input.url,location.href).pathname}catch{}
  if(pathname!=='/api/invoices/analyze')return nativeFetch(input,init);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),95000);
  const upstream=init.signal;
  if(upstream?.aborted&&upstream.reason!=='request_timeout')controller.abort(upstream.reason);
  return nativeFetch(input,{...init,signal:controller.signal}).finally(()=>clearTimeout(timer));
};

window.NuvastoV27=Object.freeze({version:VERSION,supersededBy:'v28'});
