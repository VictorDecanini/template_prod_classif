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
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);

  $('#f-categoria').value = 'Limpeza';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  doc.querySelector('input[name="opcao"][value="Opção 4"]').checked = true;
  doc.querySelector('input[name="opcao"][value="Opção 4"]').dispatchEvent(new window.Event('change'));
  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  // 815 SKUs de "MOP", 246 de "OUTROS", e 1 SKU digitado errado como "TESTE1"
  // (que o time vai corrigir pra "MOP" no Passo 3).
  const rows = [['EAN', 'Descricao SKU', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'impVta24']];
  for (let i = 1; i <= 815; i++) rows.push([String(i), 'Item MOP ' + i, 'Limpeza', 'Limpeza', 'MOP', '1000']);
  for (let i = 900; i < 900 + 246; i++) rows.push([String(i), 'Item OUTROS ' + i, 'Limpeza', 'Limpeza', 'OUTROS', '300']);
  rows.push(['999999', 'Item digitado errado', 'Limpeza', 'Limpeza', 'TESTE1', '1000']);

  function toCsv(rs) { return rs.map(r => r.join(';')).join('\n'); }
  const baseFile = new window.File([Buffer.from(toCsv(rows), 'utf8')], 'base.csv', { type: 'text/csv' });
  const classifFile = new window.File([Buffer.from('CODIGO_BARRAS;Categoria;Scannmarket 1\n999999;Limpeza;TESTE1', 'utf8')], 'classif.csv', { type: 'text/csv' });

  Object.defineProperty($('#file-base'), 'files', { value: [baseFile], writable: true });
  $('#file-base').dispatchEvent(new window.Event('change'));
  Object.defineProperty($('#file-classif'), 'files', { value: [classifFile], writable: true });
  $('#file-classif').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 400));

  $('#btn-to-step3').dispatchEvent(new window.Event('click'));

  const n1Table = doc.querySelectorAll('#importancia-area table.data-table')[0];
  const teste1Row = Array.from(n1Table.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'TESTE1');
  log('Linha "TESTE1" existe e, antes da correção, é Revisar (baixa relevância sozinha)',
    teste1Row && teste1Row.classList.contains('row-revisar') && teste1Row.querySelector('.badge').textContent.trim() === 'Revisar',
    teste1Row && teste1Row.children[3].textContent);

  // corrige o Nome Final de "TESTE1" para "MOP" (prod que ja existe)
  const input = teste1Row.querySelector('input[type="text"]');
  input.value = 'MOP';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));

  const n1TableAfter = doc.querySelectorAll('#importancia-area table.data-table')[0];
  const teste1RowAfter = Array.from(n1TableAfter.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'TESTE1');
  const mopRowAfter = Array.from(n1TableAfter.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'MOP');

  log('Linha "TESTE1" continua aparecendo (rastreabilidade)', teste1RowAfter !== undefined);
  log('Linha "TESTE1" agora mostra os SKUs consolidados com "MOP" (816), não mais 1 sozinha',
    teste1RowAfter && teste1RowAfter.children[2].textContent.trim() === '816', teste1RowAfter && teste1RowAfter.children[2].textContent);
  log('Linha "TESTE1" mostra a Importância consolidada (mesma da linha "MOP")',
    teste1RowAfter && mopRowAfter && teste1RowAfter.children[3].textContent === mopRowAfter.children[3].textContent,
    teste1RowAfter && teste1RowAfter.children[3].textContent);
  log('Linha "TESTE1" deixa de ser "Revisar" e vira "OK" (consolidada com MOP, que é saudável)',
    teste1RowAfter && teste1RowAfter.querySelector('.badge').textContent.trim() === 'OK');
  log('Linha "TESTE1" não fica mais destacada em vermelho (row-revisar)',
    teste1RowAfter && !teste1RowAfter.classList.contains('row-revisar'));

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  const lowRelCard = Array.from(doc.querySelectorAll('#validation-area .check-card'))
    .find(c => c.querySelector('strong').textContent.includes('baixa relevância'));
  log('"MOP" (consolidado) NÃO aparece mais como baixa relevância no Passo 4', lowRelCard === undefined);

  console.log('\nTeste de consolidação por Nome Final finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
