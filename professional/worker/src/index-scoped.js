import platformWorker from './index.js';
import {authenticate} from './auth.js';
import {corsHeaders,errorResponse,ok,routeMatch,securityHeaders} from './core.js';
import {ensureSchema} from './schema.js';
import {dashboard,listProducts} from './api/catalog-scoped.js';
import {createCategoryV14,listUserCategoriesV14,updateCategoryV14} from './api/catalog-v14.js';
import {deleteCategoryToTrashV15,deleteProductToTrashV15,deleteSupplierToTrashV15} from './api/enterprise-v15.js';
import {commitCatalogWorkbookV17,listCatalogSnapshotsV17,previewCatalogWorkbookV17,restoreCatalogSnapshotV17} from './api/catalog-workbook-v17.js';
import {acceptLegalV17,commercialReadinessV17,createSupportTicketV17,listLegalV17,listSupportTicketsV17,manageSubscriptionV17,recordQaRunV17,runInvoiceBenchmarkV17,runIsolationAuditV17,saveLegalV17,saveOnboardingV17,updateSupportTicketV17,verifyRecoveryV17} from './api/readiness-v17.js';

const EXPECTED_UNIQUE_PRODUCTS=193,EXPECTED_SUPPLIERS=12,EXPECTED_PURCHASE_FORMATS=194;
function addPlatformHeaders(response,request,env){const headers=new Headers(response.headers),origin=request.headers.get('Origin')||'';for(const[name,value]of Object.entries(corsHeaders(origin,env)))headers.set(name,value);for(const[name,value]of Object.entries(securityHeaders()))headers.set(name,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers})}
async function health(env,schema){
  const[products,suppliers,purchaseFormats,owners,locations]=await Promise.all([env.DB.prepare('SELECT COUNT(*) AS total FROM products WHERE active=1').first(),env.DB.prepare('SELECT COUNT(*) AS total FROM suppliers WHERE active=1').first(),env.DB.prepare('SELECT COUNT(*) AS total FROM supplier_products WHERE active=1').first(),env.DB.prepare('SELECT COUNT(*) AS total FROM platform_owners').first(),env.DB.prepare('SELECT COUNT(*) AS total FROM locations WHERE active=1').first()]);
  const catalogProducts=Number(products?.total||0),catalogSuppliers=Number(suppliers?.total||0),catalogPurchaseFormats=Number(purchaseFormats?.total||0);
  return{service:'pedidos-pro-platform',version:'2.0.0-alpha.17',databaseConfigured:Boolean(env.DB),databaseInitialized:true,schemaVersion:schema.version,catalogReady:catalogProducts>=EXPECTED_UNIQUE_PRODUCTS&&catalogSuppliers>=EXPECTED_SUPPLIERS&&catalogPurchaseFormats>=EXPECTED_PURCHASE_FORMATS,catalogProducts,catalogSuppliers,catalogPurchaseFormats,catalogSourceRows:EXPECTED_PURCHASE_FORMATS,platformOwnerReady:Number(owners?.total||0)>0,activeLocations:Number(locations?.total||0),storageConfigured:Boolean(env.FILES||env.DB),storageBackend:env.FILES?'r2':'d1-chunks',r2Configured:Boolean(env.FILES),aiEndpoint:Boolean(env.AI_ENDPOINT),geminiConfigured:Boolean(env.GEMINI_API_KEY),persistentCatalog:true,persistentBranding:true,trashRestore:true,autosave:true,orderDuplication:true,costCenterBudgets:true,advancedReception:true,threeWayReconciliation:true,aliasLearning:true,priceAlerts:true,productPriceHistory:true,humanInvoiceReview:true,multichannelNotifications:true,realBilling:Boolean(env.MERCADOPAGO_ACCESS_TOKEN),backupRestore:true,r2Migration:true,commercialMonitoring:true,e2eReady:true,customDashboard:true,executiveExports:true,excelWorkbookImport:true,excelImportPreview:true,catalogRestorePoints:true,batchNativeShare:true,supplierLogoPdf:true,commercialReadinessCenter:true,tenantIsolationAudit:true,invoiceBenchmark:true,automaticOnboarding:true,legalAcceptance:true,supportTickets:true,recoveryVerification:true,environment:env.ENVIRONMENT||'development',timestamp:new Date().toISOString()};
}
export default{async fetch(request,env,ctx){
  const url=new URL(request.url),method=request.method.toUpperCase(),path=url.pathname;
  const categoryParams=routeMatch(path,'/api/categories/:id'),productParams=routeMatch(path,'/api/products/:id'),supplierParams=routeMatch(path,'/api/suppliers/:id'),snapshotRestoreParams=routeMatch(path,'/api/catalog/import-snapshots/:id/restore'),supportParams=routeMatch(path,'/api/readiness/support/:id');
  const scopedHealth=method==='GET'&&path==='/health',scopedDashboard=method==='GET'&&path==='/api/dashboard',scopedProducts=(method==='GET'&&path==='/api/products')||(method==='DELETE'&&Boolean(productParams)),scopedSuppliers=method==='DELETE'&&Boolean(supplierParams),scopedWorkbook=(method==='POST'&&['/api/catalog/import-workbook','/api/catalog/import-workbook/preview'].includes(path))||(method==='GET'&&path==='/api/catalog/import-snapshots')||(snapshotRestoreParams&&method==='POST');
  const scopedReadiness=path.startsWith('/api/readiness/')||path==='/api/readiness';
  const scopedCategories=(path==='/api/categories'&&['GET','POST'].includes(method))||(categoryParams&&['PATCH','DELETE'].includes(method));
  if(!scopedHealth&&!scopedDashboard&&!scopedProducts&&!scopedSuppliers&&!scopedCategories&&!scopedWorkbook&&!scopedReadiness)return platformWorker.fetch(request,env,ctx);
  try{
    const schema=await ensureSchema(env);
    if(scopedHealth)return addPlatformHeaders(ok(await health(env,schema),request,env),request,env);
    const actor=await authenticate(request,env);
    let payload;
    if(scopedDashboard)payload=await dashboard(env,actor);
    else if(path==='/api/catalog/import-workbook/preview'&&method==='POST')payload={preview:await previewCatalogWorkbookV17(request,env,actor)};
    else if(path==='/api/catalog/import-workbook'&&method==='POST')payload={result:await commitCatalogWorkbookV17(request,env,actor)};
    else if(path==='/api/catalog/import-snapshots'&&method==='GET')payload={snapshots:await listCatalogSnapshotsV17(env,actor)};
    else if(snapshotRestoreParams&&method==='POST')payload=await restoreCatalogSnapshotV17(request,env,actor,snapshotRestoreParams.id);
    else if(path==='/api/readiness'&&method==='GET')payload=await commercialReadinessV17(env,actor);
    else if(path==='/api/readiness/qa'&&method==='POST')payload={run:await recordQaRunV17(request,env,actor)};
    else if(path==='/api/readiness/isolation'&&method==='POST')payload={run:await runIsolationAuditV17(request,env,actor)};
    else if(path==='/api/readiness/benchmark'&&method==='POST')payload={run:await runInvoiceBenchmarkV17(request,env,actor)};
    else if(path==='/api/readiness/onboarding'&&method==='POST')payload=await saveOnboardingV17(request,env,actor);
    else if(path==='/api/readiness/subscription'&&method==='POST')payload={subscription:await manageSubscriptionV17(request,env,actor)};
    else if(path==='/api/readiness/recovery'&&method==='POST')payload={run:await verifyRecoveryV17(request,env,actor)};
    else if(path==='/api/readiness/support'&&method==='GET')payload={tickets:await listSupportTicketsV17(env,actor)};
    else if(path==='/api/readiness/support'&&method==='POST')payload={ticket:await createSupportTicketV17(request,env,actor)};
    else if(supportParams&&method==='PATCH')payload={ticket:await updateSupportTicketV17(request,env,actor,supportParams.id)};
    else if(path==='/api/readiness/legal'&&method==='GET')payload=await listLegalV17(env,actor);
    else if(path==='/api/readiness/legal'&&method==='POST')payload={document:await saveLegalV17(request,env,actor)};
    else if(path==='/api/readiness/legal/accept'&&method==='POST')payload=await acceptLegalV17(request,env,actor);
    else if(method==='GET'&&path==='/api/products')payload={products:await listProducts(env,actor,url)};
    else if(productParams&&method==='DELETE')payload=await deleteProductToTrashV15(request,env,actor,productParams.id);
    else if(supplierParams&&method==='DELETE')payload=await deleteSupplierToTrashV15(request,env,actor,supplierParams.id);
    else if(path==='/api/categories'&&method==='GET')payload={categories:await listUserCategoriesV14(env,actor)};
    else if(path==='/api/categories'&&method==='POST')payload={category:await createCategoryV14(request,env,actor)};
    else if(categoryParams&&method==='PATCH')payload={category:await updateCategoryV14(request,env,actor,categoryParams.id)};
    else if(categoryParams&&method==='DELETE')payload=await deleteCategoryToTrashV15(request,env,actor,categoryParams.id);
    else throw new Error('Ruta v17 no implementada');
    return addPlatformHeaders(ok(payload,request,env),request,env);
  }catch(error){if(Number(error?.status||500)>=500)console.error('scoped_request_failed',error);return addPlatformHeaders(errorResponse(error,request,env),request,env)}
}};
