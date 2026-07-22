import fs from 'node:fs';

const path = 'tools/apply-cost-centers-login-ui.mjs';
let source = fs.readFileSync(path, 'utf8');

function literalizeWriteBlock(filePath, nextMarker) {
  const startToken = `write('${filePath}', \``;
  const start = source.indexOf(startToken);
  if (start < 0) throw new Error(`Start block not found: ${filePath}`);
  const bodyStart = start + startToken.length;
  const endToken = `\n\`);\n\n${nextMarker}`;
  const end = source.indexOf(endToken, bodyStart);
  if (end < 0) throw new Error(`End block not found: ${filePath}`);
  const body = source.slice(bodyStart, end);
  const replacement = `write('${filePath}', ${JSON.stringify(body)});\n\n${nextMarker}`;
  source = source.slice(0, start) + replacement + source.slice(end + endToken.length);
}

literalizeWriteBlock('professional/web/app-actions.js', "write('professional/web/app-views.js', `");
literalizeWriteBlock('professional/web/app-views.js', "replace('professional/web/app-order-detail.js',");

fs.writeFileSync(path, source);
console.log('Embedded frontend templates converted to safe string literals.');
