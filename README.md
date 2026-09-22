# FtM Dados

Os gráficos do IPCA do chart book, desenhados no navegador e **atualizados
sozinhos** com dados do Banco Central (SGS) e do IBGE (SIDRA). Site estático,
sem build: `index.html` + `app.js` + `styles.css`, com os dados em
`dados/ipca.json`.

- **Modo escuro/claro** — botão no topo; o escuro é o padrão e usa o fundo de
  notas dos slides do FtM.
- **Baixar** — em cada gráfico, no tema da tela, em PNG, JPG, PDF ou SVG
  editável, e o CSV com todas as séries. Tamanhos (todos em 2×, para sair
  nítido): apresentação 16:9 (3840×2160) e Instagram feed 4:5 (2160×2700),
  feed 3:4 (2160×2880), quadrado 1:1 (2160×2160) e Stories 9:16 (2160×3840,
  com o gráfico dentro da área segura, longe das barras do app).
- **Período** — Tudo / 20 / 10 / 5 anos. Passe o mouse (ou toque) para ver os
  valores do mês.

## Como os dados se atualizam

A Action `.github/workflows/atualizar.yml` roda todo dia às 09:30 e às 17:00
(Brasília), executa `scripts/atualizar.py` e comita `dados/ipca.json` **só se
algum número mudou**. O GitHub Pages republica sozinho em seguida. Não há
chave, senha nem serviço externo: as duas APIs são públicas.

Para rodar na mão (mesmo resultado):

```bash
python3 scripts/atualizar.py
```

Ou, no GitHub: **Actions → Atualiza os dados → Run workflow**.

## As contas (as fórmulas da planilha)

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

## Para mudar um gráfico

Título, subtítulo, cores, séries e janela estão na função `main()` de
`scripts/atualizar.py`, um bloco por gráfico. O desenho (`app.js`) é genérico:
lê o que vier no JSON. Depois de mudar, rode o script e faça o push.

## Testar localmente

```bash
python3 -m http.server 8000   # http://localhost:8000
```

## Estrutura

```
index.html  styles.css  app.js
assets/     fundo.jpg (fundo dos slides do FtM), logo-ftm.svg, favicon.svg
dados/      ipca.json (gerado)
scripts/    atualizar.py
.github/workflows/atualizar.yml
```
