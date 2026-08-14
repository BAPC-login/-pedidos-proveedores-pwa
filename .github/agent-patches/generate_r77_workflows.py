from pathlib import Path

def rep(text,old,new,label):
    if old not in text: raise SystemExit(f'missing {label}')
    return text.replace(old,new,1)

verify=Path('.github/workflows/verify.yml').read_text()
verify=rep(verify,"CLIENT_RELEASE='2026.08.14.76'","CLIENT_RELEASE='2026.08.14.77'",'verify client release')
verify=rep(verify,"PLATFORM_RELEASE='2026.08.14.76'","PLATFORM_RELEASE='2026.08.14.77'",'verify platform release')
verify=rep(verify,"grep -Fq \"'/api/finance/payment-candidates'\" professional/worker/src/routes/enterprise.js","grep -Fq \"'/api/finance/payment-candidates'\" professional/worker/src/routes/enterprise.js\n          grep -Fq \"'/api/finance/payment-proof-analysis'\" professional/worker/src/routes/enterprise.js\n          grep -Fq 'analyzePaymentProofCanonical' professional/worker/src/api/payment-proof-ai.js\n          grep -Fq 'Jamás inventes verificadores' professional/worker/src/api/payment-proof-ai.js",'verify proof backend')
verify=rep(verify,"grep -Fq 'openPaymentDocumentComposer' professional/web/app-payment-workflow.js","grep -Fq 'openPaymentDocumentComposer' professional/web/app-payment-workflow.js\n          grep -Fq 'paymentProofFile' professional/web/app-payment-workflow.js\n          grep -Fq '/api/finance/payment-proof-analysis' professional/web/app-payment-workflow.js\n          grep -Fq 'Gemini extrajo los verificadores' professional/web/app-payment-workflow.js\n          grep -Fq 'id=\"v30Payment\"' professional/web/app-order-detail-v30.js\n          grep -Fq \"import('./app-payment-workflow.js')\" professional/web/app-order-detail-v30.js",'verify proof frontend')
verify=rep(verify,"grep -Fq 'supplierInvoiceProfilesV76:true' professional/worker/src/router.js","grep -Fq 'supplierInvoiceProfilesV76:true' professional/worker/src/router.js\n          grep -Fq 'paymentProofGeminiV77:true' professional/worker/src/router.js\n          grep -Fq 'orderDetailPaymentsV77:true' professional/worker/src/router.js\n          grep -Fq 'catalogFlowConsolidationV77:true' professional/worker/src/router.js\n          grep -Fq 'Catálogo y recorrido' professional/web/app-experience-admin.js\n          grep -Fq \"catalogNav('centers')\" professional/web/app-experience-admin.js",'verify r77 health')
verify=rep(verify,'nuvasto-v76-supplier-final-unit','nuvasto-v77-payment-proof-ops','verify sw')

# Production deploy waits for backend flags and verifies the actual user-facing assets.
deploy=Path('.github/workflows/deploy-cloudflare.yml').read_text()
deploy=rep(deploy,"const r76=h.supplierFinalUnitReadersV76===true&&h.printedFinalUnitPricingV76===true&&h.supplierInvoiceProfilesV76===true;","const r76=h.supplierFinalUnitReadersV76===true&&h.printedFinalUnitPricingV76===true&&h.supplierInvoiceProfilesV76===true;\n            const r77=h.paymentProofGeminiV77===true&&h.orderDetailPaymentsV77===true&&h.catalogFlowConsolidationV77===true;",'deploy r77 flags')
deploy=rep(deploy,"process.stdout.write(storage&&runtime&&legacy&&r71&&r72&&r73&&r74&&r76&&migration?'true':'false');","process.stdout.write(storage&&runtime&&legacy&&r71&&r72&&r73&&r74&&r76&&r77&&migration?'true':'false');",'deploy r77 ready')
deploy=rep(deploy,"app-payment-workflow.js app-invoice-v30.js","app-payment-workflow.js app-order-detail-v30.js app-invoice-v30.js",'deploy detail asset')
deploy=rep(deploy,"grep -Fq 'openPaymentDocumentComposer' /tmp/app-payment-workflow.js || { echo '::error::no existe compositor canónico de documento de pago'; exit 1; }","grep -Fq 'openPaymentDocumentComposer' /tmp/app-payment-workflow.js || { echo '::error::no existe compositor canónico de documento de pago'; exit 1; }\n          grep -Fq 'paymentProofFile' /tmp/app-payment-workflow.js || { echo '::error::pagos no inicia por el comprobante'; exit 1; }\n          grep -Fq '/api/finance/payment-proof-analysis' /tmp/app-payment-workflow.js || { echo '::error::pagos no usa análisis Gemini del comprobante'; exit 1; }\n          grep -Fq 'Gemini extrajo los verificadores' /tmp/app-payment-workflow.js || { echo '::error::pagos no muestra verificadores extraídos por IA'; exit 1; }\n          grep -Fq 'id=\"v30Payment\"' /tmp/app-order-detail-v30.js || { echo '::error::detalle de pedido no expone Registrar pago'; exit 1; }\n          grep -Fq \"import('./app-payment-workflow.js')\" /tmp/app-order-detail-v30.js || { echo '::error::detalle de pedido no abre el flujo canónico de pagos'; exit 1; }",'deploy payment proof checks')
deploy=rep(deploy,'nuvasto-v76-supplier-final-unit','nuvasto-v77-payment-proof-ops','deploy sw')
deploy=rep(deploy,'lectores CCU/Pisquera/VSPT y precio final unitario verificados en producción.','lectores de factura, pagos Gemini y catálogo/recorrido verificados en producción.','deploy success copy')

out=Path('.github/generated');out.mkdir(parents=True,exist_ok=True)
(out/'verify-r77.yml.txt').write_text(verify)
(out/'deploy-r77.yml.txt').write_text(deploy)
print('generated r77 workflow guards')
