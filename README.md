# FtM Dados

Gráficos do chart book desenhados no navegador, sem build: `index.html` +
`app.js` + `styles.css`, com um arquivo de dados por categoria em `dados/`.

| Categoria | Dados | De onde vêm |
|---|---|---|
| **IPCA** | `dados/ipca.json` | Baixados **sozinhos** todo dia do Banco Central (SGS) e do IBGE (SIDRA) |
| **Fiscal** | `dados/fiscal.json` | Baixados **sozinhos** do SGS do Banco Central (resultado primário do setor público consolidado) |
| **Dívida Pública** | `dados/divida.json` | Gerados do Relatório Mensal da Dívida do Tesouro (o `.xlsx` em `dados/`) |
| **Tesouro Direto** | `dados/tesouro-direto.json` | Baixados **sozinhos** do dado aberto do Tesouro Transparente (taxas diárias desde 2004) |
| **Ouro e reservas internacionais** | `dados/reservas.json` | Gerados da planilha de ouro e reservas do FMI, do World Gold Council e da Metals Focus (o `.xlsx` em `dados/`) |
| **Moedas e câmbio** | `dados/moedas.json` | Gerados da planilha de moedas — IPCA, CPI e PTAX (o `.xlsx` em `dados/`) |

- **Menu na lateral** — uma categoria retrátil por arquivo de dados (IPCA,
  Fiscal, Dívida Pública, Tesouro Direto, Ouro e reservas internacionais,
  Moedas e câmbio), com
  as subcategorias dentro e os
  gráficos dentro delas. A
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
- **Fontes** — o pé da lateral (até onde vai cada categoria, quando foi
  atualizada e de onde veio) fica num retrátil "Fontes", fechado como o resto.
- **Baixar** — em cada gráfico, no tema da tela, em PNG, JPG, PDF ou SVG
  editável, e o CSV com todas as séries. O menu é medido ao abrir e vira de
  lado se não couber no cartão. Tamanhos (todos em 2×, para sair
  nítido): apresentação 16:9 (3840×2160) e Instagram feed 4:5 (2160×2700),
  feed 3:4 (2160×2880), quadrado 1:1 (2160×2160) e Stories 9:16 (2160×3840,
  com o gráfico dentro da área segura, longe das barras do app).
- **Período** — **arraste no gráfico com o botão esquerdo** e a faixa que você
  cobriu vira o recorte, como no FRED; o rótulo ao lado do título passa a dizer
  qual é. Duplo clique no gráfico, ou o botão **Ver tudo** (que só aparece
  quando há o que desfazer), volta à série inteira. Esc cancela um arrasto em
  curso, e arrasto curto demais conta como clique, não como seleção. Onde não
  há mouse fino — celular e tablet, em que arrastar é rolar a página —
  continuam os botões de Tudo / 20 / 10 / 5 anos.
  O recorte vale também no visor em tela cheia e **entra na imagem baixada**.
  Passe o mouse (ou toque) para ver os valores do mês.
- **Recortes** — alguns cartões mostram um recorte por vez, escolhido em
  botões ao lado do período: dívida interna ou externa, "% do total" ou
  "R$ bilhões", um título, um detentor, um indexador. O recorte escolhido
  entra no subtítulo do gráfico, então a imagem baixada diz qual é.

## Como o IPCA se atualiza

A Action `.github/workflows/atualizar.yml` roda todo dia às 09:30 e às 17:00
(Brasília), executa `scripts/atualizar.py` e `scripts/tesouro_direto.py` e
comita `dados/` **só se algum número mudou**. O GitHub Pages republica sozinho em seguida. Não há
chave, senha nem serviço externo: as duas APIs são públicas.

Para rodar na mão (mesmo resultado):

```bash
python3 scripts/atualizar.py
```

Ou, no GitHub: **Actions → Atualiza os dados → Run workflow**.

## O fiscal (resultado primário, nominal e dívida bruta)

`scripts/fiscal.py` monta `dados/fiscal.json` com nove gráficos, em três seções
— **resultado primário**, **resultado nominal** e **dívida bruta**. Os
resultados são os do setor público
consolidado: governo federal, Banco Central, estados, municípios e estatais,
fora Petrobras e Eletrobras. Tudo vem do SGS do Banco Central:

| Série | O que é |
|---|---|
| **4649** / **4583** | Fluxo mensal do resultado primário / nominal, R$ milhões (desde dez/2001) |
| **5793** / **5727** | O mesmo acumulado em 12 meses, % do PIB (desde nov/2002) |
| **5507** / **5441** | O acumulado **no ano**, % do PIB (primário / nominal) |
| **4382** | PIB acumulado em 12 meses, R$ milhões — usado na conferência |
| **4640, 4641, 4643, 4644, 4646, 4647, 4648** | Resultado primário por esfera, fluxo mensal, R$ milhões |
| **7853** e **7854** | Governo Federal sem INSS e INSS, para abrir o federal em dois |
| **4502** | Dívida bruta do governo geral, saldo em R$ milhões (metodologia até 2007) |
| **4537** / **13762** | Dívida bruta em % do PIB, metodologia até 2007 / a partir de 2008 |

**O sinal é invertido.** O SGS publica isto como *necessidade de financiamento*:
lá, número positivo é **déficit**. Em dez/2022 a série 5793 marca −1,25, e 2022
fechou com superávit primário de 1,25% do PIB. Aqui tudo é multiplicado por −1,
do jeito que se lê no noticiário: **positivo é superávit**. É o único ajuste
feito nos números do BC, e está dito no subtítulo de todos os gráficos.

**Cuidado com o denominador do acumulado no ano.** As séries 5507 e 5441 não
dividem o acumulado do ano pelo PIB de um ano inteiro: dividem pelo **PIB dos
mesmos meses**. Por isso janeiro sozinho aparece em ±10% do PIB — é o resultado
de janeiro sobre o PIB de janeiro, e a arrecadação se concentra no começo do
ano. A linha vai se assentando conforme os meses entram e, em dezembro, cai
exatamente no acumulado em 12 meses. (Conferido: a razão da 5507 é reproduzida
por `acumulado no ano ÷ PIB acumulado no ano` — série 4380, o PIB mensal — em
todos os meses desde 2002, com diferença máxima de 0,005 p.p.)

Duas conferências rodam a cada atualização, aparecem no log e **interrompem o
script** se a diferença passar do limite:

- o **acumulado em 12 meses** refeito aqui (soma de 12 meses do fluxo mensal
  dividida pela série 4382) contra o publicado: bate em **286 meses, diferença
  máxima de 0,005 p.p.** nos dois resultados — o arredondamento das séries do BC,
  que saem com duas casas;
- o **acumulado no ano fecha no de 12 meses em dezembro**: 24 dezembros,
  diferença **zero**.

Os gráficos, os mesmos três formatos para cada resultado:

- **Em R$ bilhões correntes**, acumulado em 12 meses ou o fluxo do mês (em
  barras).
- **Em % do PIB**, acumulado em 12 meses.
- **Acumulado no ano, comparando os anos**: uma linha por ano no eixo de meses
  (jan…dez), o ano corrente em branco e mais grosso. Em 5 anos, em 10 ou em
  **todos** — e aí os anos anteriores viram um feixe cinza, fino e translúcido,
  fora da legenda: o que se lê é onde o ano corrente cai dentro do feixe, não o
  valor de 2007. Como o eixo é de categorias, esses cartões não têm botão de
  período.

E um quarto, só do primário: **por esfera**, em colunas empilhadas de R$
bilhões acumulados em 12 meses — quem está em superávit sobe a partir do zero,
quem está em déficit desce, e por cima vai a **linha branca do consolidado**.
Nos botões dá para **ligar e desligar cada esfera** (a última não desliga, e a
escolha sobrevive à troca de recorte, porque é guardada pelo nome da série). A
cor de cada esfera foi escolhida pelo contraste entre **vizinhos na pilha**, não
pela ordem do espectro: azul → amarelo → verde → roxo → laranja → petróleo →
vermelho; o INSS fica na areia, que é larga o bastante para não gritar ao lado
do azul do resto do Governo Federal. As sete esferas somam o consolidado — o script confere isso a cada
rodada, e a diferença máxima em 297 meses é de R$ 20 mil, puro arredondamento.
O **INSS fica dentro do Governo Federal**; o segundo recorte do cartão o separa,
usando as séries 7853 e 7854 (somadas, dão exatamente a 4640 — conferido nos
mesmos 297 meses).

### A dívida bruta

Dois gráficos na terceira seção:

- **Dívida bruta do governo geral, em % do PIB**, com as duas metodologias em
  recortes do mesmo cartão. A **até 2007** conta os títulos do Tesouro na
  carteira do Banco Central e por isso dá um número bem maior (94,53% contra
  82,86% em ago/2026) — é a que o FMI usa nas comparações entre países. Ela não
  sai da série pronta (a 4537 só começa em 2002) e sim do **saldo em R$ (4502)
  dividido pelo PIB de 12 meses (4382)**: dá exatamente a 4537 publicada — 296
  meses, diferença máxima de 0,005 p.p., conferido a cada rodada — e estica a
  história até **fev/1998**. A de 2008 em diante é a 13762 direto. Em cada
  recorte, uma **linha pontilhada marca o recorde** (96,7% em fev/21 na
  metodologia antiga, 87,7% em out/20 na nova). O cartão usa
  `eixo: {zero: false}`: a dívida nunca chegou perto de zero, então o piso
  acompanha os dados da janela escolhida em vez de descer até zero — trocando o
  período para 5 anos, a escala fecha em cima do trecho visível.
- **Dívida bruta e PIB** — a variação em 12 meses dos dois
  lados da razão. Quando a linha branca (dívida) fica acima da azul (PIB
  nominal), a razão sobe; quando fica abaixo, cai. É o que explica 2021, em que
  a dívida cresceu 9,7% e o PIB nominal 18,4%, e a razão caiu sem que nada
  tivesse sido pago.

Números de referência para conferir: o primário de 2022 fechou em **+R$ 126,0 bi
(+1,25% do PIB)**, o de 2023 em **−R$ 249,1 bi (−2,28%)** e o de 2024 em
**−0,40%**; o nominal de 2023 em **−8,84% do PIB**; a dívida/PIB pela
metodologia até 2007 em **95,43% em jul/2026** (o mesmo número do
[poder-e-mercado](https://github.com/guivaraschinalves/poder-e-mercado), que
faz a conta pelo Excel — dois caminhos, o mesmo resultado).

## O Tesouro Direto (taxa por prazo)

`scripts/tesouro_direto.py` roda na mesma Action do IPCA e grava
`dados/tesouro-direto.json` com um ponto por pregão desde 2004:

- **taxa por prazo** (constante, interpolada) — **Tesouro Prefixado** (2 e 5
  anos), **Tesouro Prefixado com Juros Semestrais** (2, 5 e 10 anos) e
  **Tesouro IPCA+** (5, 10 e 20 anos);
- **taxa por vencimento** (o papel em si, sem interpolação) — **NTN-B por
  vencimento**, com 2035, 2045 e 2050. "NTN-B" aqui é o Tesouro IPCA+ **com**
  juros semestrais, que é o nome certo do papel e o que tem história funda
  nesses três vencimentos (2045 desde 2004, 2035 desde 2006, 2050 desde 2012);
  no sem cupom — a NTN-B Principal — o 2050 só existe desde fev/2025.

A fonte é o CSV `precotaxatesourodireto.csv` do CKAN do Tesouro Transparente
(14 MB, sem chave, atualizado em dia útil). A URL vem do próprio CKAN
(`package_show`), com uma URL fixa de reserva. **A API da B3
(`treasurybondsinfo.json`) não serve mais**: responde 410, e as rotas do site
respondem 403 fora do navegador.

As séries **por vencimento** são a taxa do papel, direto do arquivo, sem conta
nenhuma além da média entre compra e venda. Já as séries **por prazo** são
construídas, e é assim (tudo em `scripts/tesouro_direto.py`):

- **taxa** = média entre a taxa de compra e a de venda da manhã, como pedido;
- **prazo** de cada papel no dia = (vencimento − data base) / 365,25;
- a taxa de N anos sai por **interpolação linear** entre os dois vencimentos
  vizinhos ofertados naquele dia. Se o prazo pedido cair fora do que está em
  oferta, vale o vencimento mais próximo desde que esteja a menos de um ano do
  alvo; passou disso, o dia fica **sem ponto** e o site corta a linha, em vez
  de inventar;
- **papel a menos de um ano do vencimento não entra na conta** (`PRAZO_MINIMO`).
  Taxa anualizada de papel vincendo explode — o arquivo traz −1,5% e +15% — e
  no IPCA+ a taxa curta ainda é dominada pelo carrego da inflação já conhecida.
  Em mai/2026 o papel de 3 meses marcava 10,0% contra 8,0% do de três anos;
  usá-lo como âncora deformava a linha de 2 anos;
- **cotação que destoa da curva do dia também sai** (`DESVIO_MAXIMO`, 5 p.p. da
  mediana do dia). O arquivo do Tesouro traz a NTN-F mais longa a **0,03%** em
  14 pregões de 2010, o que derrubava a linha de 10 anos de 13% para 2,7%. A
  separação é limpa: tirando esses 14, o maior desvio de todo o arquivo é de
  3 p.p.

Duas coisas que o dado impõe:

- **o prefixado de 10 anos só existe com juros semestrais**: a NTN-F chega a 11
  anos de prazo, enquanto o prefixado sem cupom mais longo já ofertado tinha
  6,9 anos. Por isso o cartão sem cupom vai só até 5 anos — e essa linha começa
  em 2015, quando passou a existir papel desse prazo;
- algumas linhas são interrompidas: a de 2 anos da NTN-F em 2013-2014 e
  2016-2017, a de 20 anos do IPCA+ antes de 2010. Nesses períodos não havia
  papel em oferta naquele prazo.

## O ouro e as reservas internacionais (planilha do FMI e do WGC)

Também **não** se atualiza sozinha: vem de `dados/reservas de ouro.xlsx`, uma
planilha com oito abas. Para atualizar, trocar o `.xlsx` e rodar
`python3 scripts/reservas.py` (ele pega o mais novo que casar com `*reserva*`).

| Aba | Cartão | Recortes |
|---|---|---|
| Currency Comp | Reservas internacionais por moeda — colunas empilhadas em US$ trilhões, com o preço do ouro na escala da direita | seleção por série (dá para tirar o preço do ouro, e aí o eixo da direita some) |
| Currency Comp | Participação de cada moeda nas reservas | seleção por moeda |
| Currency Comp + FRED | Ouro e Treasuries nas reservas internacionais, os dois sobre o mesmo total | com os EUA / exc. EUA |
| Variação … acum | Variação acumulada das reservas de ouro, em toneladas | países selecionados / total mundial |
| variação … anual | Variação anual das reservas de ouro, em toneladas | países selecionados / total mundial |
| % de ouro nas reservas | Ouro nas reservas internacionais, em % das reservas de cada país | G20, com seleção |
| Oferta e Demanda | Oferta e demanda de ouro — colunas empilhadas por componente, total em linha | demanda / oferta |
| Oferta e Demanda | Oferta e demanda de ouro, e o preço — média de 4 trimestres em linha, preço na escala da direita | — |
| Demanda por País | Demanda de ouro por país e região — nove grupos empilhados mais o resíduo, total em linha | joias / barras e moedas |
| Mine production data | Produção das minas de ouro, por região | seleção por região |
| Above-ground stocks | Estoque de ouro acima do solo, por destino | por destino / com o investimento aberto |
| Exports of gold FMI | Exportações de ouro não monetário — os 10 maiores de hoje, em série temporal | seleção por país |
| Imports of gold FMI | Importações de ouro não monetário — os 10 maiores de hoje, em série temporal | seleção por país |

No cartão da média de 4 trimestres, **as duas linhas de toneladas são a mesma
linha**: no balanço do mercado a oferta é igual à demanda em todo trimestre, e
a diferença entre as duas colunas da planilha não passa de 2×10⁻¹³ t em 66
trimestres. A oferta vai pontilhada e mais fina por cima da demanda só para
ficar visível, em vez de sumir debaixo dela.

As quatro abas do mercado de ouro (as de baixo na tabela) têm somas que **têm
de fechar**, e o script confere todas a cada rodada, abortando se alguma passar
de 0,2 t: os componentes somam o total do balanço, a oferta total é igual à
demanda total, os nove grupos mais o resíduo somam o total do mundo, as sete
regiões somam a produção mundial e os quatro destinos somam o estoque. Onde uma
série não existe naquele ponto (a Austrália só tem dado a partir de 2021), ela
conta zero na conferência — que é o que o gráfico desenha.

Como os grupos da demanda por região foram montados, sem contar duas vezes:
"Américas ex EUA" é a linha das Américas menos a dos Estados Unidos, "Ásia ex
China" é a soma dos dez asiáticos que ficam fora da Grande China, e Grande
China é continente + Hong Kong + Taiwan. A faixa cinza é o resíduo da própria
planilha (`other & stock change`), que é o que faz a pilha encostar na linha do
total.

**A única série que não vem da planilha** é a dos Treasuries: `BOGZ1FL263061130Q`
do Financial Accounts (Z.1) do Fed, baixada do FRED sem chave, com os títulos do
Tesouro americano em poder de instituições oficiais estrangeiras. O pedido vai
**sem cabeçalho nenhum** — com um User-Agent de navegador o FRED não responde,
fica pendurado até o timeout em vez de devolver 403. Aquela linha não é a parte
em Treasuries da faixa do dólar: o numerador conta instituições oficiais que
podem estar fora do COFER, e a faixa do dólar é bem mais que Treasuries. As duas
linhas do cartão são comparáveis entre si por dividirem o mesmo total, não
somáveis.

O recorte **exc. EUA** tira o total de reservas e o ouro dos Estados Unidos do
numerador e do denominador, pelas colunas U e V da aba. Duas conferências rodam
a cada rodada e abortam se falharem: a série do FRED contra a coluna O, e a
razão dos Treasuries sem os EUA contra a coluna R — as duas batem exatamente.
**A coluna S da aba não é usada.** A fórmula dela desconta do denominador o
*ouro* dos EUA (coluna V) em vez do *total* deles (coluna U), e lê essa célula
uma linha abaixo; reproduz-se exatamente como
`(ouro − ouroEUA[t]) / (total − ouroEUA[t+1])` nos 106 trimestres. Dá 20,65% no
último trimestre contra 22,25% da conta descrita. Vale a conta descrita.

### A China, que o FMI não tem

As duas abas de comércio são do balanço de pagamentos do FMI, e **a China não
está nelas**. O complemento é o que a alfândega chinesa reporta à ONU: HS
710812 (ouro não monetário em bruto), pelo UN Comtrade — que para a China é
quase toda a posição 7108 (US$ 8,856 bi contra 8,814 bi em dez/2024, 0,5% de
diferença).

Isso não cabe numa rodada do `reservas.py`, por dois motivos, e por isso vive
num cache, `dados/china-ouro.json`, feito por `scripts/china_ouro.py` (que
**entra no repo**, como os `.xlsx`):

- **o portal da alfândega chinesa está fechado.** `stats.customs.gov.cn` fica
  atrás do WAF Jiasule: devolve **412** com um desafio em JavaScript e, depois
  que o navegador resolve o desafio, **400** em todas as tentativas seguintes.
  Em HTTPS o certificado servido é um autoassinado do próprio Jiasule e a
  resposta é **504**. O `www.customs.gov.cn` responde 412 igual;
- **o endpoint aberto do Comtrade aceita um período por chamada** e corta em
  429 se as chamadas vierem coladas. Com 17 segundos entre elas aguenta, e uma
  chamada traz os dois fluxos do período — são uns 40 minutos de coleta.

**O mensal e o anual juntos.** A China só reporta o mês a mês de 2016 em diante
e com atraso (quando isto foi escrito, até dezembro de 2024), mas o **total de
2025 já está publicado**. Os dois entram no mesmo gráfico sem conversão: a soma
móvel de quatro trimestres no 4º trimestre de um ano **é** o total daquele ano.
A amarração é conferida a cada rodada do `china_ouro.py`, em todo ano que tenha
os doze meses — pelo mensal, os quatro trimestres até 2016-Q4 dão US$ 60,60 bi
de importação, exatamente o anual de 2016 publicado. O trecho entre 2024-Q4 e
2025-Q4 é, então, uma reta entre dois pontos verdadeiros, e o cartão usa
`buracoMax: 4` para o traço não cortar ali.

A limitação que fica, dita na nota do gráfico: **a régua é outra**. O FMI mede
mudança de propriedade pelo balanço de pagamentos; a alfândega mede mercadoria
cruzando a fronteira. A linha da China dá ordem de grandeza e posição no
ranking, não um número que se some aos outros — por isso ela vai pontilhada.

Outras portas foram testadas e não servem: Swiss-Impex e UK Trade Info dão 404
nas rotas públicas, e o portal de Hong Kong responde mas mediria só o fluxo via
Hong Kong, não o total da China.

O ranking dos dez maiores sai do **último trimestre em que o painel do FMI está
cheio**, não do mais recente: nos últimos trimestres só parte dos países já
reportou, e ali o Peru — 6º maior exportador — cairia do ranking sem ter
encolhido.

Três coisas que o script resolve e vale saber:

- **a composição começa em 2000**, não em 1999, que é onde a planilha abre: a
  coluna do ouro só existe a partir de 2000-Q1, e sem ela o denominador da
  participação é outro (o dólar daria 71% em 1999 contra 61% em 2000 só por
  causa disso);
- **dólar canadense, dólar australiano e yuan** só ganham coluna própria em
  2012-Q4 e 2016-Q4. Antes estavam em "outras moedas", que por isso encolhe de
  uma vez — está dito na nota do gráfico;
- **o total mundial é o agregado do FMI**, não a coluna "Total above" da
  planilha. Aquela é a soma das colunas de país e quebra nos trimestres
  recentes, em que a maioria ainda não reportou: ela marca −6.027 t em 2026-Q2,
  num trimestre em que o mundo comprou ouro.

## A dívida pública (Relatório Mensal da Dívida)

Essa parte **não** se atualiza sozinha: vem do `.xlsx` dos anexos do Relatório
Mensal da Dívida, que fica em `dados/`. Todo mês:

1. baixar o novo *Relatório da Dívida `<Mês><Ano>`.xlsx* no site do Tesouro
   Nacional (Relatório Mensal da Dívida → anexos) e jogar em `dados/`;
2. `python3 scripts/divida.py` (ele pega o `.xlsx` mais novo da pasta cujo nome
   case com `Relat*` ou `*dívida*` — a pasta também guarda a planilha das
   reservas, então o filtro importa);
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
dados/      ipca.json, fiscal.json, divida.json, reservas.json,
            tesouro-direto.json, moedas.json, juros.json (gerados)
            + o .xlsx do Tesouro, o das reservas e o das moedas
scripts/    atualizar.py (IPCA), fiscal.py (resultado primário),
            tesouro_direto.py (taxas) e juros.py (Brasil × EUA),
            automáticos; divida.py (dívida), reservas.py (reservas) e
            moedas.py (câmbio), dos .xlsx, na mão
.github/workflows/atualizar.yml
```

O `app.js` é genérico: lê os arquivos de `dados/` e desenha o que vier. Séries
em linha ou em barra empilhada, unidade `%`, `bi` (R$ bilhões), `anos`,
`usd-tri`, `usd-oz`, `t` (toneladas), `brl`, `usd` ou `brl-usd` (câmbio, duas
casas fixas também no eixo), eixo X mensal, diário (`diario`),
trimestral (`trimestral`, chave `"2000-Q1"`) ou por categoria (`categorias`,
que é como entram as séries anuais — um rótulo por ano), e
cartões com `variantes`. Por série ainda dá para pedir `largura`, `opacidade`,
`traco`, `rotulo` (o valor na ponta da linha) e `legenda: false`. A `nota`
do gráfico aceita vários parágrafos (linha em branco entre eles) e `**negrito**`. Com
`selecao: true` no gráfico, cada série ganha um botão para ligar e desligar.
`passoX: n` força o eixo X a um rótulo a cada n meses (o dólar desde 1912 usa
`120`: o passo que o eixo escolhe sozinho cabe, mas vira um paredão de texto).

**Eixo da direita**: a série marcada com `dir: true` sai da escala da esquerda e
ganha a sua, na unidade de `unidade2` (é o preço do ouro ao lado do estoque de
reservas). Para as duas grades coincidirem, a escala da direita é obrigada a ter
o **mesmo número de intervalos** da esquerda, e o passo dela sai de uma lista de
degraus mais rica (1,5, 2,5, 3, 6…) — assim cada número da direita cai numa
linha da grade sem virar número quebrado. Com uma única série ali, os números da
direita saem na cor dela. `eixo: {alvo: n}` pede n marcas no eixo da esquerda
(o padrão, 8, daria passo 5 numa faixa de 0 a 18 e desperdiçaria metade da
grade).

A **ordem das categorias** na página e no menu é a ordem da lista `FONTES` no
`app.js`, não a ordem alfabética. Hoje: Moedas e câmbio, IPCA, Fiscal, Dívida
Pública, Tesouro Direto, Juros no Brasil e nos EUA, Ouro e reservas
internacionais.

**Nota abaixo do gráfico, só quando ele pedir.** Regra dele, de 8/10/2026: não
acrescentar nota por iniciativa própria. Onde já existe uma, ela é só de
metodologia — o que a série é, de que código ou aba ela vem, o que a conta faz
e onde ela não dá para comparar. Nada de leitura do gráfico nem de instrução de
uso dos botões.

O **subtítulo** é o lugar de explicar o dado, e ele é direto: o que a série
mede, em que unidade, e a ressalva que muda o número, depois de ponto e
vírgula. O modelo é dele: *"Variação % acumulada em 12 meses; EX1 exclui
combustíveis e alimentos com preços mais voláteis"*. Nada de didático.

`legenda: false` quer dizer **pano de fundo**: a série é desenhada, mas fica
fora da legenda e da caixa do mouse — é o que faz o feixe cinza de "todos os
anos" caber na tela. No **CSV ela entra assim mesmo**: na tela é contexto, no
arquivo é dado.

### Área preenchida, e a cédula sob a linha

`area: true` fecha a série até a linha do zero e pinta. É **um polígono por
trecho contínuo**, não um só: onde a série tem buraco, a área se divide — e
emendar por cima seria inventar o mês que falta.

Com `imagem: "assets/…"` junto, o preenchimento deixa de ser cor e passa a ser
a imagem, esticada no quadro do gráfico e **recortada pela área**: é a linha que
decide quanto dela aparece. É assim que a nota de R$ 100 vai sob o poder de
compra do real e a de US$ 100 sob a do dólar. A imagem é esticada de propósito
(`preserveAspectRatio="none"`) — ela precisa cobrir o quadro, não ficar na
proporção da cédula de verdade.

Duas coisas que não são óbvias:

- **A imagem entra em data URI, não como caminho.** Na hora de baixar, o SVG é
  serializado e rasterizado dentro de um `<img>`, e ali referência externa não
  carrega: a nota sumiria do PNG. `carregarImagens` baixa cada arquivo uma vez,
  converte em `data:image/jpeg;base64,…` e guarda em `IMAGENS`; o desenho usa a
  cópia embutida. Assim o PNG, o JPG, o PDF e o `.svg` saem todos com a nota —
  o `.svg` fica autossuficiente, num arquivo só (96 KB no do real).
- **Ela chega depois do primeiro desenho.** O gráfico aparece na hora, com o
  preenchimento liso da cor da série, e é redesenhado quando a imagem carrega.
  Imagem que não baixar não quebra nada: a série fica na cor, que é o desenho
  de sempre.

## As moedas e o câmbio (planilha de moedas)

Também **não** se atualiza sozinha: vem de `dados/Moedas brasileiras 5.xlsx`.
Para atualizar, trocar o `.xlsx` e rodar `python3 scripts/moedas.py` (ele pega
o mais novo que casar com `*oeda*`).

| Aba | Colunas | Cartão |
|---|---|---|
| 1-BRL PP Chart | C (mês) e D | Perda de poder de compra do real |
| USD PP Chart | A (data) e B | Perda de poder de compra do dólar |
| 2-Chart Câmbio Justo | C (mês), D e F | A taxa de câmbio de equilíbrio |
| 3-BRL USD 99 Depr % | A (data) e B | Sobre/(sub)valorização do real |
| Diferencial Inflação | A (data), B e C | Diferencial de inflação entre Brasil e Estados Unidos |

Três coisas da planilha que o script precisa saber:

- **A data nem sempre é a coluna A.** Nas abas `1-BRL PP Chart` e
  `2-Chart Câmbio Justo` o mês do gráfico está na **coluna C**: a coluna A é
  outro eixo, que começa em 1942 e serve a outro desenho. Ler a A alinharia
  cada ponto a um mês errado por cinquenta anos — e sem erro nenhum na tela.
- **Colunas duplicadas.** D e E da primeira aba são a mesma série, e o mesmo
  vale para B e C da `USD PP Chart`. Só uma entra.
- **O cabeçalho do FRED.** A `USD PP Chart` traz seis linhas de cabeçalho antes
  do dado, e uma delas tem número na coluna do valor. O leitor descarta tudo
  que não tenha um serial de data plausível na coluna da data.

### O que cada série é

Os dois cartões de **poder de compra** levam a cédula correspondente sob a
linha (`assets/nota-real-1994.jpg` e `assets/nota-dolar.jpg`), como no modelo
feito no PowerPoint — ver *Área preenchida, e a cédula sob a linha*, acima. A do
real é a da **primeira família**, a que circulava em 1994, onde a linha começa;
a atual só saiu em 2010. Os dois eixos são travados em **100** (`eixo: {max}`):
sem isso o do dólar subiria a 120, porque o índice passa de 100 em 1913 (bate em
100,71 em maio), e os dois gráficos deixariam de ser lidos na mesma régua.

**Os cinco cartões desta categoria não têm nota de rodapé** — a metodologia
está aqui, nesta seção, e não embaixo do gráfico.

O **poder de compra** das duas moedas é a mesma conta: 100 no mês-base,
dividido pela inflação acumulada desde então. Do real, base junho de 1994 (o
último mês fechado antes de 1º de julho, quando ele entrou em circulação),
descontado o IPCA; do dólar, base dezembro de 1912, descontado o CPI — esse é o
índice `CUUR0000SA0R` do BLS ("Purchasing Power of the Consumer Dollar")
baixado do FRED e reindexado. A linha do dólar **sobe** nos anos 1920 e na
Depressão, quando houve deflação, e não é retificada por isso.

O **câmbio pela PPC** parte da paridade da estreia do real (R$ 1,00 por
US$ 1,00 em julho de 1994) e daí anda só pelo diferencial de inflação: a cada
mês é multiplicado pelo IPCA e dividido pelo CPI. Os três cartões de câmbio
abrem em **março de 1999**, no flutuante — antes disso o dólar era
administrado, e comparar o administrado com um câmbio de equilíbrio não diz
nada sobre o mercado.

A **sobre/(sub)valorização** não é dado independente: é `PPC ÷ mercado − 1`. O
script refaz a conta e a confronta com a coluna B da aba 3 a cada rodada — hoje
bate com **erro zero nos 329 meses**. Se um dia descolar, ele para em vez de
publicar um gráfico que não é o que o título diz.

### O buraco de outubro de 2025

Quatro das cinco séries param um mês no caminho, e é o mesmo mês em todas. A
paralisação de 43 dias do governo americano (1º de outubro a 12 de novembro de
2025) impediu a coleta de preços, e o BLS **cancelou** o CPI daquele mês em vez
de atrasá-lo: os dados não podem ser levantados retroativamente, então out/2025
não existe e não vai passar a existir. Sem CPI não há diferencial de inflação,
sem diferencial não há câmbio pela PPC, e sem ele não há sobre/(sub)valorização.

O buraco fica **à vista** nos gráficos — a linha corta e a área se divide em
dois polígonos. Emendar por cima dele seria inventar o mês. Só o poder de
compra do real escapa, porque depende do IPCA e não do CPI.

## Os juros do Brasil e dos EUA (e o diferencial)

`scripts/juros.py` grava `dados/juros.json` e roda na Action **depois** do
`tesouro_direto.py` — as taxas brasileiras saem de `dados/tesouro-direto.json`,
e não de um segundo download do CSV de 14 MB do Tesouro Transparente. Além de
poupar a rede, é o que garante que o mesmo papel não apareça com duas taxas em
dois cartões do site.

Quatro cartões, em duas seções:

- **Juro real de mercado** — a NTN-B 2050 contra o TIPS de 30 anos (`DFII30` do
  FRED), e o **diferencial por prazo**, em 5, 10 e 30 anos, com botão para
  ligar e desligar cada linha. Diário.
- **Juro real ex-post da taxa básica** — a Selic deflacionada pelo IPCA contra
  o fed funds deflacionado pelo CPI, e o diferencial. Mensal, desde jan/2000.

### Os três prazos, e por que o de 30 é diferente

| Prazo | Brasil | EUA | Desde |
|---|---|---|---|
| 5 anos | Tesouro IPCA+ interpolado | `DFII5` | 15/5/2009 |
| 10 anos | Tesouro IPCA+ interpolado | `DFII10` | 18/7/2005 |
| 30 anos | **NTN-B 2050** (papel único) | `DFII30` | 1/6/2012 |

Em 5 e 10 anos as duas pontas são de **prazo constante**: do lado americano o
TIPS de maturidade constante, do brasileiro a taxa interpolada entre os dois
vencimentos vizinhos ofertados no dia — a mesma conta do cartão "Tesouro
IPCA+". É a comparação mais limpa, e a de mais história.

Em 30 anos não há interpolada: o arquivo do Tesouro Direto traz taxa por prazo
até 20 anos, e acima disso a oferta é rala demais para interpolar sem inventar.
Ali vale a NTN-B 2050, que é um papel só — tinha 38 anos de prazo em 2012 e tem
24 hoje, enquanto o `DFII30` é 30 todo dia. Está dito no subtítulo do cartão.

A linha de 5 anos tem um buraco de 94 dias entre 14/5 e 16/8/2018: o Tesouro
Direto não ofertou papel perto desse prazo ali, e o mesmo buraco já aparece no
cartão "Tesouro IPCA+". A linha corta em vez de emendar.

**Faltar 20 anos é escolha, não limitação**: o `DFII20` existe e a interpolada
brasileira de 20 anos também. Ele entra acrescentando uma linha à lista
`PRAZOS` do script.

### As três fórmulas

Nenhuma é a que se faz de cabeça, e nenhuma está escrita na tela — os cartões
não levam nota. Ficam aqui:

1. **Juro real** é `(1 + nominal) / (1 + inflação) − 1`, não "nominal menos
   inflação". Com Selic de 14,63% e IPCA de 4,22% em 12 meses (ago/2026), o
   real é 9,98% — a subtração daria 10,40%.
2. **Diferencial** é `(1 + i_br) / (1 + i_us) − 1`, não `i_br − i_us`. O
   diferencial responde "quanto rende a mais", e render a mais é razão entre
   montantes, não diferença entre taxas.
3. **A taxa americana precisa mudar de convenção antes da comparação.** A taxa
   da NTN-B é efetiva anual; o `DFII30` vem "on an investment basis", nominal
   anual com capitalização semestral. O script converte por `(1 + y/2)² − 1` —
   3,35% viram 3,38% em 6/10/2026.

O erro da subtração **não tem sinal fixo**, e é aí que é fácil tropeçar:

```
subtração − certo = (i_br − i_us) · i_us / (1 + i_us)
```

Com a taxa americana positiva a subtração exagera o diferencial; com ela
negativa, encurta. E negativa não é exceção: foi o caso em 188 dos 319 meses do
ex-post e em 407 dos 3.464 dias do juro longo. O maior erro de toda a série é
justamente de encurtamento — 0,76 p.p. em set/2022. Nenhum gráfico desenha a
subtração: no juro longo as duas linhas ficavam a um décimo de ponto uma da
outra, encostadas o gráfico inteiro, e no ex-post ele preferiu sem. O que resta
dela é a conferência — o script recalcula a identidade acima a cada rodada e
imprime os dois extremos no log.

### Detalhes que mudam o número

- **Fed funds pela rolagem diária** (`DFF`), com juro simples a/360 por dia
  corrido, composto — e não a média mensal do `FEDFUNDS` elevada a 1/12, que
  erra até 0,32 p.p. na taxa de 12 meses.
- **CPI sem ajuste sazonal** (`CPIAUCNS`): é o índice que dá a inflação de 12
  meses publicada. O `CPIAUCSL`, ajustado, serve para variação mensal.
- **Selic acumulada no mês** (SGS 4390), o juro que correu, não a meta do
  Copom. O mês em curso é descartado: o SGS já publica a parcial dele.
- **Cada país anda sozinho no ex-post.** Out/2025 não tem CPI (a paralisação do
  governo americano impediu a coleta e o BLS cancelou o índice do mês, que não
  pode ser coletado depois), então o mês fica vazio do lado americano e
  desenhado do brasileiro. O diferencial precisa dos dois e fica com o buraco.
- **O ex-post começa em jan/2000**, primeira janela de 12 meses inteiramente
  posterior à flutuação do real (15/1/1999). A conta existe desde 1987, mas nas
  janelas de 1999 a Selic de 45% da crise divide a conta com uma inflação que
  só reagiu depois (27,2% de juro real em mai/1999), e antes disso vem a
  hiperinflação (51% em ago/1992).

A cada rodada o script confere, e aborta se não fechar: o IPCA de 12 meses
contra a série 13522 do próprio BC (em termos relativos, senão a
hiperinflação estoura qualquer tolerância absoluta), a identidade do erro da
subtração, e a identidade de que deflacionar cada país e dividir depois dá o
mesmo que dividir os nominais e descontar a razão das inflações.

### A porta do FRED

O CSV do gráfico (`fredgraph.csv?id=SERIE`) não exige chave e é o mesmo dado da
API JSON, que exige. **Não mande `User-Agent` de navegador**: o FRED trava
(timeout, não 403) quando a requisição se identifica como um. O conector MCP
que o FRED lançou em outubro de 2026 (`mcp.stlouisfed.org`) é para um
assistente conversar com o acervo; numa Action, sem assistente nenhum, o
caminho continua sendo o CSV.

## Onde o site mora, e o portão de assinante

O ftm-dados roda em **dois lugares ao mesmo tempo**, de propósito, enquanto
durar a transição:

| Endereço | Quem entra | Como é publicado |
|---|---|---|
| `ftm.app.br/interno/dados` | **assinante do Follow the Money** | `publicar.yml` manda por rsync para o VPS, e o Caddy serve |
| `guivaraschinalves.github.io/ftm-dados` | qualquer um | GitHub Pages, como sempre |

### Como o portão funciona

É o **mesmo** do Follow the News, não uma cópia: mesma função, mesma base de
assinantes, mesmo token. O leitor informa o e-mail da assinatura; a função
`news-access?action=validate` confere contra `base_usuarios` (que os webhooks da
Guru e da HeroSpark alimentam) ou a `news_access_allowlist` (cortesia da equipe)
e devolve um token HMAC de 30 dias. O token fica em
`localStorage['ftn_access']` — a mesma chave do Follow the News, de propósito:
mesma origem, mesma assinatura, então **quem liberou um já entra no outro**.

O que de fato guarda os números é o **servidor**, não esta tela. Em
`ftm.app.br` o Caddy intercepta `/interno/dados/dados/*.json`, pergunta ao
`news-access?action=verify` se o token vale e só então entrega o arquivo; sem
token é 401, e o portão reaparece. Esconder o gráfico no JavaScript não
guardaria nada — bastaria abrir a aba de rede.

O portão só liga em `ftm.app.br` (ou com `?gate=1` no endereço, para testar).
No GitHub Pages o site segue aberto: pedir e-mail ali seria teatro, porque os
JSON continuam a uma URL de distância.

### Para fechar de vez

Enquanto as duas publicações existirem **não há exclusividade nenhuma**: quem
tiver o link antigo abre tudo, e quem souber a URL do GitHub baixa os JSON do
`raw.githubusercontent.com`. A máquina já está montada; ligar a exclusividade
são dois passos, nesta ordem, e **nenhum deles mexe no código**:

1. **Desligar o GitHub Pages** do repositório (Settings → Pages → Source:
   None). Mata o site aberto. Só isso já resolve a maior parte.
2. **Tornar o repositório privado.** Mata o acesso aos JSON por fora. O
   `atualizar.yml` continua rodando (repositório privado consome minutos da
   cota, e ~60 rodadas de 2 min por mês cabem folgado no plano gratuito).

### Publicação no VPS

`publicar.yml` manda o site por rsync para `/srv/apps/ftm-dados/current`. Vai
só o que o navegador precisa: `scripts/` e os `.xlsx` ficam de fora — são a
cozinha, não o prato, e a planilha sozinha tem 2 MB.

O gatilho tem uma sutileza: além do `push`, ele ouve o **`workflow_run`** do
"Atualiza os dados". É que aquele workflow commita com o `GITHUB_TOKEN` padrão,
e o GitHub não deixa push feito com esse token disparar outro workflow — para
não criar laço infinito. Sem o `workflow_run`, o site no VPS congelaria no
último commit humano enquanto o repositório continuasse atualizando, que é o
tipo de falha que parece problema de cache e não é.

Precisa dos segredos `DEPLOY_SSH_KEY` e `DEPLOY_KNOWN_HOSTS` (os mesmos do
lps-ftm) e de `/srv/apps/ftm-dados/current` já criado no servidor.
