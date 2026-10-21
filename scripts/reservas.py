#!/usr/bin/env python3
"""
Monta dados/reservas.json — a categoria "Reservas internacionais" do site, a
partir da planilha `dados/reservas de ouro.xlsx`.

Uso:
    python3 scripts/reservas.py
    python3 scripts/reservas.py "dados/outra planilha.xlsx"

Só usa a biblioteca padrão: a leitura do .xlsx é a classe `Planilha` do
scripts/divida.py (zipfile + ElementTree). Não entra na Action — a planilha
chega à mão, como o Relatório da Dívida.

AS OITO ABAS

  - **Currency Comp** — composição das reservas alocadas por moeda, trimestral
    de 1999-Q1 em diante, em **US$ milhões**, mais o ouro a preço de mercado e
    o preço do ouro em US$ por onça troy. Dólar canadense e dólar australiano
    só aparecem em 2012-Q4 e o yuan em 2016-Q4: antes disso estavam dentro de
    "Outras moedas", e é por isso que aquela faixa encolhe de repente.
  - **Variação reservas de ouro acum** — variação acumulada desde 2000 das
    reservas de ouro de cada país, em toneladas (a base, 2000-Q1, é vazia).
  - **variação reservas de ouro anual** — a mesma coisa em variação de quatro
    trimestres (começa em 2001-Q1).
  - **% de ouro nas reservas** — participação do ouro nas reservas de cada
    país, **em fração** (0,833 = 83,3%).
  - **Oferta e Demanda** — o balanço trimestral do mercado de ouro desde
    2010-Q1, em toneladas: do lado da demanda joias, tecnologia, investimento,
    bancos centrais e o balcão; do lado da oferta mineração e ouro reciclado.
    Os dois totais são o **mesmo número** por construção — o balcão (OTC) é o
    item de fechamento do balanço, e por isso é o único que fica negativo.
  - **Demanda por País** — três blocos lado a lado, deitados (país na linha,
    trimestre na coluna): joias nas colunas 2–67, barras e moedas nas 70–135 e
    ETFs da 137 em diante (este não é usado aqui). Em cada bloco as linhas sem
    recuo são os países e regiões de topo, e as recuadas são abertura delas.
  - **Mine production data** — produção das minas, anual desde 2010, por país
    dentro de sete regiões; as linhas "Total"/"Sub-total" de cada região são os
    subtotais, e a última linha é o total do mundo.
  - **Above-ground stocks** — o estoque de ouro já extraído, anual desde 2010,
    repartido em joias, bancos centrais, investimento privado (que se abre em
    barras e moedas e ETFs) e outros/balcão. A última coluna é o ano corrente
    até o fim de 2026-Q2.

O TOTAL. As abas de país trazem duas colunas de total: "Total above", que é a
soma das colunas de país, e "IMF World", o agregado mundial do próprio FMI. A
primeira quebra nos trimestres recentes — a maioria dos países ainda não
reportou e a soma passa a misturar quem reportou com quem não: ela marca
−6.027 t em 2026-Q2, quando o mundo comprou ouro. O total daqui é o do FMI, que
é consistente ponta a ponta (e que, por isso mesmo, não fecha com a soma das
colunas de país).

Dois eixos X diferentes: as abas trimestrais usam a chave "2000-Q1" com
`trimestral: true`, e as duas anuais (mineração e estoque) entram como eixo de
categorias — um rótulo por ano, que é o que também deixa o "2026*" do estoque
aparecer como ele é, um ano pela metade.
"""
import csv
import datetime
import glob
import io
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from divida import Planilha                                  # noqa: E402

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA = os.path.join(RAIZ, "dados", "reservas.json")

ABA_MOEDAS = "Currency Comp"
ABA_ACUM = "Variação reservas de ouro acum"
ABA_ANUAL = "variação reservas de ouro anual"
ABA_PCT = "% de ouro nas reservas"

TOTAL = "IMF World6 (may not sum to country total)"

ABA_BALANCO = "Oferta e Demanda"
ABA_PAISES = "Demanda por País"
ABA_MINAS = "Mine production data"
ABA_ESTOQUE = "Above-ground stocks"
# As duas abas do comércio de ouro não monetário, já em soma móvel de quatro
# trimestres e em US$ bilhões: trimestre na coluna A, país da coluna C em
# diante, cabeçalho na linha 4 (a linha 5 traz a origem na base e é pulada).
ABA_EXPORTA, ABA_IMPORTA = "Exports of gold FMI", "Imports of gold FMI"
FMI_CABECALHO, FMI_PRIMEIRA, FMI_COL0 = 4, 6, 3
QUANTOS_PAISES = 10
COMECO_COMERCIO = "2000-Q1"

# Cores do tema do Office, as mesmas dos outros gráficos do site, mais seis
# tons a mais: o gráfico do G20 tem vinte linhas e as catorze de sempre não
# bastam.
AZUL, VERMELHO, VERDE, ROXO, CIANO, LARANJA = "#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6", "#F79646"
AZUL_ESCURO, VINHO, OLIVA, AMARELO, BRANCO = "#3B6FA0", "#8C3B38", "#77933C", "#FFFF00", "#FFFFFF"
CINZA, AREIA, PETROLEO = "#95A5A6", "#D9B382", "#2E6E7E"
ROSA, LILAS, MENTA, DOURADO, MARROM, AZUL_CLARO = "#E07AB1", "#B39DDB", "#45C4A0", "#C9A227", "#A9746E", "#8CB4E2"

# Moedas, na ordem em que entram na pilha: o ouro é a última, então fica no
# topo. A cor olha para a vizinha na pilha — a sequência troca de família
# (verde, azul, vermelho, roxo, petróleo, rosa, laranja, ciano, cinza, amarelo)
# em vez de seguir o espectro, senão duas faixas coladas viram uma só.
# (coluna da planilha, rótulo no gráfico, cor) — a coluna do franco vem com
# "suíco" na planilha.
MOEDAS = [
    ("Dólar americano", "Dólar americano", VERDE),
    ("Euro", "Euro", AZUL),
    ("Iene japonês", "Iene japonês", VERMELHO),
    ("Libra esterlina", "Libra esterlina", ROXO),
    ("Dólar canadense", "Dólar canadense", PETROLEO),
    ("Dólar australiano", "Dólar australiano", ROSA),
    ("Yuan chinês", "Yuan chinês", LARANJA),
    ("Franco suíco", "Franco suíço", CIANO),
    ("Outras moedas", "Outras moedas", CINZA),
    ("Ouro", "Ouro", AMARELO),
]
PRECO_OURO = "Preço do Ouro"

# As economias do primeiro gráfico de variação, na ordem que ele pediu.
ECONOMIAS = [
    ("United States", "Estados Unidos", BRANCO),
    ("China, P.R.: Mainland", "China", VERMELHO),
    ("Russian Federation", "Rússia", AMARELO),
    ("Brazil", "Brasil", VERDE),
    ("Japan", "Japão", LARANJA),
    ("Euro Area", "Zona do Euro", AZUL),
    ("United Kingdom", "Reino Unido", CIANO),
]

# O G20 do gráfico de participação, da maior fatia de ouro para a menor (é a
# ordem em que a legenda fica legível ao lado do gráfico). A União Europeia tem
# cadeira no G20 e aqui entra como Zona do Euro, que é o que a planilha traz —
# e que já contém Alemanha, França e Itália.
#
# Vinte linhas não cabem num espectro: o que decide a cor é em que altura a
# linha anda. Os oito primeiros passam de 30% e vivem embolados no alto do
# gráfico — levam as cores mais separadas que existem (branco, vermelho, azul,
# amarelo, rosa, laranja, verde, roxo). Os doze de baixo se cruzam num feixe
# abaixo de 25%, onde o que separa é a posição, não o tom; ali entram as
# famílias repetidas, e para esses é que serve o botão de tirar da tela.
G20 = [
    ("United States", "Estados Unidos", BRANCO),
    ("Italy", "Itália", VERMELHO),
    ("France", "França", AZUL),
    ("Germany", "Alemanha", AMARELO),
    ("Euro Area", "Zona do Euro", ROSA),
    ("Türkiye, Rep of5", "Türkiye", LARANJA),
    ("Russian Federation", "Rússia", VERDE),
    ("Saudi Arabia", "Arábia Saudita", ROXO),
    ("South Africa", "África do Sul", CIANO),
    ("Argentina", "Argentina", MENTA),
    ("United Kingdom", "Reino Unido", PETROLEO),
    ("India", "Índia", LILAS),
    ("Australia", "Austrália", AREIA),
    ("China, P.R.: Mainland", "China", VINHO),
    ("Japan", "Japão", AZUL_CLARO),
    ("Indonesia", "Indonésia", MARROM),
    ("Brazil", "Brasil", DOURADO),
    ("Mexico", "México", OLIVA),
    ("Korea, Rep. of", "Coreia do Sul", AZUL_ESCURO),
    ("Canada", "Canadá", CINZA),
]

# O balanço do mercado: (coluna da aba, rótulo, cor). Essa aba está em pé, como
# a Currency Comp, então a coluna é o nome que está na primeira linha. O balcão
# fecha a conta e é o único que vai a negativo.
DEMANDA = [("Joias", "Joias", AMARELO), ("Tecnologia", "Tecnologia", CIANO),
           ("Investimento", "Investimento", AZUL),
           ("Bancos Centrais", "Bancos centrais", VERDE), ("Balcão", "Balcão (OTC)", CINZA)]
OFERTA = [("Mineração", "Mineração", LARANJA), ("Ouro Reciclado", "Ouro reciclado", ROXO)]
DEMANDA_TOTAL, OFERTA_TOTAL, PRECO_BALANCO = "Demanda por Ouro", "Oferta de Ouro", "Preço"

# Demanda por país: os dois blocos deitados da aba, pelo deslocamento da
# primeira coluna de dados.
BLOCOS_DEMANDA = [("joias", "Joias", 2), ("barras", "Barras e moedas", 70)]

# Os grupos que ele pediu, na ordem em que ele pediu — e é essa a ordem da
# pilha, de baixo para cima. Cada um é (rótulo, cor, linhas que somam, linhas
# que subtraem): "Américas ex EUA" é a linha das Américas menos a dos Estados
# Unidos, e "Ásia ex China" é a soma dos asiáticos que ficam fora da Grande
# China. Juntos, os nove cobrem exatamente as linhas de topo do bloco, que a
# aba soma em "Total above".
GRUPOS_DEMANDA = [
    ("Europa ex CIS", AZUL, [32], []),
    ("Américas ex EUA", VERDE, [27], [28]),
    ("Estados Unidos", AREIA, [28], []),
    ("Türkiye", VERMELHO, [25], []),
    ("Rússia", AMARELO, [26], []),
    ("Oriente Médio", ROXO, [18], []),
    ("Grande China", LARANJA, [6], []),
    ("Ásia ex China", CIANO, [3, 4, 5, 10, 11, 12, 13, 14, 15, 16], []),
    ("Oceania", ROSA, [17], []),
]
LINHA_RESIDUO, LINHA_MUNDO = 42, 43

# Produção das minas: a linha de subtotal de cada região (as "linhas verdes" da
# aba) e a do total do mundo.
REGIOES_MINA = [(9, "América do Norte", AZUL), (24, "América Central e do Sul", VERDE),
                (32, "Europa", ROXO), (51, "África", LARANJA), (59, "CIS", AMARELO),
                (69, "Ásia", VERMELHO), (76, "Oceania", CIANO)]
LINHA_MINA_TOTAL = 78

# Estoque acima do solo: os quatro blocos que somam o total, e a abertura do
# investimento privado em barras/moedas e ETFs.
ESTOQUE = [(4, "Joias", AMARELO), (5, "Bancos centrais", VERDE),
           (6, "Investimento privado", AZUL), (9, "Outros e balcão", CINZA)]
ESTOQUE_ABERTO = [(4, "Joias", AMARELO), (5, "Bancos centrais", VERDE),
                  (7, "Barras e moedas", AZUL), (8, "ETFs", PETROLEO),
                  (9, "Outros e balcão", CINZA)]
LINHA_ESTOQUE_TOTAL = 10

# A única série que não vem da planilha: Treasuries em poder de instituições
# oficiais estrangeiras (bancos centrais e fundos soberanos), do Financial
# Accounts (Z.1) do Fed, em US$ milhões, trimestral desde 1945.
FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s"
SERIE_TESOUROS = "BOGZ1FL263061130Q"
FONTE_TESOUROS = ("Federal Reserve (Financial Accounts, Z.1, via FRED), FMI (COFER) "
                  "e World Gold Council")

# O bloco à direita da aba Currency Comp, que ele montou: data na coluna Q e,
# ao lado, os Treasuries em US$ (O), a razão deles sobre as reservas sem os EUA
# (R) e o total e o ouro dos Estados Unidos (U e V). A coluna S, do ouro sem os
# EUA, não é lida — ver a conferência em `grafico_ouro_tesouros`.
EX_EUA_DATA = 17
EX_EUA_TESOUROS, EX_EUA_TESOUROS_PCT = 15, 18
EX_EUA_TOTAL, EX_EUA_OURO = 21, 22

# Comércio de ouro: o nome em português e a cor de cada país. A cor é por país,
# não por posição no ranking, para a mesma linha ter a mesma cor nos dois
# gráficos — Suíça e Estados Unidos aparecem nos dois, e lê-se um ao lado do
# outro. Quem não estiver aqui entra com o nome da planilha e uma cor do fim da
# fila.
# A cor olha para o *grupo de baixo* de cada gráfico, que é onde as linhas se
# encavalam: nas exportações, Japão, Peru, Gana, Itália e Tailândia andam todos
# entre US$ 15 e 27 bi, e por isso levam famílias diferentes (ciano, roxo,
# areia, vinho, menta) em vez de três tons de azul-petróleo.
PAISES = {
    "Switzerland": ("Suíça", BRANCO),
    "United States": ("Estados Unidos", AZUL),
    "China": ("China", VERMELHO),
    "India": ("Índia", LARANJA),
    "Canada": ("Canadá", VERDE),
    "Germany": ("Alemanha", AMARELO),
    "Australia": ("Austrália", ROSA),
    "Japan": ("Japão", CIANO),
    "Peru": ("Peru", ROXO),
    "Ghana": ("Gana", AREIA),
    "Thailand": ("Tailândia", MENTA),
    "Italy": ("Itália", VINHO),
    "Türkiye, Republic of": ("Türkiye", LILAS),
    "Saudi Arabia": ("Arábia Saudita", DOURADO),
    "Korea, Republic of": ("Coreia do Sul", AZUL_CLARO),
    "South Africa": ("África do Sul", PETROLEO),
    "Brazil": ("Brasil", OLIVA),
    "Mexico": ("México", MARROM),
    "Uzbekistan, Republic of": ("Uzbequistão", CINZA),
}
RESERVA = [DOURADO, MARROM, LILAS, AZUL_CLARO, CINZA]

FONTE_COMERCIO = ("FMI (balanço de pagamentos) e, para a China, UN Comtrade "
                  "(alfândega chinesa, HS 710812)")

FONTE_WGC = "World Gold Council, Metals Focus e Refinitiv GFMS"
FONTE_ESTOQUE = "World Gold Council, Metals Focus, Refinitiv GFMS e ICE Benchmark Administration"

TRIMESTRES = ["1º", "2º", "3º", "4º"]


# --------------------------------------------------------------------------
# leitura
# --------------------------------------------------------------------------

def trimestre(txt):
    """Os três jeitos que a planilha escreve um trimestre — "1999-Q1",
    "Q1 2000" e "Q1'10" — viram a chave do eixo: "1999-Q1"."""
    txt = str(txt)
    m = re.match(r"\s*(\d{4})\D*Q([1-4])\s*$", txt)
    if m:
        return "%s-Q%s" % (m.group(1), m.group(2))
    m = re.match(r"\s*Q([1-4])\D*(\d{2}|\d{4})\s*$", txt)
    if not m:
        return None
    ano = m.group(2)
    return "%s-Q%s" % (ano if len(ano) == 4 else "20" + ano, m.group(1))


def fred(serie):
    """Série trimestral do FRED, sem chave, no formato do eixo ("2026-Q2").

    O pedido vai **sem cabeçalho nenhum**: com um User-Agent de navegador o
    FRED não responde — ele não devolve 403, fica pendurado até o timeout."""
    req = urllib.request.Request(FRED_CSV % serie)
    txt = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    fora = {}
    for linha in csv.DictReader(io.StringIO(txt)):
        valor = linha.get(serie, "")
        if not valor or valor == ".":
            continue
        ano, mes, _ = linha["observation_date"].split("-")
        fora["%s-Q%d" % (ano, (int(mes) - 1) // 3 + 1)] = float(valor)
    if not fora:
        raise RuntimeError("o FRED não devolveu nenhum ponto da série %s" % serie)
    return fora


def painel(pl, aba, linha_nomes, col_nomes, col_data):
    """Aba em pé (um trimestre por linha, um país por coluna) → {nome: {trim: v}}.

    Célula de texto (a planilha guarda "#VALUE!" onde o país não reportou) é
    buraco, não zero."""
    grade = pl.grade(aba)
    nomes = {grade[linha_nomes][c]: c for c in sorted(grade[linha_nomes]) if c >= col_nomes}
    fora = {nome: {} for nome in nomes}
    for r in sorted(grade):
        chave = trimestre(grade[r].get(col_data))
        if not chave:
            continue
        for nome, c in nomes.items():
            v = grade[r].get(c)
            if isinstance(v, float):
                fora[nome][chave] = v
    return fora


def deitada(pl, aba, linha_datas, col0, n):
    """Aba deitada (um trimestre por coluna) → {linha: {trim: valor}}.

    Devolve pela **linha** da planilha, não pelo nome: na aba "Demanda por
    País" o mesmo nome aparece nos dois blocos e os recuos fazem parte do
    rótulo, então o que identifica a série sem ambiguidade é o número da
    linha. Célula de texto é buraco, não zero."""
    grade = pl.grade(aba)
    datas = [(c, trimestre(grade[linha_datas].get(c))) for c in range(col0, col0 + n)]
    faltam = [c for c, t in datas if not t]
    if faltam:
        raise RuntimeError("a aba %r não tem trimestre nas colunas %s" % (aba, faltam))
    fora = {}
    for r, linha in grade.items():
        serie_ = {t: linha[c] for c, t in datas if isinstance(linha.get(c), float)}
        if serie_:
            fora[r] = serie_
    return fora


def anual(pl, aba, linha_anos, col0, n):
    """Aba anual (um ano por coluna) → (rótulos dos anos, {linha: {índice: v}}).

    O eixo aqui é de categorias, então a chave de cada ponto é a posição do ano
    na lista — é assim que o `app.js` desenha uma coluna por rótulo."""
    grade = pl.grade(aba)
    cols = list(range(col0, col0 + n))
    rotulos = []
    for c in cols:
        v = grade[linha_anos].get(c)
        if isinstance(v, float):
            rotulos.append("%d" % v)
            continue
        # o ano corrente vem como "YTD'26*"; aqui vira "2026", e quem chama
        # decide se marca a coluna como ano pela metade
        rot = str(v).replace("YTD'", "").replace("*", "").strip()
        rotulos.append("20" + rot if len(rot) == 2 else rot)
    fora = {}
    for r, linha in grade.items():
        serie_ = {str(i): linha[c] for i, c in enumerate(cols) if isinstance(linha.get(c), float)}
        if serie_:
            fora[r] = serie_
    return rotulos, fora


def num_tri(chave):
    a, q = chave.split("-Q")
    return int(a) * 4 + int(q) - 1


def media_movel(d, n=4):
    """Média dos últimos n trimestres. Janela com buraco não vira média: se os
    n trimestres não forem seguidos, aquele ponto fica de fora."""
    ks = sorted(d)
    fora = {}
    for i in range(n - 1, len(ks)):
        janela = ks[i - n + 1:i + 1]
        if num_tri(janela[-1]) - num_tri(janela[0]) != n - 1:
            continue
        fora[ks[i]] = sum(d[k] for k in janela) / n
    return fora


def soma(linhas, mais, menos=()):
    """Soma de linhas da planilha, trimestre a trimestre. Um trimestre só entra
    se **todas** as linhas pedidas existirem nele: metade de uma soma é um
    número errado, não um número parcial."""
    chaves = set()
    for r in list(mais) + list(menos):
        chaves |= set(linhas.get(r, {}))
    fora = {}
    for k in chaves:
        if any(k not in linhas.get(r, {}) for r in menos):
            continue
        presentes = [r for r in mais if k in linhas.get(r, {})]
        if not presentes:
            continue
        fora[k] = (sum(linhas[r][k] for r in presentes)
                   - sum(linhas[r][k] for r in menos))
    return fora


def exige(painel_, nomes, aba):
    faltam = [n for n in nomes if not painel_.get(n)]
    if faltam:
        raise RuntimeError("a aba %r não tem %s" % (aba, ", ".join(faltam)))


def confere(nome, partes, total, folga=0.05):
    """As partes têm de somar o total, chave a chave.

    Parte que não existe naquele ponto conta zero, que é o mesmo que o gráfico
    desenha: sem dado, a faixa simplesmente não aparece na pilha. Pular esses
    pontos deixaria a conferência de fora justamente onde ela é mais útil — a
    Austrália, por exemplo, só tem dado a partir de 2021."""
    difs = []
    for k in sorted(total):
        if all(k not in p for p in partes):
            continue
        difs.append((abs(sum(p.get(k, 0.0) for p in partes) - total[k]), k))
    if not difs:
        raise RuntimeError("nenhum ponto em comum para conferir %s" % nome)
    pior, onde = max(difs)
    print("  %-34s somam o total em %3d pontos, pior diferença %.2f t (%s)"
          % (nome + ":", len(difs), pior, onde))
    if pior > folga:
        raise RuntimeError("%s não somam o total (pior %.2f t em %s)" % (nome, pior, onde))


# --------------------------------------------------------------------------
# montagem
# --------------------------------------------------------------------------

def ordem(chave):
    """No eixo trimestral a chave é "2010-Q1" e a ordem alfabética serve; no de
    categorias é o número da categoria, e aí "10" vem antes de "2" se a ordem
    for de texto — a coluna sai no lugar errado."""
    return (0, int(chave), "") if chave.isdigit() else (1, 0, chave)


def serie(nome, cor, dados, casas=2, **extra):
    pares = [[t, round(v, casas)] for t, v in sorted(dados.items(), key=lambda kv: ordem(kv[0]))]
    return dict(nome=nome, cor=cor, dados=pares, **extra)


def variante(rot, series, **extra):
    return dict(rot=rot, series=series, **extra)


def grafico_moedas(moedas, preco):
    """Colunas empilhadas com o estoque de cada moeda (o ouro a preço de
    mercado) e o preço do ouro na escala da direita."""
    colunas = [serie(rot, cor, {t: v / 1e6 for t, v in moedas[nome].items()}, 3, tipo="barra")
               for nome, rot, cor in MOEDAS]
    linha = serie("Preço do ouro (eixo da direita)", BRANCO, preco, 2, dir=True, largura=5)
    return dict(
        id="reservas-moedas",
        titulo="Reservas internacionais por moeda",
        subtitulo="Estoque em US$ trilhões, no fim de cada trimestre; o ouro a preço de mercado",
        unidade="usd-tri", unidade2="usd-oz",
        trimestral=True,
        selecao=True,
        eixo=dict(alvo=10),
        series=colunas + [linha],
        nota="São as reservas **alocadas** (a parte que os bancos centrais informam ao FMI moeda "
             "por moeda) mais o ouro, avaliado ao preço do fim do trimestre. A altura de cada cor "
             "é o estoque daquela moeda e a linha branca é o preço do ouro, que corre na escala da "
             "direita. A série começa em 2000, o primeiro trimestre em que a planilha traz o ouro. "
             "Dólar canadense e dólar australiano só ganham coluna própria em 2012 e o yuan em "
             "2016: antes disso estavam dentro de \"outras moedas\".")


def bloco_ex_eua(pl):
    """O bloco dos Estados Unidos da aba Currency Comp → {trimestre: {...}}."""
    grade = pl.grade(ABA_MOEDAS)
    fora = {}
    for r in sorted(grade):
        chave = trimestre(grade[r].get(EX_EUA_DATA))
        if not chave:
            continue
        linha = {nome: grade[r].get(col) for nome, col in
                 (("tesouros", EX_EUA_TESOUROS), ("tesouros_pct", EX_EUA_TESOUROS_PCT),
                  ("eua_total", EX_EUA_TOTAL), ("eua_ouro", EX_EUA_OURO))}
        if all(isinstance(v, float) for v in linha.values()):
            fora[chave] = linha
    if not fora:
        raise RuntimeError("não achei o bloco dos EUA na aba %r" % ABA_MOEDAS)
    return fora


def painel_fmi(pl, aba):
    """Aba de comércio do FMI → {país: {trimestre: US$ bi}}."""
    grade = pl.grade(aba)
    nomes = {grade[FMI_CABECALHO][c]: c for c in sorted(grade[FMI_CABECALHO]) if c >= FMI_COL0}
    fora = {nome: {} for nome in nomes}
    for r in sorted(grade):
        if r < FMI_PRIMEIRA:
            continue
        chave = trimestre(grade[r].get(1))
        if not chave:
            continue
        for nome, c in nomes.items():
            if isinstance(grade[r].get(c), float):
                fora[nome][chave] = grade[r][c]
    if not fora:
        raise RuntimeError("a aba %r veio vazia" % aba)
    return fora


def maiores(painel_, quantos):
    """Os N maiores de hoje, pelo último trimestre em que o painel está cheio.

    Cheio é o que importa: nos trimestres mais recentes só parte dos países já
    reportou, e ranquear ali rebaixaria quem ainda não entregou — o Peru, por
    exemplo, é o 6º maior exportador e some do ranking um trimestre antes dos
    outros. A série de cada um continua desenhada até onde ela existe."""
    tris = sorted({t for s in painel_.values() for t in s})
    cobertura = {t: sum(1 for s in painel_.values() if t in s) for t in tris}
    cheio = max(cobertura.values())
    base = [t for t in tris if cobertura[t] == cheio][-1]
    ordenado = sorted(painel_.items(), key=lambda kv: -kv[1].get(base, 0.0))
    return base, [nome for nome, _ in ordenado[:quantos]]


def total_das_reservas(moedas):
    """O denominador dos gráficos de participação: a soma das dez faixas da
    composição, com o ouro a preço de mercado."""
    totais = {}
    for nome, _, _ in MOEDAS:
        for t, v in moedas[nome].items():
            totais[t] = totais.get(t, 0.0) + v
    return totais


def grafico_participacao(moedas):
    """A mesma composição em participação: cada moeda sobre a soma de todas."""
    totais = total_das_reservas(moedas)
    series = [serie(rot, cor, {t: v / totais[t] * 100 for t, v in moedas[nome].items()}, 2, rotulo=True)
              for nome, rot, cor in MOEDAS]
    return dict(
        id="reservas-participacao",
        titulo="Participação de cada moeda nas reservas",
        subtitulo="Em % do total das reservas alocadas mais o ouro",
        unidade="%",
        trimestral=True,
        selecao=True,
        series=series,
        nota="É o gráfico anterior dividido pelo total de cada trimestre; o denominador é a soma "
             "das dez faixas, ouro incluído. Em 2012 e 2016 o dólar canadense, o australiano e o "
             "yuan saem de \"outras moedas\" e passam a ter faixa própria: o degrau naquelas três "
             "linhas é mudança de classificação, não de composição.")


def grafico_ouro_tesouros(moedas, tesouros, eua):
    """Os dois grandes ativos de reserva lado a lado — o ouro e os Treasuries em
    mãos oficiais —, cada um sobre o mesmo total, com e sem os Estados Unidos.

    Tirar os EUA muda o retrato dos dois lados: eles têm a maior reserva de
    ouro do mundo e quase nenhuma reserva em moeda estrangeira, e obviamente
    não guardam Treasuries como reserva. Sem eles o ouro pesa menos e os
    Treasuries pesam mais.

    DUAS CONFERÊNCIAS contra o que ele montou na planilha, a cada rodada:
    a série do FRED contra a coluna O, e a razão dos Treasuries contra a
    coluna R. As duas têm de bater exatamente.

    A coluna S, do ouro sem os EUA, **não** é usada: a fórmula dela desconta do
    denominador o *ouro* dos EUA (coluna V) em vez do *total* deles (coluna U),
    e ainda lê essa célula uma linha abaixo. Dá 20,65% no último trimestre
    contra 22,25% da conta que ele descreveu. Aqui vale a conta descrita.
    """
    totais = total_das_reservas(moedas)
    comuns = sorted(t for t in totais if t in tesouros)
    if not comuns:
        raise RuntimeError("nenhum trimestre em comum entre a planilha e a série do FRED")
    com_eua = [t for t in comuns if t in eua]

    dif = max(abs(tesouros[t] - eua[t]["tesouros"]) for t in com_eua)
    print("  Treasuries: FRED bate com a coluna O em %d trimestres, diferença máxima US$ %.0f mi"
          % (len(com_eua), dif))
    if dif > 1.0:
        raise RuntimeError("a série do FRED não bate com a coluna da planilha (máx %.0f)" % dif)

    ex_total = {t: totais[t] - eua[t]["eua_total"] for t in com_eua}
    tes_ex = {t: tesouros[t] / ex_total[t] * 100 for t in com_eua}
    ouro_ex = {t: (moedas["Ouro"][t] - eua[t]["eua_ouro"]) / ex_total[t] * 100 for t in com_eua}
    dif = max(abs(tes_ex[t] / 100 - eua[t]["tesouros_pct"]) for t in com_eua)
    print("  Treasuries sem os EUA: bate com a coluna R em %d trimestres, diferença máxima %.2e"
          % (len(com_eua), dif))
    if dif > 1e-9:
        raise RuntimeError("a razão dos Treasuries não bate com a coluna R (máx %.3e)" % dif)
    ult = com_eua[-1]
    print("  em %s: com os EUA ouro %.1f%% e Treasuries %.1f%%; sem os EUA ouro %.1f%% e Treasuries %.1f%%"
          % (ult, moedas["Ouro"][ult] / totais[ult] * 100, tesouros[ult] / totais[ult] * 100,
             ouro_ex[ult], tes_ex[ult]))

    def par(ouro, tes):
        return [
            serie("Ouro", AMARELO, ouro, 2, rotulo=True, largura=8),
            # azul, não o verde do dólar dos outros gráficos: ao lado do
            # amarelo do ouro o verde-oliva vira quase o mesmo tom
            serie("Treasuries", AZUL, tes, 2, rotulo=True, largura=8),
        ]
    return dict(
        id="reservas-ouro-tesouros",
        titulo="Ouro e Treasuries nas reservas internacionais",
        subtitulo="Em % do total das reservas alocadas mais o ouro",
        unidade="%",
        trimestral=True,
        fonte=FONTE_TESOUROS,
        variantes=[
            variante("Com os EUA", par({t: moedas["Ouro"][t] / totais[t] * 100 for t in comuns},
                                       {t: tesouros[t] / totais[t] * 100 for t in comuns})),
            variante("Exc. EUA", par(ouro_ex, tes_ex)),
        ],
        nota="Os dois numeradores vêm de lugares diferentes e o denominador é o mesmo dos dois "
             "gráficos anteriores: a soma das dez faixas da composição, com o ouro a preço de "
             "mercado. O ouro é do World Gold Council; o FMI (COFER) entra com o valor das "
             "reservas em cada moeda, não com o ouro. Os Treasuries são a série %s do Financial "
             "Accounts (Z.1) do Fed: títulos do Tesouro americano em poder de instituições "
             "oficiais estrangeiras, que são bancos centrais e fundos soberanos. Por isso a linha "
             "dos Treasuries não é a parte em Treasuries da faixa do dólar: o numerador conta "
             "instituições oficiais que podem estar fora do COFER, e a faixa do dólar inclui muito "
             "mais que Treasuries (agências, depósitos, aplicações de curto prazo). As duas linhas "
             "são comparáveis entre si, por dividirem o mesmo total, não somáveis. No recorte "
             "\"exc. EUA\" saem do numerador e do denominador o total de reservas e o ouro dos "
             "Estados Unidos: eles têm a maior reserva de ouro do mundo e quase nada em moeda "
             "estrangeira, e não guardam Treasuries como reserva, então sem eles o ouro pesa menos "
             "e os Treasuries pesam mais." % SERIE_TESOUROS)


def china_trimestral(cache):
    """O cache do Comtrade → soma móvel de 4 trimestres, em US$ bi.

    O mensal vira trimestre (só trimestre com os três meses conta) e depois soma
    móvel de quatro trimestres seguidos — a mesma régua das abas do FMI, que já
    vêm assim.

    Onde o mensal não alcança, entra o **anual**, sem conversão nenhuma: a soma
    móvel de quatro trimestres no 4º trimestre de um ano é, por definição, o
    total daquele ano. É o que estica a China de 2024-Q4 para 2025-Q4, já que o
    Comtrade publica o total de 2025 mas ainda não os meses. O mensal tem
    preferência onde os dois existem, e o china_ouro.py confere que eles batem.
    """
    if not cache:
        return {}
    por_tri = {}
    for mes, v in cache.get("meses", {}).items():
        ano, m = int(mes[:4]), int(mes[4:])
        por_tri.setdefault("%04d-Q%d" % (ano, (m - 1) // 3 + 1), []).append(v)
    fora = {}
    for fluxo, nome in (("X", "exporta"), ("M", "importa")):
        cheios = {t: sum(x.get(fluxo, 0.0) for x in ms) / 1e9
                  for t, ms in por_tri.items()
                  if len(ms) == 3 and all(fluxo in x for x in ms)}
        # media_movel divide por 4; aqui o que vale é a soma dos 4 trimestres
        serie_ = {t: v * 4 for t, v in media_movel(cheios, 4).items()}
        for ano, v in cache.get("anos", {}).items():
            if fluxo in v:
                serie_.setdefault("%s-Q4" % ano, v[fluxo] / 1e9)
        fora[nome] = serie_
    return fora


def grafico_comercio(painel_, china, qual):
    """Os dez maiores exportadores (ou importadores) de ouro não monetário de
    hoje, em série temporal, com a China vinda da alfândega dela."""
    base, top = maiores(painel_, QUANTOS_PAISES)
    titulo = ("Exportações de ouro não monetário" if qual == "exporta"
              else "Importações de ouro não monetário")
    series, sobra = [], list(RESERVA)
    for nome in top:
        pt, cor = PAISES.get(nome, (nome, sobra.pop(0) if sobra else CINZA))
        dados = {t: v for t, v in painel_[nome].items() if t >= COMECO_COMERCIO}
        series.append(serie(pt, cor, dados, 2, rotulo=True))
    if china:
        series.append(serie("China", VERMELHO, china, 2, rotulo=True, traco="pontilhado", largura=6))
    return dict(
        id="ouro-comercio-" + qual,
        titulo=titulo,
        subtitulo="Soma dos quatro trimestres até cada ponto, em US$ bilhões",
        unidade="usd-bi",
        trimestral=True,
        selecao=True,
        # a China tem o trimestre até 2024 e depois só o total do ano: o traço
        # não pode cortar num buraco de até quatro trimestres
        buracoMax=4,
        fonte=FONTE_COMERCIO,
        series=series,
        nota="Os dez maiores de hoje, cada um com a sua série inteira. O ranking sai do último "
             "trimestre em que o painel do FMI está cheio (%s), e não do trimestre mais recente, "
             "onde só parte dos países já reportou e quem está atrasado cairia do ranking sem ter "
             "encolhido. Pelo mesmo motivo algumas linhas terminam antes das outras. **A China não "
             "entra na estatística do FMI**: a linha pontilhada vem da alfândega dela, pelo que ela "
             "reporta à ONU (HS 710812, ouro não monetário em bruto, que para a China é quase toda "
             "a posição 7108). São duas réguas diferentes (o FMI mede mudança de propriedade pelo "
             "balanço de pagamentos, a alfândega mede mercadoria cruzando a fronteira), então a "
             "linha da China indica a ordem de grandeza, não um número que se some aos outros. O "
             "trimestre dela vai até o fim de 2024, que é até onde o Comtrade tem o mês a mês; o "
             "ponto de 2025 vem do total do ano, que já está publicado e cai exatamente onde a "
             "soma móvel de quatro trimestres cai no 4º trimestre. O trecho entre um e outro é "
             "uma reta entre dois pontos verdadeiros, não trimestre medido." % base)


def grafico_variacao(acum, anual, qual):
    """Variação das reservas de ouro em toneladas, nas duas janelas (acumulada
    desde 2000 e em quatro trimestres), com dois recortes cada: as principais
    economias e o total do mundo."""
    base, titulo, comeco = (acum, "Variação acumulada das reservas de ouro", "desde 2000") \
        if qual == "acum" else (anual, "Variação anual das reservas de ouro", "em quatro trimestres")
    paises = [serie(pt, cor, base[en], 1, rotulo=True) for en, pt, cor in ECONOMIAS]
    mundo = [serie("Total mundial", AMARELO, base[TOTAL], 1, rotulo=True, largura=9)]
    return dict(
        id="reservas-ouro-" + qual,
        titulo=titulo,
        subtitulo="Em toneladas, " + comeco,
        unidade="t",
        trimestral=True,
        variantes=[
            variante("Países selecionados", paises, selecao=True),
            variante("Total mundial", mundo),
        ],
        nota="Variação da tonelagem de metal: o preço do ouro não entra nesta conta. O total "
             "mundial é o agregado do próprio FMI; a outra coluna de total da planilha soma as "
             "colunas de país e quebra nos trimestres recentes, em que a maioria ainda não "
             "reportou, e por isso não é usada aqui. Ela também não fecha com a soma dos países, "
             "que varia com quem reportou em cada trimestre.")


def grafico_pct(pct):
    """Ouro como fatia das reservas, no G20."""
    # linha mais fina que o padrão: com vinte delas no mesmo gráfico, o traço
    # de sempre engrossa o feixe de baixo até virar uma mancha só
    series = [serie(pt, cor, {t: v * 100 for t, v in pct[en].items()}, 2, largura=5)
              for en, pt, cor in G20]
    return dict(
        id="reservas-ouro-pct",
        titulo="Ouro nas reservas internacionais",
        subtitulo="Em % das reservas de cada país, no fim de cada trimestre",
        unidade="%",
        trimestral=True,
        selecao=True,
        series=series,
        eixo=dict(alvo=10),
        nota="A conta é o ouro a preço de mercado sobre o total das reservas do país: a fatia "
             "sobe tanto quando ele compra metal quanto quando o ouro se valoriza. São os vinte "
             "membros do G20, do que tem mais ouro para o que tem menos. A União Europeia, que tem "
             "cadeira no G20, entra como Zona do Euro, o agregado que a planilha traz, que já "
             "contém Alemanha, França e Itália, que aparecem à parte por serem membros também.")


# --------------------------------------------------------------------------
# o mercado de ouro: balanço, demanda por região, minas e estoque
# --------------------------------------------------------------------------

def grafico_balanco(linhas):
    """O balanço trimestral do mercado, pelos dois lados. Os dois totais são o
    mesmo número: o balcão fecha a conta."""
    def lado(itens, chave_total, rot_total):
        colunas = [serie(rot, cor, linhas[nome], 1, tipo="barra") for nome, rot, cor in itens]
        total = serie(rot_total, BRANCO, linhas[chave_total], 1, largura=5, rotulo=True)
        return colunas + [total]
    return dict(
        id="ouro-balanco",
        titulo="Oferta e demanda de ouro",
        subtitulo="Em toneladas, por trimestre",
        unidade="t",
        trimestral=True,
        fonte=FONTE_WGC,
        variantes=[
            variante("Demanda", lado(DEMANDA, DEMANDA_TOTAL, "Demanda total"), selecao=True),
            variante("Oferta", lado(OFERTA, OFERTA_TOTAL, "Oferta total"), selecao=True),
        ],
        nota="Oferta e demanda fecham no mesmo número em todo trimestre, por construção do "
             "balanço: o balcão (OTC e outros) é o item que fecha a conta, e é por isso que ele é "
             "o único que aparece abaixo do zero: ali o balcão devolveu metal ao mercado em vez "
             "de absorvê-lo. A oferta é só mineração e ouro reciclado; o hedge dos produtores "
             "está dentro do balcão. Investimento é barras, moedas e ETFs juntos.")


def grafico_balanco_media(linhas):
    """O mesmo balanço alisado em quatro trimestres, contra o preço.

    Oferta e demanda são o mesmo número em toda a série (a maior diferença
    entre as duas colunas da planilha é de 2 décimos de trilionésimo de
    tonelada, ruído de ponto flutuante), então as duas médias dão a mesma
    linha. A oferta entra pontilhada e mais fina, por cima: assim dá para ver
    que ela está ali, em vez de a demanda simplesmente escondê-la."""
    demanda = media_movel(linhas[DEMANDA_TOTAL])
    oferta = media_movel(linhas[OFERTA_TOTAL])
    return dict(
        id="ouro-balanco-media",
        titulo="Oferta e demanda de ouro, e o preço",
        subtitulo="Média dos quatro trimestres até cada ponto, em toneladas; o preço no fim do trimestre",
        unidade="t", unidade2="usd-oz",
        trimestral=True,
        fonte=FONTE_WGC + " e ICE Benchmark Administration",
        series=[
            serie("Demanda total", BRANCO, demanda, 1, largura=8, rotulo=True),
            serie("Oferta total", CIANO, oferta, 1, largura=3, traco="pontilhado", rotulo=True),
            serie("Preço do ouro (eixo da direita)", AMARELO, linhas[PRECO_BALANCO], 2,
                  dir=True, largura=5),
        ],
        nota="As duas linhas de toneladas são a mesma linha: no balanço do mercado a oferta é "
             "igual à demanda em todo trimestre, por construção; o balcão (OTC) é o item que "
             "fecha a conta. A diferença entre as duas colunas da planilha não passa de 2×10⁻¹³ t "
             "em 66 trimestres, que é erro de arredondamento do Excel. A oferta vai pontilhada e "
             "mais fina por cima da demanda só para ficar visível. O que o gráfico mostra, então, "
             "é o tamanho do mercado, alisado em quatro trimestres para tirar a sazonalidade das "
             "joias, contra o preço, que corre na escala da direita e não é alisado: é o preço do "
             "fim de cada trimestre.")


def grafico_demanda_paises(blocos):
    """Demanda de joias e de barras e moedas, repartida nos grupos que ele
    pediu, com o resíduo da planilha fechando a pilha no total do mundo."""
    variantes = []
    for chave, rot, linhas in blocos:
        colunas = [serie(nome, cor, soma(linhas, mais, menos), 1, tipo="barra")
                   for nome, cor, mais, menos in GRUPOS_DEMANDA]
        colunas.append(serie("Outros e variação de estoque", CINZA, linhas[LINHA_RESIDUO], 1,
                             tipo="barra"))
        total = serie("Demanda mundial", BRANCO, linhas[LINHA_MUNDO], 1, largura=5, rotulo=True)
        variantes.append(variante(rot, colunas + [total], selecao=True))
    return dict(
        id="ouro-demanda-regioes",
        titulo="Demanda de ouro por país e região",
        subtitulo="Em toneladas, por trimestre",
        unidade="t",
        trimestral=True,
        fonte=FONTE_WGC,
        variantes=variantes,
        nota="Cada cor é um país ou uma região da planilha, somados do jeito que eles se "
             "encaixam sem contar duas vezes: \"Américas ex EUA\" é a linha das Américas menos a "
             "dos Estados Unidos, \"Ásia ex China\" é a soma dos asiáticos que ficam fora da "
             "Grande China (Índia, Paquistão, Sri Lanka, Japão, Indonésia, Malásia, Singapura, "
             "Coreia do Sul, Tailândia e Vietnã), e Grande China é o continente mais Hong Kong e "
             "Taiwan. Oceania é só a Austrália, a única da região na planilha, e ela só tem dado a "
             "partir de 2021. A faixa cinza é o resíduo da própria planilha (\"other & stock "
             "change\"), o que falta para os países listados fecharem no total do mundo; com ela "
             "a pilha encosta exatamente na linha branca.")


def grafico_minas(anos, linhas):
    """Produção das minas por região — os subtotais de região da aba — com o
    total do mundo em linha."""
    colunas = [serie(nome, cor, linhas[r], 1, tipo="barra") for r, nome, cor in REGIOES_MINA]
    total = serie("Produção mundial", BRANCO, linhas[LINHA_MINA_TOTAL], 1, largura=5, rotulo=True)
    return dict(
        id="ouro-mineracao",
        titulo="Produção das minas de ouro",
        subtitulo="Em toneladas, por ano",
        unidade="t",
        categorias=anos,
        selecao=True,
        fonte="Metals Focus, pelo World Gold Council",
        series=colunas + [total],
        nota="As sete regiões são os subtotais da própria aba, e somadas dão o total do mundo, e "
             "o script confere isso a cada rodada. CIS é a Comunidade de Estados Independentes "
             "(Rússia, Uzbequistão, Cazaquistão, Quirguistão e outros). Turquia está dentro da "
             "Ásia, como na planilha.")


def grafico_estoque(anos, linhas):
    """O estoque de ouro já extraído, por destino."""
    def pilha(itens):
        colunas = [serie(nome, cor, linhas[r], 0, tipo="barra") for r, nome, cor in itens]
        return colunas + [serie("Estoque total", BRANCO, linhas[LINHA_ESTOQUE_TOTAL], 0,
                                largura=5, rotulo=True)]
    return dict(
        id="ouro-estoque",
        titulo="Estoque de ouro acima do solo",
        subtitulo="Em toneladas, no fim de cada ano",
        unidade="t",
        categorias=anos,
        fonte=FONTE_ESTOQUE,
        variantes=[
            variante("Por destino", pilha(ESTOQUE), selecao=True),
            variante("Com o investimento aberto", pilha(ESTOQUE_ABERTO), selecao=True),
        ],
        nota="É todo o ouro já extraído, onde ele está hoje: não é produção do ano, é estoque "
             "acumulado. Os quatro blocos somam o total; o segundo recorte abre o investimento "
             "privado em barras e moedas e em ETFs. A última coluna é o ano corrente até o fim do "
             "segundo trimestre de 2026, por isso ela é menor que um ano cheio.")


def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else None
    if not caminho:
        achados = glob.glob(os.path.join(RAIZ, "dados", "*reserva*.xlsx"))
        if not achados:
            raise SystemExit("nenhuma planilha de reservas em dados/")
        caminho = max(achados, key=os.path.getmtime)
    print("Lendo %s" % os.path.basename(caminho))
    pl = Planilha(caminho)

    moedas = painel(pl, ABA_MOEDAS, 1, 2, 1)
    exige(moedas, [n for n, _, _ in MOEDAS] + [PRECO_OURO], ABA_MOEDAS)
    acum = painel(pl, ABA_ACUM, 2, 2, 1)
    anual_ouro = painel(pl, ABA_ANUAL, 2, 2, 1)
    pct = painel(pl, ABA_PCT, 1, 3, 2)
    for p, aba in ((acum, ABA_ACUM), (anual_ouro, ABA_ANUAL)):
        exige(p, [en for en, _, _ in ECONOMIAS] + [TOTAL], aba)
    exige(pct, [en for en, _, _ in G20], ABA_PCT)

    # A planilha abre em 1999-Q1, mas a coluna do ouro só começa em 2000-Q1 —
    # e sem o ouro o total é outro (o dólar daria 71% em 1999 contra 61% em
    # 2000, só porque o denominador não tem a faixa amarela). Os dois gráficos
    # de moeda começam onde o ouro começa.
    inicio = min(moedas["Ouro"])
    moedas = {nome: {t: v for t, v in d.items() if t >= inicio} for nome, d in moedas.items()}
    preco = moedas[PRECO_OURO]
    ref = max(moedas["Dólar americano"])
    print("  moedas: %d trimestres, %s a %s; ouro a US$ %.2f/oz em %s"
          % (len(moedas["Dólar americano"]), inicio, ref, preco[ref], ref))
    total_moedas = sum(moedas[n][ref] for n, _, _ in MOEDAS) / 1e6
    print("  total em %s: US$ %.3f tri (dólar %.1f%%, ouro %.1f%%)"
          % (ref, total_moedas, moedas["Dólar americano"][ref] / 1e4 / total_moedas,
             moedas["Ouro"][ref] / 1e4 / total_moedas))
    print("  ouro: total mundial %+.0f t desde 2000 e %+.0f t no último ano (%s)"
          % (acum[TOTAL][max(acum[TOTAL])], anual_ouro[TOTAL][max(anual_ouro[TOTAL])],
             max(acum[TOTAL])))

    print("Baixando a série %s do FRED…" % SERIE_TESOUROS)
    tesouros = fred(SERIE_TESOUROS)
    ex_eua = bloco_ex_eua(pl)

    # --- o mercado de ouro: balanço, demanda por região, minas e estoque ---
    balanco = painel(pl, ABA_BALANCO, 1, 2, 1)
    exige(balanco, [n for n, _, _ in DEMANDA + OFERTA]
          + [DEMANDA_TOTAL, OFERTA_TOTAL, PRECO_BALANCO], ABA_BALANCO)
    confere("balanço — demanda", [balanco[n] for n, _, _ in DEMANDA], balanco[DEMANDA_TOTAL], 0.2)
    confere("balanço — oferta", [balanco[n] for n, _, _ in OFERTA], balanco[OFERTA_TOTAL], 0.2)
    confere("balanço — oferta = demanda", [balanco[OFERTA_TOTAL]], balanco[DEMANDA_TOTAL])

    blocos = []
    for chave, rot, col0 in BLOCOS_DEMANDA:
        linhas = deitada(pl, ABA_PAISES, 2, col0, 66)
        grupos = [soma(linhas, mais, menos) for _, _, mais, menos in GRUPOS_DEMANDA]
        confere("demanda %s — grupos" % chave, grupos + [linhas[LINHA_RESIDUO]],
                linhas[LINHA_MUNDO], 0.2)
        blocos.append((chave, rot, linhas))

    anos_mina, minas = anual(pl, ABA_MINAS, 4, 2, 16)
    confere("minas — regiões", [minas[r] for r, _, _ in REGIOES_MINA], minas[LINHA_MINA_TOTAL], 0.2)

    exporta, importa = painel_fmi(pl, ABA_EXPORTA), painel_fmi(pl, ABA_IMPORTA)
    china = {}
    caminho_china = os.path.join(RAIZ, "dados", "china-ouro.json")
    if os.path.exists(caminho_china):
        with open(caminho_china, encoding="utf-8") as f:
            china = china_trimestral(json.load(f))
        for nome, d in china.items():
            if d:
                print("  China (%s): %d trimestres, %s a %s; hoje US$ %.1f bi"
                      % (nome, len(d), min(d), max(d), d[max(d)]))
    else:
        print("  dados/china-ouro.json não existe — rode scripts/china_ouro.py; "
              "os gráficos de comércio saem sem a China")

    anos_estoque, estoque = anual(pl, ABA_ESTOQUE, 3, 2, 17)
    confere("estoque — destinos", [estoque[r] for r, _, _ in ESTOQUE], estoque[LINHA_ESTOQUE_TOTAL])
    confere("estoque — investimento aberto", [estoque[r] for r, _, _ in ESTOQUE_ABERTO],
            estoque[LINHA_ESTOQUE_TOTAL])
    anos_estoque[-1] += "*"          # o ano corrente vai só até o fim do 2º trimestre

    secoes = [
        dict(titulo="Composição por moeda",
             graficos=[grafico_moedas(moedas, preco), grafico_participacao(moedas),
                       grafico_ouro_tesouros(moedas, tesouros, ex_eua)]),
        dict(titulo="Reservas de ouro",
             graficos=[grafico_variacao(acum, anual_ouro, "acum"),
                       grafico_variacao(acum, anual_ouro, "anual"), grafico_pct(pct)]),
        dict(titulo="Oferta e demanda",
             graficos=[grafico_balanco(balanco), grafico_balanco_media(balanco),
                       grafico_demanda_paises(blocos)]),
        dict(titulo="Produção e estoque",
             graficos=[grafico_minas(anos_mina, minas), grafico_estoque(anos_estoque, estoque)]),
        dict(titulo="Comércio de ouro",
             graficos=[grafico_comercio(exporta, china.get("exporta"), "exporta"),
                       grafico_comercio(importa, china.get("importa"), "importa")]),
    ]
    doc = dict(
        atualizado=datetime.date.today().isoformat(),
        referencia="%s-%02d" % (ref[:4], int(ref[-1]) * 3),
        fonte="FMI (IFS, COFER e balanço de pagamentos), World Gold Council, Metals Focus, "
              "Refinitiv GFMS, ICE Benchmark Administration, Federal Reserve (Z.1), UN Comtrade "
              "e bancos centrais",
        categoria="Ouro e reservas internacionais",
        secoes=secoes,
    )
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("gravado %s (%.0f KB), referência %s"
          % (SAIDA, os.path.getsize(SAIDA) / 1024, doc["referencia"]))
    for sec in secoes:
        print("  %-24s %s" % (sec["titulo"] + ":", ", ".join(g["id"] for g in sec["graficos"])))


if __name__ == "__main__":
    main()
