#!/usr/bin/env python3
"""
Baixa as séries do IPCA (BCB/SGS e IBGE/SIDRA), faz as mesmas contas da
planilha do IPCA e grava dados/ipca.json — tudo o que o site desenha.

Uso:
    python3 scripts/atualizar.py

Só usa a biblioteca padrão. Roda todo dia pela Action em
.github/workflows/atualizar.yml; localmente, é o mesmo comando.

As contas ("as fórmulas da planilha") estão todas aqui, uma função por gráfico:

  - acumulado em 12 meses: produto de (1 + variação mensal) nos últimos 12
    meses, menos 1. É o que a planilha faz para núcleos e classificações; para
    o IPCA cheio usa-se a série 13522, já acumulada pelo BCB (como na macro).
  - média dos núcleos: média simples do acumulado em 12 meses dos cinco
    núcleos que o BC usa — EX0, EX3, MS, DP e P55.
  - contribuição por grupo: peso mensal × variação mensal de cada grupo
    (SIDRA 7060), encadeada — a contribuição de cada mês é corrigida pela
    inflação dos meses seguintes da janela. Assim a soma dos grupos bate com o
    IPCA acumulado da janela.
"""
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA = os.path.join(RAIZ, "dados", "ipca.json")

INICIO = "1998-01"   # 12 meses antes do primeiro mês desenhado (jan/1999)

# Cores do tema do Office que a planilha usa nos gráficos originais.
AZUL, VERMELHO, VERDE, ROXO, CIANO, LARANJA = "#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6", "#F79646"
AZUL_ESCURO, VINHO, OLIVA, AMARELO, BRANCO = "#1F497D", "#632523", "#77933C", "#FFFF00", "#FFFFFF"

HEADERS = {"User-Agent": "Mozilla/5.0 (ftm-dados)", "Accept": "application/json"}


# --------------------------------------------------------------------------
# download
# --------------------------------------------------------------------------

def http_json(url, tentativas=6):
    """GET com espera crescente (1,5s, 3s, 6s… até ~24s), como a macro. Não insiste
    em 404. O SGS às vezes responde 200 com corpo vazio quando está sobrecarregado;
    isso conta como falha e é repetido."""
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            ultimo = e
        except Exception as e:  # rede, timeout, JSON truncado
            ultimo = e
        time.sleep(1.5 * 2 ** i)
    raise RuntimeError(f"{url} falhou {tentativas} vezes: {ultimo}")


def sgs(codigo, inicio=INICIO):
    """Série do SGS como {'aaaa-mm': valor}; vale o último dado de cada mês.

    O SGS só aceita janelas de até 10 anos para séries diárias (a 432, por
    exemplo), então a busca é sempre feita em blocos de 10 anos."""
    ano_ini = int(inicio[:4])
    hoje = datetime.date.today()
    saida = {}
    for a in range(ano_ini, hoje.year + 1, 10):
        di = f"01/01/{a}" if a > ano_ini else f"01/{inicio[5:7]}/{a}"
        df = f"31/12/{min(a + 9, hoje.year)}"
        url = (f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"
               f"?formato=json&dataInicial={di}&dataFinal={df}")
        try:
            dados = http_json(url)
        except urllib.error.HTTPError as e:
            if e.code == 404:   # bloco sem dados (série que começa depois)
                continue
            raise
        for d in dados:
            dia, mes, ano = d["data"].split("/")
            if d.get("valor") not in (None, ""):
                saida[f"{ano}-{mes}"] = float(d["valor"])
        time.sleep(0.35)
    if not saida:
        raise RuntimeError(f"SGS {codigo}: nenhum dado")
    # a 432 vem registrada até a data da próxima reunião do Copom: corta o futuro
    este_mes = hoje.strftime("%Y-%m")
    return {m: v for m, v in sorted(saida.items()) if m <= este_mes}


# Grupos do IPCA na classificação 315 da tabela 7060 do SIDRA
GRUPOS = [
    ("7170", "Alimentação e bebidas", AZUL),
    ("7445", "Habitação", VERMELHO),
    ("7486", "Artigos de residência", VERDE),
    ("7558", "Vestuário", CIANO),
    ("7625", "Transportes", LARANJA),
    ("7660", "Saúde e cuidados pessoais", AZUL_ESCURO),
    ("7712", "Despesas pessoais", VINHO),
    ("7766", "Educação", ROXO),
    ("7786", "Comunicação", AMARELO),
]


def sidra_composicao():
    """Variação mensal (v63) e peso mensal (v66) de cada grupo, desde jan/2020.

    Devolve {grupo: {'aaaa-mm': (variacao, peso)}}."""
    url = ("https://apisidra.ibge.gov.br/values/t/7060/n1/1/v/63,66/p/all/c315/"
           + ",".join(g for g, _, _ in GRUPOS) + "/d/v63%202,v66%204")
    bruto = http_json(url)
    tmp = {}
    for linha in bruto[1:]:
        v = linha.get("V")
        if v in (None, "", "...", "-", ".."):
            continue
        per, grupo, var = linha["D3C"], linha["D4C"], linha["D2C"]
        chave = (grupo, f"{per[:4]}-{per[4:]}")
        tmp.setdefault(chave, {})[var] = float(v)
    saida = {}
    for (grupo, mes), d in tmp.items():
        if "63" in d and "66" in d:
            saida.setdefault(grupo, {})[mes] = (d["63"], d["66"])
    return saida


# --------------------------------------------------------------------------
# contas
# --------------------------------------------------------------------------

def mes_seguinte(m):
    a, b = int(m[:4]), int(m[5:])
    return f"{a + (b == 12)}-{b % 12 + 1:02d}"


def meses_entre(ini, fim):
    m = ini
    while m <= fim:
        yield m
        m = mes_seguinte(m)


def acumulado(mensal, janela=12):
    """Variação acumulada em N meses (em %), a partir da variação mensal (em %).
    Só existe quando os N meses da janela têm dado."""
    meses = sorted(mensal)
    saida = {}
    for i in range(janela - 1, len(meses)):
        bloco = meses[i - janela + 1:i + 1]
        # a janela precisa ser contínua (sem mês faltando no meio)
        if list(meses_entre(bloco[0], bloco[-1])) != bloco:
            continue
        p = 1.0
        for m in bloco:
            p *= 1 + mensal[m] / 100
        saida[meses[i]] = (p - 1) * 100
    return saida


def media_series(*series):
    comuns = set(series[0]).intersection(*series[1:])
    return {m: sum(s[m] for s in series) / len(series) for m in sorted(comuns)}


def meta_e_banda(meta_anual, primeiro_mes="1999-06"):
    """Meta (série 13521, anual) e o intervalo de tolerância definido pelo CMN.

    O SGS publica só o centro da meta; a tolerância vem das resoluções do CMN
    (é o que a planilha preenche à mão nas colunas D:G). Ano sem meta publicada
    ainda repete a última — a meta é contínua desde 2025."""
    def tolerancia(ano):
        if ano <= 2002:
            return 2.0
        if ano <= 2005:
            return 2.5
        if ano <= 2016:
            return 2.0
        return 1.5

    centros = {int(m[:4]): v for m, v in meta_anual.items()}
    fim = datetime.date.today().strftime("%Y-%m")
    meta, sup, inf = {}, {}, {}
    ultimo = None
    for m in meses_entre(primeiro_mes, fim):
        ano = int(m[:4])
        c = centros.get(ano, ultimo)
        if c is None:
            continue
        ultimo = c
        t = tolerancia(ano)
        meta[m], sup[m], inf[m] = c, c + t, c - t
    return meta, sup, inf


def contribuicoes(comp, janela):
    """Contribuição encadeada de cada grupo para o IPCA acumulado na janela.

    Mês a mês: contribuição = peso × variação / 100 (em p.p.) e o IPCA do mês é a
    soma delas. Na janela, a contribuição de cada mês é multiplicada pela
    inflação acumulada dos meses seguintes — é isso que faz a soma dos grupos
    bater com o IPCA acumulado da janela (conferido: 4,21% contra 4,22%
    publicados, diferença de arredondamento dos dados do SIDRA)."""
    meses = sorted(set.intersection(*(set(comp[g]) for g, _, _ in GRUPOS)))
    ipca_mes = {m: sum(comp[g][m][0] * comp[g][m][1] / 100 for g, _, _ in GRUPOS) for m in meses}
    por_grupo = {g: {} for g, _, _ in GRUPOS}
    total = {}
    for i in range(janela - 1, len(meses)):
        bloco = meses[i - janela + 1:i + 1]
        if list(meses_entre(bloco[0], bloco[-1])) != bloco:
            continue
        fatores = []   # inflação acumulada dos meses posteriores a cada mês da janela
        f = 1.0
        for m in reversed(bloco):
            fatores.append(f)
            f *= 1 + ipca_mes[m] / 100
        fatores.reverse()
        soma = 0.0
        for g, _, _ in GRUPOS:
            c = sum(comp[g][m][0] * comp[g][m][1] / 100 * fator for m, fator in zip(bloco, fatores))
            por_grupo[g][bloco[-1]] = c
            soma += c
        total[bloco[-1]] = soma
    return por_grupo, total


# --------------------------------------------------------------------------
# gráficos
# --------------------------------------------------------------------------

def serie(nome, cor, dados, desde="1999-01", **extra):
    pares = [[m, round(v, 4)] for m, v in sorted(dados.items()) if m >= desde]
    return dict(nome=nome, cor=cor, dados=pares, **extra)


def grafico(id_, titulo, subtitulo, series, **extra):
    return dict(id=id_, titulo=titulo, subtitulo=subtitulo, series=series, **extra)


def main():
    t0 = time.time()
    print("Baixando séries do SGS…")
    cods = {
        "ipca12": 13522, "selic": 432, "meta": 13521,
        "serv": 10844, "ind": 27863, "alim": 27864, "com": 4447, "ncom": 4448,
        "adm": 4449, "livres": 11428, "ndur": 10841, "sdur": 10842, "dur": 10843,
        "ex0": 11427, "ex1": 16121, "ex3": 27839, "ms": 4466, "dp": 16122, "p55": 28750,
        "exfe": 28751, "ex3serv": 29683,
    }
    s = {}
    for nome, cod in cods.items():
        s[nome] = sgs(cod, "1999-01" if nome in ("ipca12", "selic", "meta") else INICIO)
        print(f"  {cod:>6} {nome:<8} {len(s[nome]):4d} meses, até {max(s[nome])}")

    a12 = {k: acumulado(v) for k, v in s.items() if k not in ("ipca12", "selic", "meta")}
    ipca = s["ipca12"]
    media = media_series(a12["ex0"], a12["ex3"], a12["ms"], a12["dp"], a12["p55"])
    meta, sup, inf = meta_e_banda(s["meta"])

    print("Baixando composição do SIDRA (tabela 7060)…")
    comp = sidra_composicao()
    c12, t12 = contribuicoes(comp, 12)
    c3, t3 = contribuicoes(comp, 3)
    ultimo_c12 = max(t12)
    print(f"  contribuição 12m em {ultimo_c12}: soma {t12[ultimo_c12]:.2f}% "
          f"(IPCA 13522: {ipca.get(ultimo_c12, float('nan')):.2f}%)")

    ipca_cheio = lambda cor=CIANO: serie("IPCA (Var. % 12m)", cor, ipca, rotulo=True)
    VAR12 = "Variação % acumulada em 12 meses"

    secoes = [
        dict(titulo="Visão geral", graficos=[
            grafico("selic-ipca-meta", "Taxa Selic Meta, IPCA e Meta para a Inflação", "", [
                serie("IPCA (Var. % 12m)", LARANJA, ipca, rotulo=True),
                serie("Meta (%)", BRANCO, meta, largura=2.5),
                serie("Intervalo de Tolerância (%)", BRANCO, sup, largura=2.5, traco="pontilhado"),
                serie("Intervalo de Tolerância (%)", BRANCO, inf, largura=2.5, traco="pontilhado", legenda=False),
                serie("Selic Meta (% a.a.)", AZUL, s["selic"], rotulo=True),
            ], eixo=dict(min=0, max=30)),
            grafico("contribuicao-12m", "Contribuição para o IPCA por Grupo", VAR12,
                    [serie(n, cor, c12[g], desde="2021-01", tipo="barra") for g, n, cor in GRUPOS]
                    + [serie("IPCA", BRANCO, t12, desde="2021-01", rotulo=True)], passoX=3),
            grafico("contribuicao-3m", "Contribuição para o IPCA por Grupo", "Variação % acumulada em 3 meses",
                    [serie(n, cor, c3[g], desde="2020-04", tipo="barra") for g, n, cor in GRUPOS]
                    + [serie("IPCA", BRANCO, t3, desde="2020-04", rotulo=True)], passoX=3),
        ]),
        dict(titulo="Aberturas", graficos=[
            grafico("servicos", "IPCA: Serviços", VAR12,
                    [serie("Serviços - Var. % anual", CIANO, a12["serv"], rotulo=True)]),
            grafico("servicos-industriais-alimentacao", "IPCA: Serviços, Industriais e Alimentação no Domicílio", VAR12, [
                serie("Serviços - Var. % anual", CIANO, a12["serv"], rotulo=True),
                serie("Industriais - Var. % anual", VERMELHO, a12["ind"], rotulo=True),
                serie("Alimentação no domicílio - Var. % anual", VERDE, a12["alim"], rotulo=True),
            ]),
            grafico("comercializaveis", "IPCA: Comercializáveis e Não Comercializáveis", VAR12, [
                serie("Comercializáveis - Var. % anual", CIANO, a12["com"], rotulo=True),
                serie("Não comercializáveis - Var. % anual", LARANJA, a12["ncom"], rotulo=True),
            ]),
            grafico("duraveis", "IPCA: Não Duráveis, Semiduráveis e Duráveis", VAR12, [
                serie("Bens não duráveis - Var. % anual", AZUL, a12["ndur"], rotulo=True),
                serie("Bens semiduráveis - Var. % anual", VERMELHO, a12["sdur"], rotulo=True),
                serie("Bens duráveis - Var. % anual", LARANJA, a12["dur"], rotulo=True),
            ]),
            grafico("administrados-livres", "IPCA: Administrados e Livres", VAR12, [
                serie("Administrados - Var. % anual", VERMELHO, a12["adm"], rotulo=True),
                serie("Itens livres - Var. % anual", VERDE, a12["livres"], rotulo=True),
            ]),
        ]),
        dict(titulo="Núcleos", graficos=[
            grafico("ex1", "IPCA Cheio e IPCA EX1",
                    VAR12 + "; EX1 exclui combustíveis e alimentos com preços mais voláteis", [
                        ipca_cheio(), serie("IPCA - Núcleo por exclusão - EX1", VERMELHO, a12["ex1"], rotulo=True)]),
            grafico("ex-fe", "IPCA Cheio e IPCA ex Alimentação e Energia", VAR12, [
                ipca_cheio(), serie("IPCA - Núcleo Ex-alimentação e energia (EX-FE)", LARANJA, a12["exfe"], rotulo=True)]),
            grafico("ex3-servicos", "IPCA Cheio e IPCA EX3 Serviços (Serviços Subjacentes)",
                    VAR12 + "; EX3 Serviços exclui subitens mais voláteis ou com reajustes infrequentes", [
                        ipca_cheio(), serie("IPCA - EX3 Serviços", VERDE, a12["ex3serv"], rotulo=True)]),
            grafico("media-nucleos", "IPCA Cheio e Média dos Núcleos", VAR12, [
                ipca_cheio(), serie("Média dos Núcleos (Var. % 12m)", OLIVA, media, rotulo=True)],
                    nota="Média dos núcleos EX0, EX3, MS, DP e P55, os cinco que o BC acompanha."),
        ]),
    ]

    doc = dict(
        atualizado=datetime.date.today().isoformat(),
        referencia=max(ipca),
        fonte="BCB e FtM",
        secoes=secoes,
    )
    # Só regrava quando algum número mudou: a Action roda todo dia e não deve
    # criar um commit só para trocar a data de "atualizado".
    if os.path.exists(SAIDA):
        with open(SAIDA, encoding="utf-8") as f:
            antigo = json.load(f)
        if antigo.get("secoes") == json.loads(json.dumps(secoes)) and antigo.get("referencia") == doc["referencia"]:
            print(f"Sem novidade: nenhum número mudou (IPCA até {doc['referencia']}).")
            return
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    n = sum(len(sec["graficos"]) for sec in secoes)
    print(f"OK: {n} gráficos em {os.path.relpath(SAIDA, RAIZ)} "
          f"(IPCA até {max(ipca)}, {time.time() - t0:.0f}s)")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERRO: {e}", file=sys.stderr)
        sys.exit(1)
