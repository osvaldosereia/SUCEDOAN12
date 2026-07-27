const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function patch(relative, transform) {
  const target = path.join(ROOT, relative);
  const current = fs.readFileSync(target, 'utf8');
  const updated = transform(current);
  if (updated !== current) {
    fs.writeFileSync(target, updated, 'utf8');
    console.log(`Validação ajustada: ${relative}`);
  }
}

patch('app-next/tests/smoke.test.js', source => {
  let output = source.replace(/\nif \(livePolish\.includes\('#\/cesta\/'\)[^\n]+\n/g, '\n');
  const anchor = "const livePolish = read('src/live-polish.js');";
  const assertion = "if (livePolish.includes('#/cesta/') || livePolish.includes('#/kit/')) throw new Error('Carrossel ainda gera links antigos de cesta ou kit');";
  if (output.includes(anchor) && !output.includes(assertion)) {
    output = output.replace(anchor, `${anchor}\n${assertion}`);
  }
  return output;
});

patch('scripts/check-public-site.mjs', source => source
  .replace(/\s*"params\.get\('cesta'\)",\s*"params\.get\('kit'\)",?/g, '')
  .replace(/\s*"params\.get\('cesta'\)",?/g, '')
  .replace(/\s*"params\.get\('kit'\)",?/g, '')
);

console.log('Expectativas de rotas limpas atualizadas.');
