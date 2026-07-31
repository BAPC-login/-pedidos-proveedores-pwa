UPDATE brand_workspaces
SET product_name='Nuvasto',
    tagline='Compras claras. Abastecimiento inteligente.',
    status=CASE WHEN status='registered' THEN 'registered' ELSE 'selected' END,
    candidates_json='[{"name":"Nuvasto","tagline":"Compras claras. Abastecimiento inteligente.","status":"selected"}]',
    palette_json='{"navy":"#08111F","primary":"#4031B8","secondary":"#178F73","accent":"#2BD6A0","cloud":"#F4F7FB"}',
    updated_at=datetime('now')
WHERE product_name!='Nuvasto'
   OR tagline!='Compras claras. Abastecimiento inteligente.'
   OR status='exploring';

UPDATE organizations
SET settings_json=json_set(
  CASE WHEN json_valid(settings_json) THEN settings_json ELSE '{}' END,
  '$.productBrand',
  json('{"name":"Nuvasto","tagline":"Compras claras. Abastecimiento inteligente.","descriptor":"Procurement OS","navy":"#08111F","primary":"#4031B8","secondary":"#178F73","accent":"#2BD6A0"}')
);

UPDATE organizations
SET settings_json=json_set(
  CASE WHEN json_valid(settings_json) THEN settings_json ELSE '{}' END,
  '$.branding.footerText',
  'Documento generado por Nuvasto'
)
WHERE COALESCE(json_extract(settings_json,'$.branding.footerText'),'') IN (
  '',
  'Documento generado por Pedidos Pro',
  'Documento de compra generado por la plataforma'
);
