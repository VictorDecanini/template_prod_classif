const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

function log(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (extra ? '  -> ' + extra : ''));
  if (!ok) process.exitCode = 1;
}

async function main() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.TextDecoder = require('util').TextDecoder;
  window.Papa = require('papaparse');

  const scriptEl = window.document.createElement('script');
  scriptEl.textContent = fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8');
  window.document.body.appendChild(scriptEl);
  const bridge = window.document.createElement('script');
  bridge.textContent = 'window.Core = Core;';
  window.document.body.appendChild(bridge);

  function utf16leWithBOM(str) {
    const body = Buffer.from(str, 'utf16le');
    return Buffer.concat([Buffer.from([0xFF, 0xFE]), body]);
  }
  function utf16leNoBOM(str) {
    return Buffer.from(str, 'utf16le');
  }
  function latin1Buffer(str) {
    // simula export tipo Windows-1252 com acentuacao (ex: "Categoría")
    return Buffer.from(str, 'latin1');
  }

  const csvText = 'Codigo Barras SKU;Nome SKU;Categoria congelada ScannMarket\n7891000000001;Refrigerante Cola;Bebidas';

  async function testCase(name, buf, filename) {
    const file = new window.File([buf], filename, { type: 'text/csv' });
    let result = null, error = null;
    window.Core.parseFile(file).then(r => { result = r; }).catch(e => { error = e; });
    for (let i = 0; i < 20 && !result && !error; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    if (error) { log(name, false, 'erro: ' + error.message); return; }
    if (!result) { log(name, false, 'timeout esperando parseFile'); return; }
    const { headers, rows } = result;
    const ok = headers[0] === 'Codigo Barras SKU' && headers[1] === 'Nome SKU' &&
      rows.length === 1 && rows[0]['Codigo Barras SKU'] === '7891000000001' &&
      rows[0]['Nome SKU'] === 'Refrigerante Cola';
    log(name, ok, JSON.stringify(headers) + ' | ' + JSON.stringify(rows[0]));
  }

  await testCase('UTF-16LE com BOM (ex.: "ÿþNome SKU")', utf16leWithBOM(csvText), 'com_bom.csv');
  await testCase('UTF-16LE sem BOM (ex.: letras espaçadas)', utf16leNoBOM(csvText), 'sem_bom.csv');

  // acentuacao em latin1/cp1252 (ex: export antigo do Excel BR) continua funcionando
  const csvAccented = 'Codigo Barras SKU;Nome SKU;Categoria congelada ScannMarket\n7891000000002;Suco de Laranja;Bebidas não alcoólicas';
  async function parseFileSafe(file) {
    let result = null, error = null;
    window.Core.parseFile(file).then(r => { result = r; }).catch(e => { error = e; });
    for (let i = 0; i < 20 && !result && !error; i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    if (error) throw error;
    return result;
  }

  const file3 = new window.File([latin1Buffer(csvAccented)], 'latin1.csv', { type: 'text/csv' });
  const parsed3 = await parseFileSafe(file3);
  log('Latin-1/CP1252 com acentuacao continua ok', parsed3.rows[0]['Categoria congelada ScannMarket'] === 'Bebidas não alcoólicas',
    parsed3.rows[0]['Categoria congelada ScannMarket']);

  // utf-8 normal (caso mais comum) nao deve regredir
  const file4 = new window.File([Buffer.from(csvAccented, 'utf8')], 'utf8.csv', { type: 'text/csv' });
  const parsed4 = await parseFileSafe(file4);
  log('UTF-8 normal continua ok', parsed4.rows[0]['Categoria congelada ScannMarket'] === 'Bebidas não alcoólicas',
    parsed4.rows[0]['Categoria congelada ScannMarket']);

  console.log('\nTeste de encoding finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
