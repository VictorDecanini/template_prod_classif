/* report.js
   Geracao do relatorio final (PDF enxuto e Excel enxuto) e montagem do link
   mailto: para abrir o cliente de e-mail padrao (Outlook, se for o app padrao
   do sistema) com destinatario/assunto/corpo ja preenchidos.

   Importante: por restricao de seguranca dos navegadores, NAO e possivel anexar
   arquivos automaticamente via mailto:. O arquivo baixado precisa ser anexado
   manualmente pelo usuario.
*/
const Report = (function () {

  const BLUE = [5, 79, 225];
  const INK = [22, 25, 43];
  const GRAY = [86, 90, 114];

  function fmtPct(v) { return v.toFixed(2).replace('.', ',') + '%'; }

  function statusLabel(status) {
    return status === 'green' ? 'OK' : status === 'amber' ? 'Atencao' : 'Revisar';
  }

  function paramsRows(state) {
    const p = state.params;
    return [
      ['Categoria', p.categoria || '-'],
      ['Cliente', p.cliente || '-'],
      ['BU', p.bu || '-'],
      ['Status cliente', p.status || '-'],
      ['Versao SM', p.versao || '-'],
      ['FTP', p.ftp || '-'],
      ['Fenix', p.fenix || '-'],
      ['Regiao / UF', (p.regiaoUf || []).join(', ') || '-'],
      ['Opcao', p.opcao || '-'],
      ['Devera ser preenchido', p.deveraPreencher || '-'],
    ];
  }

  // ---------------- PDF ----------------
  function generatePDF(state) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const marginX = 40;
    let y = 0;

    doc.setFillColor(...BLUE);
    doc.rect(0, 0, 595, 64, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text('Relatorio de validacao - Prod & Classificaciones', marginX, 30);
    doc.setFontSize(10);
    doc.text('ScannMarket · gerado em ' + new Date().toLocaleString('pt-BR'), marginX, 48);
    y = 90;

    doc.setTextColor(...INK);
    doc.setFontSize(12);
    doc.text('Parametros', marginX, y);
    y += 8;
    doc.autoTable({
      startY: y,
      margin: { left: marginX, right: marginX },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: INK },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140 } },
      body: paramsRows(state)
    });
    y = doc.lastAutoTable.finalY + 20;

    function addImportanciaTable(title, list) {
      if (!list || list.length === 0) return;
      doc.setFontSize(12);
      doc.text(title, marginX, y);
      y += 8;
      doc.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Nome final', 'SKUs', 'Importancia', 'Status']],
        body: list.map(g => [g.final, String(g.count), fmtPct(g.pct), statusLabel(g.status)]),
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: BLUE, textColor: 255 },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 3) {
            const s = data.cell.raw;
            if (s === 'Revisar') data.cell.styles.textColor = [194, 43, 43];
            else if (s === 'Atencao') data.cell.styles.textColor = [169, 102, 10];
            else data.cell.styles.textColor = [28, 138, 90];
          }
        }
      });
      y = doc.lastAutoTable.finalY + 20;
    }

    addImportanciaTable('Importancia - Nivel 1', state.importanciaNivel1);
    addImportanciaTable('Importancia - Nivel 2', state.importanciaNivel2);

    function ensureSpace(needed) {
      if (y + needed > 780) { doc.addPage(); y = 40; }
    }

    function addListSection(title, items, emptyMsg, formatter, recommendation) {
      ensureSpace(40);
      doc.setFontSize(12);
      doc.text(title, marginX, y);
      y += 8;
      if (!items || items.length === 0) {
        doc.setFontSize(9);
        doc.setTextColor(28, 138, 90);
        doc.text(emptyMsg || 'Nenhum problema encontrado.', marginX, y + 10);
        doc.setTextColor(...INK);
        y += 26;
        return;
      }
      doc.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        body: items.slice(0, 60).map(formatter),
        styles: { fontSize: 8.5, cellPadding: 3 },
        theme: 'striped'
      });
      y = doc.lastAutoTable.finalY;
      if (items.length > 60) {
        y += 12;
        doc.setFontSize(8);
        doc.setTextColor(...GRAY);
        doc.text('+ ' + (items.length - 60) + ' outros itens (consulte o dashboard na ferramenta para a lista completa).', marginX, y);
        doc.setTextColor(...INK);
      }
      if (recommendation) {
        y += 14;
        ensureSpace(24);
        doc.setFontSize(8.5);
        doc.setTextColor(...BLUE);
        const wrapped = doc.splitTextToSize('Recomendacao: ' + recommendation, 515);
        doc.text(wrapped, marginX, y);
        doc.setTextColor(...INK);
        y += wrapped.length * 11;
      }
      y += 18;
    }

    const v = state.validationResults;
    const totalImpVta24 = (state.baseRowsMapped || []).reduce((s, r) => s + (r.impVta24 || 0), 0);
    function skuLabelStr(d) {
      let s = d.ean + (d.descricao ? '  —  ' + d.descricao : '');
      if (d.impVta24 !== undefined && totalImpVta24 > 0) {
        const pct = (d.impVta24 / totalImpVta24) * 100;
        s += '  [Vol: ' + Math.round(d.impVta24).toLocaleString('pt-BR') + ' - ' + pct.toFixed(2).replace('.', ',') + '% da categoria]';
      }
      return s;
    }
    const skuLabel = d => [skuLabelStr(d)];
    ensureSpace(30);
    doc.setFontSize(12);
    doc.text('Resumo de validacao (' + v.totalAchados + ' achados no total)', marginX, y);
    y += 20;

    addListSection('SKUs na base congelada, nao encontrados no classificaciones', v.eanCross.onlyInBase,
      null, skuLabel, Core.RECOMENDACOES.onlyInBase);
    addListSection('SKUs no classificaciones, nao encontrados na base congelada', v.eanCross.onlyInClassif,
      null, d => [d.codigoBarras + (d.descricao ? '  —  ' + d.descricao : '')], Core.RECOMENDACOES.onlyInClassif);
    addListSection('EAN duplicado dentro da base congelada', v.eanCross.duplicatesInBase,
      null, d => [skuLabelStr(d) + '  (' + d.count + ' linhas)'], Core.RECOMENDACOES.duplicatesInBase);
    addListSection('Possivel divergencia de formato de EAN (zero a esquerda)', v.eanCross.formatMismatches,
      null, d => ['Base congelada: ' + d.base + '   |   Classificaciones: ' + d.classificaciones], Core.RECOMENDACOES.eanFormat);
    addListSection('SKUs sem classificacao de Nivel 1 (em branco)', v.blankNivel1,
      null, skuLabel, Core.RECOMENDACOES.blankNivel);
    addListSection('SKUs sem classificacao de Nivel 2 (em branco)', v.blankNivel2,
      null, skuLabel, Core.RECOMENDACOES.blankNivel);
    addListSection('SKUs que trocaram de categoria (congelada vs Data Excellence)', v.categoria.trocaramCategoria,
      null, d => [skuLabelStr(d) + ':  ' + d.de + '  ->  ' + d.para], Core.RECOMENDACOES.trocaramCategoria);
    addListSection('Divergencia de maiuscula/minuscula - Nivel 1', v.caseNivel1,
      null, g => [g.variants.map(x => x.value + ' (' + x.count + ')').join('  |  ')], Core.RECOMENDACOES.caseVariants);
    addListSection('Divergencia de maiuscula/minuscula - Nivel 2', v.caseNivel2,
      null, g => [g.variants.map(x => x.value + ' (' + x.count + ')').join('  |  ')], Core.RECOMENDACOES.caseVariants);
    addListSection('Espacos em branco indevidos', v.whitespace,
      null, w => [w.ean + '  [' + w.campo + ']  ' + w.valor], Core.RECOMENDACOES.whitespace);
    addListSection('Possiveis erros de digitacao - Nivel 1 (nomes parecidos)', v.nearDupNivel1,
      null, p => ['"' + p.a + '"  vs  "' + p.b + '"  (distancia ' + p.dist + ')'], Core.RECOMENDACOES.nearDup);
    addListSection('Possiveis erros de digitacao - Nivel 2 (nomes parecidos)', v.nearDupNivel2,
      null, p => ['"' + p.a + '"  vs  "' + p.b + '"  (distancia ' + p.dist + ')'], Core.RECOMENDACOES.nearDup);

    if (v.classifNivel1) {
      addListSection('Nivel 1 nao refletido no report Classificaciones', v.classifNivel1.naoRefletida,
        null, s => [s], Core.RECOMENDACOES.classifNaoRefletida);
      addListSection('Nivel 1 incorreto no report Classificaciones (nao esperado)', v.classifNivel1.incorreta,
        null, s => [s], Core.RECOMENDACOES.classifIncorreta);
    }
    if (v.classifNivel2) {
      addListSection('Nivel 2 nao refletido no report Classificaciones', v.classifNivel2.naoRefletida,
        null, s => [s], Core.RECOMENDACOES.classifNaoRefletida);
      addListSection('Nivel 2 incorreto no report Classificaciones (nao esperado)', v.classifNivel2.incorreta,
        null, s => [s], Core.RECOMENDACOES.classifIncorreta);
    }

    ensureSpace(20);
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text('% de nulos em Categoria Data Excellence: ' + v.categoria.pctNulos.toFixed(2).replace('.', ',') + '%', marginX, y);

    const filename = 'relatorio_prod_' + slug(state.params.categoria || 'sem_categoria') + '.pdf';
    doc.save(filename);
    return filename;
  }

  // ---------------- E-mail (mailto) ----------------
  function buildMailto(state, to) {
    const p = state.params;
    const v = state.validationResults;
    const subjectParts = [
      'SOLICITAÇÃO DE PROD',
      p.cliente || 'CLIENTE NÃO INFORMADO',
      p.categoria || 'CATEGORIA NÃO INFORMADA',
      p.versao || '-'
    ];
    const subject = subjectParts.join(' – ').toUpperCase();

    const bodyLines = [
      'Ola,',
      '',
      'Segue solicitacao de Prod para validacao.',
      '',
      'Categoria: ' + (p.categoria || '-'),
      'Cliente: ' + (p.cliente || '-'),
      'BU: ' + (p.bu || '-'),
      'Status: ' + (p.status || '-'),
      'Versao SM: ' + (p.versao || '-'),
      'Opcao: ' + (p.opcao || '-') + (p.opcaoDescricao ? ' (' + p.opcaoDescricao + ')' : ''),
      'FTP: ' + (p.ftp || '-'),
      'Fenix: ' + (p.fenix || '-'),
      'Regiao/UF: ' + ((p.regiaoUf || []).join(', ') || '-'),
      '',
      'Achados na validacao automatica: ' + (v ? v.totalAchados : 0),
      '',
      'IMPORTANTE:',
      '- Se algo foi corrigido no Passo 3, anexe tambem o arquivo de prods corrigidas antes de enviar.',
      '- Anexe manualmente o PDF que voce acabou de baixar - o navegador nao anexa isso automaticamente.',
      '',
      'Obrigado!'
    ];
    const body = bodyLines.join('\n');
    const mailto = 'mailto:' + (to || '') +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
    return mailto;
  }

  // ---------------- Base congelada corrigida ----------------
  // Recebe as linhas ja com as correcoes do Passo 3 aplicadas (ver
  // app.js/buildCorrectedBaseRows) e devolve o download no MESMO formato do
  // arquivo original (csv ou xlsx), com as mesmas colunas e a mesma ordem -
  // pra poder ser reaproveitado direto no resto do processo.
  function downloadCorrectedBase(state, correctedRows) {
    const headers = state.files.base.headers;
    const originalName = (state.files.base.file && state.files.base.file.name) || 'base.csv';
    const isXlsx = /\.xlsx?$/i.test(originalName);
    const filename = 'prod_corrigida_para_subir_classificaciones_' + slug(state.params.categoria || 'sem_categoria') + (isXlsx ? '.xlsx' : '.csv');

    if (isXlsx) {
      const aoa = [headers];
      correctedRows.forEach(r => aoa.push(headers.map(h => (r[h] !== undefined ? r[h] : ''))));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Base corrigida');
      XLSX.writeFile(wb, filename);
    } else {
      const csvRows = [headers].concat(correctedRows.map(r => headers.map(h => (r[h] !== undefined ? r[h] : ''))));
      const csv = csvRows.map(row => row.map(csvEscape).join(';')).join('\r\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    return filename;
  }

  function csvEscape(v) {
    const s = v === null || v === undefined ? '' : String(v);
    if (/[;"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function slug(s) {
    return Core.normalizeCI(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'arquivo';
  }

  return { generatePDF, buildMailto, downloadCorrectedBase };
})();
