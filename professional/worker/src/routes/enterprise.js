export function matchEnterpriseDomain(path,method){
  const exact=new Set(['/api/dashboard/analytics-v41','/api/receptions/work-queue','/api/finance/payments','/api/finance/payment-methods','/api/finance/cheques','/api/finance/payment-documents','/api/finance/payment-candidates','/api/finance/payment-proof-analysis','/api/approvals','/api/approval-policies','/api/order-templates','/api/notifications-v41','/api/report-views','/api/presence','/api/global-search','/api/supplier-scorecards','/api/orders/close-reconciled','/api/platform/usage-v41']);
  if(exact.has(path))return{implementation:'enterprise',layer:path.startsWith('/api/finance/')?'finance':'enterprise'};
  if(method==='POST'&&path==='/api/order-batches/v2')return{implementation:'enterprise',layer:'orders'};
  if(method==='POST'&&/^\/api\/orders\/[^/]+\/receptions$/.test(path))return{implementation:'enterprise',layer:'reception'};
  if(/^\/api\/suppliers\/[^/]+\/payment-terms$/.test(path))return{implementation:'enterprise',layer:'supplier-terms'};
  if(/^\/api\/receptions\/[^/]+\/(returns|difference-report)$/.test(path))return{implementation:'enterprise',layer:'reception-control'};
  if(/^\/api\/finance\/payments\/[^/]+$/.test(path))return{implementation:'enterprise',layer:'finance-payments'};
  if(/^\/api\/finance\/payment-methods\/[^/]+$/.test(path))return{implementation:'enterprise',layer:'finance-payment-methods'};
  if(/^\/api\/finance\/payment-documents\/[^/]+$/.test(path))return{implementation:'enterprise',layer:'finance-payment-documents'};
  if(/^\/api\/notifications-v41\/[^/]+$/.test(path))return{implementation:'enterprise',layer:'notifications'};
  if(/^\/api\/orders\/[^/]+\/(collaboration|comments|supplier-confirmation|substitutions)$/.test(path))return{implementation:'enterprise',layer:'order-collaboration'};
  if(method==='POST'&&path==='/api/invoices')return{implementation:'enterprise',layer:'invoices'};
  return null;
}
