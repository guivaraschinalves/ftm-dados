#!/usr/bin/env python3
"""
Monta dados/bp.json — o Balanço de Pagamentos do Brasil, os mesmos gráficos do
chartbook, refeitos a partir da tabela especial do Banco Central.

Uso:
    python3 scripts/bp.py

Só usa a biblioteca padrão. Roda na Action junto com o resto.

A FONTE

Quase tudo vem da tabela especial **BalPagM.xlsx** do BC (balanço de pagamentos
mensal, BPM6, US$ milhões), a mesma que a planilha "BalPagM" colava na aba
"Balanço". O BC a publica num endereço fixo:

    https://www.bcb.gov.br/content/estatisticas/Documents/Tabelas_especiais/BalPagM.xlsx

A tabela tem uma coluna "Código no SGS" ao lado de cada linha, e é por esse
código que o script acha as linhas — não pela posição, que muda quando o BC
abre uma conta nova. As duas séries de fora da tabela vêm direto do SGS:

  - **3697 / 3698** — dólar, média do mês, compra e venda. O câmbio do gráfico
    é a média das duas (jul/2026: (5,1133 + 5,1139) / 2 = 5,1136, igual à
    planilha).
  - **4192** — PIB acumulado em 12 meses, em US$ milhões: o denominador do
    saldo de 12 meses em % do PIB.
  - **4385** — PIB mensal, em US$ milhões: somado em 3 meses, o denominador do
    saldo de 3 meses em % do PIB.

OS SINAIS

A conta financeira do BPM6 é "concessões líquidas (+) / captações líquidas
(−)": lá, dinheiro que **entra** no país sai **negativo**, e acumular reserva
sai positivo. Os gráficos usam o sinal da planilha, em que entrada é positiva:

  - conta financeira = −(conta financeira total − ativos de reserva)
  - reservas         = −(ativos de reserva)
  - ID no exterior   = −22865;  ID no país = 22885
  - carteira no exterior = −22906;  carteira no país = 22924
  - outros + derivativos = −22966 − 22969

Com isso conta corrente + conta capital + conta financeira + reservas + erros
e omissões fecha em zero, todo mês; o script confere.

O saldo do balanço de pagamentos é conta corrente + capital + financeira +
erros e omissões — o mesmo que −reservas —, separado em superávit (o que é
positivo) e déficit (o que é negativo), como na planilha.

A necessidade de capital de curto prazo é −(conta corrente + ID no país), em
12 meses, e a legenda é a do slide.

A DÍVIDA EXTERNA

A seção "Dívida externa" é trimestral e vem do SGS, fora da tabela. O SGS
data o trimestre no primeiro mês: "01/04/2026" é o 2º trimestre, posição de
fim de junho. Tudo em US$ milhões:

  - **3684 / 3685** — dívida externa bruta e líquida. A líquida é a bruta
    menos as reservas, os haveres de bancos comerciais no exterior (Cosif) e
    os créditos brasileiros no exterior (Banco do Brasil).
  - **21523 / 21524** — a bruta por devedor: pública (com a privada que tem
    garantia do setor público) e privada (sem ela). Somam a 3684.
  - **21530 a 21534** — a bruta por credor: organismos multilaterais,
    agências governamentais, bancos, detentores de títulos e outros. Somam a
    3684; começam no 4º tri/2007.
  - **24039** — ativos de reserva (estoque); igual à 3546 no último mês do
    trimestre. Começa em 2002.
  - **4192** — PIB acumulado em 12 meses em US$, no último mês do trimestre.

Duas tabelas especiais completam a seção:

  - **DivExt_T.xls**, aba "Dívida Externa - Prazo Residual": principal e juros
    que vencem em até 12 meses, por setor. O serviço do gráfico é o total
    menos a linha "Investimento direto: operações intercompanhia". Só sai em
    .xls; quem lê é o scripts/xls.py, sem biblioteca de fora.
  - **Divggp.xlsx**, aba "R$ milhões": a dívida externa do governo geral
    (contratada lá fora + títulos do mercado doméstico com não residentes)
    sobre a dívida bruta do governo geral.

O BC não publica mais os haveres de bancos e os créditos no exterior em
separado. Os "outros ativos" saem por diferença: bruta − líquida − reservas
(2º tri/2026: 407.103 − 5.083 − 367.558 = 34.461).

Os acumulados são somas móveis dos meses (3 ou 12), datadas no último mês da
janela. Cada gráfico começa onde o slide começa (`INICIO_*`).
"""
import datetime
import io
import json
import os
import re
import sys
import time
import urllib.request
import zipfile
from xml.etree import ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from atualizar import sgs                                    # noqa: E402
from xls import abas as abas_xls                             # noqa: E402

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA = os.path.join(RAIZ, "dados", "bp.json")

ESPECIAIS = "https://www.bcb.gov.br/content/estatisticas/Documents/Tabelas_especiais/"
URL_TABELA = ESPECIAIS + "BalPagM.xlsx"
URL_DIVEXT = ESPECIAIS + "DivExt_T.xls"       # só sai em .xls
URL_DIVGGP = ESPECIAIS + "Divggp.xlsx"

# Onde cada gráfico começa, como no slide.
INICIO = "1995-12"            # a maioria: primeiro mês com 12 meses de dado
INICIO_RECENTE = "2021-01"    # carteira doméstica em 3 meses e ações e fundos
INICIO_CRIPTO = "2016-01"     # fluxo mensal de criptos
INICIO_CRIPTO_12 = "2016-12"  # o mesmo, acumulado em 12 meses

# Linhas da tabela, pelo código SGS que o BC põe ao lado de cada uma.
COD = dict(
    cc=22701, comercial=22707, servicos=22719, renda1=22800, renda2=22838,
    ck=22851, ck_anp=22854, ck_transf=22860,
    cf=22863, id_ext=22865, id_pais=22885,
    id_part=22891, id_reinv=22892, id_interco=22893,
    cart_ativo=22906, cart_passivo=22924, deriv=22966, outros=22969,
    reservas=23043, eo=23060,
    dom=28869, dom_acoes=28883, dom_titulos=22942,
    cripto=29647, cripto_ck=29641, cripto_cf=29644,
)
# Cores do tema do Office, as mesmas dos slides.
AZUL, VERMELHO, VERDE, ROXO, CIANO, LARANJA = "#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6", "#F79646"
AZUL_ESCURO, AMARELO, BRANCO = "#1F497D", "#FFFF00", "#FFFFFF"

DOLAR_COMPRA, DOLAR_VENDA = 3697, 3698
PIB_12, PIB_MES = 4192, 4385
DIVIDA_BRUTA, DIVIDA_LIQUIDA, DIVIDA_PUBLICA, DIVIDA_PRIVADA, ATIVOS_RESERVA = 3684, 3685, 21523, 21524, 24039
RESERVAS_TOTAL, M2, BASE_AMPLIADA = 3546, 27842, 1833
COMPOSICAO = [(3548, "Títulos", AZUL), (3549, "Moeda e depósitos", CIANO),
              (3550, "Posição no FMI", ROXO), (3551, "DES", VERMELHO),
              (3552, "Ouro", AMARELO), (3554, "Outros ativos", LARANJA)]
INICIO_RESERVAS = "2001-01"   # a composição começa aqui no SGS
INICIO_REAL = "1994-07"       # o que passa por reais (M2, base, PIB) começa no Plano Real
EVENTOS_RESERVAS = [
    dict(x="2008-09", texto="Falência do\nLehman Brothers"),
    dict(x="2010-05", texto="1º auxílio do FMI\nà Grécia"),
    dict(x="2021-08", texto="FMI distribui US$ 650 bi em DES\nno mundo, US$ 15 bi para o Brasil"),
]
CREDORES = [(21530, "Organismos multilaterais", AZUL), (21531, "Agências governamentais", VERDE),
            (21532, "Bancos", LARANJA), (21533, "Detentores de títulos", CIANO), (21534, "Outros credores", ROXO)]
INICIO_DIVIDA = "2000-Q1"     # antes disso o BC só compilou alguns trimestres


MESES = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
         "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


# --------------------------------------------------------------------------
# a tabela do BC
# --------------------------------------------------------------------------

def baixar(url, tentativas=5, assinatura=b"PK"):
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ftm-dados)"})
            with urllib.request.urlopen(req, timeout=180) as r:
                corpo = r.read()
            if not corpo.startswith(assinatura):     # página de erro no lugar da planilha
                raise RuntimeError("a resposta não é a planilha (%d bytes)" % len(corpo))
            return corpo
        except Exception as e:                    # noqa: BLE001
            ultimo = e
            time.sleep(1.5 * 2 ** i)
    raise RuntimeError("não deu para baixar %s: %s" % (url, ultimo))


def coluna(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n


def celulas_xlsx(conteudo, nome_aba=None):
    """{linha: {coluna: valor}} de uma aba do .xlsx (a primeira, se não disser)."""
    z = zipfile.ZipFile(io.BytesIO(conteudo))
    textos = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")):
            textos.append("".join(t.text or "" for t in si.iter(NS + "t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    aba = next(a for a in ET.fromstring(z.read("xl/workbook.xml")).iter(NS + "sheet")
               if nome_aba is None or a.get("name") == nome_aba)
    alvo = rels[aba.get(RNS + "id")].lstrip("/")
    alvo = alvo if alvo.startswith("xl/") else "xl/" + alvo

    linhas = {}
    for c in ET.fromstring(z.read(alvo)).iter(NS + "c"):
        v = c.find(NS + "v")
        if v is None or v.text is None:
            continue
        val = textos[int(v.text)] if c.get("t") == "s" else v.text
        r = int(re.search(r"\d+", c.get("r")).group(0))
        linhas.setdefault(r, {})[coluna(c.get("r"))] = val
    return linhas


def colunas_de_mes(linhas):
    """{coluna: "aaaa-mm"} pelo cabeçalho: a linha dos meses ("Jan", "Março",
    "Dez"…) e, logo acima, a do ano, que só aparece na primeira coluna de cada
    ano. Devolve também o número da linha dos meses."""
    def mes(v):
        return MESES.get(str(v).strip().lower()[:3])
    lm = next(r for r in sorted(linhas) if sum(1 for v in linhas[r].values() if mes(v)) >= 3)
    def ano(v):
        try:
            a = int(float(str(v).strip()))
        except ValueError:
            return None
        return a if 1900 < a < 2200 else None
    la = next(r for r in range(lm - 1, lm - 4, -1) if any(ano(v) for v in linhas.get(r, {}).values()))
    a, meses = None, {}
    for col in sorted(linhas[lm]):
        a = ano(linhas[la].get(col, "")) or a
        if mes(linhas[lm][col]) and a:
            meses[col] = "%04d-%02d" % (a, mes(linhas[lm][col]))
    return meses, lm


def linha_numerica(cel, meses):
    d = {}
    for col, m in meses.items():
        try:
            d[m] = float(cel[col])
        except (KeyError, ValueError, TypeError):
            pass
    return d


def ler_tabela(conteudo):
    """{código SGS: {"aaaa-mm": valor em US$ milhões}} da primeira aba.
    A coluna "Código no SGS" é procurada pelo texto."""
    linhas = celulas_xlsx(conteudo)
    meses, lm = colunas_de_mes(linhas)
    col_cod = next(col for r in (lm - 1, lm) for col, t in linhas.get(r, {}).items()
                   if "digo no SGS" in str(t))

    series = {}
    for r, cel in linhas.items():
        cod = str(cel.get(col_cod, "")).strip()
        if not cod.isdigit():
            continue
        series.setdefault(int(cod), linha_numerica(cel, meses))       # código repetido: vale a 1ª linha
    return series


# --------------------------------------------------------------------------
# contas
# --------------------------------------------------------------------------

def num(mes):
    a, m = mes.split("-")
    return int(a) * 12 + int(m) - 1


def acumulado(mensal, n):
    """{mês: soma dos n meses até ele}, só onde os n meses existem."""
    ms = sorted(mensal)
    fora = {}
    for i in range(n - 1, len(ms)):
        janela = ms[i - n + 1:i + 1]
        if num(janela[-1]) - num(janela[0]) == n - 1:
            fora[ms[i]] = sum(mensal[m] for m in janela)
    return fora


def comb(*termos):
    """Soma de séries com peso: comb((1, a), (-1, b)) = a − b, nos meses comuns."""
    comuns = set.intersection(*(set(d) for _, d in termos))
    return {m: sum(k * d[m] for k, d in termos) for m in comuns}


def confere(nome, partes, total, folga=0.5):
    """As partes têm de somar o total em todos os meses (US$ milhões)."""
    soma = comb(*[(1, p) for p in partes])
    difs = [abs(soma[m] - total[m]) for m in soma if m in total]
    if not difs:
        raise RuntimeError("%s: nenhum mês em comum" % nome)
    print("  %s: fecha em %d meses, diferença máxima US$ %.3f mi" % (nome, len(difs), max(difs)))
    if max(difs) > folga:
        raise RuntimeError("%s não fecha (máx US$ %.2f mi)" % (nome, max(difs)))


# --------------------------------------------------------------------------
# montagem
# --------------------------------------------------------------------------

def bi(d, inicio=INICIO):
    return {m: v / 1000 for m, v in d.items() if m >= inicio}


def serie(nome, cor, dados, casas=2, **extra):
    return dict(nome=nome, cor=cor, dados=[[m, round(v, casas)] for m, v in sorted(dados.items())], **extra)


def barra(nome, cor, dados, **extra):
    return serie(nome, cor, dados, tipo="barra", **extra)


def grafico(id_, titulo, subtitulo, series, unidade="usd-bi", **extra):
    g = dict(id=id_, titulo=titulo, subtitulo=subtitulo, unidade=unidade, series=series, **extra)
    if g.get("variantes"):
        del g["series"]          # com variantes, as séries vêm de cada uma
    return g


def superavit_deficit(saldo):
    """O saldo em duas séries de barras: o que é positivo e o que é negativo.
    O rótulo do último mês vai na que tem o número."""
    pos = {m: max(v, 0) for m, v in saldo.items()}
    neg = {m: min(v, 0) for m, v in saldo.items()}
    ult = saldo[max(saldo)]
    return [barra("Superávit Balanço de Pagamentos", AZUL, pos, rotulo=ult >= 0),
            barra("Déficit Balanço de Pagamentos", VERMELHO, neg, rotulo=ult < 0)]


def graficos(s, dolar, pib12, pib_mes):
    # séries mensais no sinal dos gráficos (ver o cabeçalho)
    cc, ck, eo = s[COD["cc"]], s[COD["ck"]], s[COD["eo"]]
    reservas = {m: -v for m, v in s[COD["reservas"]].items()}
    cf = comb((-1, s[COD["cf"]]), (1, s[COD["reservas"]]))
    saldo = comb((1, cc), (1, ck), (1, cf), (1, eo))
    id_ext = {m: -v for m, v in s[COD["id_ext"]].items()}
    id_pais = s[COD["id_pais"]]
    cart_ext = {m: -v for m, v in s[COD["cart_ativo"]].items()}
    cart_pais = s[COD["cart_passivo"]]
    outros = comb((-1, s[COD["deriv"]]), (-1, s[COD["outros"]]))

    print("Conferindo as contas…")
    confere("CC + CK + CF + reservas + E&O = 0", [cc, ck, cf, reservas, eo], {m: 0 for m in cc})
    confere("saldo = −reservas", [saldo, reservas], {m: 0 for m in saldo})
    confere("conta corrente", [s[COD[k]] for k in ("comercial", "servicos", "renda1", "renda2")], cc)
    confere("conta capital", [s[COD["ck_anp"]], s[COD["ck_transf"]]], ck)
    confere("conta financeira", [id_ext, id_pais, cart_ext, cart_pais, outros], cf)
    confere("ID no país por componente",
            [s[COD["id_part"]], s[COD["id_reinv"]], s[COD["id_interco"]]], id_pais)
    confere("carteira no mercado doméstico", [s[COD["dom_acoes"]], s[COD["dom_titulos"]]], s[COD["dom"]])
    confere("criptoativos", [s[COD["cripto_ck"]], s[COD["cripto_cf"]]], s[COD["cripto"]])

    a12 = lambda d, ini=INICIO: bi(acumulado(d, 12), ini)       # noqa: E731
    a3 = lambda d, ini=INICIO: bi(acumulado(d, 3), ini)         # noqa: E731
    SUB12, SUB3 = "US$ bilhões, acumulado em 12 meses", "US$ bilhões, acumulado em 3 meses"

    def bp(acc):
        return [barra("Conta Corrente", AZUL, acc(cc), rotulo=True),
                barra("Conta Capital", AMARELO, acc(ck)),
                barra("Conta Financeira", VERDE, acc(cf), rotulo=True),
                barra("Reservas Intern.", LARANJA, acc(reservas), rotulo=True, contorno=True),
                barra("Erros e Omissões", VERMELHO, acc(eo), rotulo=True)]

    def pct_pib(saldo_acc, pib):
        return {m: v / pib[m] * 100 for m, v in saldo_acc.items() if m in pib and m >= INICIO}

    pib3 = acumulado(pib_mes, 3)
    cambio = {m: v for m, v in dolar.items() if m >= INICIO}

    visao = [
        grafico("bp-12m", "Balanço de Pagamentos do Brasil", SUB12, bp(a12), barra=1),
        grafico("bp-3m", "Balanço de Pagamentos do Brasil", SUB3, bp(a3), barra=1),
        grafico("bp-cambio-12m", "Balanço de Pagamentos do Brasil e Taxa de Câmbio", SUB12,
                [dict(x, rotulo=False) for x in bp(a12)] +
                [serie("USD/BRL (dir.)", BRANCO, cambio, 4, dir=True, rotulo=True)],
                barra=1, unidade2="brl-usd"),
        grafico("bp-saldo-12m", "Saldo do Balanço de Pagamentos do Brasil", SUB12,
                superavit_deficit(a12(saldo)), barra=1),
        grafico("bp-saldo-pib-12m", "Saldo do Balanço de Pagamentos",
                "US$ bilhões, acumulado em 12 meses; Superávit/déficit como % do PIB (dir.)",
                [dict(x, rotulo=False) for x in superavit_deficit(a12(saldo))] +
                [serie("Superávit(Déficit)/PIB", BRANCO, pct_pib(acumulado(saldo, 12), pib12), 3,
                       dir=True, rotulo=True)],
                barra=1, unidade2="%", eixo2=dict(min=-6)),     # −6% a 10%, como no slide
        grafico("bp-saldo-pib-3m", "Saldo do Balanço de Pagamentos",
                "US$ bilhões, acumulado em 3 meses; Superávit/déficit como % do PIB (dir.)",
                [dict(x, rotulo=False) for x in superavit_deficit(a3(saldo))] +
                [serie("Superávit(Déficit)/PIB", BRANCO, pct_pib(acumulado(saldo, 3), pib3), 3,
                       dir=True, rotulo=True)],
                barra=1, unidade2="%"),
    ]

    def conta_corrente(acc):
        return [barra("Balança Comercial", AZUL, acc(s[COD["comercial"]])),
                barra("Serviços", VERMELHO, acc(s[COD["servicos"]])),
                barra("Renda Primária", VERDE, acc(s[COD["renda1"]])),
                barra("Renda Secundária", AZUL_ESCURO, acc(s[COD["renda2"]])),
                serie("Saldo Conta Corrente", BRANCO, acc(cc), rotulo=True)]

    corrente = [
        grafico("bp-cc-12m", "Conta Corrente do Brasil", SUB12, conta_corrente(a12), barra=1),
        grafico("bp-cc-3m", "Conta Corrente do Brasil", SUB3, conta_corrente(a3), barra=1),
    ]

    def conta_financeira(acc):
        return [barra("ID no Exterior", AZUL, acc(id_ext)),
                barra("ID no País", VERMELHO, acc(id_pais)),
                barra("Carteira no Exterior", VERDE, acc(cart_ext)),
                barra("Carteira no País", AZUL_ESCURO, acc(cart_pais)),
                barra("Outros + Derivativos", CIANO, acc(outros)),
                serie("Saldo Conta Financeira", BRANCO, acc(cf), rotulo=True)]

    def domestico(acc, ini, nome_acoes):
        return [barra(nome_acoes, LARANJA, acc(s[COD["dom_acoes"]], ini)),
                barra("Títulos de dívida", AZUL, acc(s[COD["dom_titulos"]], ini)),
                serie("Investimento em carteira negociados no mercado doméstico (líquido)", BRANCO,
                      acc(s[COD["dom"]], ini), rotulo=True)]

    def ied_componentes(acc):
        return [barra("Participação no capital", AZUL, acc(s[COD["id_part"]])),
                barra("Lucros reinvestidos", VERDE, acc(s[COD["id_reinv"]])),
                barra("Operações intercompanhia", LARANJA, acc(s[COD["id_interco"]])),
                serie("ID no País", BRANCO, acc(id_pais), rotulo=True)]

    acoes = s[COD["dom_acoes"]]
    financeira = [
        grafico("bp-cf-12m", "Conta Financeira do Brasil", SUB12, conta_financeira(a12), barra=1),
        grafico("bp-cf-3m", "Conta Financeira do Brasil", SUB3, conta_financeira(a3), barra=1),
        grafico("bp-ied-12m", "Investimento Estrangeiro Direto", SUB12,
                [barra("ID no País", VERMELHO, a12(id_pais), rotulo=True),
                 barra("ID no Exterior", AZUL, a12(id_ext), rotulo=True)], barra=1),
        grafico("bp-ied-componentes-12m", "Investimento Direto no País por Componente", SUB12,
                ied_componentes(a12), barra=1),
        grafico("bp-ied-componentes-3m", "Investimento Direto no País por Componente", SUB3,
                ied_componentes(a3), barra=1),
        grafico("bp-carteira-12m", "Investimento em Carteira", SUB12,
                [barra("Carteira no Exterior", CIANO, a12(cart_ext), rotulo=True),
                 barra("Carteira no País", AZUL_ESCURO, a12(cart_pais), rotulo=True)], barra=1),
        grafico("bp-carteira-dom-12m", "Investimento em Carteira no Mercado Doméstico", SUB12,
                domestico(a12, INICIO, "Ações e fundos de investimentos (12m)"), barra=1),
        grafico("bp-carteira-dom-3m", "Investimento em Carteira no Mercado Doméstico", SUB3,
                domestico(a3, INICIO_RECENTE, "Ações e fundos de investimentos (3m)"), barra=1),
        grafico("bp-acoes-fundos", "Investimento em Ações e Fundos de Investimento no Mercado Doméstico",
                "US$ bilhões; mensal, acumulado em 3 meses e acumulado em 12 meses",
                [barra("Ações e fundos de investimentos", VERMELHO, bi(acoes, INICIO_RECENTE), rotulo=True),
                 serie("Ações e fundos de investimentos (3m)", AZUL, a3(acoes, INICIO_RECENTE), rotulo=True),
                 serie("Ações e fundos de investimentos (12m)", VERDE, a12(acoes, INICIO_RECENTE),
                       rotulo=True)]),
    ]

    def conta_capital(acc):
        return [barra("Ativos não financeiros não produzidos", VERDE, acc(s[COD["ck_anp"]])),
                barra("Transferências de capital", CIANO, acc(s[COD["ck_transf"]])),
                serie("Saldo Conta Capital", BRANCO, acc(ck), rotulo=True)]

    capital = [
        grafico("bp-ck-12m", "Conta Capital do Brasil", SUB12, conta_capital(a12), barra=1),
        grafico("bp-ck-3m", "Conta Capital do Brasil", SUB3, conta_capital(a3), barra=1),
    ]

    necessidade = {m: -v for m, v in comb((1, a12(cc)), (1, a12(id_pais))).items()}
    cripto_ck = {m: v for m, v in s[COD["cripto_ck"]].items()}
    cripto_cf = {m: v for m, v in s[COD["cripto_cf"]].items()}
    LEG_CK = "Criptos - Sem passivo correspondente (Conta capital)"
    LEG_CF = "Criptos - Com passivo correspondente (Conta financeira)"
    complementares = [
        grafico("bp-necessidade-curto-prazo", "Necessidade de Capital de Curto Prazo", SUB12,
                [barra("Necessidade de Capital de Curto Prazo (Saldo da Conta Corrente - ID no País)",
                       VERMELHO, necessidade, rotulo=True)], barra=1),
        grafico("bp-criptos-mensal", "Fluxo Externo Líquido Mensal de Criptos", "US$ bilhões",
                [barra(LEG_CK, LARANJA, bi(cripto_ck, INICIO_CRIPTO), casas=3, rotulo=True),
                 barra(LEG_CF, CIANO, bi(cripto_cf, INICIO_CRIPTO), casas=3, rotulo=True)],
                unidade="usd-bi2", barra=1),
        grafico("bp-criptos-12m", "Fluxo Externo Líquido Acumulado de Criptos", SUB12,
                [barra(LEG_CK, LARANJA, a12(cripto_ck, INICIO_CRIPTO_12), casas=3, rotulo=True),
                 barra(LEG_CF, CIANO, a12(cripto_cf, INICIO_CRIPTO_12), casas=3, rotulo=True)], barra=1),
    ]

    return [
        dict(titulo="Visão geral", graficos=visao),
        dict(titulo="Conta corrente", graficos=corrente),
        dict(titulo="Conta financeira", graficos=financeira),
        dict(titulo="Conta capital", graficos=capital),
        dict(titulo="Indicadores complementares", graficos=complementares),
    ]


def trimestre(serie_sgs):
    """{"aaaa-mm": v} do SGS trimestral (mês 01, 04, 07, 10) -> {"aaaa-Qn": v}."""
    return {"%s-Q%d" % (m[:4], (int(m[5:]) - 1) // 3 + 1): v for m, v in serie_sgs.items()}


def fim_de_trimestre(mensal):
    """Mensal -> trimestral, com o valor do último mês do trimestre."""
    return {"%s-Q%d" % (m[:4], int(m[5:]) // 3): v for m, v in mensal.items() if int(m[5:]) % 3 == 0}


def divida_externa(bruta, liquida, publica, privada, reservas, credores, pib12):
    bruta, liquida, publica, privada, reservas = map(trimestre, (bruta, liquida, publica, privada, reservas))
    credores = [(nome, cor, trimestre(d)) for nome, cor, d in credores]
    pib = fim_de_trimestre(pib12)
    # as quebras somam a 3684, salvo entre o 3º tri/2017 e o 4º tri/2018, em
    # que o BC revisou a bruta e não as quebras (até US$ 45 bi de diferença).
    # Fica o aviso; os % usam a soma das partes, que fecha em 100.
    def avisa(nome, partes):
        soma = comb(*[(1, p) for p in partes])
        fora = ["%s (%+.0f)" % (t, soma[t] - bruta[t]) for t in sorted(soma) if t in bruta and abs(soma[t] - bruta[t]) > 1]
        print("  dívida por %s: %s" % (nome, "fecha com a bruta" if not fora else "não fecha em " + ", ".join(fora)))
        return soma
    devedores = avisa("devedor", [publica, privada])
    total_cred = avisa("credor", [d for _, _, d in credores])

    tri = [t for t in sorted(bruta) if t >= INICIO_DIVIDA and t in liquida and t in publica and t in privada]
    tri_at = [t for t in tri if t in reservas]
    tri_cred = [t for t in tri if all(t in d for _, _, d in credores)]
    so = lambda d, ts=tri, k=1: {t: k * d[t] / 1000 for t in ts}         # noqa: E731
    pct = lambda d, base, ts=tri: {t: 100 * d[t] / base[t] for t in ts}  # noqa: E731
    outros = {t: bruta[t] - liquida[t] - reservas[t] for t in tri_at}
    ativos = {t: bruta[t] - liquida[t] for t in tri_at}

    SUB = "US$ bilhões, fim de trimestre"
    PUB, PRI, RES, OUT = "Dívida pública", "Dívida privada", "Reservas internacionais", "Outros ativos"
    passivos = [barra(PUB, AZUL, so(publica)), barra(PRI, CIANO, so(privada))]
    return dict(titulo="Dívida externa", graficos=[
        grafico("bp-divida-externa-liquida", "Dívida Externa Líquida do Brasil",
                SUB + "; acima de zero, o Brasil é devedor externo líquido",
                [barra("Devedor externo líquido", VERMELHO, {t: max(v, 0) for t, v in so(liquida).items()},
                       rotulo=liquida[tri[-1]] >= 0),
                 barra("Credor externo líquido", AZUL, {t: min(v, 0) for t, v in so(liquida).items()},
                       rotulo=liquida[tri[-1]] < 0)],
                trimestral=True),
        grafico("bp-divida-externa-ativos-passivos", "Ativos e Passivos da Dívida Externa",
                SUB + "; a pública inclui a privada com garantia pública; outros ativos são haveres de"
                " bancos e créditos no exterior", [],
                trimestral=True, barra=1, variantes=[
                    dict(rot="Passivos", series=passivos + [
                        serie("Dívida externa bruta", BRANCO, so(bruta), rotulo=True)]),
                    dict(rot="Ativos", series=[
                        barra(RES, LARANJA, so(reservas, tri_at)), barra(OUT, VERDE, so(outros, tri_at)),
                        serie("Ativos totais", BRANCO, so(ativos, tri_at), rotulo=True)]),
                    dict(rot="Ativos e passivos", series=[
                        barra(RES, LARANJA, so(reservas, tri_at)), barra(OUT, VERDE, so(outros, tri_at)),
                        barra(PUB, AZUL, so(publica, tri_at, -1)), barra(PRI, CIANO, so(privada, tri_at, -1)),
                        serie("Ativos menos passivos", BRANCO, so(liquida, tri_at, -1), rotulo=True)]),
                ]),
        grafico("bp-divida-externa-publica-pct", "Dívida Externa Pública",
                "% da dívida externa bruta; inclui a dívida privada com garantia do setor público",
                [serie("Dívida externa pública", AZUL, pct(publica, devedores), rotulo=True)],
                unidade="%", trimestral=True),
        grafico("bp-divida-externa-pib", "Dívida Externa em % do PIB",
                "% do PIB acumulado em 12 meses, em US$, fim de trimestre", [],
                unidade="%", trimestral=True, variantes=[
                    dict(rot="Bruta", series=[serie("Dívida externa bruta", VERMELHO, pct(bruta, pib), rotulo=True)]),
                    dict(rot="Líquida", series=[
                        barra("Dívida externa líquida", VERMELHO, pct(liquida, pib), rotulo=True)]),
                ]),
        grafico("bp-divida-externa-credores", "Dívida Externa Bruta por Credor", "Fim de trimestre", [],
                trimestral=True, barra=1, variantes=[
                    dict(rot="US$ bilhões", series=[barra(n, c, so(d, tri_cred)) for n, c, d in credores]),
                    dict(rot="% do total", unidade="%", eixo=dict(max=100),
                         series=[barra(n, c, pct(d, total_cred, tri_cred)) for n, c, d in credores]),
                ]),
    ])


def achar(linhas, prefixo, depois=0):
    """Número da 1ª linha, depois de `depois`, cujo rótulo começa com `prefixo`."""
    for r in sorted(linhas):
        if r > depois:
            rot = next((str(v).strip() for _, v in sorted(linhas[r].items()) if str(v).strip()), "")
            if rot.startswith(prefixo):
                return r
    raise RuntimeError("a tabela não tem a linha %r" % prefixo)


def servico_divida(conteudo, pib12):
    """Principal e juros vencendo em 12 meses (prazo residual), sem as operações
    intercompanhia, em % do PIB em US$. Aba "Dívida Externa - Prazo Residual"
    da DivExt_T: cada setor tem a linha do total e, logo abaixo, principal e juros."""
    cel = abas_xls(conteudo)["Dívida Externa - Prazo Residual"]
    linhas = {}
    for (r, c), v in cel.items():
        linhas.setdefault(r, {})[c] = v
    meses, _ = colunas_de_mes(linhas)
    ler = lambda r: fim_de_trimestre(linha_numerica(linhas[r], meses))   # noqa: E731
    total, interco = achar(linhas, "Serviço da dívida externa total"), achar(linhas, "Investimento direto")
    for r, rot in ((total + 1, "Principal"), (total + 2, "Juros"), (interco + 1, "Principal"), (interco + 2, "Juros")):
        if not str(linhas[r].get(min(linhas[r]), "")).strip().startswith(rot):
            raise RuntimeError("DivExt_T: esperava %r na linha %d" % (rot, r + 1))
    setores = [achar(linhas, n) for n in ("Governo geral", "Banco Central", "Bancos", "Outros setores")]
    confere("serviço da dívida por setor", [ler(r) for r in setores + [interco]], ler(total), folga=1)

    pib = fim_de_trimestre(pib12)
    principal = comb((1, ler(total + 1)), (-1, ler(interco + 1)))
    juros = comb((1, ler(total + 2)), (-1, ler(interco + 2)))
    tri = [t for t in sorted(principal) if t in juros and t in pib]
    pct = lambda d: {t: 100 * d[t] / pib[t] for t in tri}               # noqa: E731
    return grafico("bp-divida-externa-servico", "Serviço da Dívida Externa em % do PIB",
                   "Principal e juros que vencem em até 12 meses, sem operações intercompanhia; "
                   "% do PIB acumulado em 12 meses, em US$",
                   [barra("Principal", AZUL, pct(principal)), barra("Juros", LARANJA, pct(juros)),
                    serie("Serviço da dívida", BRANCO, pct({t: principal[t] + juros[t] for t in tri}), rotulo=True)],
                   unidade="%", trimestral=True, barra=1)


def divida_externa_governo(conteudo):
    """A dívida externa do governo geral em % da dívida bruta dele (DBGG), da
    aba "R$ milhões" da Divggp. A externa inclui os títulos do mercado
    doméstico em poder de não residentes; o resto é dívida contratada lá fora."""
    linhas = celulas_xlsx(conteudo, "R$ milhões")
    meses, _ = colunas_de_mes(linhas)
    ler = lambda r: linha_numerica(linhas[r], meses)                     # noqa: E731
    externa = achar(linhas, "Dívida externa")
    bruta, ext = ler(achar(linhas, "Dívida bruta do governo geral")), ler(externa)
    titulos = ler(achar(linhas, "Títulos de div. negociados no mercado doméstico", externa))
    ms = [m for m in sorted(ext) if m in bruta and m in titulos]
    pct = lambda f: {m: 100 * f(m) / bruta[m] for m in ms}             # noqa: E731
    return grafico("bp-divida-externa-dbgg", "Dívida Externa do Governo Geral em % da Dívida Bruta",
                   "% da dívida bruta do governo geral (DBGG), fim de mês",
                   [barra("Contratada no exterior", AZUL, pct(lambda m: ext[m] - titulos[m])),
                    barra("Títulos do mercado doméstico com não residentes", CIANO, pct(lambda m: titulos[m])),
                    serie("Dívida externa", BRANCO, pct(lambda m: ext[m]), rotulo=True)],
                   unidade="%", barra=1)


def reservas_internacionais(total, partes, bruta, pib12, m2, base, dolar):
    """Seção das reservas do Brasil, toda do SGS. `partes` é [(nome, cor, {mês: US$ mi})]."""
    confere("composição das reservas", [d for _, _, d in partes], total, folga=2)
    so = lambda d, ini=INICIO_RESERVAS: {m: v / 1000 for m, v in d.items() if m >= ini}   # noqa: E731
    comp = [barra(n, c, so(d)) for n, c, d in partes]
    linha_total = serie("Total", BRANCO, so({m: v for m, v in total.items() if m in partes[0][2]}), rotulo=True)

    # reservas sobre a dívida bruta: a 3684 é anual (dezembro) até 1999 e
    # trimestral depois; as reservas, no último mês de cada ponto
    bruta = trimestre(bruta)
    tot_tri = fim_de_trimestre(total)
    razao = {t: 100 * tot_tri[t] / bruta[t] for t in bruta if t in tot_tri}
    cem = {t: 100 for t in razao}

    meses = lambda *ds: sorted(set.intersection(*(set(d) for d in ds)))       # noqa: E731
    em_reais = {m: total[m] * dolar[m] * 1e3 for m in meses(total, dolar)}   # US$ mi -> R$ mil (M2 e base)
    pct_m2 = {m: 100 * em_reais[m] / m2[m] for m in meses(em_reais, m2)}
    pct_base = {m: 100 * em_reais[m] / base[m] for m in meses(em_reais, base)}
    pct_pib = {m: 100 * total[m] / pib12[m] for m in meses(total, pib12)}
    pct_m2, pct_base, pct_pib = ({m: v for m, v in d.items() if m >= INICIO_REAL} for d in (pct_m2, pct_base, pct_pib))

    return dict(titulo="Reservas internacionais", graficos=[
        grafico("bp-reservas-composicao", "Reservas Internacionais do Brasil: Composição",
                "US$ bilhões, fim de mês, conceito liquidez", [], barra=1, eixo=dict(min=0), variantes=[
                    dict(rot="Total", series=comp + [linha_total]),
                    dict(rot="Sem títulos", series=comp[1:], eventos=EVENTOS_RESERVAS),
                ]),
        grafico("bp-reservas-divida", "Reservas Internacionais em % da Dívida Externa Bruta",
                "Fim de período; anual até 1999, trimestral depois",
                [serie("Reservas internacionais / dívida externa bruta", AZUL, razao, casas=1, area=True,
                       opacidadeArea=0.85, rotulo=True),
                 serie("100%", BRANCO, cem, legenda=False)],
                unidade="%", trimestral=True, buracoMax=4),
        grafico("bp-reservas-moeda", "Reservas Internacionais em % do M2 e da Base Monetária",
                "Reservas convertidas em reais pelo dólar médio do mês; base monetária ampliada; fim de mês",
                [serie("% do M2", AZUL, pct_m2, rotulo=True),
                 serie("% da base monetária ampliada", LARANJA, pct_base, rotulo=True)],
                unidade="%"),
        grafico("bp-reservas-pib", "Reservas Internacionais em % do PIB",
                "% do PIB acumulado em 12 meses, em US$; fim de mês",
                [serie("Reservas internacionais", AZUL, pct_pib,
                       area=True, opacidadeArea=0.85, rotulo=True)],
                unidade="%"),
    ])


def main():
    print("Baixando a tabela do BC…")
    s = ler_tabela(baixar(URL_TABELA))
    falta = [k for k, c in COD.items() if c not in s or not s[c]]
    if falta:
        raise RuntimeError("a tabela do BC não tem: %s" % ", ".join("%s (%d)" % (k, COD[k]) for k in falta))
    ref = max(s[COD["cc"]])
    print("  %d linhas com código SGS, último mês %s" % (len(s), ref))

    print("Baixando câmbio e PIB do SGS…")
    compra, venda = sgs(DOLAR_COMPRA, INICIO_REAL), sgs(DOLAR_VENDA, INICIO_REAL)
    dolar = {m: (compra[m] + venda[m]) / 2 for m in compra if m in venda and m <= ref}
    pib12, pib_mes = sgs(PIB_12, INICIO_REAL), sgs(PIB_MES, INICIO_REAL)

    secoes = graficos(s, dolar, pib12, pib_mes)
    print("Baixando a dívida externa do SGS…")
    d = lambda c: sgs(c, "2000-01")                                  # noqa: E731
    secoes.append(divida_externa(d(DIVIDA_BRUTA), d(DIVIDA_LIQUIDA), d(DIVIDA_PUBLICA), d(DIVIDA_PRIVADA),
                                 d(ATIVOS_RESERVA), [(n, c, d(k)) for k, n, c in CREDORES], pib12))
    print("Baixando as reservas do SGS…")
    reservas_sec = reservas_internacionais(
        sgs(RESERVAS_TOTAL, "1970-01"), [(n, c, sgs(k, INICIO_RESERVAS)) for k, n, c in COMPOSICAO],
        sgs(DIVIDA_BRUTA, "1970-01"), pib12, sgs(M2, INICIO_REAL), sgs(BASE_AMPLIADA, INICIO_REAL), dolar)
    print("Baixando a DivExt_T e a Divggp…")
    secoes[-1]["graficos"] += [divida_externa_governo(baixar(URL_DIVGGP)),
                               servico_divida(baixar(URL_DIVEXT, assinatura=b"\xd0\xcf\x11\xe0"), pib12)]
    secoes.append(reservas_sec)
    doc = dict(
        atualizado=datetime.date.today().isoformat(),
        referencia=ref,
        fonte="BCB e FtM",
        categoria="Balanço de Pagamentos",
        secoes=secoes,
    )
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("gravado %s (%.0f KB), referência %s" % (SAIDA, os.path.getsize(SAIDA) / 1024, ref))
    for sec in secoes:
        print("  %-28s %s" % (sec["titulo"] + ":", ", ".join(g["id"] for g in sec["graficos"])))
        for g in sec["graficos"]:
            for v in g.get("variantes") or [g]:
                ult = ["%s=%s" % (x["nome"][:22], x["dados"][-1][1]) for x in v["series"] if x["dados"]]
                print("      %-30s %s %s" % ((g["id"] + " " + v.get("rot", ""))[:30], v["series"][0]["dados"][-1][0],
                                            "; ".join(ult)))


if __name__ == "__main__":
    main()
