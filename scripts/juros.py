#!/usr/bin/env python3
"""
Monta dados/juros.json — a categoria "Juros no Brasil e nos EUA": o juro real
longo que o mercado contrata nos dois países e o juro real ex-post da taxa
básica de cada um, com o diferencial entre eles.

Uso:
    python3 scripts/juros.py

Só usa a biblioteca padrão. Entra na Action, **depois** do tesouro_direto.py:
a NTN-B 2050 não é baixada de novo aqui, é lida de dados/tesouro-direto.json
(ver "DE ONDE VEM A NTN-B", abaixo).

AS QUATRO CONTAS

  1. **Juro real longo**: a NTN-B 2050 contra o TIPS de 30 anos (DFII30 do
     FRED). As duas são taxas reais de mercado — o papel paga a inflação do
     país mais essa taxa —, mas não são cotadas na mesma convenção, e por isso
     não podem ser comparadas como vêm da fonte. Ver "AS DUAS CONVENÇÕES".
  2. **Diferencial do juro real longo**, pela fórmula de Fisher.
  3. **Juro real ex-post da taxa básica**: a taxa básica efetivamente paga em
     12 meses, descontada a inflação dos mesmos 12 meses. Ex-post é a inflação
     que já aconteceu — não a esperada.
  4. **Diferencial do juro real ex-post**, pela mesma fórmula.

A FÓRMULA DO DIFERENCIAL. Juro não se subtrai, se divide:

    diferencial = (1 + i_br) / (1 + i_us) − 1

e não `i_br − i_us`. A razão é que o diferencial responde "quanto rende a mais",
e render a mais é uma razão entre dois montantes, não a diferença entre duas
taxas. Quem aplica R$ 1 no Brasil termina com (1 + i_br); nos Estados Unidos,
com (1 + i_us) — e o ganho relativo de um sobre o outro é o quociente. A
subtração é uma aproximação que só vale com taxas pequenas. **E ela não erra
sempre para o mesmo lado**, que é o detalhe em que é fácil tropeçar:

    subtração − certo = (i_br − i_us) · i_us / (1 + i_us)

O sinal do erro é o de i_us. Com a taxa americana positiva a subtração
**exagera** o diferencial — 3,30 p.p. onde a conta certa dá 3,19%, em
6/10/2026; com a taxa americana negativa, ela o **encurta**. E isso não é caso
de laboratório: aconteceu em 188 dos 319 meses do gráfico de ex-post e em 407
dos 3.464 dias do de juro real longo. O maior erro de toda a série é
justamente de encurtamento — 0,76 p.p. em set/2022, quando a inflação
americana de 8% deixou o juro real dos Estados Unidos em −6,8%.

Nenhum gráfico desenha a subtração — a decisão dele, e com razão: no juro
longo as duas linhas ficavam a um décimo de ponto uma da outra, encostadas o
gráfico inteiro. O que resta dela é a conferência: o script recalcula a
identidade acima a cada rodada e imprime os dois extremos no log.

O mesmo vale para o lado de dentro da conta ex-post. Juro real não é "juro
menos inflação", é

    (1 + nominal) / (1 + inflação) − 1

Com Selic de 14,63% e IPCA de 4,22% em 12 meses (ago/2026), o real é 9,98% —
não 10,41%. E as duas contas podem ser feitas numa só, porque são a mesma:

    (1 + n_br)/(1 + n_us) ÷ [(1 + π_br)/(1 + π_us)] − 1

dá exatamente o mesmo número que deflacionar cada país e dividir depois. O
script confere essa identidade a cada rodada.

AS DUAS CONVENÇÕES (juro real longo). A taxa da NTN-B é **efetiva anual**: o
preço do papel é o fluxo descontado por (1 + taxa)^(dias úteis/252). Já o
DFII30 é a taxa real de mercado que o Tesouro americano publica "on an
investment basis", ou seja **nominal anual com capitalização semestral** — o
padrão de título americano, que paga cupom duas vezes por ano. Comparar os dois
números crus é erro de convenção, então o TIPS entra aqui convertido:

    efetiva = (1 + y/2)² − 1

São poucos pontos-base (3,35% viram 3,38% em 6/10/2026), mas o diferencial é
uma conta de pontos-base. O subtítulo do gráfico avisa da conversão.

O PRAZO NÃO É O MESMO, e não há como fazer que seja. O DFII30 é de maturidade
constante: 30 anos, todo dia. A NTN-B 2050 é um papel só, que tinha 38 anos de
prazo quando estreou em 2012 e tem 24 agora. Nas duas pontas da amostra a
comparação é entre prazos diferentes — o que não invalida nada, porque a curva
real é quase plana nesse trecho em ambos os países, mas fica dito.

DE ONDE VEM A NTN-B. Do dados/tesouro-direto.json que o scripts/
tesouro_direto.py acabou de gravar, e não do CSV de 14 MB do Tesouro
Transparente outra vez. Dois motivos: o arquivo é grande e a Action já o baixou
no passo anterior; e, principalmente, **a mesma NTN-B 2050 aparece em dois
cartões do site** (aqui e em "NTN-B por vencimento"), e ler da mesma fonte é o
que garante que os dois não se contradigam. O preço disso é meio ponto-base: o
JSON guarda a taxa com duas casas. Se o arquivo estiver velho, o script avisa.

AS SÉRIES

  - **NTN-B 2050** — Tesouro IPCA+ com Juros Semestrais, vencimento 15/08/2050,
    média entre a taxa de compra e a de venda da manhã, de 1/6/2012 (estreia)
    em diante. Diária.
  - **DFII30** — FRED, "Market Yield on U.S. Treasury Securities at 30-Year
    Constant Maturity, Quoted on an Investment Basis, Inflation-Indexed",
    diária desde 22/2/2010.
  - **Selic acumulada no mês** — SGS 4390, em % no mês. É o juro que de fato
    correu, não a meta do Copom: no ex-post o que importa é o que foi pago.
  - **IPCA** — SGS 433, variação mensal em %.
  - **Fed funds** — FRED DFF, a taxa efetiva do overnight americano, dia a dia.
    A rolagem é feita como o mercado faz: juro simples a/360 por dia corrido,
    composto. Não é detalhe: tomar a média mensal do FEDFUNDS e elevar a 1/12
    erra até 0,32 p.p. na taxa de 12 meses.
  - **CPI-U** — FRED CPIAUCNS, índice **sem ajuste sazonal**. É o índice cheio
    que dá a inflação de 12 meses publicada; o CPIAUCSL, ajustado, serve para
    variação mensal e não para esta conta.

POR QUE O EX-POST COMEÇA EM 2000. A conta é possível desde 1987, mas a janela
de 12 meses que termina em jan/2000 é a primeira inteiramente posterior à
flutuação do real (15/1/1999). Nas janelas de 1999 a Selic de 45% da crise
divide a conta com uma inflação que só reagiu meses depois, e o juro real
ex-post do Brasil chega a mais de 25% — número verdadeiro, de um regime que
não existe mais, e que no eixo achataria os 26 anos seguintes. O script imprime
o pico que ficou de fora a cada rodada.

O FIM DA SÉRIE EX-POST é, para cada país, o último mês com inflação publicada
lá — não o último mês com juro: a Selic de setembro já existe e o IPCA de
setembro, não.

E CADA PAÍS ANDA SOZINHO. Out/2025 não tem CPI: a paralisação do governo
americano impediu a coleta de preços e o BLS cancelou o índice daquele mês em
vez de atrasá-lo, de modo que ele não existe e não vai existir. O mês fica
vazio do lado americano, mas o brasileiro continua desenhado — o buraco de lá
não tem por que apagar o dado de cá. O diferencial, que precisa dos dois lados,
fica com o buraco.

A PORTA DO FRED. Duas, e uma delas não serve: a API JSON (api.stlouisfed.org)
exige chave; o CSV do gráfico (fredgraph.csv?id=SERIE) não exige nada e é o
mesmo dado. Usamos o CSV. **Não mande User-Agent de navegador** — o FRED trava
(timeout, não 403) quando a requisição se identifica como um. O MCP que o FRED
lançou em outubro de 2026 (mcp.stlouisfed.org) é para um assistente conversar
com o acervo; aqui, numa Action sem assistente nenhum, o CSV é o caminho.
"""
import csv
import datetime
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA = os.path.join(RAIZ, "dados", "juros.json")
TESOURO = os.path.join(RAIZ, "dados", "tesouro-direto.json")

FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=%s"
SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.%d/dados?formato=json"
HEADERS_SGS = {"User-Agent": "Mozilla/5.0 (ftm-dados)", "Accept": "application/json"}

TIPS30 = "DFII30"
FED_FUNDS = "DFF"
CPI = "CPIAUCNS"
SELIC_MES = 4390
IPCA_MES = 433
IPCA_12M = 13522          # só para conferir a nossa conta de 12 meses

# o cartão e a série de onde sai a NTN-B 2050, em dados/tesouro-direto.json
CARTAO_NTNB, SERIE_NTNB = "td-ntnb-vencimentos", "2050"
# acima disto o arquivo do Tesouro está velho demais para entrar sem aviso
DIAS_DE_ATRASO = 7

# primeira janela de 12 meses inteiramente posterior à flutuação do real
INICIO_EXPOST = "2000-01"
ANO_DA_FLUTUACAO = "1999"

AZUL, VERMELHO, LARANJA, CINZA = "#4F81BD", "#C0504D", "#F79646", "#95A5A6"

FONTE_LONGO = "Tesouro Nacional, FRED (U.S. Treasury) e FtM"
FONTE_EXPOST = "Banco Central, IBGE, FRED (Fed e BLS) e FtM"


# --------------------------------------------------------------------- download

def baixar(url, headers=None, tentativas=5, falha_ok=False):
    """Com `falha_ok`, devolve (None, motivo) em vez de desistir do script —
    é o que deixa o `sgs()` tratar erro de rede e corpo inválido no mesmo laço."""
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=headers or {})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read() if not falha_ok else (r.read(), None)
        except Exception as e:                      # a rede do Actions falha de vez em quando
            ultimo = e
            time.sleep(1.5 * 2 ** i)
    if falha_ok:
        return None, ultimo
    raise SystemExit("não consegui baixar %s: %s" % (url, ultimo))


def fred(serie_id):
    """{'aaaa-mm-dd': valor}, sem os dias que o FRED marca com '.'."""
    texto = baixar(FRED_CSV % serie_id).decode("utf-8-sig")
    linhas = list(csv.reader(io.StringIO(texto)))
    if len(linhas) < 2 or len(linhas[0]) < 2 or serie_id not in linhas[0][1]:
        raise SystemExit("cabeçalho inesperado em %s: %r" % (serie_id, linhas[:1]))
    fora = {}
    for data, valor in (l[:2] for l in linhas[1:] if len(l) >= 2):
        valor = valor.strip()
        if valor in (".", ""):
            continue
        datetime.date.fromisoformat(data)
        fora[data] = float(valor)
    if len(fora) < 100:
        raise SystemExit("%s veio com %d pontos — mudou de formato?" % (serie_id, len(fora)))
    return fora


def sgs(codigo):
    """{'aaaa-mm': valor} para série mensal do SGS.

    O SGS às vezes responde 200 com um objeto de erro no lugar da lista; isso
    conta como falha e é repetido, senão o `for` sobre um dict percorreria as
    chaves e estouraria com "string indices must be integers"."""
    ultimo = None
    for i in range(5):
        bruto, ultimo = baixar(SGS % codigo, HEADERS_SGS, tentativas=2, falha_ok=True)
        try:
            dados = json.loads(bruto) if bruto is not None else None
        except ValueError as e:
            ultimo = e
        else:
            if isinstance(dados, list) and dados:
                fora = {}
                for d in dados:
                    if d.get("valor") in (None, ""):
                        continue
                    _, mes, ano = d["data"].split("/")
                    fora["%s-%s" % (ano, mes)] = float(d["valor"])
                return fora
            if bruto is not None:               # None é falha de rede, já anotada
                ultimo = "corpo inesperado: %.120r" % bruto
        time.sleep(1.5 * 2 ** i)
    raise SystemExit("SGS %d não respondeu uma lista: %s" % (codigo, ultimo))


def ntnb_2050():
    """A NTN-B 2050 como o site já a desenha, de dados/tesouro-direto.json."""
    if not os.path.exists(TESOURO):
        raise SystemExit("falta %s — rode scripts/tesouro_direto.py antes."
                         % os.path.relpath(TESOURO, RAIZ))
    with open(TESOURO, encoding="utf-8") as f:
        doc = json.load(f)
    for sec in doc["secoes"]:
        for g in sec["graficos"]:
            if g["id"] != CARTAO_NTNB:
                continue
            for s in g["series"]:
                if s["nome"] == SERIE_NTNB:
                    return {dia: v for dia, v in s["dados"]}
    raise SystemExit("não achei a série %r do cartão %r em %s — o cartão mudou de nome?"
                     % (SERIE_NTNB, CARTAO_NTNB, os.path.relpath(TESOURO, RAIZ)))


# ----------------------------------------------------------------- as fórmulas

def efetiva_de_semestral(y):
    """Taxa americana "on an investment basis" (semestral) → efetiva anual."""
    return ((1 + y / 200.0) ** 2 - 1) * 100


def real(nominal, inflacao):
    """Fisher: (1+n)/(1+π)−1, com os três em %."""
    return ((1 + nominal / 100.0) / (1 + inflacao / 100.0) - 1) * 100


def diferencial(br, us):
    """(1+i_br)/(1+i_us)−1, com os três em %."""
    return ((1 + br / 100.0) / (1 + us / 100.0) - 1) * 100


# --------------------------------------------------------------- janelas de 12

def meses_ate(fim, n=12):
    a, m = int(fim[:4]), int(fim[5:7])
    fora = []
    for _ in range(n):
        fora.append("%04d-%02d" % (a, m))
        m -= 1
        if m == 0:
            a, m = a - 1, 12
    return list(reversed(fora))


def mes_anterior(mes):
    a, m = int(mes[:4]), int(mes[5:7]) - 1
    return "%04d-%02d" % (a - 1, 12) if m == 0 else "%04d-%02d" % (a, m)


def mes_seguinte(mes):
    a, m = int(mes[:4]), int(mes[5:7]) + 1
    return "%04d-%02d" % (a + 1, 1) if m == 13 else "%04d-%02d" % (a, m)


def acumulado(serie, fim):
    """Composição dos 12 meses até `fim`, em %, de série de variação mensal."""
    p = 1.0
    for m in meses_ate(fim):
        if m not in serie:
            return None
        p *= 1 + serie[m] / 100.0
    return (p - 1) * 100


def acumulado_overnight(diaria, fim):
    """Rolagem do fed funds nos 12 meses até `fim`, em %.

    Como o mercado faz: cada dia corrido rende a taxa cotada pro rata de 360
    dias, e o resultado é composto. O DFF tem cotação para todo dia do
    calendário (a de sexta vale sábado e domingo), então o produto cobre o
    período inteiro sem emenda."""
    ini = meses_ate(fim)[0] + "-01"
    pos = mes_seguinte(fim) + "-01"
    dias = sorted(d for d in diaria if ini <= d < pos)
    if len(dias) < 360:                             # mês incompleto, ou buraco
        return None
    p = 1.0
    for d in dias:
        p *= 1 + diaria[d] / 36000.0
    return (p - 1) * 100


def variacao_12m(indice, fim):
    """Inflação de 12 meses a partir do índice de preços, em %."""
    base = mes_anterior(meses_ate(fim)[0])
    if base not in indice or fim not in indice:
        return None
    return (indice[fim] / indice[base] - 1) * 100


# ------------------------------------------------------ o erro da subtração

def erro_da_formula(geom, arit, taxa_us, rotulo):
    """Compara a subtração com a fórmula certa e confere a identidade

        subtração − certo = (i_br − i_us) · i_us / (1 + i_us)

    O sinal é o de i_us: com a taxa americana positiva a subtração exagera o
    diferencial; com ela negativa, encurta. Por isso o que sai daqui são os
    dois extremos, e não um "erro máximo" só."""
    sobra = {k: arit[k] - geom[k] for k in geom}
    pior = 0.0
    for k in geom:
        u = taxa_us[k] / 100.0
        pior = max(pior, abs(sobra[k] - arit[k] * u / (1 + u)))
    if pior > 1e-9:
        raise SystemExit("a identidade do erro da subtração não fechou: %g" % pior)
    exagera, encurta = max(sobra, key=sobra.get), min(sobra, key=sobra.get)
    fora = dict(
        exagera=sobra[exagera], exagera_quando=rotulo(exagera), exagera_us=taxa_us[exagera],
        encurta=-sobra[encurta], encurta_quando=rotulo(encurta), encurta_us=taxa_us[encurta],
        negativos=sum(1 for k in geom if taxa_us[k] < 0), total=len(geom), identidade=pior,
    )
    fora["resumo"] = (
        "subtração: exagera até %.2f p.p. (%s, taxa americana de %.2f%%) e encurta até "
        "%.2f p.p. (%s, taxa de %.2f%%); %d dos %d pontos com taxa americana negativa; "
        "identidade fecha em %g"
        % (fora["exagera"], fora["exagera_quando"], fora["exagera_us"],
           fora["encurta"], fora["encurta_quando"], fora["encurta_us"],
           fora["negativos"], fora["total"], pior))
    return fora


# ------------------------------------------------------------------- gráficos

def serie(nome, cor, dados, **extra):
    return dict(nome=nome, cor=cor,
                dados=[[k, round(v, 2)] for k, v in sorted(dados.items())], **extra)


def pct(v, casas=2):
    """'9,98%' e '−6,84%' — com sinal de menos de verdade, não hífen."""
    return ("%.*f" % (casas, v)).replace(".", ",").replace("-", "−") + "%"


def pp(v, casas=2):
    """'0,30 p.p.' — só o número leva vírgula; a abreviação já traz o ponto
    final, então quem usa isto no fim de uma frase não acrescenta outro."""
    return ("%.*f" % (casas, v)).replace(".", ",").replace("-", "−") + " p.p."


def mil(n):
    """3464 → '3.464'."""
    return "{:,}".format(n).replace(",", ".")


def dia_br(iso):
    a, m, d = iso.split("-")
    return "%d/%d/%s" % (int(d), int(m), a)


def mes_br(mes):
    nomes = ("jan", "fev", "mar", "abr", "mai", "jun",
             "jul", "ago", "set", "out", "nov", "dez")
    return "%s/%s" % (nomes[int(mes[5:7]) - 1], mes[:4])


def g_longo(ntnb, tips):
    return dict(
        id="juros-longo",
        titulo="O juro real longo no Brasil e nos Estados Unidos",
        subtitulo="Juro real negociado, % a.a.; o TIPS é convertido de capitalização "
                  "semestral para taxa efetiva anual, a convenção da NTN-B",
        unidade="%",
        fonte=FONTE_LONGO,
        diario=True,
        series=[
            serie("Brasil (NTN-B 2050)", VERMELHO, ntnb, rotulo=True),
            serie("Estados Unidos (TIPS 30 anos)", AZUL, tips, rotulo=True),
        ],
    )


def g_longo_dif(geom):
    return dict(
        id="juros-longo-dif",
        titulo="O diferencial de juro real longo",
        subtitulo="(1 + NTN-B 2050) ÷ (1 + TIPS 30 anos) − 1, em % a.a.",
        unidade="%",
        fonte=FONTE_LONGO,
        diario=True,
        series=[serie("Diferencial", LARANJA, geom, rotulo=True)],
    )


def g_expost(br, us):
    return dict(
        id="juros-expost",
        titulo="O juro real ex-post da taxa básica",
        subtitulo="Taxa básica acumulada em 12 meses deflacionada pela inflação do "
                  "período, % a.a.; Selic e IPCA no Brasil, fed funds e CPI nos EUA",
        unidade="%",
        fonte=FONTE_EXPOST,
        series=[
            serie("Brasil (Selic ÷ IPCA)", VERMELHO, br, rotulo=True),
            serie("Estados Unidos (fed funds ÷ CPI)", AZUL, us, rotulo=True),
        ],
    )


def g_expost_dif(geom):
    return dict(
        id="juros-expost-dif",
        titulo="O diferencial do juro real ex-post",
        subtitulo="(1 + juro real do Brasil) ÷ (1 + juro real dos EUA) − 1, em % a.a.",
        unidade="%",
        fonte=FONTE_EXPOST,
        series=[serie("Diferencial", LARANJA, geom, rotulo=True)],
    )


# ----------------------------------------------------------------------- main

def sem_mes_corrente(serie):
    """Tira o mês em curso: o SGS já publica a Selic parcial do mês aberto."""
    hoje = datetime.date.today()
    corte = "%04d-%02d" % (hoje.year, hoje.month)
    return {m: v for m, v in serie.items() if m < corte}


def main():
    t0 = time.time()

    print("NTN-B 2050, de dados/tesouro-direto.json…")
    ntnb = ntnb_2050()
    fim_ntnb = max(ntnb)
    atraso = (datetime.date.today() - datetime.date.fromisoformat(fim_ntnb)).days
    print("  %d pregões, de %s a %s" % (len(ntnb), min(ntnb), fim_ntnb))
    if atraso > DIAS_DE_ATRASO:
        print("  AVISO: o arquivo do Tesouro está %d dias atrasado — rode "
              "scripts/tesouro_direto.py antes deste." % atraso, file=sys.stderr)

    print("FRED…")
    tips_cru = fred(TIPS30)
    dff = fred(FED_FUNDS)
    cpi_diario = fred(CPI)
    for nome, s in ((TIPS30, tips_cru), (FED_FUNDS, dff), (CPI, cpi_diario)):
        print("  %-10s %6d pontos, até %s" % (nome, len(s), max(s)))
    cpi = sem_mes_corrente({d[:7]: v for d, v in cpi_diario.items()})

    print("SGS…")
    selic = sem_mes_corrente(sgs(SELIC_MES))
    ipca = sem_mes_corrente(sgs(IPCA_MES))
    ipca12_bc = sgs(IPCA_12M)
    for nome, s in (("4390 selic", selic), ("433 ipca", ipca), ("13522 ipca12", ipca12_bc)):
        print("  %-14s %4d meses, até %s" % (nome, len(s), max(s)))

    # ---------------- juro real longo
    tips = {d: efetiva_de_semestral(v) for d, v in tips_cru.items()}
    comuns = sorted(set(ntnb) & set(tips))
    if not comuns:
        raise SystemExit("NTN-B e TIPS não têm um dia em comum — as datas mudaram de formato?")
    geom_l = {d: diferencial(ntnb[d], tips[d]) for d in comuns}
    arit_l = {d: ntnb[d] - tips[d] for d in comuns}
    erro_l = erro_da_formula(geom_l, arit_l, tips, dia_br)
    d_fim = comuns[-1]
    print("  longo: %d dias em comum, de %s a %s" % (len(comuns), comuns[0], d_fim))
    print("    em %s: NTN-B %.2f%%, TIPS %.2f%% (cru %.2f%%) → %.2f%% (subtração: %.2f%%)"
          % (d_fim, ntnb[d_fim], tips[d_fim], tips_cru[d_fim], geom_l[d_fim], arit_l[d_fim]))
    print("    %s" % erro_l["resumo"])

    # ---------------- juro real ex-post
    # Cada país por sua conta. Out/2025 não tem CPI — a paralisação do governo
    # americano impediu a coleta de preços e o BLS cancelou o índice daquele mês
    # em vez de atrasá-lo —, e não há razão para o buraco americano apagar
    # também o mês brasileiro. O diferencial, esse, precisa dos dois lados, e
    # fica com o buraco.
    br, us = {}, {}
    for m in sorted(set(selic) | set(cpi)):
        n, pr = acumulado(selic, m), acumulado(ipca, m)
        if None not in (n, pr):
            br[m] = dict(n=n, p=pr, r=real(n, pr))
        n, pr = acumulado_overnight(dff, m), variacao_12m(cpi, m)
        if None not in (n, pr):
            us[m] = dict(n=n, p=pr, r=real(n, pr))
    if not br or not us:
        raise SystemExit("nenhum mês de ex-post — as séries não se encontram")
    r_br = {m: v["r"] for m, v in br.items() if m >= INICIO_EXPOST}
    r_us = {m: v["r"] for m, v in us.items() if m >= INICIO_EXPOST}
    bruto = {m: dict(n_br=br[m]["n"], p_br=br[m]["p"], r_br=br[m]["r"],
                     n_us=us[m]["n"], p_us=us[m]["p"], r_us=us[m]["r"])
             for m in sorted(set(br) & set(us))}
    geom_e = {m: diferencial(v["r_br"], v["r_us"]) for m, v in bruto.items()
              if m >= INICIO_EXPOST}
    arit_e = {m: v["r_br"] - v["r_us"] for m, v in bruto.items() if m >= INICIO_EXPOST}
    erro_e = erro_da_formula(geom_e, arit_e, {m: v["r_us"] for m, v in bruto.items()}, mes_br)
    print("  ex-post: Brasil %d meses até %s, EUA %d meses até %s, diferencial %d meses "
          "até %s (a conta existe desde %s)"
          % (len(r_br), max(r_br), len(r_us), max(r_us), len(geom_e), max(geom_e), min(br)))
    so_br = [m for m in sorted(r_br) if m not in r_us]
    print("    mês do Brasil sem contraparte americana: %s"
          % (", ".join(so_br) if so_br else "nenhum"))
    u = bruto[max(geom_e)]
    print("    em %s: Brasil %.2f%% (Selic %.2f%% ÷ IPCA %.2f%%), EUA %.2f%% "
          "(fed funds %.2f%% ÷ CPI %.2f%%) → %.2f%% (subtração: %.2f%%)"
          % (max(geom_e), u["r_br"], u["n_br"], u["p_br"], u["r_us"], u["n_us"], u["p_us"],
             geom_e[max(geom_e)], arit_e[max(geom_e)]))
    print("    %s" % erro_e["resumo"])
    # o que ficou de fora pelo corte de 2000: o pico de 1999, o ano da
    # flutuação — e, mais atrás, a hiperinflação (51% de juro real em ago/1992)
    antes = {m: v["r"] for m, v in br.items() if m[:4] == ANO_DA_FLUTUACAO}
    m_pico = max(antes, key=antes.get)
    print("    fora do gráfico: pico de %.2f%% em %s" % (antes[m_pico], m_pico))

    # ---------------- conferências
    # 1. a nossa conta de IPCA de 12 meses contra a série que o BC publica.
    # A comparação é entre os dois fatores acumulados, não entre as duas taxas:
    # em jun/1994 o IPCA de 12 meses passava de 4.000%, e ali as duas casas
    # decimais de cada variação mensal viram 0,14 p.p. de diferença no acumulado
    # sem que nada esteja errado. Em termos proporcionais a diferença é a mesma
    # de hoje: um décimo de milésimo.
    pior, onde = 0.0, None
    for m in sorted(br):
        if m in ipca12_bc:
            d = abs((1 + br[m]["p"] / 100) / (1 + ipca12_bc[m] / 100) - 1)
            if d > pior:
                pior, onde = d, m
    if pior > 3e-4:
        raise SystemExit("IPCA de 12 meses difere da série 13522 do BC em %.5f (relativo), "
                         "em %s" % (pior, onde))
    print("  conferido: IPCA de 12 meses bate com a série 13522 do BC em %d meses "
          "(pior caso %.5f em termos relativos, em %s)"
          % (sum(1 for m in br if m in ipca12_bc), pior, onde))

    # 2. a identidade: deflacionar e dividir = dividir e deflacionar
    pior = 0.0
    for m, v in bruto.items():
        direto = diferencial(diferencial(v["n_br"], v["n_us"]),
                             diferencial(v["p_br"], v["p_us"]))
        pior = max(pior, abs(direto - diferencial(v["r_br"], v["r_us"])))
    if pior > 1e-9:
        raise SystemExit("a identidade do diferencial não fechou: %g" % pior)
    print("  conferido: as duas rotas do diferencial dão o mesmo número (%g)" % pior)

    # ---------------- documento
    secoes = [
        dict(titulo="Juro real longo", graficos=[
            g_longo(ntnb, tips),
            g_longo_dif(geom_l),
        ]),
        dict(titulo="Juro real ex-post da taxa básica", graficos=[
            g_expost(r_br, r_us),
            g_expost_dif(geom_e),
        ]),
    ]
    doc = dict(
        atualizado=datetime.date.today().isoformat(),
        referencia=d_fim,
        fonte="Tesouro Nacional, Banco Central, IBGE e FRED (U.S. Treasury, Fed e BLS)",
        categoria="Juros no Brasil e nos EUA",
        secoes=secoes,
    )
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("gravado %s (%.0f KB), referência %s, %.0fs"
          % (os.path.relpath(SAIDA, RAIZ), os.path.getsize(SAIDA) / 1024,
             doc["referencia"], time.time() - t0))
    for sec in secoes:
        print("  %-34s %s" % (sec["titulo"] + ":", ", ".join(g["id"] for g in sec["graficos"])))


if __name__ == "__main__":
    main()
