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

  ['core.js', 'validations.js', 'report.js', 'app.js'].forEach(f => {
    const s = window.document.createElement('script');
    s.textContent = fs.readFileSync(path.join(ROOT, f), 'utf8');
    window.document.body.appendChild(s);
  });
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);

  $('#f-categoria').value = 'Bebidas';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  doc.querySelector('input[name="opcao"][value="Opção 2"]').checked = true;
  doc.querySelector('input[name="opcao"][value="Opção 2"]').dispatchEvent(new window.Event('change'));
  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  const baseRows = [
    ['EAN', 'Descricao SKU', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'ScannMarket 2', 'impVta24'],
    ['1', 'Refri Cola', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '1000'],
    ['1', 'Refri Cola dup', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '1000'],  // EAN duplicado -> deve continuar VERMELHO
    ['5', 'So na base', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '50']          // -> deve virar AMARELO
  ];
  const classifRows = [
    ['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1', 'Scannmarket 2'],
    ['1', 'Bebidas', 'Refrigerantes', 'Cola'],
    ['99', 'Bebidas', 'Refrigerantes', 'Cola']   // so no classificaciones -> deve virar AMARELO
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

  const checkCards = doc.querySelectorAll('#validation-area .check-card');
  function findCheck(sub) { return Array.from(checkCards).find(c => c.querySelector('strong').textContent.includes(sub)); }

  const onlyBaseCard = findCheck('base congelada não encontrados no classificaciones');
  const onlyBaseBadge = onlyBaseCard && onlyBaseCard.querySelector('.badge');
  log('"SKU só na base" usa badge AMARELO (aviso), não vermelho',
    onlyBaseBadge && onlyBaseBadge.classList.contains('badge-amber') && !onlyBaseBadge.classList.contains('badge-red'),
    onlyBaseBadge && onlyBaseBadge.className);

  const onlyClassifCard = findCheck('classificaciones não encontrados na base');
  const onlyClassifBadge = onlyClassifCard && onlyClassifCard.querySelector('.badge');
  log('"SKU só no classificaciones" usa badge AMARELO (aviso), não vermelho',
    onlyClassifBadge && onlyClassifBadge.classList.contains('badge-amber') && !onlyClassifBadge.classList.contains('badge-red'),
    onlyClassifBadge && onlyClassifBadge.className);

  const dupCard = findCheck('EAN duplicado');
  const dupBadge = dupCard && dupCard.querySelector('.badge');
  log('EAN duplicado CONTINUA vermelho (não é um dos dois amaciados)',
    dupBadge && dupBadge.classList.contains('badge-red') && !dupBadge.classList.contains('badge-amber'),
    dupBadge && dupBadge.className);

  const kpiAchados = doc.querySelectorAll('#kpi-row .kpi-card')[2];
  log('KPI "Achados na validação" NÃO conta os 2 avisos amarelos (só o EAN duplicado = 1)',
    kpiAchados && kpiAchados.querySelector('.kpi-value').textContent.trim() === '1',
    kpiAchados && kpiAchados.querySelector('.kpi-value').textContent);

  console.log('\nTeste de severidade (amarelo vs vermelho) finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
