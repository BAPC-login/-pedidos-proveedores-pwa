export function matchProcurementDomain(path,method){
  if(method==='GET'&&path==='/api/dashboard/finance-v81')return{implementation:'procurement',layer:'dashboard-finance'};
  if(path.startsWith('/api/procurement-os-v44')||path.startsWith('/api/master-list-assist-v44')||path.startsWith('/api/master-list-favorites-v44')||path.startsWith('/api/procurement-intelligence-v44')||path.startsWith('/api/finance-planning-v44')||path.startsWith('/api/permissions-v44')||path.startsWith('/api/my-permissions-v44')||path.startsWith('/api/reception-evidence-v44')||path.startsWith('/api/jobs-v44')||path.startsWith('/api/system-health-v44')||path.startsWith('/api/global-search-v44'))return{implementation:'procurement',layer:'procurement'};
  if(method==='POST'&&/^\/api\/order-batches\/[^/]+\/emit$/.test(path))return{implementation:'procurement',layer:'emission'};
  if(method==='POST'&&path==='/api/invoices/analyze')return{implementation:'procurement',layer:'invoices'};
  if(method==='POST'&&/^\/api\/approvals\/[^/]+\/resolve$/.test(path))return{implementation:'procurement',layer:'approvals'};
  if(path==='/api/master-list-ordering'||path==='/api/master-list-ordering-v42'||(method==='POST'&&/^\/api\/order-batches\/[^/]+\/regenerate-documents$/.test(path)))return{implementation:'ordering',layer:'master-ordering'};
  return null;
}
