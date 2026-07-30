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
    ['EAN', 'Descricao SKU', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'ScannMarket 2', 'impVta24'],
    ['1', 'Refri Cola', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '1000'],
    ['2', 'Refri Guarana', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Guarana', '500'],
    ['3', 'SKU sem nivel 1', 'Bebidas', 'Bebidas', '', 'Cola', '200'],   // sem Nivel 1
    ['4', 'SKU sem nivel 2', 'Bebidas', 'Bebidas', 'Refrigerantes', '', '150'],  // sem Nivel 2
    ['8', 'SKU sem nivel 1 e 2', 'Bebidas', 'Bebidas', '', '', '80'],  // sem os DOIS niveis - nao pode listar 2x
    ['5', 'So na base', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '50'],   // nao existe no classificaciones
    ['7', 'Trocou de categoria', 'Bebidas', 'Aguas', 'Refrigerantes', 'Cola', '30']  // categoria congelada != data excellence
  ];
  const classifRows = [
    ['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1', 'Scannmarket 2', 'DESCRIPCION'],
    ['1', 'Bebidas', 'Refrigerantes', 'Cola', 'Refri Cola'],
    ['2', 'Bebidas', 'Refrigerantes', 'Guarana', 'Refri Guarana'],
    ['0006', 'Bebidas', 'Refrigerantes', 'Cola', 'So no classificaciones'],  // zero a esquerda + so existe aqui
    ['7', 'Bebidas', 'Refrigerantes', 'Cola', 'Trocou de categoria']
  ];
  function toCsv(rows) { return rows.map(r => r.join(';')).join('\n'); }
  function makeFile(name, rows) { return new window.File([Buffer.from(toCsv(rows), 'utf8')], name, { type: 'text/csv' }); }

  Object.defineProperty($('#file-base'), 'files', { value: [makeFile('base.csv', baseRows)], writable: true });
  $('#file-base').dispatchEvent(new window.Event('change'));
  Object.defineProperty($('#file-classif'), 'files', { value: [makeFile('classif.csv', classifRows)], writable: true });
  $('#file-classif').dispatchEvent(new window.Event('change'));
  await new Promise(r => setTimeout(r, 300));

  $('#btn-to-step3').dispatchEvent(new window.Event('click'));

  // ---- Passo 3: callout sucinto, sem duplicar SKU que falta os 2 niveis ----
  const blankCallout = doc.querySelector('#blank-values-callout');
  log('Callout e sucinto (total certo, sem o parenteses longo de antes)',
    blankCallout && blankCallout.textContent.includes('3 SKU(s) sem classificação') && blankCallout.textContent.includes('classifique abaixo'),
    blankCallout && blankCallout.textContent.slice(0, 130));

  let blankRows = doc.querySelectorAll('#blank-values-callout .blank-fix-row');
  log('3 linhas distintas (o SKU que falta os 2 níveis NAO aparece duas vezes)', blankRows.length === 3, blankRows.length);

  const rowSku8 = Array.from(blankRows).find(r => r.textContent.includes('SKU sem nivel 1 e 2'));
  log('SKU sem os 2 níveis aparece 1x só, com 2 campos de correção (Nível 1 e Nível 2)',
    rowSku8 && rowSku8.querySelectorAll('.blank-fix-input').length === 2, rowSku8 && rowSku8.querySelectorAll('.blank-fix-input').length);

  const rowSku3 = Array.from(blankRows).find(r => r.textContent.includes('SKU sem nivel 1') && !r.textContent.includes(' e 2'));
  log('SKU que só falta Nível 1 tem 1 campo só, do Nível 1', rowSku3 && rowSku3.querySelectorAll('.blank-fix-input').length === 1 &&
    rowSku3.querySelector('.blank-fix-input').dataset.nivel === '1');

  // Renomeia "Refrigerantes" -> "Refrigerantes FIX" ANTES de corrigir um branco,
  // pra confirmar que o re-render disparado pela correcao nao perde esse rename.
  const n1TableBefore = doc.querySelectorAll('#importancia-area table.data-table')[0];
  const refRowBefore = Array.from(n1TableBefore.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'Refrigerantes');
  const refInput = refRowBefore.querySelector('input[type="text"]');
  refInput.value = 'Refrigerantes FIX';
  refInput.dispatchEvent(new window.Event('input', { bubbles: true }));

  // Corrige o SKU que so falta Nivel 1 (EAN 3), classificando como "Refrigerantes"
  const input3 = rowSku3.querySelector('.blank-fix-input');
  input3.value = 'Refrigerantes';
  input3.dispatchEvent(new window.Event('blur', { bubbles: true }));

  blankRows = doc.querySelectorAll('#blank-values-callout .blank-fix-row');
  log('Depois de corrigir 1 SKU inline, a lista de branco cai para 2', blankRows.length === 2, blankRows.length);

  const n1TableAfter = doc.querySelectorAll('#importancia-area table.data-table')[0];
  const refRowAfter = Array.from(n1TableAfter.querySelectorAll('tbody tr')).find(tr => tr.children[0].textContent === 'Refrigerantes');
  log('SKU corrigido entrou no grupo "Refrigerantes" (1,2,4,5,7 + o corrigido = 6 SKUs)',
    refRowAfter && refRowAfter.children[2].textContent.trim() === '6', refRowAfter && refRowAfter.children[2].textContent);
  log('O rename "Refrigerantes FIX" sobreviveu ao re-render disparado pela correção',
    refRowAfter && refRowAfter.querySelector('input[type="text"]').value === 'Refrigerantes FIX', refRowAfter && refRowAfter.querySelector('input[type="text"]').value);

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));

  // ---- Passo 4: cards novos + recomendacao + descricao + volume + headers de EAN ----
  const checkCards = doc.querySelectorAll('#validation-area .check-card');
  function findCheck(sub) { return Array.from(checkCards).find(c => c.querySelector('strong').textContent.includes(sub)); }

  const blank1Card = findCheck('sem classificação de Nível 1');
  log('Card "sem classificação Nível 1" já reflete a correção feita no Passo 3 (só sobra o EAN 8)',
    blank1Card && blank1Card.querySelector('.badge').textContent.trim() === '1 item', blank1Card && blank1Card.querySelector('.badge').textContent);
  log('Card "sem classificação Nível 1" tem recomendação', blank1Card && blank1Card.querySelector('.recommendation') !== null);

  const blank2Card = findCheck('sem classificação de Nível 2');
  log('Card "sem classificação Nível 2" existe e mostra os SKUs certos (4 e 8)',
    blank2Card && blank2Card.textContent.includes('SKU sem nivel 2') && blank2Card.textContent.includes('SKU sem nivel 1 e 2'));

  const onlyBaseCard = findCheck('base congelada não encontrados no classificaciones');
  log('SKU só na base mostra descrição E volume/representatividade',
    onlyBaseCard && onlyBaseCard.textContent.includes('So na base') && onlyBaseCard.textContent.includes('% da categoria'),
    onlyBaseCard && onlyBaseCard.querySelector('.check-list').textContent);

  const onlyClassifCard = findCheck('classificaciones não encontrados na base');
  log('SKU só no classificaciones mostra a descrição junto', onlyClassifCard && onlyClassifCard.textContent.includes('So no classificaciones'));

  const trocaCard = findCheck('trocaram de categoria');
  log('Card "trocaram de categoria" mostra volume/representatividade', trocaCard && trocaCard.textContent.includes('% da categoria'));
  const trocaRec = trocaCard && trocaCard.querySelector('.recommendation');
  log('Recomendação de "trocaram de categoria" menciona a prod OUTROS (exemplo do Victor)',
    trocaRec && trocaRec.textContent.includes('OUTROS'), trocaRec && trocaRec.textContent);

  const eanFormatCard = findCheck('formato de EAN');
  log('Card de formato de EAN some quando não há achado (Passo 4 só mostra o que tem problema)', eanFormatCard === undefined);

  $('#btn-to-step5').dispatchEvent(new window.Event('click'));

  // ---- Passo 5: excel removido, layout lado a lado + divisoria, email fixo + extra ----
  log('Botao de Excel foi removido', $('#btn-gen-xlsx') === null);
  log('Card de Excel foi removido', !$('.report-grid').textContent.includes('Excel enxuto'), $('.report-grid').textContent.slice(0, 80));
  log('Grid tem só 2 cards lado a lado (PDF e E-mail)', doc.querySelectorAll('.report-grid .report-card').length === 2, doc.querySelectorAll('.report-grid .report-card').length);
  log('Base corrigida está FORA do grid, como seção separada', $('#corrected-base-card') && !$('.report-grid').contains($('#corrected-base-card')));
  log('Existe uma divisória', $('.report-divider') !== null);
  const correctedCardEl = $('#corrected-base-card');
  const gridEl = $('.report-grid');
  log('Seção de arquivo corrigido vem ANTES do grid de PDF/E-mail (etapa 1 antes da etapa 2)',
    correctedCardEl.compareDocumentPosition(gridEl) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  log('Título novo: "Arquivo de prods corrigidas"', correctedCardEl.textContent.includes('Arquivo de prods corrigidas'));
  log('Texto deixa claro que essa etapa é condicional (só se algo mudou no Passo 3)',
    correctedCardEl.textContent.includes('Só se algo foi corrigido no Passo 3'));
  log('Instrução de 3 passos aparece (baixar -> conferir -> subir)',
    correctedCardEl.textContent.includes('Baixe o arquivo') &&
    correctedCardEl.textContent.includes('confira se todos os ajustes de Prod foram realizados') &&
    correctedCardEl.textContent.includes('suba no classificaciones novamente'));
  log('Botão do arquivo corrigido diz "Baixar arquivo"', $('#btn-gen-corrected-base').textContent.trim() === 'Baixar arquivo');

  const pendingWarning = $('#step5-pending-warning');
  log('Aviso de pendências aparece no topo do Passo 5', pendingWarning !== null, pendingWarning && pendingWarning.textContent.slice(0, 80));
  log('Aviso de pendências tem botão de atalho para o Passo 3 ou 4',
    pendingWarning.querySelector('.jump-btn') !== null);

  const lockedPill = doc.querySelector('#email-tags .tag-pill.is-locked');
  log('Pill fixo do e-mail aparece com o endereco certo', lockedPill && lockedPill.textContent.includes('Scannmarket-br@scanntech.com'));
  log('Pill fixo NAO tem botao de remover', lockedPill && lockedPill.querySelector('button') === null);

  const emailInput = $('#email-tag-input');
  emailInput.value = 'victor@scanntech.com';
  emailInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));

  const allPills = doc.querySelectorAll('#email-tags .tag-pill');
  log('Destinatario extra foi adicionado como novo pill (removivel)', allPills.length === 2, allPills.length);

  let capturedTo = null;
  const originalBuildMailto = window.Report.buildMailto;
  window.Report.buildMailto = (st, to) => { capturedTo = to; return originalBuildMailto(st, to); };
  $('#btn-gen-email').dispatchEvent(new window.Event('click'));
  log('Mailto inclui o fixo E o extra, nessa ordem', capturedTo === 'Scannmarket-br@scanntech.com,victor@scanntech.com', capturedTo);

  // ---- Nome do arquivo corrigido ----
  window.URL.createObjectURL = () => 'blob:mock';
  window.URL.revokeObjectURL = () => {};
  let capturedFilename = null;
  const fakeStateForName = { files: { base: { headers: ['EAN'], file: { name: 'base.csv' } } }, params: { categoria: 'Bebidas' } };
  capturedFilename = window.Report.downloadCorrectedBase(fakeStateForName, [{ EAN: '1' }]);
  log('Nome do arquivo corrigido usa o novo prefixo pedido',
    capturedFilename === 'prod_corrigida_para_subir_classificaciones_bebidas.csv', capturedFilename);

  console.log('\nTeste dos ajustes (branco/recomendacao/email fixo) finalizado.');
}

main().catch(e => { console.error('ERRO FATAL:', e); process.exit(1); });
