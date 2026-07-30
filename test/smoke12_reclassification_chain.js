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

  const baseRows = [
    ['EAN', 'Descricao SKU', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'impVta24'],
    ['1', 'Item MOP 1', 'Limpeza', 'Limpeza', 'MOP', '900000'],
    ['2', 'Item MOP 2', 'Limpeza', 'Limpeza', 'MOP', '50000'],
    ['3', 'Item em branco', 'Limpeza', 'Limpeza', '', '1000']  // sera' corrigido depois
  ];
  function toCsv(rs) { return rs.map(r => r.join(';')).join('\n'); }
  const baseFile = new window.File([Buffer.from(toCsv(baseRows), 'utf8')], 'base.csv', { type: 'text/csv' });
  const classifFile = new window.File([Buffer.from('CODIGO_BARRAS;Categoria;Scannmarket 1\n1;Limpeza;MOP\n2;Limpeza;MOP\n3;Limpeza;MOP', 'utf8')], 'classif.csv', { type: 'text/csv' });

  Object.defineProperty($('#file-base'), 'files', { value: [baseFile], writable: true });
  $('#file-base').dispatchEvent(new window.Event('change'));
  Object.defineProperty($('#file-classif'), 'files', { value: [classifFile], writable: true });
  $('#file-classif').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 300));

  $('#btn-to-step3').dispatchEvent(new window.Event('click'));

  // Passo 3.0: classifica o item em branco (EAN 3) como "mop" (digitado errado - minusculo)
  const blankInput = doc.querySelector('.blank-fix-input[data-ean="3"][data-nivel="1"]');
  blankInput.value = 'mop';
  blankInput.dispatchEvent(new window.Event('blur', { bubbles: true }));

  // Agora existe um novo grupo "mop" (minusculo) na tabela de Nivel 1 - o time
  // percebe o erro de digitacao e corrige o Nome Final desse grupo pra "MOP"
  const n1Table = doc.querySelectorAll('#importancia-area table.data-table')[0];
  const mopLowerRow = Array.from(n1Table.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'mop');
  log('Grupo "mop" (minusculo) foi criado pela correção do branco', mopLowerRow !== undefined);
  const renameInput = mopLowerRow.querySelector('input[type="text"]');
  renameInput.value = 'MOP';
  renameInput.dispatchEvent(new window.Event('input', { bubbles: true }));

  // Baixa o arquivo corrigido e confere o valor efetivo do EAN 3
  let capturedRows = null;
  window.Report.downloadCorrectedBase = (st, rows) => { capturedRows = rows; return 'mock.csv'; };
  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  $('#btn-to-step5').dispatchEvent(new window.Event('click'));
  $('#btn-gen-corrected-base').dispatchEvent(new window.Event('click'));

  const row3 = capturedRows && capturedRows.find(r => r['EAN'] === '3');
  log('Arquivo corrigido usa a versão FINAL ("MOP"), não a primeira digitação ("mop")',
    row3 && row3['ScannMarket 1'] === 'MOP', row3 && row3['ScannMarket 1']);

  // corrige de novo (segunda rodada de correcao) - a MESMA linha que veio do
  // branco (agora mostrando "MOP" no Nome Final) e' editada de novo pra
  // "MOP PADRAO", simulando uma reclassificacao subsequente do mesmo item.
  $('#btn-to-step3b').dispatchEvent(new window.Event('click'));
  const n1TableAgain = doc.querySelectorAll('#importancia-area table.data-table')[0];
  const mopFromBlankRow = Array.from(n1TableAgain.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'mop');
  const renameInputAgain = mopFromBlankRow.querySelector('input[type="text"]');
  renameInputAgain.value = 'MOP PADRAO';
  renameInputAgain.dispatchEvent(new window.Event('input', { bubbles: true }));

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  $('#btn-to-step5').dispatchEvent(new window.Event('click'));
  capturedRows = null;
  $('#btn-gen-corrected-base').dispatchEvent(new window.Event('click'));
  const row1Again = capturedRows && capturedRows.find(r => r['EAN'] === '1');
  const row3Again = capturedRows && capturedRows.find(r => r['EAN'] === '3');
  log('Depois de uma SEGUNDA correção no mesmo item (branco -> "mop" -> "MOP" -> "MOP PADRAO"), o arquivo usa a versão mais recente',
    row3Again && row3Again['ScannMarket 1'] === 'MOP PADRAO', 'EAN3=' + (row3Again && row3Again['ScannMarket 1']));
  log('A linha que nunca foi branco (EAN 1, sempre "MOP") continua "MOP", intacta pela correção do outro item',
    row1Again && row1Again['ScannMarket 1'] === 'MOP', 'EAN1=' + (row1Again && row1Again['ScannMarket 1']));

  console.log('\nTeste de correção em múltiplas etapas finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
