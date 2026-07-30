# Validador de Prod & Classificaciones

Ferramenta 100% client-side (HTML + JS puro, sem backend) para substituir o
template `Template_Prod.xlsx`. Todo o processamento acontece no navegador de
quem estiver usando — nenhum arquivo é enviado para nenhum servidor.

Segue a mesma arquitetura do projeto `anonimizador_html`: arquivos estáticos,
hospedáveis de graça no GitHub Pages.

## Como publicar (GitHub Pages)

1. Crie um repositório novo (pode ser público, é exigência do GitHub Pages
   grátis) e suba todo o conteúdo desta pasta (`index.html`, `style.css`,
   `core.js`, `validations.js`, `report.js`, `app.js`).
2. Em **Settings → Pages**, selecione a branch `main` e a pasta raiz (`/`).
3. Em alguns minutos o site fica disponível em
   `https://<seu-usuario>.github.io/<repositorio>/`.

Não precisa de `npm install`, build step, nem servidor — é só abrir o
`index.html` (localmente ou publicado) e usar.

## Como usar

1. **Parâmetros** — preencha Categoria, Cliente, BU, Status, Versão SM, FTP,
   Região/UF e a Opção de classificação. O aviso "Deverá ser preenchido" é
   calculado automaticamente, igual à célula K30 do template antigo.
2. **Upload** — suba a base congelada já classificada (.csv ou .xlsx) e o
   report exportado do Classificaciones. A ferramenta tenta adivinhar qual
   coluna do seu arquivo corresponde a cada campo; confira e ajuste os
   *dropdowns* se algum palpite estiver errado.
3. **Importância** — a ferramenta detecta os valores únicos de Nível 1 (e
   Nível 2, quando a opção escolhida usa) e já calcula o % de importância a
   partir da soma do `impVta24`, sem precisar digitar nada. Se algum valor
   tiver erro de digitação, corrija no campo "Nome final" — esse é o nome que
   vale para todos os cruzamentos daqui pra frente.
4. **Validação** — dashboard com todos os cruzamentos automáticos (ver lista
   abaixo). Cards vermelhos merecem atenção antes de seguir; cards verdes
   estão OK.
5. **Relatório** — baixe o PDF (recomendado para anexar no e-mail) e/ou o
   Excel enxuto, e opcionalmente já prepare o e-mail com o botão dedicado.

### Sobre o botão de e-mail

Ele abre seu cliente de e-mail padrão (Outlook, se for o app padrão do
Windows) com destinatário, assunto e corpo já preenchidos, via link `mailto:`.
Por restrição de segurança dos navegadores, **nenhum site consegue anexar
arquivo automaticamente nesse fluxo** — o PDF/Excel baixado precisa ser
arrastado manualmente para o e-mail antes de enviar.

## O que mudou em relação ao template Excel

| Antes (Excel) | Agora (HTML) |
|---|---|
| Fórmulas matriciais rodando sobre 100 mil–200 mil linhas em 4 abas, mesmo com o arquivo vazio | Tudo calculado sob demanda, só sobre as linhas que existem de verdade |
| Importância digitada manualmente | Calculada automaticamente a partir do `impVta24` da base congelada |
| `COUNTIF`/`MATCH` não distinguem maiúscula de minúscula | Comparação sensível a caixa, com checagem dedicada de divergências |
| Região/UF em 3 células com a mesma lista suspensa | Seleção múltipla em formato de tags |
| Sem detecção de espaço em branco indevido | Checagem dedicada (início/fim/espaço duplo) |
| Sem detecção de EAN duplicado ou com zero à esquerda divergente | Duas checagens novas dedicadas |
| Sem sugestão de nomes parecidos (typo) | Checagem por distância de edição (Levenshtein) entre nomes confirmados |
| Envio manual do arquivo inteiro por e-mail | Relatório enxuto (PDF/Excel) + botão que pré-preenche o e-mail |

As checagens de "Prod vs Base congelada" (C20/D20/E20 do template antigo)
deixam de existir como estavam, porque a lista de Prods agora nasce direto da
base enviada (etapa 3) em vez de ser digitada antes — o que ela validava
(erro de digitação) passou a ser coberto pelas checagens de maiúscula/minúscula
e de nomes parecidos, de forma mais direta.

## Colunas reais (confirmadas)

**Base congelada** — os campos usados pela ferramenta e seus nomes padrão:
`Nome SKU`, `Código Barras SKU`, `Marca SKU`, `Fabricante SKU`,
`Categoría congelada ScannMarket`, `Categoria atual Data Excellence`,
`Imp Vta (Ult.24 Meses)` e as colunas `Scannmarket 3`/`Scannmarket 4` (ou
`Scannmarket 1`/`Scannmarket 2`, dependendo da versão SM). **Só as colunas de
ScannMarket variam de nome** (SM3, SM_3, N3, Nível 1...) — as demais chegaram
padronizadas, então o auto-detect confia mais nelas.

**Report Classificaciones** — `CODIGO_BARRAS`, `Categoria`, `Scannmarket 1/2/3/4`,
sempre com esses nomes exatos (sem variação relatada).

## Changelog desta revisão

- **Aviso de branco mais sucinto, com correção inline** — em vez de só listar os
  SKUs sem classificação, cada um vem com um campo pra digitar o valor certo
  ali mesmo (igual o "Nome final" das tabelas de Importância). Ao confirmar, o
  SKU já entra no grupo certo (ou cria um novo) e sai da lista de pendências.
  Corrigido também um bug onde um SKU sem Nível 1 *e* Nível 2 aparecia
  duplicado na lista.
- **Volume e representatividade** — todo item que mostra SKU + descrição no
  dashboard (SKU só numa base, duplicado, sem classificação, que trocou de
  categoria) agora também mostra o volume (impVta24) e o % que ele representa
  dentro da categoria inteira — ajuda a saber se vale a pena se preocupar com
  aquele item ou não.
- **Passo 5 reorganizado** — PDF e E-mail lado a lado na mesma linha; a base
  corrigida ganhou uma seção própria, separada por uma divisória, em vez de
  brigar de layout dentro do mesmo grid.

## Changelog da revisão anterior

- **Formato Excel removido** — sobrou só o PDF como relatório final (mesmo nível de informação, mais simples de manter).
- **Instruções mais evidentes** — textos de instrução (topo de cada etapa, dicas de mapeamento) agora aparecem em caixas coloridas com borda de destaque, em vez de texto cinza pequeno.
- **Fabricante e Marca removidos** do mapeamento da base congelada (não eram usados em nenhuma validação).
- **Arquivo corrigido renomeado** para `prod_corrigida_para_subir_classificaciones_<categoria>`.
- **Recomendação em cada card de validação** — dicionário único (`Core.RECOMENDACOES`) usado tanto no dashboard quanto no PDF, para não ter duas versões do mesmo texto.
- **Divergência de EAN** agora mostra explicitamente "Base congelada: X | Classificaciones: Y".
- **Descrição do SKU** nas listas de "não encontrado" (base e classificaciones) e no EAN duplicado.
- **SKUs sem classificação** — aviso destacado no Passo 3 (antes de travar a Importância) e dois cards novos no Passo 4, com recomendação de classificar antes de seguir.
- **E-mail com destinatário fixo** — `Scannmarket-br@scanntech.com` aparece como um "pill" travado (sem botão de remover); o time pode digitar e adicionar mais destinatários, que ficam como pills removíveis ao lado.

## Colunas reais (confirmadas)

**Base congelada** — os campos usados pela ferramenta e seus nomes padrão:
`Nome SKU`, `Código Barras SKU`,
`Categoría congelada ScannMarket`, `Categoria atual Data Excellence`,
`Imp Vta (Ult.24 Meses)` e as colunas `Scannmarket 3`/`Scannmarket 4` (ou
`Scannmarket 1`/`Scannmarket 2`, dependendo da versão SM). **Só as colunas de
ScannMarket variam de nome** (SM3, SM_3, N3, Nível 1...) — as demais chegaram
padronizadas, então o auto-detect confia mais nelas. Fabricante/Marca não são
mais pedidos (não entravam em nenhuma validação).

**Report Classificaciones** — `CODIGO_BARRAS`, `Categoria`, `Scannmarket 1/2/3/4`,
sempre com esses nomes exatos (sem variação relatada), e `DESCRIPCION`
(opcional, usada para identificar os SKUs nas listas de validação).

## Recomendações por card (editar depois)

Todo o texto de recomendação vive num único lugar — `Core.RECOMENDACOES` no
`core.js` — usado tanto no dashboard quanto no PDF. São 11 chaves, uma por
tipo de achado (`onlyInBase`, `onlyInClassif`, `duplicatesInBase`, `eanFormat`,
`blankNivel`, `trocaramCategoria`, `classifNaoRefletida`, `classifIncorreta`,
`caseVariants`, `whitespace`, `nearDup`). São meus melhores palpites por
enquanto — quando você mandar as recomendações certas, é só trocar o texto
de cada chave ali, sem precisar tocar em mais nada.

## Testes automatizados

Há sete testes de ponta a ponta em `test/`, rodando a aplicação inteira num
DOM simulado (jsdom) com dados sintéticos:

- `smoke.js` / `smoke2.js` — fluxo completo nos dois formatos de Opção/Versão,
  cobrindo cada tipo de achado do dashboard e a geração de PDF.
- `smoke3_encoding.js` — arquivos em UTF-16 (com e sem BOM) e Latin-1.
- `smoke4_category_filter.js` — filtro por categoria com variação de acento,
  caixa e espaço.
- `smoke5_real_columns.js` — auto-detecção usando os nomes de coluna reais
  informados, incluindo a variação de nome do ScannMarket 3/4, e confirmando
  que Fabricante/Marca não aparecem mais.
- `smoke6_correction_download.js` — edição do "Nome final" gerando de fato
  um arquivo corrigido para download, sem tocar nas colunas não mapeadas.
- `smoke7_adjustments.js` — valores em branco (correção inline, sem duplicar
  SKU que falta os 2 níveis, rename preservado no re-render), recomendações
  por card, volume/representatividade, descrição nos SKUs, headers no EAN
  divergente, remoção do Excel, layout do Passo 5, e destinatário de e-mail
  fixo + extras.

```
npm install
npm test
```

Isso não é necessário para usar a ferramenta — é só para quem for mexer no
código depois.
