const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const XLSX = require('xlsx');

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
  window.XLSX = XLSX;
  const { jsPDF } = require('jspdf');
  const { applyPlugin } = require('jspdf-autotable');
  applyPlugin(jsPDF);
  window.jspdf = { jsPDF };

  ['core.js', 'validations.js', 'report.js', 'app.js'].forEach(f => {
    const scriptEl = window.document.createElement('script');
    scriptEl.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    window.document.body.appendChild(scriptEl);
  });
  const bridge = window.document.createElement('script');
  bridge.textContent = 'window.Core = Core; window.Validations = Validations; window.Report = Report;';
  window.document.body.appendChild(bridge);

  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);

  // Opcao 4 + versao 3.0: nivel1 = ScannMarket 3, sem nivel2, sem categoriaCongelada como fonte
  $('#f-categoria').value = 'Laticinios';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  $('#f-versao').value = '3.0';
  $('#f-versao').dispatchEvent(new window.Event('change'));
  const opcao4 = doc.querySelector('input[name="opcao"][value="Opção 4"]');
  opcao4.checked = true;
  opcao4.dispatchEvent(new window.Event('change'));
  log('deveraPreencher = APENAS SCANNMARKET 3', $('#f-deverapreencher').textContent.includes('APENAS SCANNMARKET 3'));

  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  // build an XLSX workbook in-memory for the base congelada upload
  const wb = XLSX.utils.book_new();
  const aoa = [
    ['EAN', 'Descricao SKU', 'Fabricante', 'Marca', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 3', 'impVta24'],
    ['7891111111111', 'Queijo Mussarela 500g', 'Fab X', 'Marca X', 'Laticinios', 'Laticinios', 'Queijos', 1200000.5],
    ['7891111111112', 'Iogurte Natural 170g', 'Fab Y', 'Marca Y', 'Laticinios', 'Laticinios', 'Iogurtes', 300000],
    ['7891111111113', 'Manteiga 200g', 'Fab Z', 'Marca Z', 'Laticinios', 'Laticinios', 'Manteigas', 50000]
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  XLSX.utils.book_append_sheet(wb, ws, 'Base');
  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const baseXlsxFile = new window.File([xlsxBuffer], 'base_congelada.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  const classifRows = [
    ['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1', 'Scannmarket 2', 'Scannmarket 3', 'Scannmarket 4'],
    ['7891111111111', 'Laticinios', '', '', 'Queijos', ''],
    ['7891111111112', 'Laticinios', '', '', 'Iogurtes', ''],
    ['7891111111113', 'Laticinios', '', '', 'Manteigas', '']
  ];
  const classifCsv = classifRows.map(r => r.join(';')).join('\n');
  const classifFile = new window.File([Buffer.from(classifCsv, 'utf8')], 'classificaciones.csv', { type: 'text/csv' });

  const fileBaseInput = $('#file-base');
  Object.defineProperty(fileBaseInput, 'files', { value: [baseXlsxFile], writable: true });
  fileBaseInput.dispatchEvent(new window.Event('change'));

  const fileClassifInput = $('#file-classif');
  Object.defineProperty(fileClassifInput, 'files', { value: [classifFile], writable: true });
  fileClassifInput.dispatchEvent(new window.Event('change'));

  await new Promise(r => setTimeout(r, 300));

  log('XLSX da base congelada foi lido', $('#status-base').textContent.includes('3 linhas'), $('#status-base').textContent);
  log('CSV do classificaciones foi lido', $('#status-classif').textContent.includes('3 linhas'), $('#status-classif').textContent);

  const mapSelects = doc.querySelectorAll('#mapping-area select');
  const smPrimarioRow = Array.from(doc.querySelectorAll('#mapping-area .mapping-row')).find(r => r.querySelector('label').textContent.includes('ScannMarket 3'));
  log('Mapeamento pede ScannMarket 3 (nao 1)', !!smPrimarioRow);
  const secundarioRow = Array.from(doc.querySelectorAll('#mapping-area .mapping-row')).find(r => r.querySelector('label').textContent.includes('ScannMarket 4'));
  log('Mapeamento NAO pede ScannMarket 4 (Opcao 4 nao usa Nivel 2)', !secundarioRow);

  const continueBtn = $('#btn-to-step3');
  log('Continue habilitado com mapeamento correto', !continueBtn.disabled);
  continueBtn.dispatchEvent(new window.Event('click'));

  const importTables = doc.querySelectorAll('#importancia-area table.data-table');
  log('Apenas 1 tabela de importancia (sem Nivel 2)', importTables.length === 1, importTables.length);
  const n1Rows = importTables[0].querySelectorAll('tbody tr');
  log('3 valores distintos de Nivel 1 detectados (Queijos/Iogurtes/Manteigas)', n1Rows.length === 3, n1Rows.length);

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  const kpiCards = doc.querySelectorAll('#kpi-row .kpi-card');
  log('Dashboard renderizou com 3 SKUs na base', kpiCards[0].querySelector('.kpi-value').textContent === '3');
  const achados = kpiCards[2].querySelector('.kpi-value').textContent;
  log('Nenhum achado nesse cenario limpo (0 achados)', achados === '0', achados);

  console.log('\nSmoke test 2 finalizado.');
}

main().catch(e => { console.error('ERRO FATAL NO TESTE 2:', e); process.exit(1); });
