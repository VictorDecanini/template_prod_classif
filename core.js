/* core.js
   Utilitarios genericos: parsing de arquivo (CSV/XLSX), normalizacao de texto e numero,
   deteccao de cabecalho, distancia de edicao para deteccao de quase-duplicatas.
   Tudo roda no navegador, nada e enviado para servidor nenhum.
*/
const Core = (function () {

  // ---------- Normalizacao de texto ----------

  function toStr(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  // Remove espacos extras nas pontas e colapsa espacos duplos no meio.
  // Usado para comparacao "exata, mas tolerante a espaco".
  function normalizeExact(v) {
    return toStr(v).replace(/\s+/g, ' ').trim();
  }

  // Normalizacao case-insensitive + sem acento, usada so para DETECTAR
  // divergencias de caixa/acentuacao — nunca para decidir um match "de verdade".
  function normalizeCI(v) {
    return normalizeExact(v)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function hasLeadingTrailingOrDoubleSpace(v) {
    const s = toStr(v);
    if (s === '') return false;
    return /^\s|\s$|\s{2,}/.test(s);
  }

  function isBlankLike(v) {
    const s = normalizeExact(v).toLowerCase();
    return s === '' || s === 'null' || s === 'sin_valor' || s === 'n/a' || s === 'na';
  }

  // ---------- Normalizacao de EAN ----------

  function eanDigits(v) {
    return toStr(v).replace(/\D/g, '');
  }

  // Chave para comparar EANs ignorando zeros a esquerda (problema classico de
  // planilha que trata EAN ora como texto ora como numero).
  function eanKey(v) {
    const d = eanDigits(v).replace(/^0+/, '');
    return d === '' ? '0' : d;
  }

  // ---------- Numero em formato brasileiro ----------
  // Aceita "1.234.567,89", "1234567.89", "1234,5", numeros JS puros, etc.
  function parseBRNumber(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v).trim();
    if (s === '') return 0;
    s = s.replace(/[^\d.,-]/g, '');
    const hasComma = s.indexOf(',') !== -1;
    const hasDot = s.indexOf('.') !== -1;
    if (hasComma && hasDot) {
      // formato BR: ponto = milhar, virgula = decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (hasComma && !hasDot) {
      s = s.replace(',', '.');
    }
    // se so tem ponto, assume que ja e formato "internacional" (1234.56)
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // ---------- Distancia de edicao (Levenshtein) ----------
  // Usada apenas para sinalizar possiveis erros de digitacao entre nomes
  // parecidos — nunca para decidir automaticamente que dois valores sao iguais.
  function levenshtein(a, b) {
    a = a || ''; b = b || '';
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(
          prev[j] + 1,
          curr[j - 1] + 1,
          prev[j - 1] + cost
        );
      }
      [prev, curr] = [curr, prev];
    }
    return prev[n];
  }

  // ---------- Deteccao de linha de cabecalho ----------
  // Recebe uma matriz de linhas cruas (array de arrays) e tenta achar qual
  // linha, dentre as 10 primeiras, parece ser o cabecalho (mais celulas
  // textuais nao vazias e nao numericas).
  function detectHeaderRowIndex(rows) {
    let bestIdx = 0, bestScore = -1;
    const limit = Math.min(rows.length, 10);
    for (let i = 0; i < limit; i++) {
      const row = rows[i] || [];
      let score = 0;
      row.forEach(cell => {
        const s = toStr(cell).trim();
        if (s !== '' && isNaN(Number(s.replace(',', '.')))) score++;
      });
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return bestIdx;
  }

  function normalizeHeaderKey(h) {
    return normalizeCI(h).replace(/[^a-z0-9]+/g, '');
  }

  // Tenta achar, dentre os cabecalhos originais, o que melhor bate com uma
  // lista de "candidatos" conhecidos (aliases). Retorna o cabecalho ORIGINAL
  // (para manter a grafia exibida ao usuario) ou null.
  function guessColumn(headers, candidates) {
    const normHeaders = headers.map(h => ({ raw: h, key: normalizeHeaderKey(h) }));
    for (const cand of candidates) {
      const candKey = normalizeHeaderKey(cand);
      const exact = normHeaders.find(h => h.key === candKey);
      if (exact) return exact.raw;
    }
    for (const cand of candidates) {
      const candKey = normalizeHeaderKey(cand);
      const partial = normHeaders.find(h => h.key.indexOf(candKey) !== -1 || candKey.indexOf(h.key) !== -1);
      if (partial) return partial.raw;
    }
    return null;
  }

  // ---------- Parsing de arquivo (CSV ou XLSX) ----------
  // Retorna Promise<{headers: string[], rows: object[]}>
  function parseFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      return parseXLSX(file);
    }
    return parseCSV(file);
  }

  function parseXLSX(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'));
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const wb = XLSX.read(data, { type: 'array', cellDates: false });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
          resolve(rowsToObjects(raw));
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function parseCSV(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Nao foi possivel ler o arquivo.'));
      reader.onload = (e) => {
        let text = decodeBuffer(e.target.result);
        const result = Papa.parse(text, {
          delimiter: '', // auto
          skipEmptyLines: true
        });
        resolve(rowsToObjects(result.data));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // Detecta a codificacao do arquivo e decodifica corretamente. Cobre, nessa ordem:
  //   1) UTF-16 com BOM (LE ou BE) - comum em exports do SQL Server / PowerShell /
  //      alguns BI, e a causa classica do "ÿþNome SKU" (bytes do BOM lidos como Latin-1)
  //   2) UTF-16 sem BOM, detectado heuristicamente pelo padrao de bytes 0x00 alternados -
  //      a causa classica das "l e t r a s   e s p a ç a d a s"
  //   3) UTF-8 normal
  //   4) Fallback para ISO-8859-1/CP1252 quando UTF-8 gera excesso de caracteres invalidos
  function decodeBuffer(buffer) {
    const bytes = new Uint8Array(buffer);

    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
      return new TextDecoder('utf-16le').decode(bytes.slice(2));
    }
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
      return new TextDecoder('utf-16be').decode(bytes.slice(2));
    }

    const sampleLen = Math.min(bytes.length, 8000) & ~1; // par, para nao quebrar a paridade
    if (sampleLen >= 20) {
      let zerosEven = 0, zerosOdd = 0;
      for (let i = 0; i < sampleLen; i++) {
        if (bytes[i] === 0) { if (i % 2 === 0) zerosEven++; else zerosOdd++; }
      }
      const half = sampleLen / 2;
      if (zerosOdd / half > 0.6 && zerosEven / half < 0.1) {
        return new TextDecoder('utf-16le').decode(bytes);
      }
      if (zerosEven / half > 0.6 && zerosOdd / half < 0.1) {
        return new TextDecoder('utf-16be').decode(bytes);
      }
    }

    // Qualquer caractere de substituicao (U+FFFD) ja e' prova de que os bytes nao
    // formam UTF-8 valido - um unico "ã" ou "ó" mal decodificado ja basta para
    // preferir Latin-1/CP1252, comum em exports mais antigos de planilha brasileira.
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
    if (replacementCount > 0) {
      return new TextDecoder('iso-8859-1').decode(bytes);
    }
    return utf8;
  }

  function rowsToObjects(raw) {
    const cleanRows = raw.filter(r => r && r.some(c => toStr(c).trim() !== ''));
    if (cleanRows.length === 0) return { headers: [], rows: [] };
    const headerIdx = detectHeaderRowIndex(cleanRows);
    const headerRow = cleanRows[headerIdx].map(h => normalizeExact(h));
    const dataRows = cleanRows.slice(headerIdx + 1);
    const objects = dataRows.map(r => {
      const obj = {};
      headerRow.forEach((h, i) => {
        if (h === '') return;
        obj[h] = r[i] !== undefined ? r[i] : '';
      });
      return obj;
    });
    return { headers: headerRow.filter(h => h !== ''), rows: objects };
  }

  // ---------- Recomendacoes por tipo de achado ----------
  // Texto unico usado tanto no dashboard (Passo 4) quanto no PDF, pra nao
  // ter duas versoes da mesma orientacao circulando.
  const RECOMENDACOES = {
    onlyInBase: 'Confirme se esses SKUs realmente precisam de classificação no Classificaciones ou se já foram descontinuados — neste caso, é esperado que apareçam como SIN_VALOR no dashboard.',
    onlyInClassif: 'Confirme se esses SKUs foram descontinuados ou se a base congelada usada nesta rodada está desatualizada ou incompleta.',
    duplicatesInBase: 'Verifique se há duplicidade de linhas por erro de exportação e mantenha apenas uma linha por EAN antes de seguir, para não contar a venda em dobro na Importância.',
    eanFormat: 'Confirme visualmente se é o mesmo produto e, se for, padronize o formato do EAN (como texto, preservando os zeros) nas duas bases antes da próxima rodada.',
    blankNivel: 'Esses SKUs precisam ser classificados pelo time antes de seguir — sem essa classificação, eles não vão aparecer corretamente no dashboard final.',
    trocaramCategoria: 'Classificar esses itens em uma prod "OUTROS" para garantir que o dashboard seja feito corretamente.',
    classifNaoRefletida: 'Verifique se essa classificação já foi processada no Classificaciones. Se o nome ainda não existe no sistema, aguarde o processamento ou reenvie a classificação.',
    classifIncorreta: 'Confirme se é erro de digitação feito direto no Classificaciones (e corrija por lá) ou se é uma Prod nova que precisa ser incluída na lista confirmada na Etapa 3.',
    caseVariants: 'Padronize a grafia (escolha uma única forma de escrever) e reclassifique os SKUs divergentes antes de subir ao Classificaciones.',
    whitespace: 'Remova os espaços extras direto na base de origem antes de repetir o processo — eles são invisíveis a olho nu, mas quebram comparações exatas.',
    nearDup: 'Confirme se são realmente a mesma Prod digitada de formas diferentes; se forem, unifique o nome na Etapa 3 (Importância) antes de seguir.'
  };

  return {
    toStr, normalizeExact, normalizeCI, hasLeadingTrailingOrDoubleSpace, isBlankLike,
    eanDigits, eanKey, parseBRNumber, levenshtein,
    detectHeaderRowIndex, normalizeHeaderKey, guessColumn,
    parseFile, RECOMENDACOES
  };
})();
