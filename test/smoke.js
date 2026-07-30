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
  // remove external CDN script/link tags - we'll inject npm equivalents instead
  html = html.replace(/<script src="https:[^"]+"><\/script>/g, '');
  html = html.replace(/<link rel="stylesheet" href="https:[^"]+">/g, '');

  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;

  // jsdom nao implementa a Encoding API (TextDecoder) - navegadores reais tem isso nativo.
  window.TextDecoder = require('util').TextDecoder;
  window.alert = (msg) => { console.log('  [alert] ' + msg); };
  window.scrollTo = () => {};

  window.Papa = require('papaparse');
  window.XLSX = require('xlsx');
  const { jsPDF } = require('jspdf');
  const { applyPlugin } = require('jspdf-autotable');
  applyPlugin(jsPDF);
  window.jspdf = { jsPDF };

  const files = ['core.js', 'validations.js', 'report.js', 'app.js'];
  files.forEach(f => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const scriptEl = window.document.createElement('script');
    scriptEl.textContent = code;
    window.document.body.appendChild(scriptEl);
  });

  const bridge = window.document.createElement('script');
  bridge.textContent = 'window.Core = Core; window.Validations = Validations; window.Report = Report;';
  window.document.body.appendChild(bridge);

  // fire DOMContentLoaded to run app.js init
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const doc = window.document;
  const $ = (sel) => doc.querySelector(sel);

  // ---------------- STEP 1 ----------------
  $('#f-categoria').value = 'Bebidas';
  $('#f-categoria').dispatchEvent(new window.Event('input'));
  $('#f-cliente').value = 'Cliente Teste';
  $('#f-cliente').dispatchEvent(new window.Event('input'));
  $('#f-versao').value = '2.0';
  $('#f-versao').dispatchEvent(new window.Event('change'));
  const opcao2 = doc.querySelector('input[name="opcao"][value="Opção 2"]');
  opcao2.checked = true;
  opcao2.dispatchEvent(new window.Event('change'));

  log('Step1: deveraPreencher calculado', $('#f-deverapreencher').textContent.includes('SCANNMARKET 1 e SCANNMARKET 2'));

  $('#btn-to-step2').dispatchEvent(new window.Event('click'));
  log('Step1 -> Step2 navegou', !$('#panel-2').hidden);

  // ---------------- STEP 2: build synthetic files ----------------
  const baseCsvRows = [
    ['EAN', 'Descricao SKU', 'Fabricante', 'Marca', 'Categoria Congelada', 'Categoria Data Excellence', 'ScannMarket 1', 'ScannMarket 2', 'impVta24'],
    ['7891000000001', 'Refrigerante Cola 2L', 'Fab A', 'Marca A', 'Bebidas', 'Bebidas', 'Refrigerantes', 'Cola', '1.500.000,00'],
    ['7891000000002', 'Refrigerante Guarana 2L', 'Fab A', 'Marca A', 'Bebidas', 'Bebidas', 'refrigerantes', 'Guarana', '900.000,00'], // divergencia de caixa em nivel1
    ['7891000000003', 'Suco Laranja 1L', 'Fab B', 'Marca B', 'Bebidas', 'Bebidas', 'Sucos', 'Laranja', '400.000,00'],
    ['7891000000004', 'Suco Uva 1L', 'Fab B', 'Marca B', 'Bebidas', 'Bebidas', 'Suco', 'Uva', '50.000,00'], // quase-duplicata de "Sucos"
    ['7891000000005', 'Agua com gas 500ml', 'Fab C', 'Marca C', 'Bebidas', 'Aguas', 'Aguas', 'Com gas', '30.000,00'], // trocou de categoria
    ['0891000000006', 'Cerveja Lata 350ml', 'Fab D', 'Marca D', 'Bebidas', 'null', 'Cervejas', 'Lata', '20.000,00'], // categoria data excellence nula
    ['7891000000007', 'Cerveja Long Neck', 'Fab D', 'Marca D', 'Bebidas', 'Bebidas', 'Cervejas', 'Long Neck', '10.000,00'],
    ['7891000000007', 'Cerveja Long Neck (duplicado)', 'Fab D', 'Marca D', 'Bebidas', 'Bebidas', 'Cervejas', 'Long Neck', '5.000,00'] // EAN duplicado
  ];
  const classifRows = [
    ['CODIGO_BARRAS', 'Categoria', 'Scannmarket 1', 'Scannmarket 2', 'Scannmarket 3', 'Scannmarket 4', 'DESCRIPCION', 'MARCA'],
    ['7891000000001', 'Bebidas', 'Refrigerantes', 'Cola', '', '', 'Refrigerante Cola 2L', 'Marca A'],
    ['7891000000002', 'Bebidas', 'refrigerantes', 'Guarana', '', '', 'Refrigerante Guarana 2L', 'Marca A'],
    ['7891000000003', 'Bebidas', 'Sucos', 'Laranja', '', '', 'Suco Laranja 1L', 'Marca B'],
    ['7891000000004', 'Bebidas', 'Suco', 'Uva', '', '', 'Suco Uva 1L', 'Marca B'],
    ['7891000000005', 'Bebidas', 'Aguas', 'Com gas', '', '', 'Agua com gas 500ml', 'Marca C'],
    ['891000000006', 'Bebidas', 'Cervejas Especiais', 'Lata', '', '', 'Cerveja Lata 350ml', 'Marca D'], // "incorreta" (nao existe nos confirmados) + zero a esquerda
    ['9999999999999', 'Bebidas', 'Isotonicos', 'Garrafa', '', '', 'Isotonico', 'Marca E'] // so existe no classificaciones
  ];

  function toCsv(rows) { return rows.map(r => r.join(';')).join('\n'); }

  function makeFile(name, rows) {
    const csv = toCsv(rows);
    const buf = Buffer.from(csv, 'utf8');
    return new window.File([buf], name, { type: 'text/csv' });
  }

  const baseFile = makeFile('base_congelada.csv', baseCsvRows);
  const classifFile = makeFile('classificaciones.csv', classifRows);

  const fileBaseInput = $('#file-base');
  Object.defineProperty(fileBaseInput, 'files', { value: [baseFile], writable: true });
  fileBaseInput.dispatchEvent(new window.Event('change'));

  const fileClassifInput = $('#file-classif');
  Object.defineProperty(fileClassifInput, 'files', { value: [classifFile], writable: true });
  fileClassifInput.dispatchEvent(new window.Event('change'));

  // parsing is async (FileReader) - wait a tick
  await new Promise(r => setTimeout(r, 300));

  log('Base file parsed', $('#status-base').textContent.includes('linhas encontradas'), $('#status-base').textContent);
  log('Classif file parsed', $('#status-classif').textContent.includes('linhas encontradas'), $('#status-classif').textContent);

  // check auto-mapping guesses
  const mapRows = doc.querySelectorAll('#mapping-area select');
  log('Mapping selects rendered', mapRows.length > 0, mapRows.length + ' selects');

  const continueBtn = $('#btn-to-step3');
  log('Continue to step3 enabled after mapping', !continueBtn.disabled);

  continueBtn.dispatchEvent(new window.Event('click'));
  log('Step2 -> Step3 navegou', !$('#panel-3').hidden);

  // ---------------- STEP 3 ----------------
  const importTables = doc.querySelectorAll('#importancia-area table.data-table');
  log('Importancia: 2 tabelas renderizadas (Nivel1 e Nivel2)', importTables.length === 2, importTables.length);

  const n1Rows = importTables[0].querySelectorAll('tbody tr');
  log('Nivel1: 6 valores distintos detectados', n1Rows.length === 6, n1Rows.length);

  // sanity: percentuais de nivel1 somam ~100
  let totalPct = 0;
  n1Rows.forEach(tr => {
    const txt = tr.children[3].textContent.replace('%', '').replace(',', '.');
    totalPct += parseFloat(txt);
  });
  log('Nivel1: soma dos percentuais ~= 100%', Math.abs(totalPct - 100) < 0.5, totalPct.toFixed(2));

  $('#btn-to-step4').dispatchEvent(new window.Event('click'));
  log('Step3 -> Step4 navegou e validacoes rodaram', !$('#panel-4').hidden);

  // ---------------- STEP 4 ----------------
  const kpiCards = doc.querySelectorAll('#kpi-row .kpi-card');
  log('KPIs renderizados (4 cards)', kpiCards.length === 4, kpiCards.length);

  const checkCards = doc.querySelectorAll('#validation-area .check-card');
  log('Check-cards renderizados', checkCards.length > 0, checkCards.length);

  function findCheck(titleSubstr) {
    return Array.from(checkCards).find(c => c.querySelector('strong').textContent.includes(titleSubstr));
  }

  const dupEanCard = findCheck('EAN duplicado');
  log('Detectou EAN duplicado', dupEanCard && dupEanCard.querySelector('.badge').textContent.trim() !== 'OK');

  const caseCard = findCheck('maiúscula/minúscula — Nível 1');
  log('Detectou divergencia de caixa em Nivel 1 ("refrigerantes" vs "Refrigerantes")',
    caseCard && caseCard.querySelector('.badge').textContent.trim() !== 'OK');

  const nearDupCard = findCheck('erros de digitação — Nível 1');
  log('Detectou quase-duplicata em Nivel 1 ("Sucos" vs "Suco")',
    nearDupCard && nearDupCard.querySelector('.badge').textContent.trim() !== 'OK');

  const trocaCategoriaCard = findCheck('trocaram de categoria');
  log('Detectou SKU que trocou de categoria (Bebidas -> Aguas)',
    trocaCategoriaCard && trocaCategoriaCard.querySelector('.badge').textContent.trim() !== 'OK');

  const onlyClassifCard = findCheck('classificaciones não encontrados na base');
  log('Detectou SKU so no classificaciones (isotonico)',
    onlyClassifCard && onlyClassifCard.querySelector('.badge').textContent.trim() !== 'OK');

  const incorretaCard = findCheck('Nível 1 incorreto no report Classificaciones');
  log('Detectou valor incorreto no classificaciones ("Cervejas Especiais")',
    incorretaCard && incorretaCard.querySelector('.badge').textContent.trim() !== 'OK');

  const formatoEanCard = findCheck('formato de EAN');
  log('Detectou possivel zero a esquerda em EAN (0891... vs 891...)',
    formatoEanCard && formatoEanCard.querySelector('.badge').textContent.trim() !== 'OK');

  const pctNulos = kpiCards[3].querySelector('.kpi-value').textContent;
  log('% nulos em Data Excellence calculado (esperado > 0%)', pctNulos !== '0,0%', pctNulos);

  $('#btn-to-step5').dispatchEvent(new window.Event('click'));
  log('Step4 -> Step5 navegou', !$('#panel-5').hidden);

  // ---------------- STEP 5: report generation (logic only, no real download in jsdom) ----------------
  try {
    // access internal state via a debug hook is not exposed; instead call Report directly
    // using data captured from the DOM flow is not trivial here, so we re-run the pure
    // functions with the same shape to make sure report.js itself throws no errors.
    const fakeState = {
      params: { categoria: 'Bebidas', cliente: 'Cliente Teste', bu: '', status: 'PILOTO', versao: '2.0', ftp: 'Não', regiaoUf: ['Sudeste'], opcao: 'Opção 2', deveraPreencher: 'SCANNMARKET 1 e SCANNMARKET 2' },
      importanciaNivel1: [{ original: 'Refrigerantes', final: 'Refrigerantes', count: 2, sumImp: 2400000, pct: 80, status: 'green' }],
      importanciaNivel2: [{ original: 'Cola', final: 'Cola', count: 1, sumImp: 1500000, pct: 50, status: 'amber' }],
      validationResults: window.Validations.compute({
        baseRows: [{ ean: '1', descricao: '', fabricante: '', marca: '', categoriaCongelada: 'Bebidas', categoriaDataExcellence: 'Bebidas', nivel1: 'Refrigerantes', nivel2: 'Cola', impVta24: 100 }],
        classifRows: [{ codigoBarras: '1', nivel1: 'Refrigerantes', nivel2: 'Cola' }],
        importanciaNivel1: [{ original: 'Refrigerantes', final: 'Refrigerantes' }],
        importanciaNivel2: [{ original: 'Cola', final: 'Cola' }],
        nivel1AplicaClassif: true,
        nivel2AplicaClassif: true
      })
    };
    window.Report.generatePDF(fakeState);
    log('Report.generatePDF executa sem excecao', true);
  } catch (e) {
    log('Report.generatePDF executa sem excecao', false, e.message);
  }

  const mailto = window.Report.buildMailto({
    params: { categoria: 'Bebidas', cliente: 'Cliente Teste', bu: '', status: 'PILOTO', versao: '2.0', opcao: 'Opção 2', opcaoDescricao: 'Nível 1: ScannMarket 1 e Nível 2: ScannMarket 2', ftp: 'Não', fenix: 'Não', regiaoUf: ['Sudeste'] },
    validationResults: { totalAchados: 7 }
  }, 'Scannmarket-br@scanntech.com,time@scanntech.com');
  log('Mailto contem os dois destinatarios e assunto executivo (maiusculo)',
    mailto.includes('Scannmarket-br@scanntech.com,time@scanntech.com') &&
    mailto.includes('subject=' + encodeURIComponent('SOLICITAÇÃO DE PROD – CLIENTE TESTE – BEBIDAS – 2.0')), mailto);
  log('Corpo do e-mail explica o que a Opção significa',
    decodeURIComponent(mailto).includes('Nível 1: ScannMarket 1 e Nível 2: ScannMarket 2'));

  console.log('\nSmoke test finalizado.');
}

main().catch(e => { console.error('ERRO FATAL NO TESTE:', e); process.exit(1); });
