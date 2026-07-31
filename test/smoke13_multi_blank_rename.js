const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

function log(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (extra ? '  -> ' + extra : ''));
  if (!ok) process.exitCode = 1;
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
  window.Element.prototype.scrollIntoView = () => {};
  window.Papa = require('papaparse');

  ['core.js', 'validations.js', 'report.js', 'app.js'].forEach(f => {
    const s = window.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    window.document.body.appendChild(s);
  });
  const bridge = window.document.createElement('script');
  bridge.textContent = 'window.Report = Report;';
  window.document.body.appendChild(bridge);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);

  $('#f-categoria').value = 'Limpeza';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  doc.querySelector('input[name="opcao"][value="Opção 4"]').checked = true;
  doc.querySelector('input[name="opcao"][value="Opção 4"]').dispatchEvent(new window.Event('change'));
  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  // 815 MOP, 246 OUTROS, e 3 SKUs em branco (serao fixados como "mo", "mop" e "TESTE 1")
  const rows = [['EAN', 'Descricao SKU', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'impVta24']];
  for (let i = 1; i <= 815; i++) rows.push([String(i), 'Item MOP ' + i, 'Limpeza', 'Limpeza', 'MOP', '1000']);
  for (let i = 900; i < 900 + 246; i++) rows.push([String(i), 'Item OUTROS ' + i, 'Limpeza', 'Limpeza', 'OUTROS', '300']);
  rows.push(['77771', 'Item branco A', 'Limpeza', 'Limpeza', '', '500']);
  rows.push(['77772', 'Item branco B', 'Limpeza', 'Limpeza', '', '500']);
  rows.push(['77773', 'Item branco C', 'Limpeza', 'Limpeza', '', '500']);

  function toCsv(rs) { return rs.map(r => r.join(';')).join('\n'); }
  const baseFile = new window.File([Buffer.from(toCsv(rows), 'utf8')], 'base.csv', { type: 'text/csv' });
  const classifRows = [['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1']];
  classifRows.push(['77771', 'Limpeza', 'MOP']);
  classifRows.push(['77772', 'Limpeza', 'MOP']);
  classifRows.push(['77773', 'Limpeza', 'OUTROS']);
  const classifFile = new window.File([Buffer.from(toCsv(classifRows), 'utf8')], 'classif.csv', { type: 'text/csv' });

  Object.defineProperty($('#file-base'), 'files', { value: [baseFile], writable: true });
  $('#file-base').dispatchEvent(new window.Event('change'));
  Object.defineProperty($('#file-classif'), 'files', { value: [classifFile], writable: true });
  $('#file-classif').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 400));

  $('#btn-to-step3').dispatchEvent(new window.Event('click'));

  // fixa os 3 brancos, UM POR VEZ, cada um com uma digitacao diferente
  function fixBlank(ean, value) {
    const input = doc.querySelector('.blank-fix-input[data-ean="' + ean + '"][data-nivel="1"]');
    if (!input) throw new Error('input de branco nao encontrado para EAN ' + ean);
    input.value = value;
    input.dispatchEvent(new window.Event('blur', { bubbles: true }));
  }
  fixBlank('77771', 'mo');
  fixBlank('77772', 'mop');
  fixBlank('77773', 'TESTE 1');

  log('Todos os 3 brancos foram resolvidos (lista de branco vazia)',
    $('#blank-values-callout').textContent.includes('Nenhum SKU sem classificação'),
    $('#blank-values-callout').textContent.slice(0, 60));

  // agora renomeia cada um dos 3 grupos criados, individualmente
  function renameRow(valorDetectado, novoFinal) {
    const table = doc.querySelectorAll('#importancia-area table.data-table')[0];
    const row = Array.from(table.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === valorDetectado);
    if (!row) throw new Error('linha "' + valorDetectado + '" nao encontrada na tabela');
    const input = row.querySelector('input[type="text"]');
    input.value = novoFinal;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }
  renameRow('mo', 'MOP');
  renameRow('mop', 'MOP');
  renameRow('TESTE 1', 'OUTROS');

  // confere a tela ANTES de baixar (deveria já mostrar tudo consolidado)
  const table = doc.querySelectorAll('#importancia-area table.data-table')[0];
  ['mo', 'mop'].forEach(v => {
    const row = Array.from(table.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === v);
    log('Linha "' + v + '" mostra 817 SKUs consolidados na tela (815 + mo + mop)', row && row.children[2].textContent.trim() === '817', row && row.children[2].textContent);
  });
  const testeRow = Array.from(table.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'TESTE 1');
  log('Linha "TESTE 1" mostra 247 SKUs consolidados na tela', testeRow && testeRow.children[2].textContent.trim() === '247', testeRow && testeRow.children[2].textContent);

  // baixa o arquivo corrigido e confere CADA UM dos 3 EANs que vieram do branco
  let capturedRows = null;
  window.Report.downloadCorrectedBase = (st, rowsOut) => { capturedRows = rowsOut; return 'mock.csv'; };
  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  $('#btn-to-step5').dispatchEvent(new window.Event('click'));
  $('#btn-gen-corrected-base').dispatchEvent(new window.Event('click'));

  const r1 = capturedRows.find(r => r['EAN'] === '77771');
  const r2 = capturedRows.find(r => r['EAN'] === '77772');
  const r3 = capturedRows.find(r => r['EAN'] === '77773');
  log('Arquivo exportado: EAN 77771 ("mo" -> "MOP") saiu como "MOP"', r1['ScannMarket 1'] === 'MOP', 'valor=' + r1['ScannMarket 1']);
  log('Arquivo exportado: EAN 77772 ("mop" -> "MOP") saiu como "MOP"', r2['ScannMarket 1'] === 'MOP', 'valor=' + r2['ScannMarket 1']);
  log('Arquivo exportado: EAN 77773 ("TESTE 1" -> "OUTROS") saiu como "OUTROS"', r3['ScannMarket 1'] === 'OUTROS', 'valor=' + r3['ScannMarket 1']);

  // confere tambem que uma linha normal (nunca branca) continua correta
  const rNormal = capturedRows.find(r => r['EAN'] === '1');
  log('SKU normal (nunca branco, sempre MOP) continua "MOP"', rNormal['ScannMarket 1'] === 'MOP', rNormal['ScannMarket 1']);

  console.log('\nTeste de multiplas correcoes simultaneas finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
