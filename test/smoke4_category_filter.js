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
  bridge.textContent = 'window.Core = Core;';
  window.document.body.appendChild(bridge);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);

  $('#f-categoria').value = 'Bebidas';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  const opcao2 = doc.querySelector('input[name="opcao"][value="Opção 2"]');
  opcao2.checked = true;
  opcao2.dispatchEvent(new window.Event('change'));
  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  const baseRows = [
    ['EAN', 'Descricao SKU', 'Fabricante', 'Marca', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'ScannMarket 2', 'impVta24'],
    ['1', 'Refri Cola', 'A', 'A', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '1000'],
    ['2', 'Refri Guarana', 'A', 'A', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Guarana', '500']
  ];
  // O report tem: 2 linhas de "Bebidas" com grafias diferentes (deveriam contar),
  // 1 linha "BEBIDAS" (maiuscula, deveria contar), 1 linha "Bebídas" (acento, deveria contar),
  // e 2 linhas de "Laticinios" que NAO deveriam entrar na validacao.
  const classifRows = [
    ['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1', 'Scannmarket 2'],
    ['1', 'Bebidas', 'Refrigerantes', 'Cola'],
    ['2', '  BEBIDAS  ', 'Refrigerantes', 'Guarana'],
    ['3', 'Bebídas', 'Isotonicos', 'Garrafa'],      // categoria "Bebidas" com acento -> deve contar como match
    ['99', 'Laticinios', 'Queijos', 'Mussarela'],   // categoria diferente -> nao deve entrar
    ['98', 'Laticinios', 'Iogurtes', 'Natural']      // categoria diferente -> nao deve entrar
  ];

  function toCsv(rows) { return rows.map(r => r.join(';')).join('\n'); }
  function makeFile(name, rows) { return new window.File([Buffer.from(toCsv(rows), 'utf8')], name, { type: 'text/csv' }); }

  const fileBaseInput = $('#file-base');
  Object.defineProperty(fileBaseInput, 'files', { value: [makeFile('base.csv', baseRows)], writable: true });
  fileBaseInput.dispatchEvent(new window.Event('change'));
  const fileClassifInput = $('#file-classif');
  Object.defineProperty(fileClassifInput, 'files', { value: [makeFile('classif.csv', classifRows)], writable: true });
  fileClassifInput.dispatchEvent(new window.Event('change'));

  await new Promise(r => setTimeout(r, 300));

  const filterStatus = $('#classif-category-filter-status');
  log('Status de filtro mostra 3 de 5 linhas batendo com "Bebidas"',
    filterStatus.textContent.includes('3') && filterStatus.textContent.includes('5'),
    filterStatus.textContent);

  $('#btn-to-step3').dispatchEvent(new window.Event('click'));
  $('#btn-to-step4').dispatchEvent(new window.Event('click'));

  const kpiCards = doc.querySelectorAll('#kpi-row .kpi-card');
  log('KPI "SKUs no classificaciones" reflete so as 3 linhas filtradas (nao as 5 do arquivo)',
    kpiCards[1].querySelector('.kpi-value').textContent === '3', kpiCards[1].querySelector('.kpi-value').textContent);

  const noteEl = $('#classif-filter-note-step4');
  log('Dashboard mostra nota de filtro por categoria', noteEl && noteEl.textContent.includes('3') && noteEl.textContent.includes('5'), noteEl && noteEl.textContent);

  // como as 2 linhas "Laticinios" (EAN 98 e 99) foram excluidas do cruzamento,
  // elas NAO devem aparecer como "SKU no classificaciones nao encontrado na base"
  const checkCards = doc.querySelectorAll('#validation-area .check-card');
  const onlyClassifCard = Array.from(checkCards).find(c => c.querySelector('strong').textContent.includes('classificaciones não encontrados na base'));
  const listText = onlyClassifCard.querySelector('.check-body').textContent;
  log('EANs de outra categoria (98/99) NAO vazam para a validacao', !listText.includes('98') && !listText.includes('99'), listText.slice(0, 200));

  console.log('\nTeste de filtro por categoria finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
