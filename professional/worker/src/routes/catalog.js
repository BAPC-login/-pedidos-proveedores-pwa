export function matchCatalogDomain(path,method){
  if(method==='GET'&&/^\/api\/products\/[^/]+\/insights$/.test(path))return{implementation:'procurement',layer:'product-insights'};
  if(method==='PUT'&&/^\/api\/products\/[^/]+\/suppliers\/[^/]+\/manual-price$/.test(path))return{implementation:'procurement',layer:'product-price'};
  if(method==='PUT'&&/^\/api\/products\/[^/]+\/suppliers$/.test(path))return{implementation:'procurement',layer:'catalog'};
  const catalogMutation=['POST','PATCH','PUT','DELETE'].includes(method)&&(/^\/api\/(products|categories|suppliers|cost-centers|locations)(\/|$)/.test(path)||path.startsWith('/api/catalog/import'));
  if(catalogMutation)return{implementation:'procurement',layer:'catalog'};
  if(method==='PATCH'&&/^\/api\/products\/[^/]+\/status$/.test(path))return{implementation:'lifecycle',layer:'catalog-lifecycle'};
  if(path.startsWith('/api/master-data-v44'))return{implementation:'procurement',layer:'master-data'};
  return null;
}
