from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'.github/generated'
OUT.mkdir(parents=True,exist_ok=True)

def once(text,old,new,label):
    if old not in text: raise SystemExit(f'missing workflow anchor: {label}')
    return text.replace(old,new,1)

verify=(ROOT/'.github/workflows/verify.yml').read_text()
verify=verify.replace("CLIENT_RELEASE='2026.08.14.74'","CLIENT_RELEASE='2026.08.14.76'")
verify=verify.replace("PLATFORM_RELEASE='2026.08.14.74'","PLATFORM_RELEASE='2026.08.14.76'")
verify=verify.replace('nuvasto-v75-invoice-arithmetic','nuvasto-v76-supplier-final-unit')
old="""          grep -Fq 'normalizationVersion:76' professional/worker/src/invoice-normalizer.js
          grep -Fq 'allocateInvoicePricing' professional/worker/src/invoice-normalizer.js
          grep -Fq \"priceSource='invoice-total-tax-allocation'\" professional/worker/src/invoice-normalizer.js
          grep -Fq 'documentTotalComputed' professional/worker/src/invoice-normalizer.js
          grep -Fq 'checksumDelta' professional/worker/src/invoice-normalizer.js
          grep -Fq 'orderId:queue.orderId' professional/web/app-multi-invoice.js
          grep -Fq 'Bruto final calculado' professional/web/app-multi-invoice.js
          grep -Fq 'Precio trazable desde la factura' professional/web/app-multi-invoice.js
"""
new="""          grep -Fq 'normalizationVersion:76' professional/worker/src/invoice-normalizer.js
          grep -Fq 'allocateInvoicePricing' professional/worker/src/invoice-normalizer.js
          grep -Fq 'printed-final-unit-column' professional/worker/src/invoice-normalizer.js
          grep -Fq \"priceSource:'printed-final-unit'\" professional/worker/src/invoice-normalizer.js
          grep -Fq 'supplier-total-x-unidad' professional/worker/src/invoice-normalizer.js
          grep -Fq 'documentTotalComputed' professional/worker/src/invoice-normalizer.js
          grep -Fq 'checksumDelta' professional/worker/src/invoice-normalizer.js
          grep -Fq 'finalUnitPrice' worker/src/index.js
          grep -Fq 'Total x Unidad' worker/src/index.js
          grep -Fq 'PISQUERA DE CHILE' worker/src/index.js
          grep -Fq 'VINA SAN PEDRO' worker/src/index.js
          grep -Fq 'orderId:queue.orderId' professional/web/app-multi-invoice.js
          grep -Fq 'Precio final impreso · Total x Unidad' professional/web/app-multi-invoice.js
          grep -Fq 'data-printed-final-unit' professional/web/app-multi-invoice.js
          grep -Fq 'supplierFinalUnitReadersV76:true' professional/worker/src/router.js
          grep -Fq 'printedFinalUnitPricingV76:true' professional/worker/src/router.js
          grep -Fq 'supplierInvoiceProfilesV76:true' professional/worker/src/router.js
"""
verify=once(verify,old,new,'verify invoice price contract')
(OUT/'verify.yml.txt').write_text(verify)

deploy=(ROOT/'.github/workflows/deploy-cloudflare.yml').read_text()
deploy=deploy.replace('nuvasto-v75-invoice-arithmetic','nuvasto-v76-supplier-final-unit')
old="""            const r74=h.domainRouterV74===true&&h.paymentDocumentsV74===true&&h.collectivePaymentAllocationV74===true&&h.sameSupplierPaymentV74===true&&h.multiInvoicePaymentV74===true&&h.multiOrderPaymentV74===true;
            process.stdout.write(storage&&runtime&&legacy&&r71&&r72&&r73&&r74&&migration?'true':'false');
"""
new="""            const r74=h.domainRouterV74===true&&h.paymentDocumentsV74===true&&h.collectivePaymentAllocationV74===true&&h.sameSupplierPaymentV74===true&&h.multiInvoicePaymentV74===true&&h.multiOrderPaymentV74===true;
            const r76=h.supplierFinalUnitReadersV76===true&&h.printedFinalUnitPricingV76===true&&h.supplierInvoiceProfilesV76===true;
            process.stdout.write(storage&&runtime&&legacy&&r71&&r72&&r73&&r74&&r76&&migration?'true':'false');
"""
deploy=once(deploy,old,new,'deploy health contract')
old="""          grep -Fq 'Bruto final calculado' /tmp/app-multi-invoice.js || { echo '::error::revisión de factura no muestra bruto final calculado'; exit 1; }
          grep -Fq 'Precio trazable desde la factura' /tmp/app-multi-invoice.js || { echo '::error::revisión no explica la trazabilidad de precio'; exit 1; }
"""
new="""          grep -Fq 'Precio final impreso · Total x Unidad' /tmp/app-multi-invoice.js || { echo '::error::revisión no expone el precio final unitario impreso'; exit 1; }
          grep -Fq 'data-printed-final-unit' /tmp/app-multi-invoice.js || { echo '::error::revisión no preserva la columna Total x Unidad'; exit 1; }
"""
deploy=once(deploy,old,new,'deploy final unit UI contract')
deploy=deploy.replace('precios de factura y contexto de pedido verificados en producción','lectores CCU/Pisquera/VSPT y precio final unitario verificados en producción')
(OUT/'deploy-cloudflare.yml.txt').write_text(deploy)
print('generated guarded r76 workflows')
