# FtM Dados

Gráficos do chart book desenhados no navegador, sem build: `index.html` +
`app.js` + `styles.css`, com um arquivo de dados por categoria em `dados/`.

| Categoria | Dados | De onde vêm |
|---|---|---|
| **IPCA** | `dados/ipca.json` | Baixados **sozinhos** todo dia do Banco Central (SGS) e do IBGE (SIDRA) |
| **Dívida Pública** | `dados/divida.json` | Gerados do Relatório Mensal da Dívida do Tesouro (o `.xlsx` em `dados/`) |

- **Menu na lateral** — uma categoria retrátil por arquivo de dados (IPCA,
  Dívida Pública), com as subcategorias dentro e os gráficos dentro delas. A
  página tem a mesma árvore, e **tudo abre fechado**: a tela inicial é o índice
  dos gráficos.
- **Tela cheia** — da página inteira (botão na lateral) e de um gráfico só
  (botão **Tela cheia** no cartão). Em tela cheia os controles do gráfico viram
  um menu de hambúrguer e somem sozinhos depois de uns segundos parados,
  voltando a qualquer movimento — igual ao chart book.
- **Anotar à mão** — no gráfico ampliado, ligue **Desenhar** e arraste para
  rabiscar por cima (Desfazer e Limpar ao lado). Com o desenho desligado, o
  gráfico continua mostrando os valores do mês ao passar o mouse. O botão
  **Baixar PNG** do visor sai com as anotações dentro.
- **Modo escuro/claro** — botão na lateral; o escuro é o padrão e usa o fundo de
  notas dos slides do FtM.
- **Baixar** — em cada gráfico, no tema da tela, em PNG, JPG, PDF ou SVG
  editável, e o CSV com todas as séries. Tamanhos (todos em 2×, para sair
  nítido): apresentação 16:9 (3840×2160) e Instagram feed 4:5 (2160×2700),
  feed 3:4 (2160×2880), quadrado 1:1 (2160×2160) e Stories 9:16 (2160×3840,
  com o gráfico dentro da área segura, longe das barras do app).
- **Período** — Tudo / 20 / 10 / 5 anos. Passe o mouse (ou toque) para ver os
  valores do mês.
- **Recortes** — alguns cartões mostram um recorte por vez, escolhido em
  botões ao lado do período: dívida interna ou externa, "% do total" ou
  "R$ bilhões", um título, um detentor, um indexador. O recorte escolhido
  entra no subtítulo do gráfico, então a imagem baixada diz qual é.

## Como o IPCA se atualiza

A Action `.github/workflows/atualizar.yml` roda todo dia às 09:30 e às 17:00
(Brasília), executa `scripts/atualizar.py` e comita `dados/ipca.json` **só se
algum número mudou**. O GitHub Pages republica sozinho em seguida. Não há
chave, senha nem serviço externo: as duas APIs são públicas.

Para rodar na mão (mesmo resultado):

```bash
python3 scripts/atualizar.py
```

Ou, no GitHub: **Actions → Atualiza os dados → Run workflow**.

## A dívida pública (Relatório Mensal da Dívida)

Essa parte **não** se atualiza sozinha: vem do `.xlsx` dos anexos do Relatório
Mensal da Dívida, que fica em `dados/`. Todo mês:

1. baixar o novo *Relatório da Dívida `<Mês><Ano>`.xlsx* no site do Tesouro
   Nacional (Relatório Mensal da Dívida → anexos) e jogar em `dados/`;
2. `python3 scripts/divida.py` (ele pega o `.xlsx` mais novo da pasta);
3. commit de `dados/` e push.

`scripts/divida.py` também só usa a biblioteca padrão. Uma função por gráfico,
e cada anexo vira um cartão:

| Anexo | Cartão | Recortes |
|---|---|---|
| 1.2 | Emissão líquida da DPF (emissões menos resgates) por indexador, com o total do mês em linha | interna (DPMFi) / externa (DPFe) |
| 2.4 | Composição da DPF por indexador | % do total / R$ bilhões |
| 2.7 | Detentores da dívida interna | % do total / R$ bilhões |
| 2.8 | Detentores de cada título | LFT, LTN, NTN-B, NTN-F, Outros |
| 2.8 | Carteira de cada detentor (o mesmo anexo lido de lado) | um detentor por vez |
| 3.1 | Estrutura de vencimentos, por faixa de prazo | DPF / DPMFi / DPFe |
| 3.2 | Estrutura de vencimentos por indexador | prefixados, taxa flutuante, índice de preços, câmbio, demais |
| 3.4 | Cronograma de vencimentos | mês a mês / acumulado (a tabela do fim da aba) |
| 3.8 | Prazo médio da dívida interna e da externa | dois cartões, cada um com média de 12 meses / mês a mês |
| 4.1 | Custo médio mensal da dívida interna e da externa | dois cartões |
| 4.2 | Custo acumulado em 12 meses, interna e externa | dois cartões |
| 4.1+4.2 | Custo da DPMFi: mensal e acumulado em 12 meses, só duas linhas | — |

Duas decisões que valem registro:

- **os percentuais são recalculados aqui** (valor ÷ total da linha). As colunas
  de % da planilha ora vêm em fração (0,31), ora em pontos percentuais (9,82) —
  na mesma linha. Dividir é o que sempre bate com o total;
- na **carteira de cada detentor**, o anexo 2.8 só traz o % dentro de cada
  título; o script volta para reais (participação × estoque do título) para
  poder somar os títulos de um mesmo detentor e tirar o % da carteira dele.

Quais séries entram em cada um:

- **composição, detentores e vencimentos em %**: linhas, uma por categoria, com
  o valor do último mês na ponta. Em R$ bilhões (composição e detentores) a
  mesma coisa vira barra empilhada, que é onde o total importa. A exceção é a
  estrutura de vencimentos **por indexador** (3.2), que continua empilhada;
- **prazo médio**: sai em **média de 12 meses**. O prazo anda em serrote (sobe
  quando sai um título novo e cai um mês por mês até o próximo), e a média é o
  que deixa a tendência visível; o mês a mês está no segundo recorte. Da dívida
  externa entram as linhas que ainda têm dados (Global USD, Euros, Global BRL e
  dívida contratual) — Reestruturada e Clube de Paris ficaram para trás;
- **custo**: a dívida interna sai com DPMFi, LFT, LTN e NTN-B; a externa, só
  com a linha da DPFe.

## As contas do IPCA (as fórmulas da planilha)

Estão todas em `scripts/atualizar.py`, que só usa a biblioteca padrão do Python.

| Gráfico | Séries | Conta |
|---|---|---|
| Selic Meta, IPCA e Meta | SGS 432, 13522, 13521 | Selic: último valor de cada mês. Meta: 13521 (anual); a tolerância vem das resoluções do CMN (±2 até 2002, ±2,5 em 2003–05, ±2 em 2006–16, ±1,5 desde 2017) |
| Contribuição por grupo (12 e 3 meses) | SIDRA 7060: variação e peso mensal dos 9 grupos | Contribuição do mês = peso × variação; na janela, cada mês é corrigido pela inflação dos meses seguintes. A soma dos grupos bate com o IPCA da janela (4,21% contra 4,22% publicados em ago/26 — arredondamento do SIDRA) |
| Aberturas | SGS 10844, 27863, 27864, 4447, 4448, 10841, 10842, 10843, 4449, 11428 | Acumulado em 12 meses a partir da variação mensal |
| EX1 / EX-FE / EX3 Serviços | SGS 16121, 28751, 29683 | Idem |
| Média dos núcleos | SGS 11427 (EX0), 27839 (EX3), 4466 (MS), 16122 (DP), 28750 (P55) | Média simples do acumulado em 12 meses dos cinco |
| IPCA cheio | SGS 13522 | Já vem acumulado em 12 meses pelo BCB |

Conferido contra os rótulos dos slides de ago/26: todos os últimos valores
batem na segunda casa decimal.

A contribuição por grupo começa em 2020 porque é quando começa a tabela 7060
do SIDRA (a estrutura de pesos atual do IPCA).

## O visor (tela cheia de um gráfico)

`abrirVisor` em `app.js` monta um painel único, reaproveitado por todos os
cartões: ele redesenha o gráfico no layout grande (ou no layout em pé, no
celular) e põe por cima um `<canvas>` para a anotação.

Os traços ficam guardados como listas de pontos **nas coordenadas do layout**
(1920×1080) e são repintados do zero a cada mudança. É isso que faz o rabisco
acompanhar o gráfico em qualquer tamanho de tela e sair certo no PNG baixado,
que é gerado em 2× — o mesmo traço, na escala do arquivo.

O canvas só recebe o ponteiro quando **Desenhar** está ligado; desligado, ele
fica transparente ao clique e quem responde é o gráfico (valores do mês).

## Para mudar um gráfico

Título, subtítulo, cores, séries e janela estão na função `main()` de
`scripts/atualizar.py`, um bloco por gráfico. O nome da categoria retrátil do
menu é o campo `categoria` do JSON (hoje "IPCA"); as subcategorias são os
títulos das seções. O desenho (`app.js`) é genérico:
lê o que vier no JSON. Depois de mudar, rode o script e faça o push.

`index.html` chama `app.js?v=N` e `styles.css?v=N`: **suba o N** a cada mudança
de código, senão quem já visitou o site continua vendo a versão em cache.

## Testar localmente

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## Estrutura

```
index.html  styles.css  app.js
assets/     fundo.jpg (fundo dos slides do FtM), logo-ftm.svg, favicon.svg
dados/      ipca.json e divida.json (gerados) + o .xlsx do Tesouro
scripts/    atualizar.py (IPCA, automático), divida.py (dívida, do .xlsx)
.github/workflows/atualizar.yml
```

O `app.js` é genérico: lê os arquivos de `dados/` e desenha o que vier. Séries
em linha ou em barra empilhada, unidade `%`, `bi` (R$ bilhões) ou `anos`, eixo
X no tempo ou por categoria (`categorias`), e cartões com `variantes`.
