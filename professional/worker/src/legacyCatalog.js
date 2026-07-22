const LEGACY_ITEMS = Object.freeze([["GIN BEEFEATER","PISQUERA","CAJA (6)"],["GIN BEEFEATER PINK","PISQUERA","CAJA (6)"],["GIN MONKEY","PISQUERA","UNIDAD"],["GIN HENDRICKS","DESA","UNIDAD"],["GIN TANQUERAY","COCA-COLA","UNIDAD"],["GIN TANQUERAY ROYALE","COCA-COLA","UNIDAD"],["GIN TANQUERAY SEVILLA","COCA-COLA","UNIDAD"],["GIN TANQUERAY BOSSA NOVA","COCA-COLA","UNIDAD"],["GIN TANQUERAY 0","TROPEZON","UNIDAD"],["GIN TANQUERAY TEN","COCA-COLA","UNIDAD"],["GIN SANTOS","TROPEZON","CAJA (6)"],["GIN LARÚ","Larú","CAJA (6)"],["GIN MALFY ORIGINAL","PISQUERA","UNIDAD"],["GIN MALFY LIMON","PISQUERA","UNIDAD"],["GIN MALFY ROSA","PISQUERA","UNIDAD"],["LICOR RAMAZZOTTI","PISQUERA","CAJA (6)"],["LICOR RAMAZZOTTI VIOLETTO","PISQUERA","CAJA (6)"],["LICOR APEROL LITRO","DESA","UNIDAD"],["LICOR ST-GERMAIN","TROPEZON","UNIDAD"],["LICOR CHAMBORD","DESA","UNIDAD"],["LICOR JAGERMEISTER","DESA","CAJA (6)"],["LICOR FRANGELICO","DESA","UNIDAD"],["LICOR BAILEYS","COCA-COLA","UNIDAD"],["LICOR DRAMBUI","DESA","UNIDAD"],["LICOR CAMPARI","DESA","UNIDAD"],["LICOR FERNET BRANCA","PISQUERA","UNIDAD"],["LICOR CACHACA","DESA","UNIDAD"],["LICOR AMARETTO DISSARONO","DESA","UNIDAD"],["LICOR KAHLUA","PISQUERA","UNIDAD"],["LICOR BORGHETTI","PISQUERA","UNIDAD"],["LICOR TRIPLE SEC","DESA","UNIDAD"],["LICOR CURACAO","DESA","UNIDAD"],["LICOR DE CASSIS","DESA","UNIDAD"],["LICOR DE CACAO","DESA","UNIDAD"],["LICOR VERMUT MARTINI ROSSO","TROPEZON","UNIDAD"],["LICOR VERMUT MARTINI BIANCO","TROPEZON","UNIDAD"],["LICOR VERMUT MARTINI FIERO","TROPEZON","UNIDAD"],["LICOR VERMUT MARTINI EXTRA DRY","TROPEZON","UNIDAD"],["PISCO ALTO DEL CARMEN 35 LITRO","COCA-COLA","CAJA (6)"],["PISCO ALTO DEL CARMEN 35 750","COCA-COLA","CAJA (6)"],["PISCO ALTO DEL CARMEN 40","COCA-COLA","CAJA (6)"],["PISCO ALTO TRANSPARENTE","COCA-COLA","CAJA (6)"],["PISCO MISTRAL 35","PISQUERA","CAJA (12)"],["PISCO MISTRAL NOBEL","PISQUERA","CAJA (6)"],["PISCO MISTRAL NOBEL BARRICA TOSTADA","PISQUERA","CAJA (6)"],["PISCO MISTRAL NOBEL APPLE","PISQUERA","CAJA (6)"],["PISCO MISTRAL NOBEL CRISTALINO","PISQUERA","CAJA (6)"],["PISCO MISTRAL GRAN NOBEL","PISQUERA","CAJA (4)"],["PISCO ESPIRITU DE LOS ANDES","PISQUERA","UNIDAD"],["PISCO DIABLO LITRO","PEUMO","CAJA (6)"],["PISCO DIABLO ROSÉ","PEUMO","CAJA (6)"],["PISCO DIABLO 40","PEUMO","CAJA (6)"],["PISCO DIABLO TRANSPARENTE","PEUMO","CAJA (6)"],["PISCO MAL PASO 35","PEUMO","CAJA (6)"],["PISCO MAL PASO ROBLE","PEUMO","CAJA (6)"],["PISCO MAL PASO PEDRO JIMENEZ","PEUMO","CAJA (6)"],["PISCO MAL PASO APPLE","PEUMO","CAJA (6)"],["PISCO MAL PASO VAINILLA","PEUMO","CAJA (6)"],["PISCO MAL PASO TROPICAL","PEUMO","CAJA (6)"],["PISCO MAL PASO ICONO","PEUMO","CAJA (4)"],["RON PAMPERO ANIVERSARIO","DESA","UNIDAD"],["RON HAVANA ESPECIAL","TROPEZON","UNIDAD"],["RON HAVANA 7","TROPEZON","UNIDAD"],["RON HAVANA BLANCO LITRO","PISQUERA","CAJA (6)"],["RON DE COCO","PISQUERA","UNIDAD"],["TEQUILA OLMECA BLANCO","PISQUERA","CAJA (6)"],["TEQUILA OLMECA REPOSADO","PISQUERA","CAJA (6)"],["TEQUILA DON JULIO","COCA-COLA","UNIDAD"],["VOD ABSOLUT BLUE","PISQUERA","UNIDAD"],["VOD ABSOLUT CITRON","PISQUERA","UNIDAD"],["VOD ABSOLUT PEARS","PISQUERA","UNIDAD"],["VOD ABSOLUT RASPBERRY","PISQUERA","UNIDAD"],["VOD ABSOLUT MANGO","PISQUERA","UNIDAD"],["VOD ABSOLUT LIME","PISQUERA","UNIDAD"],["VOD STOLICHNAYA LITRO","DESA","UNIDAD"],["VOD GREY GOOSE","TROPEZON","UNIDAD"],["WHIS JACK DANIELS","DESA","UNIDAD"],["WHIS JACK DANIELS HONEY","DESA","UNIDAD"],["WHIS JACK DANIELS FIRE","DESA","UNIDAD"],["WHIS JACK DANIELS APPLE","DESA","UNIDAD"],["WHIS JACK DANIELS GENTLEMAN","DESA","UNIDAD"],["WHIS JACK DANIELS SINGLE BARREL","DESA","UNIDAD"],["WHIS JW RED LABEL","COCA-COLA","UNIDAD"],["WHIS JW BLACK LABEL","COCA-COLA","UNIDAD"],["WHIS JW DOBLE BLACK","COCA-COLA","UNIDAD"],["WHIS JW GREEN LABEL","COCA-COLA","UNIDAD"],["WHIS JW GOLD LABEL","COCA-COLA","UNIDAD"],["WHIS BUCHANANS","COCA-COLA","UNIDAD"],["WHIS BALLANTINES","PISQUERA","CAJA (6)"],["WHIS CHIVAS 12","PISQUERA","UNIDAD"],["WHIS CHIVAS 18","PISQUERA","UNIDAD"],["WHIS JAMESON","PISQUERA","UNIDAD"],["WHIS GUILIGAN'S","PEUMO","UNIDAD"],["CLOSS DE PIRQUE","PEUMO","CAJA (6)"],["VINO 1865 MASTER BLEND","VIÑA SAN PEDRO","CAJA (6)"],["VINO CASTILLO MOLINA CARMENERE","VIÑA SAN PEDRO","CAJA (12)"],["VINO CASTILLO MOLINA CS","VIÑA SAN PEDRO","CAJA (12)"],["VINO DIABLO DARK RED","PEUMO","UNIDAD"],["VINO DIABLO DEEP CAR","PEUMO","UNIDAD"],["VINO EPU","PEUMO","UNIDAD"],["VINO GRAN RESERVA CS","PEUMO","UNIDAD"],["VINO LATE HARVEST","PEUMO","UNIDAD"],["VINO MARQUÉS CASA Y CONCHA CAR","PEUMO","CAJA (6)"],["VINO MARQUÉS CASA Y CONCHA CS","PEUMO","CAJA (6)"],["VINO MARQUÉS CASA Y CONCHA MERLOT","PEUMO","CAJA (6)"],["VINO MARQUÉS CASA Y CONCHA PINOT NOIR","PEUMO","CAJA (6)"],["VINO MARQUÉS CASA Y CONCHA CHARDONNAY","PEUMO","CAJA (6)"],["VINO MARQUÉS CASA Y CONCHA ET NEGRA","PEUMO","CAJA (6)"],["VINO MARQUÉS CASA Y CONCHA HERITAJE","PEUMO","UNIDAD"],["VINO MARQUÉS CASA Y CONCHA BLUE CAR","PEUMO","CAJA (6)"],["VINO MARQUÉS CASA Y CONCHA GOLD CS","PEUMO","CAJA (6)"],["VINO TERRUNYO CAR","PEUMO","UNIDAD"],["VINO TERRUNYO CS","PEUMO","UNIDAD"],["VINO AMELIA CHAR","PEUMO","UNIDAD"],["VINO PATAGONIA CAR","PEUMO","CAJA (6)"],["VINO PATAGONIA CS","PEUMO","CAJA (6)"],["VINO PATAGONIA CHARDONNAY","PEUMO","CAJA (6)"],["VINO THE WINE CARMENERE","PEUMO","CAJA (12)"],["VINO THE WINE CABERNET SAUVIGNON","PEUMO","CAJA (12)"],["VINO THE WINE SAUVIGNON BLANC","PEUMO","CAJA (12)"],["VINO PÉREZ CRUZ CAR","VINOTECA","CAJA (6)"],["VINO PÉREZ CRUZ CS","VINOTECA","CAJA (6)"],["VINO TARAPACÁ ET ROJA CS SYRAH","VIÑA SAN PEDRO","CAJA (12)"],["VINO TARAPACÁ ETIQUETA BLANCA CARMENERE","VIÑA SAN PEDRO","CAJA (12)"],["VINO TARAPACÁ ETIQUETA BLANCA CS","VIÑA SAN PEDRO","CAJA (12)"],["VINO TARAPACÁ ETIQUETA NEGRA CARMENERE","VIÑA SAN PEDRO","CAJA (12)"],["VINO TARAPACÁ ETIQUETA NEGRA CS","VIÑA SAN PEDRO","CAJA (12)"],["VINO TARAPACÁ ETIQUETA BLANCA CHARDONNAY","VIÑA SAN PEDRO","CAJA (12)"],["ESP SPARKLING BRUT","PEUMO","CAJA (12)"],["ESP VIÑA MAR DESALCOHOLIZADO","VIÑA SAN PEDRO","CAJA (6)"],["ESP VIÑA MAR SWEET","VIÑA SAN PEDRO","CAJA (6)"],["ESP DIABLO BRUT","PEUMO","CAJA (6)"],["ESP CONO SUR BRUT","PEUMO","CAJA (6)"],["LATA COCA COLA NORMAL 350","COCA-COLA","DISPLAY"],["LATA COCA COLA CERO 350","COCA-COLA","DISPLAY"],["LATA SPRITE NORMAL 350","COCA-COLA","DISPLAY"],["LATA SPRITE CERO 350","COCA-COLA","DISPLAY"],["LATA TONICA NORMAL 310","CCU","DISPLAY"],["LATA TONICA CERO  310","CCU","DISPLAY"],["LATA FANTA 350","COCA-COLA","DISPLAY"],["LATA GINGER ALE 310","CCU","DISPLAY"],["LATA GINGER ALE CERO 310","CCU","DISPLAY"],["LATA PEPSI CERO 350","CCU","DISPLAY"],["REDBULL NORMAL","CCU","DISPLAY"],["REDBULL CERO","CCU","DISPLAY"],["REDBULL SANDIA","CCU","DISPLAY"],["REDBULL MARACUYA","CCU","DISPLAY"],["REDBULL ACAI","CCU","DISPLAY"],["REDBULL ARANDANO","CCU","DISPLAY"],["REDBULL DRAGON","CCU","DISPLAY"],["PORVENIR CON GAS VIDRIO","CCU","DISPLAY"],["PORVENIR SIN GAS VIDRIO","CCU","DISPLAY"],["JUGO WATTS NARANJA 1.5","CCU","DISPLAY"],["TONICA 1.5","CCU","DISPLAY"],["AGUA CON GAS 1.5","CCU","DISPLAY"],["CERV HEINEKEN","CCU","DISPLAY"],["CERV HEINEKEN CERO","CCU","DISPLAY"],["CERV KUNSTMANN CERO","CCU","DISPLAY"],["CERV KUNSTMANN LAGER SIN FILTRAR","CCU","DISPLAY"],["CERV KUNSTMANN TOROBAYO","CCU","DISPLAY"],["CERV KUNSTMANN BOCK","CCU","DISPLAY"],["CERV KUNSTMANN MIEL","CCU","DISPLAY"],["CERV AUSTRAL CALAFATE","CCU","DISPLAY"],["CERV KROSS 5","PEUMO","DISPLAY"],["CERV DELIRIUM TREMENS","SOCAIBA","DISPLAY"],["CERV DELIRIUM RED","SOCAIBA","DISPLAY"],["CERV CUELLO NEGRO STOUT","SOCAIBA","DISPLAY"],["CERV CUELLO NEGRO AMBAR","SOCAIBA","DISPLAY"],["CERV MILLER","PEUMO","DISPLAY"],["CERV FREE DAMM","PEUMO","DISPLAY"],["FENTIMANS ROSE","DESA","DISPLAY"],["FENTIMANS TONICA","DESA","DISPLAY"],["FENTIMANS GINGER BEER","DESA","DISPLAY"],["FENTIMANS POMELO","DESA","DISPLAY"],["BARRIL TOROBAYO","CCU","UNIDAD"],["BARRIL VPL","CCU","UNIDAD"],["BARRIL CALAFATE","CCU","UNIDAD"],["BARRIL HEINEKEN","CCU","UNIDAD"],["BARRIL KROSS GOLDEN","PEUMO","UNIDAD"],["BARRIL KROSS 5","PEUMO","UNIDAD"],["BARRIL ESTRELLA","PEUMO","UNIDAD"],["BARRIL BLUE MOON","PEUMO","UNIDAD"],["TANQUE CO2","PEUMO","UNIDAD"],["TANQUE CO2","CCU","UNIDAD"],["PULPA PIÑA","PURO MAR","KG"],["PULPA MANGO","PURO MAR","KG"],["PULPA FRAMBUESA","PURO MAR","KG"],["PULPA MARACUYÁ","PURO MAR","KG"],["PULPA MELON TUNA","PURO MAR","KG"],["FRAMBUESA CONGELADA","PURO MAR","KG"],["ARANDANO CONGELADO","PURO MAR","KG"],["CREMA COCO","BIDFOOD","UNIDAD"],["CREMA","BIDFOOD","UNIDAD"],["AZÚCAR","BIDFOOD","KG"]]);

const LEGACY_CATEGORIES = Object.freeze([
  'Bebidas sin alcohol','Cervezas','Vinos','Espumantes','Pisco','Ron','Vodka',
  'Gin','Whisky','Tequila','Licores','Insumos','Abarrotes','Otros'
]);

const SEED_KEY = 'madriguera-bar-catalog-v1';

function normalize(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function categoryFor(name) {
  const value = String(name || '').toUpperCase();
  if (value.startsWith('GIN ')) return 'Gin';
  if (value.startsWith('LICOR ')) return 'Licores';
  if (value.startsWith('PISCO ')) return 'Pisco';
  if (value.startsWith('RON ')) return 'Ron';
  if (value.startsWith('TEQUILA ')) return 'Tequila';
  if (value.startsWith('VOD ')) return 'Vodka';
  if (value.startsWith('WHIS ')) return 'Whisky';
  if (value.startsWith('VINO ') || value.startsWith('CLOSS ')) return 'Vinos';
  if (value.startsWith('ESP ')) return 'Espumantes';
  if (value.startsWith('CERV ') || value.startsWith('BARRIL ')) return 'Cervezas';
  if (/^(LATA |REDBULL |PORVENIR |JUGO |TONICA |AGUA |FENTIMANS )/.test(value)) return 'Bebidas sin alcohol';
  if (value.startsWith('AZÚCAR')) return 'Abarrotes';
  return 'Insumos';
}

function supplierName(value) {
  return String(value || '').toUpperCase() === 'LARÚ' ? 'Larú' : String(value || '').toUpperCase();
}

function formatMeta(format) {
  const value = String(format || '').toUpperCase();
  const pack = value.match(/\((\d+)\)/);
  if (value.startsWith('CAJA')) return {orderUnit:'CAJA', unitsPerOrderUnit:Number(pack?.[1] || 1), baseUnit:'unidad'};
  if (value === 'DISPLAY') return {orderUnit:'DISPLAY', unitsPerOrderUnit:1, baseUnit:'unidad'};
  if (value === 'KG') return {orderUnit:'KG', unitsPerOrderUnit:1, baseUnit:'kg'};
  return {orderUnit:'UNIDAD', unitsPerOrderUnit:1, baseUnit:'unidad'};
}

async function runBatches(db, statements, size = 45) {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

export async function seedLegacyCatalog(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS data_seed_state (
      seed_key TEXT PRIMARY KEY,
      item_count INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT NOT NULL
    )
  `).run();

  const completed = await db.prepare('SELECT item_count FROM data_seed_state WHERE seed_key = ?').bind(SEED_KEY).first();
  const organization = await db.prepare("SELECT id FROM organizations WHERE slug = 'pedidos-pro' LIMIT 1").first();
  if (!organization) return {seeded:false, itemCount:0, reason:'organization_missing'};

  const timestamp = new Date().toISOString();
  const location = await db.prepare('SELECT id FROM locations WHERE org_id = ? ORDER BY created_at ASC LIMIT 1').bind(organization.id).first();
  if (!location) return {seeded:false, itemCount:0, reason:'location_missing'};

  await db.batch([
    db.prepare(`UPDATE organizations SET name = 'Madriguera', settings_json = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify({brand:true, source:'legacy-catalog'}), timestamp, organization.id),
    db.prepare(`UPDATE locations SET name = 'Madriguera Clubhaus', code = 'MDR', updated_at = ? WHERE id = ? AND org_id = ?`)
      .bind(timestamp, location.id, organization.id),
    db.prepare(`INSERT OR IGNORE INTO platform_owners (user_id, created_at)
      SELECT id, ? FROM users WHERE email = 'admin@pedidospro.local' LIMIT 1`).bind(timestamp),
    db.prepare(`INSERT OR IGNORE INTO cost_centers
      (id, org_id, location_id, name, code, active, created_at, updated_at)
      VALUES (?, ?, ?, 'Barra', 'BARRA', 1, ?, ?)`).bind(`${location.id}-cc-barra`, organization.id, location.id, timestamp, timestamp),
    db.prepare(`INSERT OR IGNORE INTO cost_centers
      (id, org_id, location_id, name, code, active, created_at, updated_at)
      VALUES (?, ?, ?, 'Salón', 'SALON', 1, ?, ?)`).bind(`${location.id}-cc-salon`, organization.id, location.id, timestamp, timestamp),
    db.prepare(`INSERT OR IGNORE INTO cost_centers
      (id, org_id, location_id, name, code, active, created_at, updated_at)
      VALUES (?, ?, ?, 'Cocina', 'COCINA', 1, ?, ?)`).bind(`${location.id}-cc-cocina`, organization.id, location.id, timestamp, timestamp)
  ]);

  if (Number(completed?.item_count || 0) >= LEGACY_ITEMS.length) {
    return {seeded:false, itemCount:LEGACY_ITEMS.length, alreadyCompleted:true};
  }

  const categoryStatements = LEGACY_CATEGORIES.map((name, index) =>
    db.prepare(`INSERT OR IGNORE INTO categories
      (id, org_id, name, sort_order, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 1, ?, ?)`)
      .bind(`legacy-category-${normalize(name)}`, organization.id, name, index + 1, timestamp, timestamp)
  );
  await runBatches(db, categoryStatements);

  const suppliers = [...new Set(LEGACY_ITEMS.map(item => supplierName(item[1])))];
  const supplierStatements = suppliers.map(name =>
    db.prepare(`INSERT OR IGNORE INTO suppliers
      (id, org_id, name, legal_name, rut, email, phone, contact_name, lead_days, cutoff_time,
       minimum_order, payment_terms, settings_json, active, created_at, updated_at)
      VALUES (?, ?, ?, '', '', '', '', '', 0, '', 0, '', ?, 1, ?, ?)`)
      .bind(`legacy-supplier-${normalize(name)}`, organization.id, name, JSON.stringify({source:'legacy-catalog'}), timestamp, timestamp)
  );
  await runBatches(db, supplierStatements);

  const productStatements = LEGACY_ITEMS.map((item, index) => {
    const [name, , format] = item;
    const meta = formatMeta(format);
    return db.prepare(`INSERT OR IGNORE INTO products
      (id, org_id, category_id, name, brand, variant, content_value, content_unit, base_unit, barcode,
       active, created_at, updated_at)
      SELECT ?, ?, c.id, ?, '', '', 0, ?, ?, '', 1, ?, ?
      FROM categories c WHERE c.org_id = ? AND c.name = ? LIMIT 1`)
      .bind(
        `legacy-product-${String(index + 1).padStart(3, '0')}`,
        organization.id,
        name,
        meta.baseUnit === 'kg' ? 'kg' : 'unidad',
        meta.baseUnit,
        timestamp,
        timestamp,
        organization.id,
        categoryFor(name)
      );
  });
  await runBatches(db, productStatements);

  const relationStatements = LEGACY_ITEMS.map((item, index) => {
    const [name, supplier, format] = item;
    const meta = formatMeta(format);
    return db.prepare(`INSERT OR IGNORE INTO supplier_products
      (id, org_id, supplier_id, product_id, supplier_sku, supplier_name, order_unit,
       units_per_order_unit, minimum_quantity, quantity_multiple, last_gross_unit_price,
       active, created_at, updated_at)
      SELECT ?, ?, s.id, p.id, '', p.name, ?, ?, 0, 1, 0, 1, ?, ?
      FROM suppliers s JOIN products p ON p.org_id = s.org_id
      WHERE s.org_id = ? AND s.name = ? AND p.name = ? LIMIT 1`)
      .bind(
        `legacy-supplier-product-${String(index + 1).padStart(3, '0')}`,
        organization.id,
        meta.orderUnit,
        meta.unitsPerOrderUnit,
        timestamp,
        timestamp,
        organization.id,
        supplierName(supplier),
        name
      );
  });
  await runBatches(db, relationStatements);

  const barra = await db.prepare(`SELECT id FROM cost_centers WHERE org_id = ? AND location_id = ? AND code = 'BARRA' LIMIT 1`)
    .bind(organization.id, location.id).first();
  if (barra) {
    await db.prepare(`INSERT OR IGNORE INTO product_cost_centers (org_id, product_id, cost_center_id, created_at)
      SELECT ?, p.id, ?, ? FROM products p WHERE p.org_id = ?`)
      .bind(organization.id, barra.id, timestamp, organization.id).run();
  }

  await db.prepare(`INSERT INTO data_seed_state (seed_key, item_count, completed_at)
    VALUES (?, ?, ?) ON CONFLICT(seed_key) DO UPDATE SET item_count = excluded.item_count, completed_at = excluded.completed_at`)
    .bind(SEED_KEY, LEGACY_ITEMS.length, timestamp).run();

  return {seeded:true, itemCount:LEGACY_ITEMS.length, supplierCount:suppliers.length};
}

export const LEGACY_CATALOG_SIZE = LEGACY_ITEMS.length;
