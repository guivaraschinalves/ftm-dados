#!/usr/bin/env python3
"""
Os leilões de títulos públicos do Tesouro Nacional, como seção final da
categoria Dívida Pública. Este arquivo é um **módulo**: quem grava o
dados/divida.json é o scripts/divida.py, que chama `secoes()` daqui.

Uso (só para conferir, imprime um resumo e não grava nada):
    python3 scripts/leiloes.py

Só usa a biblioteca padrão — a leitura do .xlsx é a classe `Planilha` do
divida.py, a mesma do Relatório da Dívida.

A FONTE. "Resultado dos leilões da Dívida Pública Mobiliária Federal Interna",
do Tesouro Transparente (conjunto ds013). O arquivo "todos" traz **uma aba por
ano, de 2000 ao corrente**, e é atualizado a cada leilão — em 9/10/2026 ele já
tinha o pregão do dia 8. São 19.891 leilões.

Existe em .xls e em .xlsx no mesmo caminho; aqui vale o **.xlsx**, que o
`Planilha` lê sem dependência nenhuma. O .xls é BIFF8 e precisaria de xlrd.

AS COLUNAS, que o próprio arquivo nomeia duas vezes (linha 6 em português,
linha 7 em inglês — é a linha em inglês que tira a dúvida das duas últimas):

     2 Data do leilão          7 Data de vencimento   12 Financeiro (R$)
     3 Título                  8 Oferta               13 Venda para Bacen
     4 Tipo de leilão          9 Taxa média              = Quantity to Central Bank
     5 Volta                  10 Taxa de corte        14 Financeiro para Bacen
     6 Data de liquidação     11 Venda                   = Total Amount to Central Bank

Oferta, Venda e Venda para Bacen são **quantidade de títulos**, não reais. O
Financeiro é em reais.

A VENDA AO BANCO CENTRAL NÃO É UMA FATIA DA VENDA PÚBLICA, é colocação **a
mais**. Em 791 das 1.033 linhas em que ela aparece, a quantidade do Bacen é
MAIOR que a vendida ao mercado, e às vezes maior que a própria oferta: em
6/1/2026 o Tesouro ofertou 300 mil NTN-B, vendeu as 300 mil ao mercado e
colocou outras 2 milhões no Banco Central. O preço é o mesmo — o PU das duas
colunas bate até o centavo —, então o que o Bacen leva sai pelo preço que o
leilão formou, mas fora do volume ofertado.

Por isso a fatia do Banco Central é calculada sobre o **total colocado**
(mercado + Bacen), não sobre o financeiro do leilão, e os outros gráficos
(colocação, prazo, perfil) olham só a parte de mercado. O script confere a
cada rodada que os dois PU batem — é esse o invariante, não o de subconjunto.

O QUE NÃO EXISTE AQUI, e por isso não há gráfico disso: **a demanda**. O
arquivo traz o que foi ofertado e o que foi vendido, nunca o total proposto
pelo mercado. Sem demanda não há *bid-to-cover*; o que dá para medir é a
**colocação** (vendido ÷ ofertado), que é o termômetro possível.

E a diferença entre taxa de corte e taxa média é praticamente zero — mediana
de 0,0 ponto-base e máximo de 0,4 em 19 mil leilões. As taxas vêm arredondadas
a quatro casas da fração, e a dispersão se perde no arredondamento. Por isso
não há gráfico de cauda de leilão: seria uma linha reta em zero.

A LFT FICA FORA DO GRÁFICO DE TAXA. A "taxa" dela não é juro, é ágio/deságio
sobre a Selic — 0,1065% em jan/2026, contra 12,8% de uma NTN-F no mesmo mês.
No mesmo eixo, as outras três viram uma linha colada no topo.
"""
import datetime
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from divida import (Planilha, AZUL, VERMELHO, VERDE, ROXO, CIANO, LARANJA,  # noqa: E402
                    CINZA, AZUL_ESCURO, VINHO, OLIVA, AREIA, PETROLEO, AMARELO,
                    MESES)

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ARQUIVO = os.path.join(RAIZ, "dados", "leiloes-tesouro.xlsx")
URL = ("https://sisweb.tesouro.gov.br/apex/cosis/rleiloes/arquivos/todos/desc/"
       "historico-leiloes-todos.xlsx")
# acima disto o arquivo em disco é rebaixado
HORAS_DE_VALIDADE = 6

# coluna → o que é
DATA, TITULO, TIPO, VOLTA, LIQUIDACAO, VENCIMENTO = 2, 3, 4, 5, 6, 7
OFERTA, TAXA_MEDIA, TAXA_CORTE, VENDA, FINANCEIRO = 8, 9, 10, 11, 12
VENDA_BC, FINANCEIRO_BC = 13, 14

# os quatro papéis que existem hoje; NTN-C e NTN-D entram no perfil, mas não
# ganham linha própria — a NTN-C parou de ser emitida em 2006 e a NTN-D, em 2002
PAPEIS = [("LTN", VERMELHO), ("NTN-F", AZUL), ("NTN-B", VERDE), ("LFT", LARANJA)]
# como o perfil agrupa: cada papel pelo que corrige o principal
FAMILIA = {"LFT": "Pós-fixado (Selic)", "LTN": "Prefixado", "NTN-F": "Prefixado",
           "NTN-B": "Índice de preços", "NTN-C": "Índice de preços",
           "NTN-D": "Câmbio"}
CORES_FAMILIA = {"Pós-fixado (Selic)": LARANJA, "Prefixado": AZUL,
                 "Índice de preços": VERDE, "Câmbio": CINZA}
ANO = 365.25

# Os papéis que ganham cartão de taxa por vencimento, e o ano a partir do qual
# um vencimento conta como "em oferta".
POR_VENCIMENTO = ["LTN", "NTN-F", "NTN-B"]
DESDE = 2024
# até treze linhas num cartão só: a curva inteira em oferta, uma cor por prazo
PALETA = [VERMELHO, LARANJA, AMARELO, OLIVA, VERDE, PETROLEO, CIANO,
          AZUL, AZUL_ESCURO, ROXO, VINHO, AREIA, CINZA]


def baixar():
    """O arquivo do Tesouro, com cache em disco de algumas horas."""
    if os.path.exists(ARQUIVO):
        idade = (time.time() - os.path.getmtime(ARQUIVO)) / 3600
        if idade < HORAS_DE_VALIDADE:
            return ARQUIVO
    req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0 (ftm-dados)"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            bruto = r.read()
    except Exception as e:
        if os.path.exists(ARQUIVO):
            print("  aviso: não baixei o arquivo novo (%s); vale o que está em disco" % e,
                  file=sys.stderr)
            return ARQUIVO
        raise SystemExit("não consegui baixar %s: %s" % (URL, e))
    os.makedirs(os.path.dirname(ARQUIVO), exist_ok=True)
    with open(ARQUIVO, "wb") as f:
        f.write(bruto)
    return ARQUIVO


def dia(serial):
    return datetime.date(1899, 12, 30) + datetime.timedelta(days=int(serial))


def ler():
    """[dict] por leilão, com datas já convertidas e números já em float."""
    pl = Planilha(baixar())
    fora = []
    for aba in pl.abas:
        if not aba.lower().startswith("ano"):
            continue
        grade = pl.grade(aba)
        for linha in sorted(grade):
            c = grade[linha]
            if not isinstance(c.get(DATA), float) or TITULO not in c:
                continue                       # cabeçalho, nota de rodapé, vazio
            def n(col):
                v = c.get(col)
                return float(v) if isinstance(v, float) else 0.0
            fora.append(dict(
                data=dia(c[DATA]), titulo=str(c[TITULO]).strip(),
                tipo=str(c.get(TIPO, "")).strip(), volta=str(c.get(VOLTA, "")).strip(),
                liquidacao=dia(c[LIQUIDACAO]) if isinstance(c.get(LIQUIDACAO), float) else None,
                vencimento=dia(c[VENCIMENTO]) if isinstance(c.get(VENCIMENTO), float) else None,
                oferta=n(OFERTA), taxa=n(TAXA_MEDIA) * 100, corte=n(TAXA_CORTE) * 100,
                venda=n(VENDA), financeiro=n(FINANCEIRO),
                venda_bc=n(VENDA_BC), financeiro_bc=n(FINANCEIRO_BC)))
    if len(fora) < 15000:
        raise SystemExit("só %d leilões — o arquivo mudou de formato?" % len(fora))
    return fora


# ------------------------------------------------------------- as agregações

def mes(d):
    return "%04d-%02d" % (d.year, d.month)


def so_venda(leiloes):
    """Leilões em que o Tesouro vende (inclui a 2.ª volta e os extras).

    Compra e troca ficam de fora: na compra o Tesouro está do outro lado do
    balcão, e na troca não há dinheiro novo — misturar as três num índice de
    colocação não quer dizer nada."""
    return [l for l in leiloes if "Venda" in l["tipo"]]


def razao_mensal(leiloes, cima, baixo, papeis=None):
    """{papel: {'AAAA-MM': 100 * Σcima / Σbaixo}} — só meses com denominador.

    Linha sem denominador fica fora **inteira**, numerador junto: 159 segundas
    voltas entre 2003 e 2007 registram venda com a oferta em branco, e somar
    essa venda a um denominador que não a inclui inflaria a colocação."""
    acc = {}
    for l in leiloes:
        if papeis and l["titulo"] not in papeis:
            continue
        if l[baixo] <= 0:
            continue
        a = acc.setdefault(l["titulo"], {}).setdefault(mes(l["data"]), [0.0, 0.0])
        a[0] += l[cima]
        a[1] += l[baixo]
    return {p: {m: 100 * c / b for m, (c, b) in v.items() if b}
            for p, v in acc.items()}


def media_ponderada_mensal(leiloes, valor, peso, papeis=None, chave=None):
    """{papel: {'AAAA-MM': média de `valor` ponderada por `peso`}}."""
    acc = {}
    for l in leiloes:
        if papeis and l["titulo"] not in papeis:
            continue
        v, w = (chave(l) if chave else l[valor]), l[peso]
        if w <= 0 or v is None:
            continue
        a = acc.setdefault(l["titulo"], {}).setdefault(mes(l["data"]), [0.0, 0.0])
        a[0] += v * w
        a[1] += w
    return {p: {m: s / w for m, (s, w) in v.items() if w} for p, v in acc.items()}


def prazo_anos(l):
    """Prazo do papel vendido, em anos, do dia da liquidação ao vencimento."""
    if not l["liquidacao"] or not l["vencimento"]:
        return None
    return (l["vencimento"] - l["liquidacao"]).days / ANO


def confere(leiloes):
    """O que o Banco Central leva sai pelo mesmo preço do leilão: o PU das duas
    colunas tem de bater. É esse o invariante — a quantidade do Bacen não é
    fatia da venda pública e pode ser maior que ela."""
    fora, total = [], 0
    for l in leiloes:
        if min(l["venda_bc"], l["venda"], l["financeiro"], l["financeiro_bc"]) <= 0:
            continue
        total += 1
        d = abs((l["financeiro_bc"] / l["venda_bc"]) / (l["financeiro"] / l["venda"]) - 1)
        if d > 1e-4:
            fora.append((d, l))
    # O PU bate exatamente em todos os anos menos 2002, que tem um ponto solto
    # (uma LTN de 28/5, 21% fora). Um punhado de linhas tortas num arquivo de
    # 2002 é ruído de digitação; dezenas seriam outra coisa, e aí vale parar.
    if len(fora) > 5:
        pior = max(fora)[0]
        raise SystemExit("o PU do Bacen não bate em %d de %d linhas (pior %.4f)"
                         % (len(fora), total, pior))
    for d, l in sorted(fora, key=lambda x: -x[0]):
        print("  aviso: PU do Bacen %.1f%% fora do PU do leilão em %s %s"
              % (100 * d, l["data"], l["titulo"]), file=sys.stderr)
    return len(fora), total


# ---------------------------------------------------------------- os gráficos

def ordem(chave):
    """No eixo mensal a chave é "AAAA-MM" e a ordem de texto serve; no de
    categorias ela é o índice da coluna, e aí "10" viria antes de "2"."""
    return (0, int(chave), "") if chave.isdigit() else (1, 0, chave)


def serie(nome, cor, dados, casas=2, **extra):
    return dict(nome=nome, cor=cor,
                dados=[[m, round(v, casas)] for m in sorted(dados, key=ordem)
                       for v in [dados[m]]], **extra)


def g_colocacao(vendas):
    por = razao_mensal(vendas, "venda", "oferta", [p for p, _ in PAPEIS])
    return dict(
        id="divida-leilao-colocacao",
        titulo="Quanto do ofertado o Tesouro consegue colocar",
        subtitulo="Quantidade vendida ÷ ofertada nos leilões de venda, por mês e por "
                  "papel, em %; inclui 1.ª e 2.ª voltas",
        unidade="%", selecao=True,
        series=[serie(p, cor, por[p], rotulo=True) for p, cor in PAPEIS if por.get(p)],
    )


def g_taxa(vendas):
    sem_lft = [p for p, _ in PAPEIS if p != "LFT"]
    por = media_ponderada_mensal(vendas, "taxa", "financeiro", sem_lft)
    return dict(
        id="divida-leilao-taxa",
        titulo="A taxa que o Tesouro contratou nos leilões",
        subtitulo="Taxa média do leilão ponderada pelo financeiro, por mês e por papel, "
                  "% a.a.; a NTN-B é taxa real e a LFT fica fora por ser ágio sobre a Selic",
        unidade="%", eixo=dict(zero=False), selecao=True,
        series=[serie(p, cor, por[p], rotulo=True)
                for p, cor in PAPEIS if p in sem_lft and por.get(p)],
    )


def g_prazo(vendas):
    por = media_ponderada_mensal(vendas, None, "financeiro", [p for p, _ in PAPEIS],
                                 chave=prazo_anos)
    todos = media_ponderada_mensal(vendas, None, "financeiro", chave=prazo_anos)
    geral = {}
    acc = {}
    for l in vendas:
        pz = prazo_anos(l)
        if pz is None or l["financeiro"] <= 0:
            continue
        a = acc.setdefault(mes(l["data"]), [0.0, 0.0])
        a[0] += pz * l["financeiro"]
        a[1] += l["financeiro"]
    geral = {m: s / w for m, (s, w) in acc.items() if w}
    series = [serie("Todos os papéis", CINZA, geral, rotulo=True, largura=5)]
    series += [serie(p, cor, por[p], rotulo=True) for p, cor in PAPEIS if por.get(p)]
    return dict(
        id="divida-leilao-prazo",
        titulo="O prazo do que foi vendido em leilão",
        subtitulo="Anos entre a liquidação e o vencimento, ponderado pelo financeiro de "
                  "cada leilão, por mês",
        unidade="anos", selecao=True, series=series,
    )


def g_perfil(vendas):
    """Composição do financeiro por família de indexador, em % e por ano."""
    acc, anos = {}, set()
    for l in vendas:
        fam = FAMILIA.get(l["titulo"])
        if not fam or l["financeiro"] <= 0:
            continue
        a = str(l["data"].year)
        anos.add(a)
        acc.setdefault(fam, {}).setdefault(a, 0.0)
        acc[fam][a] += l["financeiro"]
    # a chave de cada ponto é a POSIÇÃO do ano na lista de categorias: é assim
    # que o app.js desenha uma coluna por rótulo. Com o ano como chave, ele
    # procuraria categorias[2000] e o eixo sairia sem rótulo nenhum.
    anos = sorted(anos)
    pos = {a: str(i) for i, a in enumerate(anos)}
    total = {a: sum(acc[f].get(a, 0.0) for f in acc) for a in anos}
    pilha = ["Pós-fixado (Selic)", "Prefixado", "Índice de preços", "Câmbio"]
    return dict(
        id="divida-leilao-perfil",
        titulo="O perfil do que o Tesouro vendeu em leilão",
        subtitulo="Participação de cada indexador no financeiro vendido no ano, em %",
        unidade="%", categorias=anos,
        series=[dict(nome=f, cor=CORES_FAMILIA[f], tipo="barra",
                     dados=[[pos[a], round(100 * acc[f].get(a, 0.0) / total[a], 2)]
                            for a in anos if total[a]])
                for f in pilha if f in acc],
    )


def g_bacen(vendas):
    """Por ano, não por mês: mês a mês a fatia pula de 0% a 77% e o desenho
    vira ruído — a venda ao Banco Central é episódica, acontece em alguns
    leilões do mês e não em todos."""
    acc = {}
    for l in vendas:
        if l["financeiro"] <= 0:
            continue
        a = acc.setdefault(str(l["data"].year), [0.0, 0.0])
        a[0] += l["financeiro_bc"]
        a[1] += l["financeiro"]
    anos = sorted(acc)
    pos = {a: str(i) for i, a in enumerate(anos)}
    fatia = {pos[a]: 100 * bc / (tot + bc) for a, (bc, tot) in acc.items() if tot + bc}
    valor = {pos[a]: bc / 1e9 for a, (bc, tot) in acc.items()}
    return dict(
        id="divida-leilao-bacen",
        titulo="Quanto da colocação vai para o Banco Central",
        subtitulo="Venda direta ao Banco Central em % de tudo que o Tesouro colocou "
                  "no ano (mercado + Bacen); é colocação adicional, pelo preço do leilão",
        unidade="%", categorias=anos,
        variantes=[
            dict(rot="% da colocação", unidade="%",
                 series=[serie("Fatia do Banco Central", ROXO, fatia, tipo="barra")]),
            dict(rot="R$ bilhões", unidade="bi",
                 series=[serie("Vendido ao Banco Central", ROXO, valor, 1, tipo="barra")]),
        ],
    )


def g_taxa_por_vencimento(vendas, hoje):
    """A taxa de corte de cada vencimento em oferta, leilão a leilão.

    É a taxa de CORTE, não a média: é a que o mercado acompanha, porque é o
    pior preço que o Tesouro aceitou — e é a que as tabelas de leilão que
    circulam publicam. A diferença para a média é de meio ponto-base.

    Entram os vencimentos leiloados desde %d que ainda não venceram; os já
    vencidos encurtariam o cartão sem acrescentar nada. Só 1.ª volta: a 2.ª
    sai pela mesma taxa e duplicaria o ponto.""" % DESDE
    variantes = []
    for papel in POR_VENCIMENTO:
        linhas = [l for l in vendas
                  if l["titulo"] == papel and l["corte"] > 0 and "1.ª" in l["volta"]
                  and l["data"].year >= DESDE and l["vencimento"] > hoje]
        vencs = sorted({l["vencimento"] for l in linhas})
        if not vencs:
            continue
        series = []
        for i, v in enumerate(vencs):
            pontos = {l["data"].isoformat(): l["corte"] for l in linhas if l["vencimento"] == v}
            # o rótulo é o vencimento em português: "jan/31", não "Jan/31"
            series.append(dict(nome="%s/%s" % (MESES[v.month - 1], str(v.year)[-2:]),
                               cor=PALETA[i % len(PALETA)],
                               dados=[[d, round(x, 4)] for d, x in sorted(pontos.items())]))
        variantes.append(dict(rot=papel, series=series, unidade="%", selecao=True))
    return dict(
        id="divida-leilao-taxa-vencimento",
        titulo="A taxa de corte, vencimento a vencimento",
        subtitulo="Taxa de corte de cada leilão de 1.ª volta, por vencimento em oferta, "
                  "% a.a.; na NTN-B é taxa real",
        unidade="%", diario=True, eixo=dict(zero=False),
        # o padrão do eixo diário corta a linha em buraco de mais de 6 dias, o
        # que faz sentido para cotação de todo pregão e nenhum para leilão: o
        # mesmo vencimento volta a leilão a cada 7 ou 14 dias (1.045 dos 1.201
        # intervalos desde 2024), e com 6 a linha virava poeira — 98% dos
        # trechos cortados. Com 28 a cadência fica ligada e as 25 ausências de
        # verdade, em que o papel saiu de oferta, continuam aparecendo.
        buracoMax=28,
        variantes=variantes,
    )


# ------------------------------------------------- o acervo da Anbima

# A taxa indicativa do mercado secundário, que é a régua certa para dizer se o
# Tesouro pagou caro num leilão. O arquivo diário é público e não pede
# cadastro — mas o nome é aammdd, não ddmmaa, e **a Anbima só guarda cerca de
# um mês**: 15/09/2026 responde, 01/09/2026 já é 404. Por isso existe este
# acervo: cada rodada baixa os dias que faltam da janela e acumula num JSON
# versionado. Dia não arquivado é dia perdido para sempre.
#
# O acervo ainda não vira gráfico: com um mês de história não dá. Ele existe
# para que daqui a alguns meses dê.
ANBIMA_URL = "https://www.anbima.com.br/informacoes/merc-sec/arqs/ms%s.txt"
ANBIMA_ACERVO = os.path.join(RAIZ, "dados", "anbima-indicativas.json")
ANBIMA_JANELA = 40                      # dias corridos para trás que valem tentar
ANBIMA_PAPEIS = ("LTN", "NTN-F", "NTN-B")
NAVEGADOR_ANBIMA = {"User-Agent": "Mozilla/5.0 (ftm-dados)"}


def arquivar_anbima(hoje):
    """Baixa os dias que faltam da janela e devolve o acervo inteiro."""
    import urllib.error
    import urllib.request
    try:
        with open(ANBIMA_ACERVO, encoding="utf-8") as f:
            acervo = json.load(f)
    except (IOError, ValueError):
        acervo = {}
    novos = faltaram = 0
    for n in range(ANBIMA_JANELA):
        d = hoje - datetime.timedelta(days=n)
        if d.weekday() >= 5 or d.isoformat() in acervo:
            continue
        req = urllib.request.Request(ANBIMA_URL % d.strftime("%y%m%d"),
                                     headers=NAVEGADOR_ANBIMA)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                bruto = r.read().decode("latin-1")
        except urllib.error.HTTPError as e:
            if e.code == 404:           # feriado, ou dia fora da janela deles
                faltaram += 1
                continue
            raise
        except Exception as e:
            print("  Anbima %s: %s" % (d, e), file=sys.stderr)
            continue
        dia = {}
        for linha in bruto.splitlines():
            c = linha.split("@")
            if len(c) > 7 and c[0] in ANBIMA_PAPEIS:
                try:
                    venc = datetime.datetime.strptime(c[4], "%Y%m%d").date()
                    dia["%s|%s" % (c[0], venc.isoformat())] = float(c[7].replace(",", "."))
                except ValueError:
                    continue
        if dia:
            acervo[d.isoformat()] = dia
            novos += 1
        time.sleep(0.4)
    if novos:
        with open(ANBIMA_ACERVO, "w", encoding="utf-8") as f:
            json.dump(acervo, f, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
            f.write("\n")
    dias = sorted(acervo)
    print("  Anbima: %d dias no acervo (%s a %s), %d novos, %d sem arquivo"
          % (len(dias), dias[0] if dias else "—", dias[-1] if dias else "—",
             novos, faltaram))
    return acervo


def secoes():
    """A seção de leilões, para o divida.py pôr no fim de dados/divida.json."""
    leiloes = ler()
    vendas = so_venda(leiloes)
    fora, conferidas = confere(leiloes)
    dias = sorted({l["data"] for l in leiloes})
    print("  leilões: %d (%d de venda), de %s a %s" %
          (len(leiloes), len(vendas), dias[0], dias[-1]))
    try:
        arquivar_anbima(datetime.date.today())
    except Exception as e:                 # acervo é acúmulo, não bloqueia nada
        print("  Anbima falhou: %s" % e, file=sys.stderr)
    print("  conferido: o Bacen paga o preço do leilão em %d de %d linhas"
          % (conferidas - fora, conferidas))
    return [dict(titulo="Leilões", graficos=[
        g_colocacao(vendas), g_taxa(vendas), g_taxa_por_vencimento(vendas, dias[-1]),
        g_prazo(vendas), g_perfil(vendas), g_bacen(vendas),
    ])]


if __name__ == "__main__":
    for sec in secoes():
        for g in sec["graficos"]:
            series = g.get("series") or g["variantes"][0]["series"]
            print("  %-26s %-52s %s" % (g["id"], g["titulo"][:50],
                  ", ".join("%s(%d)" % (s["nome"], len(s["dados"])) for s in series)))
