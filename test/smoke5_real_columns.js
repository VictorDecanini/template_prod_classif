const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

function log(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (extra ? '  -> ' + extra : ''));
  if (!ok) process.exitCode = 1;
}

const BASE_HEADERS_REAL = ['Nome SKU', 'Código Barras SKU', 'Qtd Conteúdo SKU', 'Est Mer Codigo', 'Marca SKU', 'Fabricante SKU',
  'Categoría congelada ScannMarket', 'Categoria atual Data Excellence', 'Est Mer 1 Descripcion', 'Est Mer 2 Descripcion',
  'Est Mer 3 Descripcion', 'Est Mer 4 Descripcion', 'Est Mer 5 Descripcion', 'Est Mer 6 (Categoria)', 'Est Mer 7 (Subcategoria)',
  'Est Mer 8 Descripcion', 'Est Mer 9 Descripcion', 'Est Mer 10 Descripcion', 'CODIGO_BARRAS_CONTENIDO', 'UNIDADES_CONTENIDO',
  '¿Es Marca Propia?', 'Imp Vta (Ult.24 Meses)', 'Cant Vta', 'Precio por unidad', 'Precio KG/LT', 'FECHA_PRIM_MOV',
  '¿Está congelado?', 'Fecha de congelamiento', 'Scannmarket 4', 'Scannmarket 3'];

const CLASSIF_HEADERS_REAL = ['CODIGO_SE', 'COD_CLASIF_SE', 'Categoria', 'Categoria_CODIGO', 'PV1', 'PV2', 'Scannmarket 2',
  'Scannmarket 1', 'Scannmarket 4', 'Scannmarket 3', 'Grupo de Mercadoria', 'Centro de Lucro', 'Capacidade',
  'Fator de Conversão', 'Código SKU Bettanin', 'Prod Clasif 10', 'Subcategoria', 'Segmento', 'CODIGO_BARRAS',
  'DESCRIPCION', 'MARCA', 'CANT_CONTENIDO', 'Proveedor'];

function buildRow(headers, values) {
  return headers.map(h => (values[h] !== undefined ? values[h] : ''));
}

async function main() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(/<script src="https:[^"]+"><\/script>/g, '');
  html = html.replace(/<link rel="stylesheet" href="https:[^"]+">/g, '');

  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  window.TextDecoder = require('util').TextDecoder;
  window.alert = (msg) => console.log('  [alert] ' + msg);
  window.scrollTo = () => {};
  window.Papa = require('papaparse');

  ['core.js', 'validations.js', 'report.js', 'app.js'].forEach(f => {
    const s = window.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    window.document.body.appendChild(s);
  });
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);

  // Cenario: versao 3.0, Opcao 2 (usa Scannmarket 3 e 4, com nomes as vezes variando na base)
  $('#f-categoria').value = 'Bebidas';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  $('#f-versao').value = '3.0';
  $('#f-versao').dispatchEvent(new window.Event('change'));
  doc.querySelector('input[name="opcao"][value="Opção 2"]').checked = true;
  doc.querySelector('input[name="opcao"][value="Opção 2"]').dispatchEvent(new window.Event('change'));
  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  // Base congelada com o cabecalho real EXATO que o Victor mandou
  const baseRow1 = buildRow(BASE_HEADERS_REAL, {
    'Nome SKU': 'Refrigerante Cola 2L', 'Código Barras SKU': '7891000000001', 'Marca SKU': 'Marca A',
    'Fabricante SKU': 'Fab A', 'Categoría congelada ScannMarket': 'Bebidas', 'Categoria atual Data Excellence': 'Bebidas',
    'Imp Vta (Ult.24 Meses)': '1.500.000,00', 'Scannmarket 3': 'Refrigerantes', 'Scannmarket 4': 'Cola'
  });
  const baseCsv = [BASE_HEADERS_REAL.join(';'), baseRow1.join(';')].join('\n');
  const baseFile = new window.File([Buffer.from(baseCsv, 'utf8')], 'base_real.csv', { type: 'text/csv' });

  const classifRow1 = buildRow(CLASSIF_HEADERS_REAL, {
    'CODIGO_BARRAS': '7891000000001', 'Categoria': 'Bebidas', 'Scannmarket 3': 'Refrigerantes', 'Scannmarket 4': 'Cola'
  });
  const classifCsv = [CLASSIF_HEADERS_REAL.join(';'), classifRow1.join(';')].join('\n');
  const classifFile = new window.File([Buffer.from(classifCsv, 'utf8')], 'classif_real.csv', { type: 'text/csv' });

  const fileBaseInput = $('#file-base');
  Object.defineProperty(fileBaseInput, 'files', { value: [baseFile], writable: true });
  fileBaseInput.dispatchEvent(new window.Event('change'));
  const fileClassifInput = $('#file-classif');
  Object.defineProperty(fileClassifInput, 'files', { value: [classifFile], writable: true });
  fileClassifInput.dispatchEvent(new window.Event('change'));

  await new Promise(r => setTimeout(r, 300));

  function mappedValue(cardTitle, label) {
    const cards = doc.querySelectorAll('.mapping-card');
    const card = Array.from(cards).find(c => c.querySelector('h3').textContent.includes(cardTitle));
    const row = Array.from(card.querySelectorAll('.mapping-row')).find(r => r.querySelector('label').textContent.startsWith(label));
    return row ? row.querySelector('select').value : null;
  }

  log('Auto-detect: EAN -> "Código Barras SKU"', mappedValue('Base congelada', 'EAN') === 'Código Barras SKU', mappedValue('Base congelada', 'EAN'));
  log('Auto-detect: Descrição -> "Nome SKU"', mappedValue('Base congelada', 'Descrição') === 'Nome SKU', mappedValue('Base congelada', 'Descrição'));
  log('Fabricante nao aparece mais no mapeamento (removido a pedido)', mappedValue('Base congelada', 'Fabricante') === null, mappedValue('Base congelada', 'Fabricante'));
  log('Marca nao aparece mais no mapeamento (removido a pedido)', mappedValue('Base congelada', 'Marca') === null, mappedValue('Base congelada', 'Marca'));
  log('Auto-detect: Categoria congelada -> "Categoría congelada ScannMarket"',
    mappedValue('Base congelada', 'Categoria congelada') === 'Categoría congelada ScannMarket', mappedValue('Base congelada', 'Categoria congelada'));
  log('Auto-detect: Categoria Data Excellence -> "Categoria atual Data Excellence" (tinha a palavra "atual" no meio)',
    mappedValue('Base congelada', 'Categoria Data Excellence') === 'Categoria atual Data Excellence', mappedValue('Base congelada', 'Categoria Data Excellence'));
  log('Auto-detect: impVta24 -> "Imp Vta (Ult.24 Meses)" (parenteses e ponto)',
    mappedValue('Base congelada', 'impVta24') === 'Imp Vta (Ult.24 Meses)', mappedValue('Base congelada', 'impVta24'));
  log('Auto-detect: ScannMarket 3 (base) -> "Scannmarket 3"',
    mappedValue('Base congelada', 'ScannMarket 3') === 'Scannmarket 3', mappedValue('Base congelada', 'ScannMarket 3'));
  log('Auto-detect: ScannMarket 4 (base) -> "Scannmarket 4"',
    mappedValue('Base congelada', 'ScannMarket 4') === 'Scannmarket 4', mappedValue('Base congelada', 'ScannMarket 4'));

  log('Auto-detect: CODIGO_BARRAS (classif) -> "CODIGO_BARRAS"', mappedValue('Classificaciones', 'CODIGO_BARRAS') === 'CODIGO_BARRAS');
  log('Auto-detect: Categoria (classif) -> "Categoria"', mappedValue('Classificaciones', 'Categoria') === 'Categoria');
  log('Auto-detect: Scannmarket 3 (classif) -> "Scannmarket 3"', mappedValue('Classificaciones', 'Scannmarket 3') === 'Scannmarket 3');
  log('Auto-detect: Scannmarket 4 (classif) -> "Scannmarket 4"', mappedValue('Classificaciones', 'Scannmarket 4') === 'Scannmarket 4');

  const continueBtn = $('#btn-to-step3');
  log('Tudo mapeado automaticamente, botao Continuar habilitado sem ajuste manual', !continueBtn.disabled);

  console.log('\n--- Cenario 2: variacao de nome (Scannmarket 3 renomeado para "SM_3" na base) ---');

  // Recarrega a pagina do zero para simular um novo upload com nome de coluna variante
  const dom2 = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const w2 = dom2.window;
  w2.TextDecoder = require('util').TextDecoder;
  w2.alert = () => {};
  w2.scrollTo = () => {};
  w2.Papa = require('papaparse');
  ['core.js', 'validations.js', 'report.js', 'app.js'].forEach(f => {
    const s = w2.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    w2.document.body.appendChild(s);
  });
  w2.document.dispatchEvent(new w2.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
  const d2 = w2.document;
  const $2 = (sel) => d2.querySelector(sel);

  $2('#f-categoria').value = 'Bebidas';
  $2('#f-categoria').dispatchEvent(new w2.Event('input'));
  $2('#f-versao').value = '3.0';
  $2('#f-versao').dispatchEvent(new w2.Event('change'));
  d2.querySelector('input[name="opcao"][value="Opção 2"]').checked = true;
  d2.querySelector('input[name="opcao"][value="Opção 2"]').dispatchEvent(new w2.Event('change'));
  $2('#btn-to-step2').dispatchEvent(new w2.Event('click'));

  const variantHeaders = BASE_HEADERS_REAL.map(h => h === 'Scannmarket 3' ? 'SM_3' : (h === 'Scannmarket 4' ? 'N2' : h));
  const variantRow = buildRow(variantHeaders, {
    'Nome SKU': 'Refri Cola', 'Código Barras SKU': '1', 'Categoría congelada ScannMarket': 'Bebidas',
    'Categoria atual Data Excellence': 'Bebidas', 'Imp Vta (Ult.24 Meses)': '1000', 'SM_3': 'Refrigerantes', 'N2': 'Cola'
  });
  const variantCsv = [variantHeaders.join(';'), variantRow.join(';')].join('\n');
  const variantFile = new w2.File([Buffer.from(variantCsv, 'utf8')], 'base_variant.csv', { type: 'text/csv' });
  const classifFile2 = new w2.File([Buffer.from(classifCsv, 'utf8')], 'classif2.csv', { type: 'text/csv' });

  Object.defineProperty($2('#file-base'), 'files', { value: [variantFile], writable: true });
  $2('#file-base').dispatchEvent(new w2.Event('change'));
  Object.defineProperty($2('#file-classif'), 'files', { value: [classifFile2], writable: true });
  $2('#file-classif').dispatchEvent(new w2.Event('change'));
  await new Promise(r => setTimeout(r, 300));

  function mappedValue2(cardTitle, label) {
    const cards = d2.querySelectorAll('.mapping-card');
    const card = Array.from(cards).find(c => c.querySelector('h3').textContent.includes(cardTitle));
    const row = Array.from(card.querySelectorAll('.mapping-row')).find(r => r.querySelector('label').textContent.startsWith(label));
    return row ? row.querySelector('select').value : null;
  }

  log('Variante "SM_3" reconhecida como ScannMarket 3', mappedValue2('Base congelada', 'ScannMarket 3') === 'SM_3', mappedValue2('Base congelada', 'ScannMarket 3'));
  log('Variante "N2" reconhecida como ScannMarket 4', mappedValue2('Base congelada', 'ScannMarket 4') === 'N2', mappedValue2('Base congelada', 'ScannMarket 4'));

  console.log('\nTeste com colunas reais finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
