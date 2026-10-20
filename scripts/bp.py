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

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA = os.path.join(RAIZ, "dados", "bp.json")

URL_TABELA = "https://www.bcb.gov.br/content/estatisticas/Documents/Tabelas_especiais/BalPagM.xlsx"

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
DOLAR_COMPRA, DOLAR_VENDA = 3697, 3698
PIB_12, PIB_MES = 4192, 4385

# Projeção do BC para 2026, Relatório de Política Monetária de setembro de 2026
# (boxe "Projeções para a evolução das contas externas", Tabela 1, coluna
# "Proj. 2026 Atual"), em US$ bilhões. A renda secundária não está na tabela:
# é o que fecha a conta (−60 − 75 + 56 + 85 = +6). Entra em dez/2026 no gráfico
# de 12 meses, que é o acumulado do ano inteiro. Trocar a cada RPM.
PROJ_BC = dict(mes="2026-12", rpm="RPM de setembro de 2026", cc=-60.0, comercial=75.0,
               servicos=-56.0, renda1=-85.0)
PROJ_BC["renda2"] = PROJ_BC["cc"] - PROJ_BC["comercial"] - PROJ_BC["servicos"] - PROJ_BC["renda1"]

# Cores do tema do Office, as mesmas dos slides.
AZUL, VERMELHO, VERDE, ROXO, CIANO, LARANJA = "#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6", "#F79646"
AZUL_ESCURO, AMARELO, BRANCO, CINZA = "#1F497D", "#FFFF00", "#FFFFFF", "#95A5A6"

MESES = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
         "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


# --------------------------------------------------------------------------
# a tabela do BC
# --------------------------------------------------------------------------

def baixar(url, tentativas=5):
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ftm-dados)"})
            with urllib.request.urlopen(req, timeout=180) as r:
                corpo = r.read()
            if not corpo.startswith(b"PK"):          # página de erro no lugar do .xlsx
                raise RuntimeError("a resposta não é um .xlsx (%d bytes)" % len(corpo))
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


def ler_tabela(conteudo):
    """{código SGS: {"aaaa-mm": valor em US$ milhões}} da primeira aba.

    O cabeçalho tem o ano na linha 6 (só na primeira coluna de cada ano) e o
    mês na 7; a coluna "Código no SGS" é procurada pelo texto."""
    z = zipfile.ZipFile(io.BytesIO(conteudo))
    textos = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")):
            textos.append("".join(t.text or "" for t in si.iter(NS + "t")))
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    aba = next(ET.fromstring(z.read("xl/workbook.xml")).iter(NS + "sheet"))
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

    # cabeçalho: acha a linha dos meses (a que tem "Jan") e a do ano, logo acima
    lm = next(r for r in sorted(linhas) if "Jan" in linhas[r].values())
    ano, meses = None, {}
    for col in sorted(linhas[lm]):
        if str(linhas.get(lm - 1, {}).get(col, "")).strip().isdigit():
            ano = int(str(linhas[lm - 1][col]).strip())
        m = MESES.get(str(linhas[lm][col]).strip().lower()[:3])
        if m and ano:
            meses[col] = "%04d-%02d" % (ano, m)
    col_cod = next(col for r in (lm - 1, lm) for col, t in linhas.get(r, {}).items()
                   if "digo no SGS" in str(t))

    series = {}
    for r, cel in linhas.items():
        cod = str(cel.get(col_cod, "")).strip()
        if not cod.isdigit():
            continue
        d = {}
        for col, mes in meses.items():
            try:
                d[mes] = float(cel[col])
            except (KeyError, ValueError):
                pass
        series.setdefault(int(cod), d)       # código repetido: vale a 1ª linha
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
    return dict(id=id_, titulo=titulo, subtitulo=subtitulo, unidade=unidade, series=series, **extra)


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

    def projecao_bc(atual):
        """A projeção do BC em dez/2026: as mesmas cores, apagadas e fora da
        legenda, e uma linha pontilhada do último mês publicado até ela."""
        m, fraco = PROJ_BC["mes"], 0.4
        if m <= max(atual):
            return []                             # o ano já fechou: sai sozinha
        ult = max(atual)
        return [barra("Balança Comercial (proj. BC)", AZUL, {m: PROJ_BC["comercial"]}, opacidade=fraco, legenda=False),
                barra("Serviços (proj. BC)", VERMELHO, {m: PROJ_BC["servicos"]}, opacidade=fraco, legenda=False),
                barra("Renda Primária (proj. BC)", VERDE, {m: PROJ_BC["renda1"]}, opacidade=fraco, legenda=False),
                barra("Renda Secundária (proj. BC)", AZUL_ESCURO, {m: PROJ_BC["renda2"]}, opacidade=fraco,
                      legenda=False),
                serie("Projeção do BC para 2026 (%s)" % PROJ_BC["rpm"], CINZA,
                      {ult: atual[ult], m: PROJ_BC["cc"]}, traco="pontilhado", rotulo=True)]

    cc12 = a12(cc)
    corrente = [
        grafico("bp-cc-12m", "Conta Corrente do Brasil", SUB12, conta_corrente(a12) + projecao_bc(cc12),
                barra=1, buracoMax=5),             # a linha da projeção atravessa os meses vazios
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


def main():
    print("Baixando a tabela do BC…")
    s = ler_tabela(baixar(URL_TABELA))
    falta = [k for k, c in COD.items() if c not in s or not s[c]]
    if falta:
        raise RuntimeError("a tabela do BC não tem: %s" % ", ".join("%s (%d)" % (k, COD[k]) for k in falta))
    ref = max(s[COD["cc"]])
    print("  %d linhas com código SGS, último mês %s" % (len(s), ref))

    print("Baixando câmbio e PIB do SGS…")
    compra, venda = sgs(DOLAR_COMPRA, "1995-01"), sgs(DOLAR_VENDA, "1995-01")
    dolar = {m: (compra[m] + venda[m]) / 2 for m in compra if m in venda and m <= ref}
    pib12, pib_mes = sgs(PIB_12, "1995-01"), sgs(PIB_MES, "1995-01")

    secoes = graficos(s, dolar, pib12, pib_mes)
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
            ult = ["%s=%s" % (x["nome"][:22], x["dados"][-1][1]) for x in g["series"] if x["dados"]]
            print("      %-30s %s %s" % (g["id"], g["series"][0]["dados"][-1][0], "; ".join(ult)))


if __name__ == "__main__":
    main()
