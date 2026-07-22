import fs from 'node:fs';

const path = 'tools/apply-cost-centers-login-ui.mjs';
let source = fs.readFileSync(path, 'utf8');

const oldSchemaPatch = `replace('professional/worker/src/schema.js',
\`    const fileChunkStatements = await executeSchema(env.DB, fileChunkSchema, 'file-chunks');
    const platformStatements = await executeSchema(env.DB, platformSchema, 'platform-r2-history');
    const seeded = await seedDefaultWorkspace(env.DB);
    const ownerPasswordMigrated = await migrateSeededOwnerPassword(env.DB);\`,
\`    const fileChunkStatements = await executeSchema(env.DB, fileChunkSchema, 'file-chunks');
    const platformStatements = await executeSchema(env.DB, platformSchema, 'platform-r2-history');
    const seeded = await seedDefaultWorkspace(env.DB);
    const costCenterStatements = await executeSchema(env.DB, costCenterSchema, 'cost-centers');
    const ownerPasswordMigrated = await migrateSeededOwnerPassword(env.DB);\`);`;

const currentSchemaPatch = `replace('professional/worker/src/schema.js',
\`    const platformStatements = await executeSchema(env.DB, platformSchema, 'platform-r2-history');
    const fileChunkStatements = await executeSchema(env.DB, fileChunkSchema, 'file-chunks');
    const seeded = await seedDefaultWorkspace(env.DB);
    const ownerPasswordMigrated = await migrateSeededOwnerPassword(env.DB);\`,
\`    const platformStatements = await executeSchema(env.DB, platformSchema, 'platform-r2-history');
    const fileChunkStatements = await executeSchema(env.DB, fileChunkSchema, 'file-chunks');
    const seeded = await seedDefaultWorkspace(env.DB);
    const costCenterStatements = await executeSchema(env.DB, costCenterSchema, 'cost-centers');
    const ownerPasswordMigrated = await migrateSeededOwnerPassword(env.DB);\`);`;

if (!source.includes(oldSchemaPatch)) throw new Error('Schema applicator patch block was not found');
source = source.replace(oldSchemaPatch, currentSchemaPatch);

const currentStoragePatch = "replace('professional/worker/src/storage.js',\n  \"`Local: ${order.locationName||''}`,`Proveedor: ${order.supplierName||''}`\",\n  \"`Local: ${order.locationName||''}`,`Centro de costo: ${order.costCenterName||'Barra'}`,`Proveedor: ${order.supplierName||''}`\");\n\nreplace('professional/worker/src/api/catalog.js',";
const storageBlockPattern = /replace\('professional\/worker\/src\/storage\.js',[\s\S]*?\);\n\nreplace\('professional\/worker\/src\/api\/catalog\.js',/;
if (!storageBlockPattern.test(source)) throw new Error('Storage applicator patch block was not found');
source = source.replace(storageBlockPattern, currentStoragePatch);

source = source.replace(/\\*\$\{/g, '\\${');
source = source.replace('\\${costCenterApi}', '${costCenterApi}');
source = source.replace("throw new Error(`Missing marker in \\${path}: \\${needle.slice(0, 100)}`)", "throw new Error('Missing marker in ' + path + ': ' + needle.slice(0, 100))");
source = source.replace("throw new Error(`Missing regex marker in \\${path}: \\${pattern}`)", "throw new Error('Missing regex marker in ' + path + ': ' + String(pattern))");

function literalizeWriteBlock(filePath, nextMarker) {
  const startToken = `write('${filePath}', \``;
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Start block not found: ${filePath}`);
  const bodyStart = start + startToken.length;
  const endToken = `\n\`);\n\n${nextMarker}`;
  const end = source.indexOf(endToken, bodyStart);
  if (end < 0) throw new Error(`End block not found: ${filePath}`);
  const body = source.slice(bodyStart, end).replace(/\\\$\{/g, '${');
  const replacement = `write('${filePath}', ${JSON.stringify(body)});\n\n${nextMarker}`;
  source = source.slice(0, start) + replacement + source.slice(end + endToken.length);
}

literalizeWriteBlock('professional/web/app-actions.js', "write('professional/web/app-views.js', `");
literalizeWriteBlock('professional/web/app-views.js', "replace('professional/web/app-order-detail.js',");

fs.writeFileSync(path, source);
console.log('Schema order, storage marker, diagnostics, generated expressions and frontend templates normalized.');
