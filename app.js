/* app.js
   Controlador principal: estado da aplicacao, navegacao entre etapas,
   formulario de parametros, upload + mapeamento de colunas, confirmacao de
   importancia, dashboard de validacao e disparo do relatorio final.
*/
(function () {

  const REGIOES = ['Norte', 'Sul', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Brasil'];
  const UFS = ['AL_SE', 'BA', 'CE', 'PB', 'PE', 'RN', 'MA_PI', 'SP Interior', 'SP Regmet', 'RJ', 'ES',
    'MG', 'RS', 'SC', 'PR', 'RR_AM_RO_AC', 'TO_PA_AP', 'DF', 'GO', 'MS', 'MT', 'TODOS'];

  const ALIASES = {
    // Base congelada — nomes reais confirmados primeiro, variações genéricas como reforço
    ean: ['código barras sku', 'codigo barras sku', 'ean', 'codigo de barras', 'codigo_barras', 'cod barras', 'gtin'],
    descricao: ['nome sku', 'descricao sku', 'descricao', 'nombre sku', 'produto', 'descripcion'],
    fabricante: ['fabricante sku', 'fabricante'],
    marca: ['marca sku', 'marca'],
    categoriaCongelada: ['categoría congelada scannmarket', 'categoria congelada scannmarket', 'categoria congelada'],
    categoriaDataExcellence: ['categoria atual data excellence', 'categoria data excellence', 'categoria de'],
    impVta24: ['imp vta (ult.24 meses)', 'imp vta ult 24 meses', 'impvta24', 'imp vta24', 'imp_vta_24', 'importancia venda 24 meses', 'importancia 24 meses'],
    // Report Classificaciones — nomes padronizados confirmados
    codigoBarras: ['codigo_barras', 'codigo de barras', 'ean'],
    categoria: ['categoria', 'categoria classificaciones', 'categoria report']
  };

  // As colunas de ScannMarket 3/4 na base congelada podem vir com nomes variados
  // (SM3, SM_3, Nível 1, N3...), diferente do Classificaciones, que é padronizado.
  // rawNum = número real da coluna ScannMarket (1-4); nivelSemantico = qual Nível
  // (1 ou 2) essa coluna acaba alimentando, dado a Opção escolhida.
  function scannmarketBaseCandidates(rawNum, nivelSemantico) {
    return [
      'scannmarket ' + rawNum, 'scannmarket_' + rawNum, 'scannmarket' + rawNum, 'scan market ' + rawNum,
      'sm' + rawNum, 'sm_' + rawNum, 'sm ' + rawNum, 'sm-' + rawNum,
      'nivel ' + nivelSemantico, 'nível ' + nivelSemantico, 'n' + nivelSemantico,
      'n' + rawNum, 'nivel ' + rawNum, 'nível ' + rawNum
    ];
  }

  const state = {
    params: {
      categoria: '', cliente: '', bu: '', status: '', versao: '2.0', ftp: 'Não', fenix: 'Não',
      regiaoUf: [], opcao: null, deveraPreencher: ''
    },
    files: { base: null, classif: null },
    mapping: { base: {}, classif: {} },
    baseRowsMapped: [],
    classifRowsMapped: [],
    importanciaNivel1: [],
    importanciaNivel2: null,
    classifFilterStats: null,
    validationResults: null,
    emailExtraRecipients: [],
    blankFixes: { nivel1: {}, nivel2: {} },
    currentStep: 1,
    maxStepReached: 1
  };

  // ---------------- Helpers de opcao ----------------
  function hasNivel2(opcao) { return opcao === 'Opção 1' || opcao === 'Opção 2'; }
  function nivel1UsaScannMarket(opcao) { return opcao === 'Opção 2' || opcao === 'Opção 4'; }
  function nivel2UsaScannMarket(opcao) { return hasNivel2(opcao); }
  function precisaPrimario(opcao) { return opcao === 'Opção 1' || opcao === 'Opção 2' || opcao === 'Opção 4'; }
  function precisaSecundario(opcao) { return opcao === 'Opção 2'; }
  function smNumeroPrimario(versao) { return versao === '3.0' ? '3' : '1'; }
  function smNumeroSecundario(versao) { return versao === '3.0' ? '4' : '2'; }

  function computeDeveraPreencher(opcao, versao) {
    if (!opcao) return '';
    const p = smNumeroPrimario(versao), s = smNumeroSecundario(versao);
    if (opcao === 'Opção 1') return 'APENAS SCANNMARKET ' + p;
    if (opcao === 'Opção 2') return 'SCANNMARKET ' + p + ' e SCANNMARKET ' + s;
    if (opcao === 'Opção 4') return 'APENAS SCANNMARKET ' + p;
    return 'NADA';
  }

  function computeOpcaoDescricao(opcao, versao) {
    if (!opcao) return '';
    const p = smNumeroPrimario(versao), s = smNumeroSecundario(versao);
    if (opcao === 'Opção 1') return 'Nível 1: Categoria ScannTech e Nível 2: ScannMarket ' + p;
    if (opcao === 'Opção 2') return 'Nível 1: ScannMarket ' + p + ' e Nível 2: ScannMarket ' + s;
    if (opcao === 'Opção 3') return 'Nível 1: Categoria ScannTech (sem Nível 2)';
    if (opcao === 'Opção 4') return 'Nível 1: ScannMarket ' + p + ' (sem Nível 2)';
    return '';
  }

  // ==================================================================
  // STEP 1 — PARAMETROS
  // ==================================================================
  function initStep1() {
    document.getElementById('f-categoria').addEventListener('input', e => { state.params.categoria = e.target.value; });
    document.getElementById('f-cliente').addEventListener('input', e => { state.params.cliente = e.target.value; });
    document.getElementById('f-bu').addEventListener('input', e => { state.params.bu = e.target.value; });
    document.getElementById('f-status').addEventListener('change', e => { state.params.status = e.target.value; });
    document.getElementById('f-versao').addEventListener('change', e => {
      state.params.versao = e.target.value;
      refreshDeveraPreencher();
    });

    const ftpEl = document.getElementById('f-ftp');
    ftpEl.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        ftpEl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.params.ftp = btn.dataset.val;
      });
    });

    const fenixEl = document.getElementById('f-fenix');
    fenixEl.querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        fenixEl.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.params.fenix = btn.dataset.val;
      });
    });

    document.querySelectorAll('input[name="opcao"]').forEach(radio => {
      radio.addEventListener('change', e => {
        state.params.opcao = e.target.value;
        refreshDeveraPreencher();
      });
    });

    initTagSelect();

    document.getElementById('btn-to-step2').addEventListener('click', () => {
      if (!state.params.categoria.trim()) {
        alert('Preencha o campo Categoria antes de continuar.');
        return;
      }
      if (!state.params.opcao) {
        alert('Selecione uma opção de classificação antes de continuar.');
        return;
      }
      goToStep(2);
    });
  }

  function refreshDeveraPreencher() {
    state.params.deveraPreencher = computeDeveraPreencher(state.params.opcao, state.params.versao);
    state.params.opcaoDescricao = computeOpcaoDescricao(state.params.opcao, state.params.versao);
    const el = document.getElementById('f-deverapreencher');
    if (!state.params.opcao) {
      el.textContent = 'Selecione uma opção para ver o que deverá ser preenchido no classificaciones.';
    } else {
      el.innerHTML = '<i class="ti ti-info-circle"></i>&nbsp; Deverá ser preenchido no classificaciones: <strong>' +
        state.params.deveraPreencher + '</strong>';
    }
  }

  function initTagSelect() {
    const trigger = document.getElementById('tagselect-trigger');
    const menu = document.getElementById('tagselect-menu');
    const search = document.getElementById('tagselect-search');
    const tagsWrap = document.getElementById('tagselect-tags');

    function renderTags() {
      tagsWrap.innerHTML = '';
      state.params.regiaoUf.forEach(val => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.innerHTML = '<span>' + val + '</span>';
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.innerHTML = '&times;';
        rm.addEventListener('click', (ev) => {
          ev.stopPropagation();
          state.params.regiaoUf = state.params.regiaoUf.filter(v => v !== val);
          renderTags();
          renderMenu(search.value);
        });
        pill.appendChild(rm);
        tagsWrap.appendChild(pill);
      });
    }

    function renderMenu(filterText) {
      const f = (filterText || '').toLowerCase();
      menu.innerHTML = '';
      function group(label, items) {
        const filtered = items.filter(i => i.toLowerCase().includes(f));
        if (filtered.length === 0) return;
        const glabel = document.createElement('div');
        glabel.className = 'tagselect-group-label';
        glabel.textContent = label;
        menu.appendChild(glabel);
        filtered.forEach(item => {
          const opt = document.createElement('div');
          opt.className = 'tagselect-option' + (state.params.regiaoUf.includes(item) ? ' is-selected' : '');
          opt.textContent = item;
          opt.addEventListener('click', () => {
            if (state.params.regiaoUf.includes(item)) {
              state.params.regiaoUf = state.params.regiaoUf.filter(v => v !== item);
            } else {
              state.params.regiaoUf.push(item);
            }
            renderTags();
            renderMenu(search.value);
          });
          menu.appendChild(opt);
        });
      }
      group('Região', REGIOES);
      group('UF', UFS);
    }

    trigger.addEventListener('click', () => {
      menu.hidden = false;
      renderMenu(search.value);
      search.focus();
    });
    search.addEventListener('input', () => renderMenu(search.value));
    document.addEventListener('click', (e) => {
      if (!document.getElementById('f-regiao-uf').contains(e.target)) menu.hidden = true;
    });

    renderTags();
    renderMenu('');
  }

  // ==================================================================
  // STEP 2 — UPLOAD + MAPEAMENTO
  // ==================================================================
  function initStep2() {
    document.getElementById('btn-to-step1').addEventListener('click', () => goToStep(1));
    document.getElementById('btn-to-step3').addEventListener('click', () => {
      if (finalizeMapping()) goToStep(3);
    });

    setupUpload('file-base', 'file-base-label', 'status-base', 'base');
    setupUpload('file-classif', 'file-classif-label', 'status-classif', 'classif');
  }

  function setupUpload(inputId, labelId, statusId, kind) {
    const input = document.getElementById(inputId);
    const dropzone = input.closest('.dropzone');

    function handleFile(file) {
      if (!file) return;
      document.getElementById(labelId).textContent = file.name;
      const statusEl = document.getElementById(statusId);
      statusEl.textContent = 'Lendo arquivo...';
      statusEl.className = 'upload-status';
      Core.parseFile(file).then(({ headers, rows }) => {
        if (rows.length === 0) {
          statusEl.textContent = 'Não foi possível identificar linhas de dados neste arquivo.';
          statusEl.className = 'upload-status is-error';
          return;
        }
        state.files[kind] = { file, headers, rows };
        statusEl.textContent = rows.length.toLocaleString('pt-BR') + ' linhas encontradas, ' + headers.length + ' colunas.';
        statusEl.className = 'upload-status is-ok';
        renderMappingArea();
      }).catch(err => {
        statusEl.textContent = 'Erro ao ler arquivo: ' + err.message;
        statusEl.className = 'upload-status is-error';
      });
    }

    input.addEventListener('change', e => handleFile(e.target.files[0]));
    ['dragover', 'dragenter'].forEach(evt => {
      dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove('is-dragover'); });
    });
    dropzone.addEventListener('drop', e => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
  }

  function fieldRow(container, key, label, headers, currentMapping, required, hint, candidatesOverride) {
    const row = document.createElement('div');
    row.className = 'mapping-row';
    const lab = document.createElement('label');
    lab.textContent = label + (required ? ' *' : '');
    row.appendChild(lab);

    const wrap = document.createElement('div');
    const select = document.createElement('select');
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '— não mapear —';
    select.appendChild(emptyOpt);
    headers.forEach(h => {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = h;
      select.appendChild(opt);
    });
    const candidates = candidatesOverride || ALIASES[key] || [label];
    const guess = currentMapping[key] || Core.guessColumn(headers, candidates);
    if (guess) select.value = guess;
    currentMapping[key] = select.value || null;
    select.addEventListener('change', () => { currentMapping[key] = select.value || null; });
    wrap.appendChild(select);
    if (hint) {
      const hintEl = document.createElement('div');
      hintEl.className = 'opt-tag';
      hintEl.textContent = hint;
      wrap.appendChild(hintEl);
    }
    row.appendChild(wrap);
    container.appendChild(row);
  }

  function renderMappingArea() {
    const area = document.getElementById('mapping-area');
    area.innerHTML = '';
    const opcao = state.params.opcao;
    const versao = state.params.versao;

    if (state.files.base) {
      const card = document.createElement('div');
      card.className = 'mapping-card';
      card.innerHTML = '<h3>Mapeamento — Base congelada classificada</h3><p>Confirme (ou ajuste) qual coluna do seu arquivo corresponde a cada campo.</p>';
      const headers = state.files.base.headers;
      const m = state.mapping.base;
      fieldRow(card, 'ean', 'EAN', headers, m, true);
      fieldRow(card, 'descricao', 'Descrição', headers, m, false);
      fieldRow(card, 'categoriaCongelada', 'Categoria congelada', headers, m, true);
      fieldRow(card, 'categoriaDataExcellence', 'Categoria Data Excellence', headers, m, true);
      fieldRow(card, 'impVta24', 'impVta24 (venda 24 meses)', headers, m, true);
      if (precisaPrimario(opcao)) {
        const nivelSemantico = nivel1UsaScannMarket(opcao) ? 1 : 2;
        fieldRow(card, 'scannmarketPrimario', 'ScannMarket ' + smNumeroPrimario(versao), headers, m, true,
          'Vai alimentar o Nível ' + nivelSemantico + ' — pode aparecer como "SM' + smNumeroPrimario(versao) + '", "N' + nivelSemantico + '" etc.',
          scannmarketBaseCandidates(smNumeroPrimario(versao), nivelSemantico));
      }
      if (precisaSecundario(opcao)) {
        fieldRow(card, 'scannmarketSecundario', 'ScannMarket ' + smNumeroSecundario(versao), headers, m, true,
          'Vai alimentar o Nível 2 — pode aparecer como "SM' + smNumeroSecundario(versao) + '", "N2" etc.',
          scannmarketBaseCandidates(smNumeroSecundario(versao), 2));
      }
      area.appendChild(card);
    }

    if (state.files.classif) {
      const card = document.createElement('div');
      card.className = 'mapping-card';
      card.innerHTML = '<h3>Mapeamento — Report Classificaciones</h3><p>As colunas podem estar em qualquer ordem no seu arquivo — só confirme o de-para abaixo.</p>';
      const headers = state.files.classif.headers;
      const m = state.mapping.classif;
      fieldRow(card, 'codigoBarras', 'CODIGO_BARRAS', headers, m, true);
      fieldRow(card, 'descricao', 'Descrição (opcional)', headers, m, false,
        'Ajuda a identificar os SKUs nas listas de validação e no relatório.');
      fieldRow(card, 'categoria', 'Categoria', headers, m, true,
        'Usada para manter só as linhas da categoria "' + (state.params.categoria || '?') + '" — o report pode trazer várias categorias misturadas.');
      if (precisaPrimario(opcao)) {
        fieldRow(card, 'classifPrimario', 'Scannmarket ' + smNumeroPrimario(versao), headers, m, true);
      }
      if (precisaSecundario(opcao)) {
        fieldRow(card, 'classifSecundario', 'Scannmarket ' + smNumeroSecundario(versao), headers, m, true);
      }
      const statusEl = document.createElement('div');
      statusEl.className = 'callout';
      statusEl.id = 'classif-category-filter-status';
      statusEl.style.marginTop = '4px';
      card.appendChild(statusEl);
      area.appendChild(card);
      updateClassifCategoryFilterStatus();
    }

    updateStep2ContinueButton();
  }

  // Compara ignorando acento, caixa e espaço extra - "Bebidas", "BEBIDAS " e
  // "Bebídas" devem contar como a mesma categoria na hora de filtrar o report.
  function updateClassifCategoryFilterStatus() {
    const el = document.getElementById('classif-category-filter-status');
    if (!el) return;
    const catCol = state.mapping.classif.categoria;
    if (!catCol || !state.files.classif) {
      el.className = 'callout';
      el.innerHTML = '<i class="ti ti-info-circle"></i> Selecione a coluna de categoria para ver quantas linhas batem com "' + escapeHtml(state.params.categoria || '') + '".';
      return;
    }
    const alvo = Core.normalizeCI(state.params.categoria);
    const rows = state.files.classif.rows;
    const matched = rows.filter(r => Core.normalizeCI(r[catCol]) === alvo).length;
    if (matched === 0) {
      el.className = 'callout callout-info';
      el.style.background = 'var(--red-bg)';
      el.style.borderColor = '#F3C9C9';
      el.style.color = 'var(--red)';
      el.innerHTML = '<i class="ti ti-alert-triangle"></i> Nenhuma linha do Classificaciones bateu com a categoria "' +
        escapeHtml(state.params.categoria) + '" (de ' + rows.length.toLocaleString('pt-BR') + ' linhas no arquivo). ' +
        'Confira se a coluna mapeada é mesmo a de categoria e se o nome digitado no Passo 1 está certo.';
    } else {
      el.className = 'callout callout-info';
      el.style.background = '';
      el.style.borderColor = '';
      el.style.color = '';
      el.innerHTML = '<i class="ti ti-filter"></i> ' + matched.toLocaleString('pt-BR') + ' de ' + rows.length.toLocaleString('pt-BR') +
        ' linhas do Classificaciones são da categoria "' + escapeHtml(state.params.categoria) + '" e serão usadas na validação.';
    }
  }

  function updateStep2ContinueButton() {
    const ok = state.files.base && state.files.classif && mappingIsComplete();
    document.getElementById('btn-to-step3').disabled = !ok;
  }

  function mappingIsComplete() {
    const opcao = state.params.opcao;
    const mb = state.mapping.base, mc = state.mapping.classif;
    if (!mb.ean || !mb.categoriaCongelada || !mb.categoriaDataExcellence || !mb.impVta24) return false;
    if (precisaPrimario(opcao) && !mb.scannmarketPrimario) return false;
    if (precisaSecundario(opcao) && !mb.scannmarketSecundario) return false;
    if (!mc.codigoBarras || !mc.categoria) return false;
    if (precisaPrimario(opcao) && !mc.classifPrimario) return false;
    if (precisaSecundario(opcao) && !mc.classifSecundario) return false;
    return true;
  }

  // recheck the continue button whenever a mapping select changes, since fieldRow
  // attaches its own listener — we piggyback with a delegated listener here.
  document.addEventListener('change', e => {
    if (e.target.closest && e.target.closest('#mapping-area')) {
      updateStep2ContinueButton();
      updateClassifCategoryFilterStatus();
    }
  });

  function nivel1RawColumn(opcao, mb) {
    return (opcao === 'Opção 1' || opcao === 'Opção 3') ? mb.categoriaCongelada : mb.scannmarketPrimario;
  }
  function nivel2RawColumn(opcao, mb) {
    if (opcao === 'Opção 1') return mb.scannmarketPrimario;
    if (opcao === 'Opção 2') return mb.scannmarketSecundario;
    return null;
  }

  function finalizeMapping() {
    if (!mappingIsComplete()) {
      alert('Complete o mapeamento de colunas obrigatórias antes de continuar.');
      return false;
    }
    const opcao = state.params.opcao;
    const mb = state.mapping.base, mc = state.mapping.classif;
    const col1 = nivel1RawColumn(opcao, mb);
    const col2 = nivel2RawColumn(opcao, mb);

    state.baseRowsMapped = state.files.base.rows.map(r => {
      return {
        ean: r[mb.ean],
        descricao: mb.descricao ? r[mb.descricao] : '',
        categoriaCongelada: r[mb.categoriaCongelada],
        categoriaDataExcellence: r[mb.categoriaDataExcellence],
        impVta24: Core.parseBRNumber(r[mb.impVta24]),
        nivel1: r[col1],
        nivel2: col2 ? r[col2] : null
      };
    });

    const alvoCategoria = Core.normalizeCI(state.params.categoria);
    const classifRowsDaCategoria = state.files.classif.rows.filter(r => Core.normalizeCI(r[mc.categoria]) === alvoCategoria);
    state.classifFilterStats = { total: state.files.classif.rows.length, matched: classifRowsDaCategoria.length };

    state.classifRowsMapped = classifRowsDaCategoria.map(r => {
      let n1 = null, n2 = null;
      if (nivel1UsaScannMarket(opcao)) n1 = r[mc.classifPrimario];
      if (opcao === 'Opção 1') n1 = r[mc.classifPrimario];
      if (opcao === 'Opção 2') n2 = r[mc.classifSecundario];
      return { codigoBarras: r[mc.codigoBarras], descricao: mc.descricao ? r[mc.descricao] : '', nivel1: n1, nivel2: n2 };
    });

    return true;
  }

  // ==================================================================
  // STEP 3 — IMPORTANCIA
  // ==================================================================
  function initStep3() {
    document.getElementById('btn-to-step2b').addEventListener('click', () => goToStep(2));
    document.getElementById('btn-to-step4').addEventListener('click', () => {
      captureImportanciaEdits();
      runValidationsAndRender();
      goToStep(4);
    });
  }

  function buildImportanciaTable(title, groups, storeKey, blockId) {
    const wrap = document.createElement('div');
    wrap.className = 'importancia-block';
    if (blockId) wrap.id = blockId;
    const h = document.createElement('h3');
    h.textContent = title;
    wrap.appendChild(h);

    const editHint = document.createElement('p');
    editHint.className = 'edit-hint';
    editHint.innerHTML = '<i class="ti ti-pencil"></i> As caixas da coluna <strong>"Nome Final - Editável"</strong> podem ser alteradas — clique e digite o nome correto para corrigir algum erro de digitação.';
    wrap.appendChild(editHint);

    const table = document.createElement('table');
    table.className = 'data-table';
    table.innerHTML = '<thead><tr><th>Valor detectado</th><th>Nome Final - Editável</th><th>SKUs</th><th>Importância</th>' +
      '<th>Status<span class="th-sub">Revisar: abaixo de 4% · Atenção: 4%–5% · OK: 5% ou mais</span></th></tr></thead>';
    const tbody = document.createElement('tbody');
    groups.forEach((g, idx) => {
      const tr = document.createElement('tr');
      if (g.status === 'red') tr.className = 'row-revisar';
      const badgeClass = g.status === 'green' ? 'badge-green' : g.status === 'amber' ? 'badge-amber' : 'badge-red';
      const badgeText = g.status === 'green' ? 'OK' : g.status === 'amber' ? 'Atenção' : 'Revisar';
      tr.innerHTML =
        '<td>' + escapeHtml(g.original) + '</td>' +
        '<td><input type="text" class="nome-final-input" data-idx="' + idx + '" data-store="' + storeKey + '" value="' + escapeAttr(g.final) + '"></td>' +
        '<td>' + g.count.toLocaleString('pt-BR') + '</td>' +
        '<td>' + g.pct.toFixed(2).replace('.', ',') + '%</td>' +
        '<td><span class="badge ' + badgeClass + '">' + badgeText + '</span></td>';
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function mergeFinalValues(newGroups, oldGroups) {
    const oldMap = new Map((oldGroups || []).map(g => [g.original, g.final]));
    return newGroups.map(g => Object.assign({}, g, { final: oldMap.has(g.original) ? oldMap.get(g.original) : g.original }));
  }

  function renderImportanciaArea() {
    const area = document.getElementById('importancia-area');
    area.innerHTML = '';

    const blankWrap = document.createElement('div');
    blankWrap.className = 'importancia-block';
    const blankH = document.createElement('h3');
    blankH.textContent = '3.0 Itens com classificação em branco';
    blankWrap.appendChild(blankH);
    blankWrap.appendChild(buildBlankValuesCallout());
    area.appendChild(blankWrap);

    const g1 = mergeFinalValues(Validations.attachPctAndStatus(Validations.computeGroupStats(state.baseRowsMapped, 'nivel1')), state.importanciaNivel1);
    state.importanciaNivel1 = g1;
    area.appendChild(buildImportanciaTable('3.1 Nível 1', g1, 'nivel1', 'importancia-nivel1-block'));

    if (hasNivel2(state.params.opcao)) {
      const g2 = mergeFinalValues(Validations.attachPctAndStatus(Validations.computeGroupStats(state.baseRowsMapped, 'nivel2')), state.importanciaNivel2);
      state.importanciaNivel2 = g2;
      area.appendChild(buildImportanciaTable('3.2 Nível 2', g2, 'nivel2', 'importancia-nivel2-block'));
    } else {
      state.importanciaNivel2 = null;
    }

    area.addEventListener('input', () => { captureImportanciaEdits(); updateCorrectionsPreview(); });

    const previewEl = document.createElement('div');
    previewEl.id = 'corrections-preview';
    previewEl.className = 'callout';
    previewEl.style.marginTop = '4px';
    area.appendChild(previewEl);
    updateCorrectionsPreview();
  }

  // O time comercial nao pode deixar SKU sem classificacao. Em vez de so' avisar,
  // a lista ja vem com um campo pra classificar o SKU na hora - igual o "Nome
  // final" das tabelas de Importancia. Ao confirmar (Enter ou clicar fora), o
  // valor e' aplicado direto no SKU e a tela toda recalcula (o SKU pode entrar
  // num grupo existente, tipo "MOP", ou virar um grupo novo).
  function buildBlankValuesCallout() {
    const hasN2 = hasNivel2(state.params.opcao);
    const blanks = Validations.blankNivelRowsCombined(state.baseRowsMapped, hasN2);

    const el = document.createElement('div');
    el.style.marginBottom = '18px';
    el.id = 'blank-values-callout';

    if (blanks.length === 0) {
      el.className = 'callout';
      el.innerHTML = '<i class="ti ti-check"></i> Nenhum SKU sem classificação.';
      return el;
    }

    el.className = 'callout callout-danger';
    let html = '<i class="ti ti-alert-triangle"></i><div style="width:100%">' +
      '<strong>' + blanks.length.toLocaleString('pt-BR') + ' SKU(s) sem classificação</strong> — classifique abaixo antes de seguir.' +
      '<div class="blank-fix-list">';
    blanks.slice(0, 20).forEach(r => {
      html += '<div class="blank-fix-row">' +
        '<span class="blank-fix-label">' + escapeHtml(r.ean) + (r.descricao ? ' — ' + escapeHtml(r.descricao) : '') + '</span>';
      if (r.faltaNivel1) {
        html += '<input type="text" class="blank-fix-input" data-ean="' + escapeAttr(r.ean) + '" data-nivel="1" placeholder="Classificar Nível 1...">';
      }
      if (r.faltaNivel2) {
        html += '<input type="text" class="blank-fix-input" data-ean="' + escapeAttr(r.ean) + '" data-nivel="2" placeholder="Classificar Nível 2...">';
      }
      html += '</div>';
    });
    html += '</div>';
    if (blanks.length > 20) {
      html += '<div style="margin-top:6px;font-size:12px;">+ ' + (blanks.length - 20) + ' outros — corrija os primeiros e a lista atualiza.</div>';
    }
    html += '</div>';
    el.innerHTML = html;

    el.querySelectorAll('.blank-fix-input').forEach(input => {
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
      input.addEventListener('blur', () => {
        if (input.value.trim() !== '') applyBlankCorrection(input.dataset.ean, input.dataset.nivel, input.value);
      });
    });

    return el;
  }

  function applyBlankCorrection(ean, nivelStr, value) {
    const val = Core.normalizeExact(value);
    if (val === '') return;
    const eanKey = Core.toStr(ean);
    let changed = false;
    state.baseRowsMapped.forEach(row => {
      if (Core.toStr(row.ean) === eanKey) {
        if (nivelStr === '1') { row.nivel1 = val; state.blankFixes.nivel1[eanKey] = val; }
        else { row.nivel2 = val; state.blankFixes.nivel2[eanKey] = val; }
        changed = true;
      }
    });
    if (changed) renderImportanciaArea();
  }

  function captureImportanciaEdits() {
    document.querySelectorAll('#importancia-area input[type="text"]').forEach(input => {
      const idx = Number(input.dataset.idx);
      const store = input.dataset.store;
      const list = store === 'nivel1' ? state.importanciaNivel1 : state.importanciaNivel2;
      if (list && list[idx]) list[idx].final = input.value;
    });
  }

  // "Nome final" so existe dentro da ferramenta - editar esse campo NAO muda uma
  // unica linha do arquivo que foi subido. Por isso, sempre que houver diferenca
  // entre o valor detectado e o nome final, isso vira uma substituicao a ser
  // aplicada de verdade na base congelada, disponivel para download no Passo 5 -
  // em vez do usuario ter que corrigir manualmente o arquivo original.
  function buildCorrections() {
    const opcao = state.params.opcao;
    const mb = state.mapping.base;
    const col1 = nivel1RawColumn(opcao, mb);
    const col2 = nivel2RawColumn(opcao, mb);

    const map1 = new Map();
    (state.importanciaNivel1 || []).forEach(g => {
      const finalNorm = Core.normalizeExact(g.final);
      if (finalNorm !== '' && finalNorm !== g.original) map1.set(g.original, finalNorm);
    });
    const map2 = new Map();
    (state.importanciaNivel2 || []).forEach(g => {
      const finalNorm = Core.normalizeExact(g.final);
      if (finalNorm !== '' && finalNorm !== g.original) map2.set(g.original, finalNorm);
    });

    const blankTotal = Object.keys(state.blankFixes.nivel1).length + Object.keys(state.blankFixes.nivel2).length;
    const renameTotal = map1.size + map2.size;

    return { col1, col2, map1, map2, renameTotal, blankTotal, total: renameTotal + blankTotal };
  }

  function buildCorrectedBaseRows() {
    const { col1, col2, map1, map2 } = buildCorrections();
    const eanCol = state.mapping.base.ean;
    return state.files.base.rows.map(r => {
      const copy = Object.assign({}, r);
      const eanKey = Core.toStr(r[eanCol]);
      if (col1) {
        if (state.blankFixes.nivel1[eanKey] !== undefined) {
          copy[col1] = state.blankFixes.nivel1[eanKey];
        } else {
          const key = Core.normalizeExact(copy[col1]);
          if (map1.has(key)) copy[col1] = map1.get(key);
        }
      }
      if (col2) {
        if (state.blankFixes.nivel2[eanKey] !== undefined) {
          copy[col2] = state.blankFixes.nivel2[eanKey];
        } else {
          const key = Core.normalizeExact(copy[col2]);
          if (map2.has(key)) copy[col2] = map2.get(key);
        }
      }
      return copy;
    });
  }

  function updateCorrectionsPreview() {
    const el = document.getElementById('corrections-preview');
    if (!el) return;
    const { map1, map2, renameTotal } = buildCorrections();
    if (renameTotal === 0) {
      el.className = 'callout';
      el.innerHTML = '<i class="ti ti-info-circle"></i> Nenhuma correção de nome pendente — se você mudar um "Nome final", a correção aparecerá aqui e ficará disponível para download no Passo 5.';
      return;
    }
    const lines = [];
    map1.forEach((final, original) => lines.push('Nível 1: "' + original + '" → "' + final + '"'));
    map2.forEach((final, original) => lines.push('Nível 2: "' + original + '" → "' + final + '"'));
    el.className = 'callout callout-info';
    el.innerHTML = '<i class="ti ti-edit"></i> ' + renameTotal + ' correção(ões) de nome serão aplicadas na base congelada: ' +
      escapeHtml(lines.join(' · ')) + '. Baixe o arquivo já corrigido no Passo 5 (Relatório) em vez de editar o original manualmente.';
  }

  // ==================================================================
  // STEP 4 — VALIDACAO
  // ==================================================================
  function initStep4() {
    document.getElementById('btn-to-step3b').addEventListener('click', () => goToStep(3));
    document.getElementById('btn-to-step5').addEventListener('click', () => goToStep(5));
  }

  function runValidationsAndRender() {
    const opcao = state.params.opcao;
    state.validationResults = Validations.compute({
      baseRows: state.baseRowsMapped,
      classifRows: state.classifRowsMapped,
      importanciaNivel1: state.importanciaNivel1,
      importanciaNivel2: state.importanciaNivel2,
      nivel1AplicaClassif: nivel1UsaScannMarket(opcao),
      nivel2AplicaClassif: hasNivel2(opcao)
    });
    renderDashboard();
  }

  function kpiCard(value, label, tone) {
    const card = document.createElement('div');
    card.className = 'kpi-card' + (tone ? ' is-' + tone : '');
    card.innerHTML = '<div class="kpi-value">' + value + '</div><div class="kpi-label">' + label + '</div>';
    return card;
  }

  function renderDashboard() {
    const v = state.validationResults;
    const kpiRow = document.getElementById('kpi-row');
    kpiRow.innerHTML = '';
    kpiRow.appendChild(kpiCard(state.baseRowsMapped.length.toLocaleString('pt-BR'), 'SKUs na base congelada'));
    kpiRow.appendChild(kpiCard(state.classifRowsMapped.length.toLocaleString('pt-BR'), 'SKUs no classificaciones'));
    kpiRow.appendChild(kpiCard(v.totalAchados.toLocaleString('pt-BR'), 'Achados na validação', v.totalAchados > 0 ? 'red' : 'green'));
    kpiRow.appendChild(kpiCard(v.categoria.pctNulos.toFixed(1).replace('.', ',') + '%', '% nulos em Data Excellence'));

    let filterNote = document.getElementById('classif-filter-note-step4');
    if (!filterNote) {
      filterNote = document.createElement('div');
      filterNote.id = 'classif-filter-note-step4';
      filterNote.className = 'callout callout-info';
      filterNote.style.marginBottom = '16px';
      kpiRow.parentNode.insertBefore(filterNote, kpiRow);
    }
    if (state.classifFilterStats) {
      filterNote.innerHTML = '<i class="ti ti-filter"></i> Do arquivo Classificaciones, ' +
        state.classifFilterStats.matched.toLocaleString('pt-BR') + ' de ' + state.classifFilterStats.total.toLocaleString('pt-BR') +
        ' linhas eram da categoria "' + escapeHtml(state.params.categoria) + '" e foram usadas nesta validação.';
    }

    const area = document.getElementById('validation-area');
    area.innerHTML = '';

    const totalImpVta24 = state.baseRowsMapped.reduce((s, r) => s + (r.impVta24 || 0), 0);
    function skuLabel(d) {
      let s = d.ean + (d.descricao ? ' — ' + d.descricao : '');
      if (d.impVta24 !== undefined && totalImpVta24 > 0) {
        const pct = (d.impVta24 / totalImpVta24) * 100;
        s += '  [Vol: ' + d.impVta24.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) +
          ' · ' + pct.toFixed(2).replace('.', ',') + '% da categoria]';
      }
      return s;
    }

    const jump3_0 = { label: 'Ir para o Passo 3.0', sectionId: 'blank-values-callout' };
    const jump3_1 = { label: 'Ir para o Passo 3.1', sectionId: 'importancia-nivel1-block' };
    const jump3_2 = { label: 'Ir para o Passo 3.2', sectionId: 'importancia-nivel2-block' };

    // Ordem de prioridade: primeiro o que mais afeta o dashboard final
    // (classificação não refletida/incorreta, SKU sem classificação, prod de
    // baixa relevância, divergência de grafia), depois o resto.
    const checkDefs = [
      v.classifNivel1 && {
        title: 'Nível 1 não refletido no report Classificaciones',
        desc: 'Um nome confirmado na Etapa 3 (Importância) para o Nível 1 não aparece em nenhuma linha do report Classificaciones — a classificação pedida pode não ter sido processada ainda pelo sistema.',
        items: v.classifNivel1.naoRefletida, formatter: x => x, recommendation: Core.RECOMENDACOES.classifNaoRefletida, jumpTo: jump3_1
      },
      v.classifNivel1 && {
        title: 'Nível 1 incorreto no report Classificaciones',
        desc: 'Um valor encontrado no report Classificaciones não corresponde a nenhum nome confirmado na Etapa 3 — pode ser um erro de digitação feito direto no sistema, ou uma Prod nova que ainda não foi registrada.',
        items: v.classifNivel1.incorreta, formatter: x => x, recommendation: Core.RECOMENDACOES.classifIncorreta
      },
      v.classifNivel2 && {
        title: 'Nível 2 não refletido no report Classificaciones',
        desc: 'Um nome confirmado na Etapa 3 (Importância) para o Nível 2 não aparece em nenhuma linha do report Classificaciones — a classificação pedida pode não ter sido processada ainda pelo sistema.',
        items: v.classifNivel2.naoRefletida, formatter: x => x, recommendation: Core.RECOMENDACOES.classifNaoRefletida, jumpTo: jump3_2
      },
      v.classifNivel2 && {
        title: 'Nível 2 incorreto no report Classificaciones',
        desc: 'Um valor encontrado no report Classificaciones não corresponde a nenhum nome confirmado na Etapa 3 — pode ser um erro de digitação feito direto no sistema, ou uma Prod nova que ainda não foi registrada.',
        items: v.classifNivel2.incorreta, formatter: x => x, recommendation: Core.RECOMENDACOES.classifIncorreta
      },
      {
        title: 'SKUs sem classificação de Nível 1',
        desc: 'SKUs da base congelada que não têm nenhum valor no campo de Nível 1 — ficaram sem classificação nenhuma.',
        items: v.blankNivel1, formatter: skuLabel, recommendation: Core.RECOMENDACOES.blankNivel, jumpTo: jump3_0
      },
      (v.blankNivel2.length || (state.importanciaNivel2 && state.importanciaNivel2.length)) && {
        title: 'SKUs sem classificação de Nível 2',
        desc: 'SKUs da base congelada que não têm nenhum valor no campo de Nível 2 — ficaram sem classificação nenhuma.',
        items: v.blankNivel2, formatter: skuLabel, recommendation: Core.RECOMENDACOES.blankNivel, jumpTo: jump3_0
      },
      {
        title: 'Prods com baixa relevância (Revisar) — Nível 1',
        desc: 'Aviso, não é erro: grupos do Nível 1 com Importância abaixo de 4% — status "Revisar" na Etapa 3. Não bloqueia o andamento; dá pra seguir sem corrigir isso.',
        items: v.lowRelevanceNivel1, formatter: g => '"' + g.nome + '"  —  ' + g.count + ' SKU(s)  —  ' + g.pct.toFixed(2).replace('.', ',') + '%',
        recommendation: Core.RECOMENDACOES.lowRelevance, jumpTo: jump3_1, severity: 'warning'
      },
      (state.importanciaNivel2 && state.importanciaNivel2.length) && {
        title: 'Prods com baixa relevância (Revisar) — Nível 2',
        desc: 'Aviso, não é erro: grupos do Nível 2 com Importância abaixo de 4% — status "Revisar" na Etapa 3. Não bloqueia o andamento; dá pra seguir sem corrigir isso.',
        items: v.lowRelevanceNivel2, formatter: g => '"' + g.nome + '"  —  ' + g.count + ' SKU(s)  —  ' + g.pct.toFixed(2).replace('.', ',') + '%',
        recommendation: Core.RECOMENDACOES.lowRelevance, jumpTo: jump3_2, severity: 'warning'
      },
      {
        title: 'Divergência de maiúscula/minúscula — Nível 1',
        desc: 'O mesmo texto aparece grafado de formas diferentes (ex.: "Refrigerantes" e "refrigerantes"). O Excel não pega isso porque COUNTIF/MATCH ignoram caixa, mas no dashboard final essas duas grafias virariam duas Prods diferentes.',
        items: v.caseNivel1, formatter: g => g.variants.map(x => '"' + x.value + '" (' + x.count + ')').join('  vs  '), recommendation: Core.RECOMENDACOES.caseVariants, jumpTo: jump3_1
      },
      (state.importanciaNivel2 && state.importanciaNivel2.length) && {
        title: 'Divergência de maiúscula/minúscula — Nível 2',
        desc: 'Mesma lógica acima, aplicada ao Nível 2.',
        items: v.caseNivel2, formatter: g => g.variants.map(x => '"' + x.value + '" (' + x.count + ')').join('  vs  '), recommendation: Core.RECOMENDACOES.caseVariants, jumpTo: jump3_2
      },
      {
        title: 'Possíveis erros de digitação — Nível 1',
        desc: 'Dois nomes confirmados na Etapa 3 são muito parecidos entre si (distância de edição ≤ 2 caracteres) — pode ser o mesmo produto/Prod digitado de forma levemente diferente em dois lugares.',
        items: v.nearDupNivel1, formatter: p => '"' + p.a + '"  vs  "' + p.b + '"  (distância ' + p.dist + ')', recommendation: Core.RECOMENDACOES.nearDup, jumpTo: jump3_1
      },
      (state.importanciaNivel2 && state.importanciaNivel2.length) && {
        title: 'Possíveis erros de digitação — Nível 2',
        desc: 'Mesma lógica acima, aplicada ao Nível 2.',
        items: v.nearDupNivel2, formatter: p => '"' + p.a + '"  vs  "' + p.b + '"  (distância ' + p.dist + ')', recommendation: Core.RECOMENDACOES.nearDup, jumpTo: jump3_2
      },
      {
        title: 'Espaços em branco indevidos',
        desc: 'Espaço no início, no fim ou duplo no meio do texto de uma classificação — invisível a olho nu, mas pode quebrar comparações exatas em outras etapas do processo ou em outras ferramentas.',
        items: v.whitespace, formatter: w => w.ean + '  [' + w.campo + ']  ' + w.valor, recommendation: Core.RECOMENDACOES.whitespace
      },
      {
        title: 'SKUs na base congelada não encontrados no classificaciones',
        desc: 'SKUs que já têm uma classificação na base congelada desta rodada, mas que não aparecem em nenhuma linha do report Classificaciones para a categoria filtrada. É esperado que isso aconteça às vezes (SKU descontinuado, ou classificação ainda não processada) — vale a pena olhar o volume de cada um pra saber se merece atenção.',
        items: v.eanCross.onlyInBase, formatter: skuLabel, recommendation: Core.RECOMENDACOES.onlyInBase, severity: 'warning'
      },
      {
        title: 'SKUs no classificaciones não encontrados na base congelada',
        desc: 'SKUs que já existem classificados no Classificaciones para essa categoria, mas que não vieram na base congelada enviada nesta rodada. Também é uma situação comum — não significa necessariamente um problema.',
        items: v.eanCross.onlyInClassif, formatter: d => d.codigoBarras + (d.descricao ? ' — ' + d.descricao : ''), recommendation: Core.RECOMENDACOES.onlyInClassif, severity: 'warning'
      },
      {
        title: 'EAN duplicado dentro da base congelada',
        desc: 'O mesmo EAN aparece em mais de uma linha da base congelada enviada — isso pode fazer a venda desse produto ser contada em dobro no cálculo de Importância.',
        items: v.eanCross.duplicatesInBase, formatter: d => skuLabel(d) + '  (' + d.count + ' linhas)', recommendation: Core.RECOMENDACOES.duplicatesInBase
      },
      {
        title: 'Possível divergência de formato de EAN (zero à esquerda)',
        desc: 'O mesmo produto aparece com quantidade diferente de dígitos entre as duas bases — geralmente é EAN tratado como número em uma planilha (perdendo o zero à esquerda) e como texto na outra.',
        items: v.eanCross.formatMismatches, formatter: d => 'Base congelada: ' + d.base + '   |   Classificaciones: ' + d.classificaciones, recommendation: Core.RECOMENDACOES.eanFormat
      },
      {
        title: 'SKUs que trocaram de categoria',
        desc: 'A Categoria congelada (a que já estava classificada) é diferente da Categoria atual em Data Excellence (a mais recente) para o mesmo SKU — o produto mudou de categoria entre uma base e outra.',
        items: v.categoria.trocaramCategoria, formatter: d => skuLabel(d) + ':  ' + d.de + '  →  ' + d.para, recommendation: Core.RECOMENDACOES.trocaramCategoria
      }
    ].filter(Boolean);

    const totalChecks = checkDefs.length;
    const approved = checkDefs.filter(c => c.items.length === 0).length;
    const pending = totalChecks - approved;

    const summary = document.createElement('div');
    summary.className = 'callout ' + (pending === 0 ? '' : 'callout-info');
    summary.style.marginBottom = '16px';
    summary.innerHTML = pending === 0
      ? '<i class="ti ti-check"></i> <strong>' + totalChecks + '/' + totalChecks + ' verificações aprovadas</strong> — nenhum ponto de atenção encontrado.'
      : '<i class="ti ti-list-check"></i> <strong>' + approved + '/' + totalChecks + ' verificações aprovadas</strong> — as ' + pending +
        ' abaixo precisam de atenção, ordenadas da mais para a menos relevante.';
    area.appendChild(summary);

    checkDefs.filter(c => c.items.length > 0).forEach(c => {
      addCheck(area, c.title, c.desc, c.items, c.formatter, c.recommendation, c.severity, c.jumpTo);
    });
  }

  function jumpToStep3(sectionId) {
    goToStep(3);
    setTimeout(() => {
      const el = document.getElementById(sectionId);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash-highlight');
      setTimeout(() => el.classList.remove('flash-highlight'), 3000);
    }, 60);
  }

  function addCheck(container, title, desc, items, formatter, recommendation, severity, jumpTo) {
    const card = document.createElement('div');
    card.className = 'check-card';
    const count = items ? items.length : 0;
    const badgeClass = count === 0 ? 'badge-green' : (severity === 'warning' ? 'badge-amber' : 'badge-red');
    const badgeText = count === 0 ? 'OK' : count + (count === 1 ? ' item' : ' itens');

    const head = document.createElement('div');
    head.className = 'check-head';
    head.innerHTML = '<strong>' + title + '</strong><span class="badge ' + badgeClass + '">' + badgeText + '</span><i class="ti ti-chevron-right chev"></i>';
    head.addEventListener('click', () => card.classList.toggle('is-open'));
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = 'check-body';
    const p = document.createElement('p');
    p.className = 'desc';
    p.textContent = desc;
    body.appendChild(p);

    if (count === 0) {
      const empty = document.createElement('div');
      empty.className = 'check-empty';
      empty.innerHTML = '<i class="ti ti-check"></i> Nenhum item encontrado.';
      body.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'check-list';
      items.slice(0, 300).forEach(item => {
        const row = document.createElement('div');
        row.className = 'check-list-item';
        row.textContent = formatter(item);
        list.appendChild(row);
      });
      body.appendChild(list);
      if (items.length > 300) {
        const more = document.createElement('p');
        more.className = 'desc';
        more.style.marginTop = '8px';
        more.textContent = '+ ' + (items.length - 300) + ' outros itens — lista completa no PDF gerado no Passo 5.';
        body.appendChild(more);
      }
      if (recommendation) {
        const rec = document.createElement('div');
        rec.className = 'recommendation';
        rec.innerHTML = '<strong>Recomendação:</strong> ' + escapeHtml(recommendation);
        if (jumpTo) {
          const jumpBtn = document.createElement('button');
          jumpBtn.type = 'button';
          jumpBtn.className = 'jump-btn';
          jumpBtn.innerHTML = jumpTo.label + ' <i class="ti ti-arrow-right"></i>';
          jumpBtn.addEventListener('click', (e) => { e.stopPropagation(); jumpToStep3(jumpTo.sectionId); });
          rec.appendChild(jumpBtn);
        }
        body.appendChild(rec);
      }
    }
    card.appendChild(body);
    container.appendChild(card);
  }

  // ==================================================================
  // STEP 5 — RELATORIO
  // ==================================================================
  const FIXED_EMAIL = 'Scannmarket-br@scanntech.com';

  function initStep5() {
    document.getElementById('btn-to-step4b').addEventListener('click', () => goToStep(4));
    document.getElementById('btn-gen-pdf').addEventListener('click', () => Report.generatePDF(state));
    document.getElementById('btn-gen-email').addEventListener('click', () => {
      const mailto = Report.buildMailto(state, getEmailRecipients().join(','));
      // Abre numa aba separada, sem tirar o usuario da ferramenta - assim ele
      // continua podendo baixar o PDF/arquivo depois sem perder nada.
      window.open(mailto, '_blank');
      document.getElementById('report-reminder').hidden = false;
    });
    renderCorrectedBaseCard();
    initEmailTags();
  }

  // "Scannmarket-br@scanntech.com" e' sempre destinatario, sem botao de remover.
  // O time pode adicionar mais gente digitando e apertando Enter ou virgula.
  function initEmailTags() {
    const tagsWrap = document.getElementById('email-tags');
    const input = document.getElementById('email-tag-input');
    if (!tagsWrap || !input) return;

    function render() {
      tagsWrap.innerHTML = '';
      const locked = document.createElement('span');
      locked.className = 'tag-pill is-locked';
      locked.innerHTML = '<i class="ti ti-lock"></i><span>' + escapeHtml(FIXED_EMAIL) + '</span>';
      tagsWrap.appendChild(locked);
      state.emailExtraRecipients.forEach(email => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.innerHTML = '<span>' + escapeHtml(email) + '</span>';
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.innerHTML = '&times;';
        rm.addEventListener('click', () => {
          state.emailExtraRecipients = state.emailExtraRecipients.filter(e => e !== email);
          render();
        });
        pill.appendChild(rm);
        tagsWrap.appendChild(pill);
      });
    }

    function addFromInput() {
      const val = input.value.trim().replace(/,+$/, '');
      if (val && !state.emailExtraRecipients.includes(val)) state.emailExtraRecipients.push(val);
      input.value = '';
      render();
    }

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFromInput(); }
    });
    input.addEventListener('blur', () => { if (input.value.trim()) addFromInput(); });

    render();
  }

  function getEmailRecipients() {
    return [FIXED_EMAIL].concat(state.emailExtraRecipients || []);
  }

  // Secao extra (montada por JS, nao esta no index.html) para baixar o arquivo
  // de prods corrigidas com as correcoes do Passo 3 ja aplicadas. Fica ANTES
  // do grid de PDF/E-mail, como "Etapa 1" - so' e' necessaria se algo foi
  // corrigido no Passo 3; o PDF/e-mail (Etapa 2) sempre acontecem.
  function renderCorrectedBaseCard() {
    const grid = document.querySelector('#panel-5 .report-grid');
    if (!grid || document.getElementById('corrected-base-card')) return;

    const section = document.createElement('div');
    section.className = 'corrected-base-section';
    section.id = 'corrected-base-card';
    section.innerHTML = '<div class="corrected-base-info"><i class="ti ti-file-check"></i><div>' +
      '<span class="step-eyebrow">1 · Só se algo foi corrigido no Passo 3</span>' +
      '<strong>Arquivo de prods corrigidas</strong>' +
      '<span class="corrected-base-flow">Baixe o arquivo&nbsp;→&nbsp;confira se todos os ajustes de Prod foram realizados&nbsp;→&nbsp;suba no classificaciones novamente.</span>' +
      '<span id="corrected-base-desc"></span>' +
      '</div></div>';
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.id = 'btn-gen-corrected-base';
    btn.textContent = 'Baixar arquivo';
    btn.addEventListener('click', () => {
      const rows = buildCorrectedBaseRows();
      Report.downloadCorrectedBase(state, rows);
    });
    section.appendChild(btn);
    grid.parentNode.insertBefore(section, grid);

    const divider = document.createElement('div');
    divider.className = 'report-divider';
    divider.innerHTML = '<span>2 · Envie a solicitação (sempre, independente de correção)</span>';
    grid.parentNode.insertBefore(divider, grid);
  }

  function updateCorrectedBaseCardDesc() {
    const desc = document.getElementById('corrected-base-desc');
    if (!desc) return;
    const { total } = buildCorrections();
    desc.textContent = total === 0
      ? 'Nenhuma correção feita no Passo 3 — mesma estrutura do arquivo original.'
      : total + ' correção(ões) do Passo 3 já aplicadas — mesma estrutura do arquivo original.';
  }

  // Aviso no topo do Passo 5 avisando o que ainda ficou pendente da validação,
  // com atalho direto pra onde resolver - pra ninguem enviar a solicitacao
  // sem perceber que ainda ha' pontos em aberto.
  function renderStep5PendingWarning() {
    let el = document.getElementById('step5-pending-warning');
    if (!el) {
      el = document.createElement('div');
      el.id = 'step5-pending-warning';
      el.style.marginBottom = '18px';
      const panelHead = document.querySelector('#panel-5 .panel-head');
      panelHead.parentNode.insertBefore(el, panelHead.nextSibling);
    }
    const v = state.validationResults;
    const lowRelTotal = v ? (v.lowRelevanceNivel1.length + v.lowRelevanceNivel2.length) : 0;
    const lowRelNote = lowRelTotal > 0
      ? '<div style="margin-top:8px;font-weight:500;">Aviso à parte (não bloqueia): ' + lowRelTotal + ' Prod(s) com baixa relevância (Revisar) — pode seguir sem corrigir.</div>'
      : '';

    if (!v || v.totalAchados === 0) {
      el.className = lowRelTotal > 0 ? 'callout callout-warning' : 'callout';
      el.innerHTML = '<i class="ti ti-check"></i> <div>Nenhuma pendência bloqueante da validação — pode seguir com o relatório.' + lowRelNote + '</div>';
      return;
    }
    const blankTotal = v.blankNivel1.length + v.blankNivel2.length;
    const restTotal = v.totalAchados - blankTotal;
    const parts = [];
    if (blankTotal) parts.push(blankTotal + ' SKU(s) sem classificação');
    if (restTotal > 0) parts.push(restTotal + ' outro(s) ponto(s) de validação');

    el.className = 'callout callout-danger';
    let html = '<i class="ti ti-alert-triangle"></i><div><strong>' + v.totalAchados + ' pendência(s) ainda em aberto:</strong> ' +
      escapeHtml(parts.join(', ')) + '.';
    if (blankTotal) html += '<button type="button" class="jump-btn" id="step5-jump-step3">Ir para o Passo 3 <i class="ti ti-arrow-right"></i></button>';
    if (restTotal > 0) html += '<button type="button" class="jump-btn" id="step5-jump-step4">Ver detalhes no Passo 4 <i class="ti ti-arrow-right"></i></button>';
    html += lowRelNote + '</div>';
    el.innerHTML = html;
    const b3 = document.getElementById('step5-jump-step3');
    if (b3) b3.addEventListener('click', () => goToStep(3));
    const b4 = document.getElementById('step5-jump-step4');
    if (b4) b4.addEventListener('click', () => goToStep(4));
  }

  // ==================================================================
  // NAVEGACAO ENTRE ETAPAS
  // ==================================================================
  function goToStep(n) {
    state.currentStep = n;
    state.maxStepReached = Math.max(state.maxStepReached, n);
    document.querySelectorAll('.panel').forEach(p => { p.hidden = Number(p.dataset.panel) !== n; });
    document.querySelectorAll('.step').forEach(s => {
      const sn = Number(s.dataset.step);
      s.classList.toggle('is-active', sn === n);
      s.classList.toggle('is-done', sn < n);
    });
    if (n === 2) renderMappingArea();
    if (n === 3) renderImportanciaArea();
    if (n === 5) { updateCorrectedBaseCardDesc(); renderStep5PendingWarning(); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function initStepper() {
    document.querySelectorAll('.step').forEach(s => {
      s.addEventListener('click', () => {
        const n = Number(s.dataset.step);
        if (n <= state.maxStepReached) goToStep(n);
      });
    });
  }

  function escapeHtml(s) {
    return Core.toStr(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  document.addEventListener('DOMContentLoaded', () => {
    initStepper();
    initStep1();
    initStep2();
    initStep3();
    initStep4();
    initStep5();
    refreshDeveraPreencher();
    goToStep(1);
  });

})();
