import platformWorker from './index-v27.js';

const VERSION='28';
const RELEASE_VERSION='2.0.0-alpha.28';

function decorate(response,env){
  const headers=new Headers(response.headers);
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Storage',env.FILES?'r2':'unavailable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

async function health(request,env,ctx){
  const response=await platformWorker.fetch(request,env,ctx);
  const payload=await response.clone().json().catch(()=>({}));
  const r2Configured=Boolean(env.FILES);
  const r2Required=String(env.REQUIRE_R2||'').toLowerCase()==='true';
  const headers=new Headers(response.headers);
  headers.set('Content-Type','application/json; charset=utf-8');
  headers.set('X-Nuvasto-Version',VERSION);
  headers.set('X-Nuvasto-Storage',r2Configured?'r2':'unavailable');
  return new Response(JSON.stringify({
    ...payload,
    service:'nuvasto',
    productName:'Nuvasto',
    version:RELEASE_VERSION,
    r2Configured,
    r2Required,
    r2Ready:r2Configured&&(!r2Required||r2Configured),
    r2Bucket:'nuvasto-files',
    storageConfigured:r2Configured,
    storageBackend:r2Configured?'r2':'unavailable',
    storageFallback:r2Configured?'none':'disabled',
    invoiceNormalizationVersion:26,
    invoiceFlowVersion:28,
    keyboardNavigationVersion:28,
    modalFlowVersion:28,
    regressionSuiteVersion:28
  }),{status:response.status,statusText:response.statusText,headers});
}

export default{
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method.toUpperCase()==='GET'&&url.pathname==='/health')return health(request,env,ctx);
    return decorate(await platformWorker.fetch(request,env,ctx),env);
  }
};
