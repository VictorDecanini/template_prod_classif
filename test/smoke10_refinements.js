const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PDF_PATH = path.join(ROOT, 'relatorio_prod_bebidas.pdf');

function log(label, ok, extra) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + (extra ? '  -> ' + extra : ''));
  if (!ok) process.exitCode = 1;
}

async function main() {
  if (fs.existsSync(PDF_PATH)) fs.unlinkSync(PDF_PATH);

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

  // "Relatório PDF" no lugar de "PDF enxuto"
  log('Card do PDF foi renomeado para "Relatório PDF"', doc.body.textContent.includes('Relatório PDF'));
  log('Texto antigo "PDF enxuto" não aparece mais', !$('.report-grid').textContent.includes('PDF enxuto'));

  $('#f-categoria').value = 'Bebidas';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  doc.querySelector('input[name="opcao"][value="Opção 2"]').checked = true;
  doc.querySelector('input[name="opcao"][value="Opção 2"]').dispatchEvent(new window.Event('change'));
  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  const baseRows = [
    ['EAN', 'Descricao SKU', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'ScannMarket 2', 'impVta24'],
    ['1', 'Refri Cola', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '900000'],
    ['2', 'Refri Cola 2', 'Bebidas', 'Bebidas', 'refrigerantes', 'Cola', '50000'],
    ['3', 'Item baixa relevancia', 'Bebidas', 'Bebidas', 'TESTE2', 'Cola', '1000']
  ];
  const classifRows = [
    ['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1', 'Scannmarket 2'],
    ['1', 'Bebidas', 'Refrigerantes', 'Cola'],
    ['2', 'Bebidas', 'refrigerantes', 'Cola']
  ];
  function toCsv(rows) { return rows.map(r => r.join(';')).join('\n'); }
  function makeFile(name, rows) { return new window.File([Buffer.from(toCsv(rows), 'utf8')], name, { type: 'text/csv' }); }

  Object.defineProperty($('#file-base'), 'files', { value: [makeFile('base.csv', baseRows)], writable: true });
  $('#file-base').dispatchEvent(new window.Event('change'));
  Object.defineProperty($('#file-classif'), 'files', { value: [makeFile('classif.csv', classifRows)], writable: true });
  $('#file-classif').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 300));

  $('#btn-to-step3').dispatchEvent(new window.Event('click'));
  $('#btn-to-step4').dispatchEvent(new window.Event('click'));

  let checkCards = Array.from(doc.querySelectorAll('#validation-area .check-card'));
  function findCheck(sub) { return checkCards.find(c => c.querySelector('strong').textContent.includes(sub)); }

  const naoRefletidoCard = findCheck('Nível 1 não refletido');
  log('"Nível 1 não refletido" existe (TESTE2 não está no classificaciones)', naoRefletidoCard !== undefined);
  log('"Nível 1 não refletido" tem botão de atalho pro Passo 3.1',
    naoRefletidoCard && naoRefletidoCard.querySelector('.jump-btn') !== null &&
    naoRefletidoCard.querySelector('.jump-btn').textContent.includes('3.1'));

  const lowRelCard = findCheck('baixa relevância');
  const lowRelBadge = lowRelCard && lowRelCard.querySelector('.badge');
  log('Card de baixa relevância usa badge AMARELO', lowRelBadge && lowRelBadge.classList.contains('badge-amber'));
  log('Card de baixa relevância deixa claro que é aviso, não erro, e que pode seguir sem corrigir',
    lowRelCard.textContent.includes('Aviso, não é erro') && lowRelCard.textContent.includes('Não bloqueia'));

  const kpiAchados = doc.querySelectorAll('#kpi-row .kpi-card')[2].querySelector('.kpi-value').textContent.trim();
  // acertos reais neste ponto: "nao refletido" (TESTE2) + divergencia de caixa (Refrigerantes/refrigerantes,
  // ainda nao corrigida) = 2. Baixa relevancia (TESTE2) e' aviso e nao entra nessa conta.
  log('KPI de achados NÃO conta a baixa relevância (conta só os 2 problemas reais)', kpiAchados === '2', kpiAchados);

  $('#btn-to-step3b').dispatchEvent(new window.Event('click'));
  const n1Table = doc.querySelectorAll('#importancia-area table.data-table')[0];
  const lowerRow = Array.from(n1Table.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'refrigerantes');
  const lowerInput = lowerRow.querySelector('input[type="text"]');
  lowerInput.value = 'Refrigerantes';
  lowerInput.dispatchEvent(new window.Event('input', { bubbles: true }));

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  checkCards = Array.from(doc.querySelectorAll('#validation-area .check-card'));
  const caseCardAfter = checkCards.find(c => c.querySelector('strong').textContent.includes('maiúscula/minúscula — Nível 1'));
  log('Depois de corrigir o Nome Final na Etapa 3, a divergência de maiúscula/minúscula SOME (não fica presa ao valor bruto)',
    caseCardAfter === undefined, caseCardAfter && caseCardAfter.querySelector('.badge').textContent);

  $('#btn-to-step5').dispatchEvent(new window.Event('click'));
  $('#btn-gen-pdf').dispatchEvent(new window.Event('click'));
  await new Promise(r => setTimeout(r, 200));

  if (fs.existsSync(PDF_PATH)) {
    const text = execSync('pdftotext -layout "' + PDF_PATH + '" -').toString();
    log('PDF mostra "X/Y checks aprovados" no resumo', /\d+\/\d+ checks aprovados/.test(text), text.match(/\d+\/\d+ checks aprovados/));
    log('PDF NÃO lista "Nenhum problema encontrado" (checks aprovados ficam de fora)', !text.includes('Nenhum problema encontrado'));
    log('PDF ainda mostra o problema real que restou ("nao refletido")', text.includes('nao refletido') || text.includes('TESTE2'));
    fs.unlinkSync(PDF_PATH);
  } else {
    log('PDF foi gerado no disco para conferência de conteúdo', false, 'arquivo não encontrado');
  }

  console.log('\nTeste dos refinamentos finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
