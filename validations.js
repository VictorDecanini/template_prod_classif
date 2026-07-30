/* validations.js
   Motor de validacao. Recebe dados ja normalizados (ver app.js / core.js) e devolve
   um objeto de resultados usado pelo dashboard (step 4) e pelo relatorio (report.js).

   Formatos de entrada esperados:
   baseRows:   [{ ean, descricao, fabricante, marca, categoriaCongelada,
                   categoriaDataExcellence, nivel1, nivel2, impVta24 }, ...]
   classifRows:[{ codigoBarras, nivel1, nivel2 }, ...]   (nivel1/nivel2 = null quando nao aplicavel)
*/
const Validations = (function () {
  const N = Core.normalizeExact;
  const CI = Core.normalizeCI;

  const LIMIAR_OK = 5;      // >= 5% => verde
  const LIMIAR_ALERTA = 4;  // 4% a 5% => amarelo, < 4% => vermelho

  // ---------- Estatisticas por Nivel (base para a etapa de Importancia) ----------
  function computeGroupStats(baseRows, field) {
    const map = new Map();
    baseRows.forEach(r => {
      const raw = r[field];
      if (raw === null || raw === undefined) return;
      const key = N(raw);
      if (key === '') return;
      if (!map.has(key)) map.set(key, { original: key, count: 0, sumImp: 0 });
      const g = map.get(key);
      g.count++;
      g.sumImp += (r.impVta24 || 0);
    });
    return Array.from(map.values()).sort((a, b) => b.sumImp - a.sumImp);
  }

  function attachPctAndStatus(list) {
    const total = list.reduce((s, g) => s + g.sumImp, 0);
    return list.map(g => {
      const pct = total > 0 ? (g.sumImp / total) * 100 : 0;
      let status = 'green';
      if (pct < LIMIAR_ALERTA) status = 'red';
      else if (pct < LIMIAR_OK) status = 'amber';
      return Object.assign({}, g, { pct, status });
    });
  }

  // Quando duas linhas "Valor detectado" diferentes acabam com o mesmo
  // "Nome Final" (ex.: um typo corrigido pra bater com uma prod que ja'
  // existe), elas devem contar JUNTAS pra fins de SKUs/Importancia/Status -
  // a linha do typo continua aparecendo separada na tabela (pra rastrear o
  // que foi corrigido), mas o numero que importa e' o do grupo consolidado.
  function consolidateFinalGroups(groups) {
    const total = (groups || []).reduce((s, g) => s + g.sumImp, 0);
    const map = new Map();
    (groups || []).forEach(g => {
      const key = N(g.final);
      if (key === '') return;
      if (!map.has(key)) map.set(key, { final: key, count: 0, sumImp: 0 });
      const c = map.get(key);
      c.count += g.count;
      c.sumImp += g.sumImp;
    });
    return Array.from(map.values()).map(c => {
      const pct = total > 0 ? (c.sumImp / total) * 100 : 0;
      let status = 'green';
      if (pct < LIMIAR_ALERTA) status = 'red';
      else if (pct < LIMIAR_OK) status = 'amber';
      return Object.assign({}, c, { pct, status });
    });
  }

  // ---------- Prod (nivel1/nivel2) vs Classificaciones ----------
  // confirmedList: [{ original, final }]  (saida da etapa 3, ja com nome final confirmado)
  // classifValues: array de valores brutos encontrados na coluna correspondente do report
  function diffAgainstClassif(confirmedList, classifValues) {
    const finalSet = new Set(confirmedList.map(c => N(c.final)));
    const classifSet = new Set();
    (classifValues || []).forEach(v => {
      const k = N(v);
      if (k !== '') classifSet.add(k);
    });
    const naoRefletida = confirmedList
      .map(c => N(c.final))
      .filter(v => !classifSet.has(v));
    const incorreta = Array.from(classifSet).filter(v => !finalSet.has(v));
    return { naoRefletida, incorreta };
  }

  // ---------- Cruzamento de SKU (EAN) ----------
  function eanCrossCheck(baseRows, classifRows) {
    const baseByKey = new Map();
    baseRows.forEach(r => {
      const k = Core.eanKey(r.ean);
      if (!baseByKey.has(k)) baseByKey.set(k, []);
      baseByKey.get(k).push(r);
    });
    const classifByKey = new Map();
    classifRows.forEach(r => {
      const k = Core.eanKey(r.codigoBarras);
      if (!classifByKey.has(k)) classifByKey.set(k, []);
      classifByKey.get(k).push(r);
    });

    const onlyInBase = [];
    baseByKey.forEach((rows, key) => {
      if (!classifByKey.has(key)) onlyInBase.push({ ean: rows[0].ean, descricao: rows[0].descricao || '', impVta24: rows[0].impVta24 || 0 });
    });
    const onlyInClassif = [];
    classifByKey.forEach((rows, key) => {
      if (!baseByKey.has(key)) onlyInClassif.push({ codigoBarras: rows[0].codigoBarras, descricao: rows[0].descricao || '' });
    });
    const duplicatesInBase = [];
    baseByKey.forEach((rows, key) => {
      if (rows.length > 1) duplicatesInBase.push({ ean: rows[0].ean, descricao: rows[0].descricao || '', count: rows.length, impVta24: rows[0].impVta24 || 0 });
    });
    const formatMismatches = [];
    baseByKey.forEach((rows, key) => {
      if (!classifByKey.has(key)) return;
      const baseRaw = Core.eanDigits(rows[0].ean);
      const classifRaw = Core.eanDigits(classifByKey.get(key)[0].codigoBarras);
      if (baseRaw !== classifRaw) {
        formatMismatches.push({ base: rows[0].ean, classificaciones: classifByKey.get(key)[0].codigoBarras });
      }
    });

    return { onlyInBase, onlyInClassif, duplicatesInBase, formatMismatches };
  }

  // ---------- SKUs sem classificacao (campo em branco) ----------
  function blankNivelRows(baseRows, field) {
    return baseRows
      .filter(r => N(r[field]) === '')
      .map(r => ({ ean: r.ean, descricao: r.descricao || '', impVta24: r.impVta24 || 0 }));
  }

  // Versao "por SKU" (nao por nivel) - usada no aviso do Passo 3, pra nao listar
  // o mesmo SKU duas vezes quando falta Nivel 1 E Nivel 2 ao mesmo tempo.
  function blankNivelRowsCombined(baseRows, hasNivel2) {
    return baseRows
      .filter(r => N(r.nivel1) === '' || (hasNivel2 && N(r.nivel2) === ''))
      .map(r => ({
        ean: r.ean,
        descricao: r.descricao || '',
        impVta24: r.impVta24 || 0,
        faltaNivel1: N(r.nivel1) === '',
        faltaNivel2: hasNivel2 && N(r.nivel2) === ''
      }));
  }

  // ---------- Prods com baixa relevancia (status "Revisar" da Etapa 3) ----------
  function lowRelevanceGroups(list) {
    return consolidateFinalGroups(list || [])
      .filter(g => g.status === 'red')
      .map(g => ({ nome: g.final, pct: g.pct, count: g.count }));
  }

  // ---------- Categoria congelada vs Data Excellence ----------
  function categoriaChecks(baseRows) {
    const trocaramCategoria = [];
    let nulos = 0, totalComValor = 0;
    const catSet = new Set();
    baseRows.forEach(r => {
      const congelada = N(r.categoriaCongelada);
      const dataExc = N(r.categoriaDataExcellence);
      if (!Core.isBlankLike(dataExc)) {
        totalComValor++;
        catSet.add(dataExc);
      } else {
        nulos++;
      }
      if (congelada !== '' && dataExc !== '' && !Core.isBlankLike(dataExc) && congelada !== dataExc) {
        trocaramCategoria.push({ ean: r.ean, descricao: r.descricao || '', de: congelada, para: dataExc, impVta24: r.impVta24 || 0 });
      }
    });
    const total = baseRows.length;
    const pctNulos = total > 0 ? (nulos / total) * 100 : 0;
    return { trocaramCategoria, pctNulos, categoriasUnicas: Array.from(catSet).sort() };
  }

  // ---------- Divergencias de caixa/acentuacao (maiuscula x minuscula) ----------
  function caseVariants(values) {
    const map = new Map();
    values.forEach(v => {
      const exact = N(v);
      if (exact === '') return;
      const key = CI(exact);
      if (!map.has(key)) map.set(key, new Map());
      const variants = map.get(key);
      variants.set(exact, (variants.get(exact) || 0) + 1);
    });
    const flagged = [];
    map.forEach((variants) => {
      if (variants.size > 1) {
        flagged.push({
          variants: Array.from(variants.entries()).map(([value, count]) => ({ value, count }))
        });
      }
    });
    return flagged;
  }

  // Mesma logica acima, mas pesada pelos grupos confirmados na Etapa 3
  // (usa g.final, nao o valor bruto do arquivo) - assim, se o usuario ja
  // corrigiu "refrigerantes" para "Refrigerantes" no Nome Final, essa
  // divergencia deixa de ser sinalizada, em vez de continuar presa ao
  // valor original do arquivo.
  function caseVariantsWeighted(groups) {
    const map = new Map();
    (groups || []).forEach(g => {
      const exact = N(g.final);
      if (exact === '') return;
      const key = CI(exact);
      if (!map.has(key)) map.set(key, new Map());
      const variants = map.get(key);
      variants.set(exact, (variants.get(exact) || 0) + (g.count || 0));
    });
    const flagged = [];
    map.forEach((variants) => {
      if (variants.size > 1) {
        flagged.push({
          variants: Array.from(variants.entries()).map(([value, count]) => ({ value, count }))
        });
      }
    });
    return flagged;
  }

  // ---------- Espacos em branco (inicio/fim/duplo) ----------
  function whitespaceIssues(baseRows, fields) {
    const issues = [];
    baseRows.forEach(r => {
      fields.forEach(f => {
        if (Core.hasLeadingTrailingOrDoubleSpace(r[f])) {
          issues.push({ ean: r.ean, campo: f, valor: JSON.stringify(r[f]) });
        }
      });
    });
    return issues;
  }

  // ---------- Quase-duplicatas (possiveis erros de digitacao) ----------
  function nearDuplicates(values, maxDistance) {
    maxDistance = maxDistance || 2;
    const uniq = Array.from(new Set(values.map(N).filter(v => v !== '')));
    const pairs = [];
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        const a = uniq[i], b = uniq[j];
        if (CI(a) === CI(b)) continue; // isso e' diferenca de caixa, ja tratado em caseVariants
        const dist = Core.levenshtein(CI(a), CI(b));
        if (dist > 0 && dist <= maxDistance) {
          pairs.push({ a, b, dist });
        }
      }
    }
    return pairs.sort((x, y) => x.dist - y.dist);
  }

  // ---------- Funcao principal ----------
  // input: {
  //   baseRows, classifRows,
  //   importanciaNivel1: [{original,final,count,sumImp,pct,status}],
  //   importanciaNivel2: [...] | null,
  //   nivel1AplicaClassif: bool, nivel2AplicaClassif: bool
  // }
  function compute(input) {
    const { baseRows, classifRows, importanciaNivel1, importanciaNivel2,
      nivel1AplicaClassif, nivel2AplicaClassif } = input;

    const results = {};

    results.eanCross = eanCrossCheck(baseRows, classifRows);
    results.categoria = categoriaChecks(baseRows);
    results.blankNivel1 = blankNivelRows(baseRows, 'nivel1');
    results.blankNivel2 = importanciaNivel2 ? blankNivelRows(baseRows, 'nivel2') : [];
    results.lowRelevanceNivel1 = lowRelevanceGroups(importanciaNivel1);
    results.lowRelevanceNivel2 = importanciaNivel2 ? lowRelevanceGroups(importanciaNivel2) : [];

    results.caseNivel1 = caseVariantsWeighted(importanciaNivel1);
    results.caseNivel2 = importanciaNivel2 ? caseVariantsWeighted(importanciaNivel2) : [];

    results.whitespace = whitespaceIssues(baseRows, importanciaNivel2
      ? ['nivel1', 'nivel2', 'categoriaCongelada', 'categoriaDataExcellence']
      : ['nivel1', 'categoriaCongelada', 'categoriaDataExcellence']);

    results.nearDupNivel1 = nearDuplicates(importanciaNivel1.map(g => g.final));
    results.nearDupNivel2 = importanciaNivel2 ? nearDuplicates(importanciaNivel2.map(g => g.final)) : [];

    if (nivel1AplicaClassif) {
      results.classifNivel1 = diffAgainstClassif(importanciaNivel1, classifRows.map(r => r.nivel1));
    } else {
      results.classifNivel1 = null;
    }
    if (importanciaNivel2 && nivel2AplicaClassif) {
      results.classifNivel2 = diffAgainstClassif(importanciaNivel2, classifRows.map(r => r.nivel2));
    } else {
      results.classifNivel2 = null;
    }

    // contagem total de "achados" para o KPI de topo
    let totalAchados = 0;
    totalAchados += results.eanCross.duplicatesInBase.length;
    totalAchados += results.categoria.trocaramCategoria.length;
    totalAchados += results.blankNivel1.length + results.blankNivel2.length;
    totalAchados += results.caseNivel1.length + results.caseNivel2.length;
    totalAchados += results.whitespace.length;
    totalAchados += results.nearDupNivel1.length + results.nearDupNivel2.length;
    if (results.classifNivel1) totalAchados += results.classifNivel1.naoRefletida.length + results.classifNivel1.incorreta.length;
    if (results.classifNivel2) totalAchados += results.classifNivel2.naoRefletida.length + results.classifNivel2.incorreta.length;
    results.totalAchados = totalAchados;

    return results;
  }

  return {
    LIMIAR_OK, LIMIAR_ALERTA,
    computeGroupStats, attachPctAndStatus, consolidateFinalGroups,
    diffAgainstClassif, eanCrossCheck, categoriaChecks, blankNivelRows, blankNivelRowsCombined,
    caseVariants, caseVariantsWeighted, whitespaceIssues, nearDuplicates,
    compute
  };
})();
