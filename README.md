# Validador de Prod & Classificações

Ferramenta 100% client-side (HTML + JS puro, sem backend) para substituir um
template de Excel usado para validar classificações de produto antes de gerar
um dashboard. Todo o processamento acontece no navegador de quem estiver
usando — nenhum arquivo é enviado para nenhum servidor.

Arquitetura simples de propósito: arquivos estáticos, hospedáveis de graça em
qualquer serviço de páginas estáticas (GitHub Pages, Netlify, etc.).

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

1. **Parâmetros** — preencha Categoria, Cliente, BU, Status, Versão, FTP,
   Região/UF e a Opção de classificação. O aviso "Deverá ser preenchido" é
   calculado automaticamente a partir da opção escolhida.
2. **Upload** — suba a base já classificada (.csv ou .xlsx) e o report do
   sistema de classificação. A ferramenta tenta adivinhar qual coluna do seu
   arquivo corresponde a cada campo; confira e ajuste os *dropdowns* se algum
   palpite estiver errado.
3. **Importância** — a ferramenta detecta os valores únicos de Nível 1 (e
   Nível 2, quando a opção escolhida usa) e já calcula o % de importância a
   partir do volume de venda, sem precisar digitar nada. SKUs sem
   classificação aparecem destacados, com um campo para corrigir ali mesmo.
   Se algum valor tiver erro de digitação, corrija no campo "Nome final" —
   esse é o nome que vale para todos os cruzamentos daqui pra frente.
4. **Validação** — dashboard com todos os cruzamentos automáticos. Cards
   vermelhos/amarelos merecem atenção antes de seguir; cards verdes estão OK.
5. **Relatório** — baixe o PDF (ideal para anexar no e-mail), a base
   corrigida (se houve alguma correção no passo 3) e, se quiser, já prepare o
   e-mail com o botão dedicado.

### Sobre o botão de e-mail

Ele abre o cliente de e-mail padrão do computador (Outlook, Gmail, etc. —
o que estiver configurado como padrão) com destinatário, assunto e corpo já
preenchidos, via link `mailto:`. Por restrição de segurança dos navegadores,
**nenhum site consegue anexar arquivo automaticamente nesse fluxo** — o PDF
baixado precisa ser arrastado manualmente para o e-mail antes de enviar.

Um endereço fixo aparece sempre como destinatário (sem opção de remover pela
interface); o time pode adicionar mais destinatários ao lado, que ficam
removíveis. Esse endereço fixo é definido na constante `FIXED_EMAIL`, no
início da seção "STEP 5" do `app.js` — troque ali para usar outro endereço
padrão.

## O que mudou em relação ao processo em Excel

| Antes (Excel) | Agora (HTML) |
|---|---|
| Fórmulas matriciais rodando sobre 100 mil–200 mil linhas em várias abas, mesmo com o arquivo vazio | Tudo calculado sob demanda, só sobre as linhas que existem de verdade |
| Importância digitada manualmente | Calculada automaticamente a partir do volume de venda da base |
| `COUNTIF`/`MATCH` não distinguem maiúscula de minúscula | Comparação sensível a caixa, com checagem dedicada de divergências |
| Região/UF em células separadas com a mesma lista suspensa | Seleção múltipla em formato de tags |
| Sem detecção de espaço em branco indevido | Checagem dedicada (início/fim/espaço duplo) |
| Sem detecção de EAN duplicado ou com zero à esquerda divergente | Duas checagens novas dedicadas |
| Sem sugestão de nomes parecidos (typo) | Checagem por distância de edição (Levenshtein) entre nomes confirmados |
| Sem visibilidade de quanto cada item pesa nas vendas | Volume e % de representatividade mostrados em cada achado |
| Envio manual do arquivo inteiro por e-mail | Relatório enxuto em PDF + botão que pré-preenche o e-mail |

As checagens de "classificação vs base" do processo antigo deixam de existir
como estavam, porque a lista de classificações agora nasce direto do arquivo
enviado (Passo 3) em vez de ser digitada antes — o que ela validava (erro de
digitação) passou a ser coberto pelas checagens de maiúscula/minúscula e de
nomes parecidos, de forma mais direta.

## Mapeamento de colunas

A ferramenta tenta adivinhar automaticamente qual coluna do seu arquivo
corresponde a cada campo esperado (EAN, descrição, categoria, nível 1/2 etc.),
usando uma lista de apelidos configurável no `app.js` (constante `ALIASES`,
mais uma função dedicada para os campos com nome mais instável entre
exportações). Se algum arquivo tiver colunas com nomes muito diferentes do
esperado, é só ajustar essa lista — o *dropdown* de confirmação sempre permite
corrigir manualmente também, então a detecção errada nunca trava o uso.

## Changelog

- **Refinamentos da checagem de baixa relevância**: agora é claramente um
  aviso amarelo, não um erro — não conta mais no total de achados, e o texto
  do card deixa explícito que dá pra seguir sem corrigir.
- **Atalho para o Passo 3 também nos checks "não refletido"** (Nível 1 e 2),
  além dos que já tinham (SKU sem classificação, baixa relevância).
- **Correção de bug**: a divergência de maiúscula/minúscula ficava presa ao
  valor bruto do arquivo mesmo depois do usuário corrigir o nome no Passo 3.
  Agora a checagem usa o nome já confirmado, então some assim que a correção
  é feita.
- **PDF mais enxuto**: só lista os pontos que ainda precisam de atenção — os
  checks aprovados não aparecem mais como "nenhum problema encontrado", só
  contam para o resumo "X/Y checks aprovados" no topo.
- Renomeado "PDF enxuto" para "Relatório PDF".

- **Lote grande de ajustes de usabilidade**:
  - Passo 1: novo toggle "Precisa de Fênix?" ao lado do de FTP.
  - Passo 2: caixas de upload com cor de destaque por padrão (não só no hover).
  - Passo 3: coluna renomeada para "Nome Final - Editável" com dica visual de
    que o campo é editável; subseções numeradas (3.0 branco, 3.1 Nível 1, 3.2
    Nível 2); legenda dos limiares de status; linha inteira em vermelho-claro
    quando o status é "Revisar".
  - Passo 4: nova checagem de "baixa relevância" (grupos com Importância
    abaixo de 4%); seta movida para o fim do card (mais claro que é
    clicável); só aparecem os cards com problema, com um resumo tipo
    "10/18 verificações aprovadas" no topo; ordenados por relevância
    (classificação incorreta/não refletida primeiro); botão de atalho que
    volta ao Passo 3 certo e destaca a seção.
  - Passo 5: aviso de pendências no topo listando o que falta e onde
    resolver; arquivo corrigido renomeado e movido para o topo, com
    instrução deixando claro que é uma etapa condicional (só se algo mudou
    no Passo 3), separada do envio do relatório (que sempre acontece); botão
    de e-mail agora abre em nova aba, sem perder a ferramenta aberta.
  - E-mail: assunto mais executivo (maiúsculas, com cliente/categoria/versão)
    e corpo explicando o que a opção de classificação escolhida significa.
- **Duas checagens não contam mais como "problema"** — "SKU só numa base" e
  "SKU só na outra" continuam aparecendo como alerta amarelo, mas não somam
  mais no contador de achados do topo do dashboard, já que são situações
  comuns e esperadas.
- **Instrução clara no download da base corrigida** — título e um resumo do
  fluxo (baixar → conferir os ajustes → subir de novo no sistema de
  classificação) ficam explícitos na seção do Passo 5.
- **Dois cards viraram alerta (amarelo), não mais erro (vermelho)** — "SKU só
  numa base" e "SKU só na outra" são situações comuns e esperadas, não
  necessariamente um problema. O texto de cada um foi suavizado pra refletir
  isso. Os demais cards continuam vermelhos quando há achados.
- **Aviso de branco mais sucinto, com correção inline** — em vez de só listar
  os SKUs sem classificação, cada um vem com um campo pra digitar o valor
  certo ali mesmo (igual o "Nome final" das tabelas de Importância). Ao
  confirmar, o SKU já entra no grupo certo (ou cria um novo) e sai da lista de
  pendências. Corrigido também um bug onde um SKU sem Nível 1 *e* Nível 2
  aparecia duplicado na lista.
- **Volume e representatividade** — todo item que mostra SKU + descrição no
  dashboard (SKU só numa base, duplicado, sem classificação, que trocou de
  categoria) agora também mostra o volume de venda e o % que ele representa
  dentro da categoria inteira — ajuda a saber se vale a pena se preocupar com
  aquele item ou não.
- **Passo 5 reorganizado** — PDF e E-mail lado a lado na mesma linha; a base
  corrigida ganhou uma seção própria, separada por uma divisória, em vez de
  brigar de layout dentro do mesmo grid.
- **Formato de planilha removido** do relatório final — sobrou só o PDF (mesmo
  nível de informação, mais simples de manter).
- **Instruções mais evidentes** — textos de instrução (topo de cada etapa,
  dicas de mapeamento) agora aparecem em caixas coloridas com borda de
  destaque, em vez de texto cinza pequeno.
- Dois campos pouco usados foram removidos do mapeamento da base (não entravam
  em nenhuma validação).
- **Arquivo corrigido com nome mais descritivo**, indicando que ele já está
  pronto para ser reenviado ao sistema de classificação.
- **Recomendação em cada card de validação** — dicionário único
  (`Core.RECOMENDACOES` no `core.js`) usado tanto no dashboard quanto no PDF,
  para não ter duas versões do mesmo texto.
- **Divergência de EAN** agora mostra explicitamente qual valor veio de qual
  arquivo.
- **Descrição do SKU** nas listas de "não encontrado" e no EAN duplicado.
- **SKUs sem classificação** — aviso destacado no Passo 3 (antes de travar a
  Importância) e cards dedicados no Passo 4, com recomendação de classificar
  antes de seguir.
- **E-mail com destinatário fixo** — configurável no código (ver seção acima),
  aparece como um "pill" travado (sem botão de remover); o time pode digitar e
  adicionar mais destinatários, que ficam como pills removíveis ao lado.

## Recomendações por card (editar depois)

Todo o texto de recomendação vive num único lugar — `Core.RECOMENDACOES` no
`core.js` — usado tanto no dashboard quanto no PDF. São 11 chaves, uma por
tipo de achado (`onlyInBase`, `onlyInClassif`, `duplicatesInBase`, `eanFormat`,
`blankNivel`, `trocaramCategoria`, `classifNaoRefletida`, `classifIncorreta`,
`caseVariants`, `whitespace`, `nearDup`). São recomendações genéricas por
enquanto — para recomendações específicas do seu processo, é só trocar o
texto de cada chave ali, sem precisar tocar em mais nada.

## Testes automatizados

Há oito testes de ponta a ponta em `test/`, rodando a aplicação inteira num
DOM simulado (jsdom) com dados sintéticos:

- `smoke.js` / `smoke2.js` — fluxo completo nos dois formatos de Opção/Versão,
  cobrindo cada tipo de achado do dashboard e a geração de PDF.
- `smoke3_encoding.js` — arquivos em UTF-16 (com e sem BOM) e Latin-1.
- `smoke4_category_filter.js` — filtro por categoria com variação de acento,
  caixa e espaço.
- `smoke5_real_columns.js` — auto-detecção com nomes de coluna variados,
  incluindo colunas com nome instável entre exportações, e confirmando que
  campos removidos do mapeamento não aparecem mais.
- `smoke6_correction_download.js` — edição do "Nome final" gerando de fato
  um arquivo corrigido para download, sem tocar nas colunas não mapeadas.
- `smoke7_adjustments.js` — valores em branco (correção inline, sem duplicar
  SKU que falta os 2 níveis, rename preservado no re-render), recomendações
  por card, volume/representatividade, descrição nos SKUs, headers no EAN
  divergente, layout do Passo 5, e destinatário de e-mail fixo + extras.
- `smoke8_severity.js` — "SKU só numa base" e "SKU só na outra" aparecem em
  amarelo (aviso), não vermelho; os demais cards continuam vermelhos quando
  há achados.
- `smoke9_big_batch.js` — o lote grande de ajustes: toggle extra no Passo 1,
  subseções numeradas e destaque de linha no Passo 3, resumo/ordenação/checks
  ocultos/atalho no Passo 4, e aviso de pendências + e-mail em nova aba no
  Passo 5.
- `smoke10_refinements.js` — atalho nos checks "não refletido", baixa
  relevância como aviso não-bloqueante e fora da contagem de achados,
  correção de maiúscula/minúscula reagindo ao Nome Final da Etapa 3, e o
  PDF enxuto (só problemas reais + contagem de aprovados).

```
npm install
npm test
```

Isso não é necessário para usar a ferramenta — é só para quem for mexer no
código depois.
