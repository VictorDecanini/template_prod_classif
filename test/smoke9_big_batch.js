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

  // ---- Passo 1: Fênix ----
  log('Toggle de Fênix existe ao lado do FTP', $('#f-fenix') !== null);
  const fenixSimBtn = $('#f-fenix .seg-btn[data-val="Sim"]');
  fenixSimBtn.dispatchEvent(new window.Event('click'));
  log('Fênix "Sim" fica ativo ao clicar', fenixSimBtn.classList.contains('is-active'));

  $('#f-categoria').value = 'Bebidas';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  doc.querySelector('input[name="opcao"][value="Opção 2"]').checked = true;
  doc.querySelector('input[name="opcao"][value="Opção 2"]').dispatchEvent(new window.Event('change'));
  $('#btn-to-step2').dispatchEvent(new window.Event('click'));

  const baseRows = [
    ['EAN', 'Descricao SKU', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'ScannMarket 2', 'impVta24'],
    ['1', 'Refri Cola', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '900000'],
    ['2', 'Refri Cola 2', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '50000'],
    ['3', 'Item baixa relevancia', 'Bebidas', 'Bebidas', 'TESTE2', 'Cola', '1000'],
    ['4', 'Sem nivel 1', 'Bebidas', 'Bebidas', '', 'Cola', '5000'],
    ['5', 'Refri minusculo', 'Bebidas', 'Bebidas', 'refrigerantes', 'Cola', '2000'],
    ['6', 'Duplicado A', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '3000'],
    ['6', 'Duplicado B', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '3000']
  ];
  const classifRows = [
    ['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1', 'Scannmarket 2'],
    ['1', 'Bebidas', 'Refrigerantes', 'Cola'],
    ['2', 'Bebidas', 'Refrigerantes', 'Cola'],
    ['3', 'Bebidas', 'TESTE2', 'Cola'],
    ['6', 'Bebidas', 'Refrigerantes', 'Cola'],
    ['99', 'Bebidas', 'ClassifIncorretoXYZ', 'Cola']
  ];
  function toCsv(rows) { return rows.map(r => r.join(';')).join('\n'); }
  function makeFile(name, rows) { return new window.File([Buffer.from(toCsv(rows), 'utf8')], name, { type: 'text/csv' }); }

  Object.defineProperty($('#file-base'), 'files', { value: [makeFile('base.csv', baseRows)], writable: true });
  $('#file-base').dispatchEvent(new window.Event('change'));
  Object.defineProperty($('#file-classif'), 'files', { value: [makeFile('classif.csv', classifRows)], writable: true });
  $('#file-classif').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 300));

  $('#btn-to-step3').dispatchEvent(new window.Event('click'));

  // ---- Passo 3: subseções numeradas, campo editável, legenda do status, linha vermelha ----
  const importanciaArea = $('#importancia-area');
  const h3s = Array.from(importanciaArea.querySelectorAll('h3')).map(h => h.textContent);
  log('Subseção 3.0 (branco) presente', h3s.some(t => t.startsWith('3.0')), h3s);
  log('Subseção 3.1 (Nível 1) presente', h3s.some(t => t.startsWith('3.1')));
  log('Subseção 3.2 (Nível 2) presente', h3s.some(t => t.startsWith('3.2')));

  const n1Table = doc.querySelectorAll('#importancia-area table.data-table')[0];
  log('Cabeçalho diz "Nome Final - Editável"', n1Table.querySelector('thead').textContent.includes('Nome Final - Editável'));
  log('Dica de campo editável aparece acima da tabela',
    $('#importancia-nivel1-block .edit-hint') !== null && $('#importancia-nivel1-block .edit-hint').textContent.includes('podem ser alteradas'));
  log('Legenda do status explica os limiares (Revisar/Atenção/OK)',
    n1Table.querySelector('.th-sub') !== null && n1Table.querySelector('.th-sub').textContent.includes('4%'));
  log('Input do Nome Final tem a classe de destaque (editável)', n1Table.querySelector('input.nome-final-input') !== null);

  const teste2Row = Array.from(n1Table.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'TESTE2');
  log('Linha "TESTE2" (baixa relevância) fica com fundo vermelho-claro (row-revisar)',
    teste2Row && teste2Row.classList.contains('row-revisar'), teste2Row && teste2Row.className);

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));

  // ---- Passo 4: resumo, ordenação por prioridade, checks ocultos quando OK, seta no final, atalho pro Passo 3 ----
  const summary = doc.querySelector('#validation-area').firstElementChild;
  log('Linha-resumo de verificações aprovadas aparece no topo', summary && summary.textContent.includes('verificações aprovadas'), summary && summary.textContent);

  const checkCards = Array.from(doc.querySelectorAll('#validation-area .check-card'));
  function idxOf(sub) { return checkCards.findIndex(c => c.querySelector('strong').textContent.includes(sub)); }

  const idxIncorreto = idxOf('Nível 1 incorreto');
  const idxDuplicado = idxOf('EAN duplicado');
  log('"Nível 1 incorreto" (alta prioridade) aparece ANTES de "EAN duplicado" (baixa prioridade)',
    idxIncorreto !== -1 && idxDuplicado !== -1 && idxIncorreto < idxDuplicado, 'idx incorreto=' + idxIncorreto + ' idx duplicado=' + idxDuplicado);

  const lowRelCard = checkCards.find(c => c.querySelector('strong').textContent.includes('baixa relevância'));
  log('Card de "baixa relevância" (novo) existe e aparece antes do EAN duplicado',
    lowRelCard && checkCards.indexOf(lowRelCard) < idxDuplicado);

  // qualquer card cujo item de checagem nao tenha achados nao deve aparecer
  // (categoria congelada == data excellence em todas as linhas neste cenario)
  const trocaramIdx = idxOf('trocaram de categoria');
  log('Checks sem achado ficam ocultos (ex.: "trocaram de categoria" não deveria aparecer aqui)', trocaramIdx === -1);

  const firstHead = checkCards[0].querySelector('.check-head');
  log('Seta (chevron) fica no FINAL do cabeçalho do card, não no início',
    firstHead.lastElementChild.classList.contains('chev'));

  // clica no botao de atalho do card de baixa relevancia -> deve voltar pro Passo 3 e destacar a tabela do Nivel 1
  const jumpBtn = lowRelCard.querySelector('.jump-btn');
  log('Card de baixa relevância tem botão de atalho pro Passo 3', jumpBtn !== null);
  jumpBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  log('Clicar no atalho volta pro Passo 3', !$('#panel-3').hidden);
  const n1Block = $('#importancia-nivel1-block');
  log('A seção de Nível 1 recebe o destaque (flash) ao voltar pelo atalho',
    n1Block && n1Block.classList.contains('flash-highlight'));

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  $('#btn-to-step5').dispatchEvent(new window.Event('click'));

  // ---- Passo 5: aviso de pendências, e-mail em nova aba, corpo com Fênix e Opção explicada ----
  const pending = $('#step5-pending-warning');
  log('Aviso de pendências no topo do Passo 5 lista os tipos certos',
    pending && pending.textContent.includes('SKU(s) sem classificação') && pending.textContent.includes('Prod(s) com baixa relevância'),
    pending && pending.textContent);

  let openedUrl = null;
  const originalOpen = window.open;
  window.open = (url) => { openedUrl = url; return { closed: false }; };
  $('#btn-gen-email').dispatchEvent(new window.Event('click'));
  window.open = originalOpen;

  log('Botão de e-mail usa window.open (nova aba), não location.href', openedUrl !== null, openedUrl && openedUrl.slice(0, 60));
  const decoded = openedUrl ? decodeURIComponent(openedUrl) : '';
  log('Assunto do e-mail é executivo e em maiúsculas (SOLICITAÇÃO DE PROD – ...)',
    decoded.includes('SOLICITA') && decoded.includes('BEBIDAS'));
  log('Corpo do e-mail menciona Fênix: Sim', decoded.includes('Fenix: Sim'), decoded.slice(0, 400));
  log('Corpo do e-mail explica o que a Opção significa (Nível 1/2 = ScannMarket X)',
    decoded.includes('Nível 1: ScannMarket 1 e Nível 2: ScannMarket 2'));

  console.log('\nTeste do lote grande de ajustes finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
