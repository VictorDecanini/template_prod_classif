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
  window.Papa = require('papaparse');
  window.XLSX = require('xlsx');
  const { jsPDF } = require('jspdf');
  const { applyPlugin } = require('jspdf-autotable');
  applyPlugin(jsPDF);
  window.jspdf = { jsPDF };

  ['core.js', 'validations.js', 'report.js', 'app.js'].forEach(f => {
    const s = window.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    window.document.body.appendChild(s);
  });
  const bridge = window.document.createElement('script');
  bridge.textContent = 'window.Core = Core; window.Report = Report;';
  window.document.body.appendChild(bridge);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);

  $('#f-categoria').value = 'Bebidas';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  doc.querySelector('input[name="opcao"][value="Opção 2"]').checked = true;
  doc.querySelector('input[name="opcao"][value="Opção 2"]').dispatchEvent(new window.Event('change'));
  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  const baseRows = [
    ['EAN', 'Descricao SKU', 'Fabricante', 'Marca', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'ScannMarket 2', 'impVta24'],
    ['1', 'Refri Cola', 'A', 'A', 'Bebidas', 'Bebidas', 'refrigerantes', 'Cola', '1000'],   // "refrigerantes" com erro de digitacao (minusculo)
    ['2', 'Refri Guarana', 'A', 'A', 'Bebidas', 'Bebidas', 'refrigerantes', 'Guarana', '500'],
    ['3', 'Suco Uva', 'B', 'B', 'Bebidas', 'Bebidas', 'Sucos', 'Uva', '300']  // esse ScannMarket 1 nao muda
  ];
  const classifRows = [
    ['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1', 'Scannmarket 2'],
    ['1', 'Bebidas', 'Refrigerantes', 'Cola'],
    ['2', 'Bebidas', 'Refrigerantes', 'Guarana'],
    ['3', 'Bebidas', 'Sucos', 'Uva']
  ];
  function toCsv(rows) { return rows.map(r => r.join(';')).join('\n'); }
  function makeFile(name, rows) { return new window.File([Buffer.from(toCsv(rows), 'utf8')], name, { type: 'text/csv' }); }

  Object.defineProperty($('#file-base'), 'files', { value: [makeFile('base.csv', baseRows)], writable: true });
  $('#file-base').dispatchEvent(new window.Event('change'));
  Object.defineProperty($('#file-classif'), 'files', { value: [makeFile('classif.csv', classifRows)], writable: true });
  $('#file-classif').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 300));

  $('#btn-to-step3').dispatchEvent(new window.Event('click'));

  // corrige "refrigerantes" -> "Refrigerantes" no Nivel 1
  const n1Table = doc.querySelectorAll('#importancia-area table.data-table')[0];
  const rowRefrigerantes = Array.from(n1Table.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'refrigerantes');
  const input = rowRefrigerantes.querySelector('input[type="text"]');
  input.value = 'Refrigerantes';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));

  const preview = $('#corrections-preview');
  log('Preview de correcao aparece com o de-para certo', preview.textContent.includes('"refrigerantes"') && preview.textContent.includes('"Refrigerantes"'), preview.textContent);

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  $('#btn-to-step5').dispatchEvent(new window.Event('click'));

  const desc = $('#corrected-base-desc');
  log('Card do Passo 5 mostra 1 correcao pendente', desc.textContent.includes('1'), desc.textContent);

  let capturedState = null, capturedRows = null;
  window.Report.downloadCorrectedBase = (st, rows) => { capturedState = st; capturedRows = rows; return 'mock.csv'; };

  $('#btn-gen-corrected-base').dispatchEvent(new window.Event('click'));

  log('downloadCorrectedBase foi chamado', !!capturedRows);
  if (capturedRows) {
    const row1 = capturedRows.find(r => r['EAN'] === '1');
    const row2 = capturedRows.find(r => r['EAN'] === '2');
    const row3 = capturedRows.find(r => r['EAN'] === '3');
    log('Linha 1: ScannMarket 1 corrigido para "Refrigerantes"', row1['ScannMarket 1'] === 'Refrigerantes', row1['ScannMarket 1']);
    log('Linha 2: ScannMarket 1 corrigido para "Refrigerantes"', row2['ScannMarket 1'] === 'Refrigerantes', row2['ScannMarket 1']);
    log('Linha 3 (Sucos): NAO foi alterada', row3['ScannMarket 1'] === 'Sucos', row3['ScannMarket 1']);
    log('Colunas nao mapeadas continuam intactas (Descricao SKU da linha 1)', row1['Descricao SKU'] === 'Refri Cola', row1['Descricao SKU']);
    log('Todas as 3 linhas originais estao presentes no arquivo corrigido', capturedRows.length === 3, capturedRows.length);
  }

  console.log('\nTeste de correcao de base finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
