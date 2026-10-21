#!/usr/bin/env python3
"""
SpaceX (SPCX) — as seções da categoria "Ações EUA". Quem grava o JSON é o
acoes_eua.py, que chama secoes() daqui:

    python3 scripts/acoes_eua.py

MANUAL. Fontes, ambas em dados/:
  - SpaceX-Reports-Third-Quarter-2026-Results.pdf — o release do 3º tri de
    2026 (20/10/2026): DRE, balanço, fluxo de caixa e os segmentos (Espaço,
    Conectividade e SI, "Super Intelligence", o antigo segmento de IA);
  - SpaceX (SPCX) Q3 2026 Earnings Call Transcript _ The Motley Fool.pdf — a
    transcrição da teleconferência: guidance, metas e as falas.

Tudo em US$ milhões como no release, e dividido por mil na saída.

O release dá o 3º tri, o 2º tri e os 9 meses; o 1º tri de 2026 sai da conta
9M − 2T − 3T, e o script confere que as partes somam o total publicado. Não
há 4º tri de 2025 nem 1º e 2º tri de 2025 separados: no gráfico, "n.d.".

Valuation: preço de US$ 147,79 (página do Motley Fool, 21/10/2026, 9h41) e
13.579 mi de ações em circulação em 30/9 (classe A 8.240 + classe B 5.339,
balanço). Trocar PRECO quando quiser atualizar. Os múltiplos usam o 3º tri
anualizado (× 4) porque o lucro de 12 meses pediria o 4º tri de 2025, que o
release não traz.

Capex dos hyperscalers no 2º tri de 2026 (abr–jun), para a conferência da
fala sobre eficiência de capital: Alphabet 44,9 / receita 119,8; Meta 31,08
(com arrendamento financeiro) / 60,8; Microsoft 41,0 (com arrendamento) /
90,0 (trimestre fiscal encerrado em junho); Amazon 53,1 / 200,6 (imprensa;
outra fonte dá 54,2 de capex).
"""

# ---------- release, US$ milhões ----------
# (3T26, 2T26, 3T25, 9M26, 9M25)
RECEITA = {
    "Espaço": (1767, 962, 1666, 3348, 3277),
    "Conectividade": (5248, 4291, 3097, 12796, 8159),
    "SI": (7560, 2561, 813, 10939, 2278),
}
RECEITA_TOT = (14575, 7814, 5576, 27083, 13714)
OPER = {
    "Espaço": (-7, -542, 259, -1211, -181),
    "Conectividade": (2367, 1656, 1190, 5211, 3147),
    "SI": (431, -1257, -1722, -3295, -4182),
}
OPER_TOT = (2791, -143, -273, 705, -1216)
EBITDA = {
    "Espaço": (357, -205, 674, -199, 803),
    "Conectividade": (3499, 2597, 1923, 8183, 5123),
    "SI": (4953, 1146, -428, 5490, -813),
}
EBITDA_TOT = (8809, 3538, 2169, 13474, 5113)
CAPEX = {
    "Espaço": (1606, 1174, 1113, 3832, 2818),
    "Conectividade": (1543, 1367, 1007, 4242, 2951),
    "SI": (16444, 15828, 4760, 39995, 8077),
}
CAPEX_TOT = (19593, 18369, 6880, 48069, 13846)
DA = {
    "Espaço": (185, 158, 264, 509, 572),
    "Conectividade": (986, 805, 628, 2574, 1706),
    "SI": (2473, 1885, 922, 5851, 2506),
}
DA_TOT_3T26, DA_TOT_3T25, DA_TOT_9M26 = 3644, 1814, 8934
LUCRO = (4404, -1054)          # 3T26, 3T25
LPA_DILUIDO = (0.35, -0.36)    # 3T26, 3T25
LPA_9M26 = -0.15

# ---------- páginas dos segmentos (4, 5 e 6 do release; 3 a 5 do PDF) ----------
# mesma ordem: (3T26, 2T26, 3T25, 9M26, 9M25). Saldo de fim de período
# (assinantes, ARPU, GW) não tem 1º tri: os 9 meses repetem o 3º tri.
ESPACO_OP = {
    "lanc_clientes": (12, 10, 15, 29, 36), "lanc_internos": (23, 28, 29, 84, 92),
    "lanc_total": (35, 38, 44, 113, 128),
    "carga_clientes": (119, 87, 111, 251, 274), "carga_interna": (358, 397, 415, 1266, 1353),
    "massa": (476, 485, 525, 1517, 1627),
}
ESPACO_REC = {"Serviços de lançamento": (1130, 648, 1000, 2108, 2056),
              "Lançamento e desenvolvimento": (637, 314, 666, 1240, 1221)}
ESPACO_CUSTO = {"Custo da receita": (435, 329, 477, 1045, 1104), "P&D": (1225, 1076, 849, 3231, 2069),
                "Vendas, gerais e administrativas": (114, 99, 81, 283, 256), "Impairment": (0, 0, 0, 0, 29)}
CONEX_ASSIN = (13.6, 12.0, 7.2)      # mi, fim de período (3T26, 2T26, 3T25)
CONEX_ARPU = (69, 66, 83)            # US$/mês
CONEX_REC = {"Consumidor": (3121, 2485, 1986, 7754, 5198),
             "Empresas e governo": (2127, 1806, 1111, 5042, 2961)}
CONEX_CUSTO = {"Custo da receita": (2368, 2060, 1657, 6079, 4271), "P&D": (188, 294, 141, 687, 406),
               "Vendas, gerais e administrativas": (325, 281, 109, 819, 335)}
SI_GW = (1.7, 1.4, 0.6)              # compute nominal, fim de período
SI_REC = {"Publicidade": (538, 367, 454, 1248, 1323),
          "Soluções e infraestrutura de SI": (7022, 2194, 359, 9691, 955)}
SI_CUSTO = {"Custo da receita": (2675, 1106, 571, 4237, 1574), "P&D": (3183, 2178, 1301, 7740, 3331),
            "Vendas, gerais e administrativas": (1268, 532, 385, 2263, 1083),
            "Reestruturação": (3, 2, 278, -6, 472)}

# ponte SI, 3T26: resultado operacional → EBITDA ajustado
SI_PONTE = [("Depreciação e amortização", 2473), ("Remuneração em ações", 821),
            ("Remuneração em ações da compra do Cursor", 1217),
            ("Custos de aquisição e reestruturação", 8 + 3)]
# ponte consolidada, 3T26: lucro líquido → EBITDA ajustado
CONS_PONTE = [("Depreciação e amortização", 3644), ("Remuneração em ações", 1146),
              ("Remuneração em ações da compra do Cursor", 1217),
              ("Custos de aquisição e reestruturação", 8 + 3),
              ("Juros pagos", 675), ("Juros recebidos", -873),
              ("Outras receitas, líquidas", -1025), ("Benefício de imposto de renda", -390)]

# fluxo de caixa, 9M26
CAIXA_INICIO, CAIXA_FIM = 25124, 53386
FCO = (4120, 13097)            # 9M25, 9M26
FC_CAPEX = (-13846, -48069)
TITULOS = (-46834, 9158, 77)   # compras, vencimentos, vendas
OUTROS_INV = (-20, 1372, -866, 514, 57)
INVEST_TOT = -84611
IPO = 85675
DIVIDA = (51834, -124, -39845, -1153, -270)   # captação, custos, amortização, prêmio, arrendamento
OUTROS_FIN = (8319, 368, -4426, -559)          # ações, planos, recompra, impostos de ações
FIN_TOT = 99819
CAMBIO = -43

# balanço (dez/25, set/26)
CAIXA = (24747, 51294)
TITULOS_SALDO = (0, 38561)
IMOBILIZADO = (42602, 89483)
GOODWILL = (11809, 48423)
INTANGIVEIS = (1548, 6354)
ATIVO = (92079, 254045)
DIV_CURTA, DIV_LONGA = (928, 2698), (21968, 36146)
REC_DIF_CURTA, REC_DIF_LONGA = (6111, 10784), (6005, 6736)
PASSIVO = (50754, 77277)
PREFERENCIAIS = (38752, 0)
PL = (2573, 176768)

ACOES_MI = 8240 + 5339
PRECO = 147.79

# capex e receita no 2º tri de 2026, US$ bi
PARES_CAPEX = [("Meta", 31.08, 60.8), ("Microsoft", 41.0, 90.0), ("Alphabet", 44.9, 119.8), ("Amazon", 53.1, 200.6)]

REL = "SpaceX, release de resultados do 3º trimestre de 2026"
CALL = "SpaceX, teleconferência do 3º trimestre de 2026 (transcrição do Motley Fool)"
CINZA, AZUL, LARANJA, VERMELHO, VERDE, ROXO, AZUL_CLARO = (
    "#95A5A6", "#4F81BD", "#F79646", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6")
COR_SEG = {"Espaço": ROXO, "Conectividade": AZUL_CLARO, "SI": LARANJA}


def bi(x):
    return round(x / 1000, 3)


def primeiro_tri(t):
    """1T26 = 9M26 − 2T26 − 3T26."""
    return t[3] - t[1] - t[0]


def conferir():
    for nome, seg, tot in (("receita", RECEITA, RECEITA_TOT), ("operacional", OPER, OPER_TOT),
                           ("EBITDA", EBITDA, EBITDA_TOT), ("capex", CAPEX, CAPEX_TOT)):
        for k in range(5):
            soma = sum(v[k] for v in seg.values())
            assert soma == tot[k], (nome, k, soma, tot[k])
    assert sum(v[0] for v in DA.values()) == DA_TOT_3T26
    assert sum(v[2] for v in DA.values()) == DA_TOT_3T25
    assert sum(v[3] for v in DA.values()) == DA_TOT_9M26
    assert OPER["SI"][0] + sum(v for _, v in SI_PONTE) == EBITDA["SI"][0]
    assert LUCRO[0] + sum(v for _, v in CONS_PONTE) == EBITDA_TOT[0]
    assert FC_CAPEX[1] + sum(TITULOS) + sum(OUTROS_INV) == INVEST_TOT
    assert IPO + sum(DIVIDA) + sum(OUTROS_FIN) == FIN_TOT
    assert CAIXA_INICIO + FCO[1] + INVEST_TOT + FIN_TOT + CAMBIO == CAIXA_FIM
    for k in (0, 1):
        assert PASSIVO[k] + PREFERENCIAIS[k] + PL[k] == ATIVO[k]
    # cada segmento: as partes da receita somam a receita, e receita − custos
    # dá o resultado operacional publicado, nas cinco colunas
    for seg, rec, custo in (("Espaço", ESPACO_REC, ESPACO_CUSTO), ("Conectividade", CONEX_REC, CONEX_CUSTO),
                            ("SI", SI_REC, SI_CUSTO)):
        for k in range(5):
            assert sum(v[k] for v in rec.values()) == RECEITA[seg][k], (seg, k)
            assert RECEITA[seg][k] - sum(v[k] for v in custo.values()) == OPER[seg][k], (seg, k)
    for k in range(5):
        assert ESPACO_OP["lanc_clientes"][k] + ESPACO_OP["lanc_internos"][k] == ESPACO_OP["lanc_total"][k]
        # a tabela arredonda cada linha: as partes erram o total em até 1 t (119 + 358 = 477 × 476)
        assert abs(ESPACO_OP["carga_clientes"][k] + ESPACO_OP["carga_interna"][k] - ESPACO_OP["massa"][k]) <= 2


def secoes():
    conferir()
    T = ("3T25", "3T26")

    def par(rot, t):          # (3T26, …, 3T25, …) → [3T25, 3T26]
        return {"rot": rot, "v": [bi(t[2]), bi(t[0])]}

    def variante(rot, rec, ebitda, oper, capex, lucro=None):
        ms = [par("Receita", rec), par("EBITDA ajustado", ebitda), par("Resultado operacional", oper)]
        if lucro:
            ms.append({"rot": "Lucro líquido", "v": [bi(lucro[1]), bi(lucro[0])]})
        ms.append(par("Capex", capex))
        return {"rot": rot, "metricas": ms}

    pares_resultado = {
        "id": "spacex-3t-comparacao", "painel": "pares",
        "titulo": "SpaceX: receita, EBITDA, resultado e capex no 3º trimestre",
        "subtitulo": "3º tri de 2025 × 3º tri de 2026, em US$ bilhões; em cima, a variação %, e a diferença em US$",
        "unidade": "usd-bi", "fonte": REL, "colunas": ["3º tri 2025", "3º tri 2026"],
        "metricas": [],
        "variantes": [
            variante("Consolidado", RECEITA_TOT, EBITDA_TOT, OPER_TOT, CAPEX_TOT, LUCRO),
            variante("SI", RECEITA["SI"], EBITDA["SI"], OPER["SI"], CAPEX["SI"]),
            variante("Conectividade", RECEITA["Conectividade"], EBITDA["Conectividade"], OPER["Conectividade"], CAPEX["Conectividade"]),
            variante("Espaço", RECEITA["Espaço"], EBITDA["Espaço"], OPER["Espaço"], CAPEX["Espaço"]),
        ],
    }
    del pares_resultado["metricas"]

    # trimestres: 3T25, 4T25 (n.d.), 1T26, 2T26, 3T26 e o que vier de guidance
    def tri(t):
        return [bi(t[2]), None, bi(primeiro_tri(t)), bi(t[1]), bi(t[0])]

    receita_tri = {
        "id": "spacex-receita-trimestral", "painel": "colunas",
        "titulo": "SpaceX: receita por trimestre e o guidance do 1º tri de 2027",
        "subtitulo": "Receita por segmento, em US$ bilhões; 1º tri de 2026 = 9 meses − 2º tri − 3º tri, e o guidance é de US$ 33 a 37 bi",
        "unidade": "usd-bi", "fonte": REL + "; guidance da teleconferência",
        "periodos": ["3T25", "4T25", "1T26", "2T26", "3T26", "4T26", "1T27"],
        "series": [{"nome": s, "cor": COR_SEG[s], "v": tri(RECEITA[s]) + [None, None]} for s in ("Espaço", "Conectividade", "SI")],
        "guia": [{"p": "1T27", "lo": 33, "hi": 37}],
    }
    capex_tri = {
        "id": "spacex-capex-trimestral", "painel": "colunas",
        "titulo": "SpaceX: capex por trimestre e o guidance do 4º tri",
        "subtitulo": "Capex por segmento, em US$ bilhões; o guidance do 4º tri de 2026 é de US$ 35 a 40 bi",
        "unidade": "usd-bi", "fonte": REL + "; guidance da teleconferência",
        "periodos": ["3T25", "4T25", "1T26", "2T26", "3T26", "4T26"],
        "series": [{"nome": s, "cor": COR_SEG[s], "v": tri(CAPEX[s]) + [None]} for s in ("Espaço", "Conectividade", "SI")],
        "guia": [{"p": "4T26", "lo": 35, "hi": 40}],
    }
    da_tri = {
        "id": "spacex-depreciacao", "painel": "colunas",
        "titulo": "SpaceX: depreciação e amortização por trimestre",
        "subtitulo": "D&A por segmento, em US$ bilhões; o imobilizado líquido foi de US$ 42,6 bi em dez/25 a US$ 89,5 bi em set/26",
        "unidade": "usd-bi", "fonte": REL,
        "periodos": ["3T25", "4T25", "1T26", "2T26", "3T26"],
        "series": [{"nome": s, "cor": COR_SEG[s], "v": tri(DA[s])} for s in ("Espaço", "Conectividade", "SI")],
    }
    ponte = {
        "id": "spacex-ponte-ebitda", "painel": "cascata",
        "titulo": "SpaceX: do resultado ao EBITDA ajustado no 3º trimestre",
        "subtitulo": "3º tri de 2026, em US$ bilhões; o EBITDA ajustado soma de volta o que não é caixa e o que não é operação",
        "unidade": "usd-bi", "fonte": REL, "corTotal": AZUL,
        "inicio": {"rot": "", "v": 0}, "passos": [], "fim": {"rot": "", "v": 0},
        "variantes": [
            {"rot": "SI", "inicio": {"rot": "Resultado operacional do SI", "v": bi(OPER["SI"][0])},
             "passos": [{"rot": r, "v": bi(v)} for r, v in SI_PONTE],
             "fim": {"rot": "EBITDA ajustado do SI", "v": bi(EBITDA["SI"][0])}},
            {"rot": "Consolidado", "inicio": {"rot": "Lucro líquido", "v": bi(LUCRO[0])},
             "passos": [{"rot": r, "v": bi(v)} for r, v in CONS_PONTE],
             "fim": {"rot": "EBITDA ajustado", "v": bi(EBITDA_TOT[0])}},
        ],
    }

    # ---------- fluxo de caixa ----------
    cascata_caixa = {
        "id": "spacex-caixa-9m", "painel": "cascata",
        "titulo": "SpaceX: de onde veio e para onde foi o caixa em 2026",
        "subtitulo": "Nove meses até setembro de 2026, em US$ bilhões; caixa, equivalentes e caixa restrito",
        "unidade": "usd-bi", "fonte": REL, "corTotal": AZUL,
        "inicio": {"rot": "Caixa em dezembro de 2025", "v": bi(CAIXA_INICIO)},
        "passos": [
            {"rot": "Geração de caixa operacional", "v": bi(FCO[1])},
            {"rot": "Capex", "v": bi(FC_CAPEX[1])},
            {"rot": "Títulos negociáveis: compras de 46,8 menos vencimentos e vendas", "v": bi(sum(TITULOS))},
            {"rot": "Outros investimentos (abatimentos, intangíveis, aquisições)", "v": bi(sum(OUTROS_INV))},
            {"rot": "IPO, líquido de custos", "v": bi(IPO)},
            {"rot": "Dívida: captações menos amortizações", "v": bi(sum(DIVIDA))},
            {"rot": "Ações: emissões menos recompras", "v": bi(sum(OUTROS_FIN))},
            {"rot": "Câmbio", "v": bi(CAMBIO)},
        ],
        "fim": {"rot": "Caixa em setembro de 2026", "v": bi(CAIXA_FIM)},
    }
    fcl = {
        "id": "spacex-fluxo-livre", "painel": "pares",
        "titulo": "SpaceX: geração de caixa, capex e fluxo de caixa livre",
        "subtitulo": "Nove meses até setembro, em US$ bilhões; fluxo livre = caixa operacional − capex",
        "unidade": "usd-bi", "fonte": REL, "colunas": ["9 meses 2025", "9 meses 2026"],
        "metricas": [
            {"rot": "Caixa operacional", "v": [bi(FCO[0]), bi(FCO[1])]},
            {"rot": "Capex", "v": [bi(FC_CAPEX[0]), bi(FC_CAPEX[1])]},
            {"rot": "Fluxo de caixa livre", "v": [bi(FCO[0] + FC_CAPEX[0]), bi(FCO[1] + FC_CAPEX[1])]},
        ],
    }

    # ---------- balanço ----------
    outros_at = [ATIVO[k] - CAIXA[k] - TITULOS_SALDO[k] - IMOBILIZADO[k] - GOODWILL[k] - INTANGIVEIS[k] for k in (0, 1)]
    divida = [DIV_CURTA[k] + DIV_LONGA[k] for k in (0, 1)]
    rec_dif = [REC_DIF_CURTA[k] + REC_DIF_LONGA[k] for k in (0, 1)]
    outros_pas = [PASSIVO[k] - divida[k] - rec_dif[k] for k in (0, 1)]
    balanco = {
        "id": "spacex-balanco", "painel": "pilhas",
        "titulo": "SpaceX: o balanço antes e depois do IPO",
        "subtitulo": "Em US$ bilhões; acima do zero o que a empresa tem, abaixo como isso é financiado",
        "unidade": "usd-bi", "fonte": REL,
        "colunas": ["Dezembro de 2025", "Setembro de 2026"], "colunasCurtas": ["dez/25", "set/26"],
        "itens": [
            {"rot": "Caixa e equivalentes", "v": [bi(x) for x in CAIXA], "cor": AZUL},
            {"rot": "Títulos negociáveis", "v": [None, bi(TITULOS_SALDO[1])], "cor": AZUL_CLARO},
            {"rot": "Imobilizado", "v": [bi(x) for x in IMOBILIZADO], "cor": LARANJA},
            {"rot": "Goodwill", "v": [bi(x) for x in GOODWILL], "cor": ROXO},
            {"rot": "Intangíveis", "v": [bi(x) for x in INTANGIVEIS], "cor": "#B39DDB"},
            {"rot": "Outros ativos", "v": [bi(x) for x in outros_at], "cor": CINZA},
            {"rot": "Dívida e arrendamentos", "v": [-bi(x) for x in divida], "cor": VERMELHO},
            {"rot": "Receita diferida", "v": [-bi(x) for x in rec_dif], "cor": "#D99694"},
            {"rot": "Outros passivos", "v": [-bi(x) for x in outros_pas], "cor": "#7F7F7F"},
            {"rot": "Preferenciais conversíveis", "v": [-bi(PREFERENCIAIS[0]), None], "cor": "#E8C547"},
            {"rot": "Patrimônio líquido", "v": [-bi(x) for x in PL], "cor": VERDE},
        ],
    }
    liquidez = {
        "id": "spacex-liquidez", "painel": "pares",
        "titulo": "SpaceX: caixa, títulos e dívida",
        "subtitulo": "Em US$ bilhões; caixa líquido = caixa e títulos negociáveis − dívida e arrendamentos",
        "unidade": "usd-bi", "fonte": REL, "colunas": ["dez/25", "set/26"],
        "metricas": [
            {"rot": "Caixa e títulos", "v": [bi(CAIXA[0] + TITULOS_SALDO[0]), bi(CAIXA[1] + TITULOS_SALDO[1])]},
            {"rot": "Dívida e arrendamentos", "v": [bi(divida[0]), bi(divida[1])]},
            {"rot": "Caixa líquido", "v": [bi(CAIXA[0] + TITULOS_SALDO[0] - divida[0]), bi(CAIXA[1] + TITULOS_SALDO[1] - divida[1])]},
        ],
    }

    # ---------- valuation ----------
    mcap = PRECO * ACOES_MI / 1000                     # US$ bi
    lpa_ano = LPA_DILUIDO[0] * 4
    rec_ano = RECEITA_TOT[0] * 4 / 1000
    ebitda_ano = EBITDA_TOT[0] * 4 / 1000
    caixa_liq = (CAIXA[1] + TITULOS_SALDO[1] - divida[1]) / 1000
    ev = mcap - caixa_liq

    def fmt(v, casas=1):
        return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")

    quadros = {
        "id": "spacex-valuation", "painel": "numeros",
        "titulo": "SpaceX: valuation",
        "subtitulo": f"Preço de US$ {fmt(PRECO, 2)} (21/10/2026); múltiplos sobre o 3º tri de 2026 anualizado (× 4)",
        "fonte": REL + "; preço do Motley Fool",
        "quadros": [
            {"rot": "Valor de mercado", "valor": f"US$ {fmt(mcap / 1000, 2)} tri",
             "detalhe": f"US$ {fmt(PRECO, 2)} × {fmt(ACOES_MI / 1000, 2)} bi de ações (classes A e B, 30/9)"},
            {"rot": "Lucro por ação, 3º tri", "valor": f"US$ {fmt(LPA_DILUIDO[0], 2)}",
             "detalhe": f"Diluído; era −US$ {fmt(-LPA_DILUIDO[1], 2)} no 3º tri de 2025 e é −US$ {fmt(-LPA_9M26, 2)} em 9 meses de 2026"},
            {"rot": "Preço / lucro", "valor": f"{fmt(PRECO / lpa_ano, 0)}x",
             "detalhe": f"Sobre US$ {fmt(lpa_ano, 2)} (LPA do 3º tri × 4); o lucro do tri tem US$ 1,0 bi de outras receitas e US$ 0,4 bi de benefício fiscal"},
            {"rot": "Preço / vendas", "valor": f"{fmt(mcap / rec_ano, 0)}x",
             "detalhe": f"Sobre US$ {fmt(rec_ano, 1)} bi (receita do 3º tri × 4)"},
            {"rot": "EV / EBITDA ajustado", "valor": f"{fmt(ev / ebitda_ano, 0)}x",
             "detalhe": f"EV de US$ {fmt(ev / 1000, 2)} tri (valor de mercado − caixa líquido) sobre US$ {fmt(ebitda_ano, 1)} bi (3º tri × 4)"},
            {"rot": "Caixa líquido", "valor": f"US$ {fmt(caixa_liq, 1)} bi",
             "detalhe": "Caixa e títulos negociáveis menos dívida e arrendamentos, em 30/9"},
        ],
    }
    ps = {
        "id": "spacex-preco-vendas", "painel": "barras",
        "titulo": "SpaceX: preço / vendas conforme a receita que se usa",
        "subtitulo": f"Valor de mercado de US$ {fmt(mcap / 1000, 2)} tri ÷ receita anual; tracejado, o que depende de guidance ou meta",
        "unidade": "x", "fonte": REL + " e teleconferência; preço do Motley Fool",
        "linhas": [
            {"rot": "3º tri de 2026 × 4", "detalhe": f"US$ {fmt(rec_ano, 1)} bi, o último trimestre", "v": round(mcap / rec_ano, 1), "cor": AZUL},
            {"rot": "ARR de dezembro de 2026", "detalhe": "US$ 100 bi, receita de dezembro × 12 (meta do CFO)",
             "v": round(mcap / 100, 1), "cor": LARANJA, "contorno": True},
            {"rot": "Guidance do 1º tri de 2027 × 4", "detalhe": "US$ 140 bi, o meio da faixa de 33 a 37",
             "v": round(mcap / 140, 1), "cor": LARANJA, "contorno": True},
            {"rot": "ARR do fim de 2027", "detalhe": "US$ 500 bi a 1 tri (Musk); a barra é a ponta de 500 bi",
             "v": round(mcap / 500, 1), "cor": LARANJA, "contorno": True,
             "prefixo": fmt(mcap / 1000, 1) + " a "},
        ],
    }

    # ---------- destaques da teleconferência ----------
    linha_tempo = {
        "id": "spacex-guidance-metas", "painel": "linhaTempo",
        "titulo": "SpaceX: guidance e metas da teleconferência",
        "subtitulo": "O que a empresa disse esperar, por data",
        "fonte": CALL, "cor": AZUL_CLARO,
        "itens": [
            {"quando": "Out/2026", "t": "Quase 2,2 GW de compute nominal no fim do mês", "guidance": True},
            {"quando": "Nov/2026", "t": "Voo 15 do Starship: tentativa de pegar booster e nave na torre"},
            {"quando": "4º tri 2026", "t": "Capex de US$ 35 a 40 bi; margem bruta de volta ao nível do 2º tri", "guidance": True},
            {"quando": "Fim de 2026", "t": "2,5 a 3 GW de compute; ARR de US$ 100 bi (receita de dezembro × 12)", "guidance": True},
            {"quando": "1º tri 2027", "t": "Receita de US$ 33 a 37 bi", "guidance": True},
            {"quando": "1º sem. 2027", "t": "Starship semanal; reabastecimento em órbita; centenas de satélites V3; fecha a compra do espectro de 800 MHz"},
            {"quando": "Mai–jun/2027", "t": "Primeiro chip de teste (SRAM), na fábrica de pesquisa em Austin"},
            {"quando": "Fim do 2º tri 2027", "t": "Maior cluster de treino: 440 mil Vera Rubin"},
            {"quando": "Fim de 2027", "t": "13 GW de compute (+10 GW no ano, com plano para +20 GW de energia); ARR de US$ 500 bi a 1 tri; Starship duas vezes por semana"},
            {"quando": "Início de 2028", "t": "Starlink Mobile com o espectro novo no ar"},
            {"quando": "2028", "t": "Primeiro lançamento em Louisiana (meta interna; 2029, “muito provável”)"},
            {"quando": "3º tri 2028", "t": "Produção em volume na Terafab, em Gibbons Creek"},
        ],
    }
    compute = {
        "id": "spacex-compute-por-watt", "painel": "fala",
        "titulo": "SpaceX: por que alugar compute a preço spot",
        "subtitulo": "Elon Musk, respondendo a Eric Sheridan (Goldman Sachs); tradução livre",
        "fonte": CALL,
        "citacao": {"texto": "Nossa abordagem é alugar, na prática, a preço de mercado spot, em vez de assinar contratos "
                             "longos. Acreditamos que o valor da computação por watt vai aumentar com o tempo, não diminuir.",
                    "autor": "Elon Musk", "cor": LARANJA},
        "pontos": [
            "Modelos melhores tiram mais “inteligência útil” de cada watt, e o valor do compute acompanha isso: H100s antigos alugam por mais do que quando eram novos",
            "Os contratos curtos estão sendo renovados a mais dólares por watt, não menos",
            "Preço atual, segundo o CFO: um pouco acima do topo da faixa de US$ 30 a 50 por watt; instalações novas se pagam em menos de um ano",
            "Divisão do compute: cerca de metade para uso próprio e metade alugada, podendo ir a 60/40 para qualquer lado",
        ],
    }
    tesla = {
        "id": "spacex-fusao-tesla", "painel": "fala",
        "titulo": "SpaceX: a fusão com a Tesla",
        "subtitulo": "Pergunta de Edison Yu (Deutsche Bank) e resposta de Elon Musk; tradução livre",
        "fonte": CALL,
        "pergunta": {"quem": "Edison Yu, Deutsche Bank",
                     "texto": "Quais os prós e contras de uma combinação com a Tesla, e há obstáculos a resolver antes?"},
        "citacao": {"texto": "Algumas pessoas assumem que uma fusão entre SpaceX e Tesla é certa, e acho que isso seria "
                             "exagero. Se acho que seria uma boa ideia? Sim. Mas, no fim, os acionistas têm de apoiar.",
                    "autor": "Elon Musk", "cor": LARANJA},
        "pontos": [
            "As duas empresas formaram comitês especiais de conselheiros independentes, a pedido de acionistas; Musk, como parte conflitada, fica fora das conversas",
            "Na Tesla, a fusão precisa do voto de 50% de todas as ações, não só das que votam",
            "Os comitês não chegaram a acordo sobre os termos, e não há garantia de que cheguem",
            "Ganhos que ele vê: software de superinteligência, design de chips, Terafab, robótica, a constelação Starmind e conectividade",
        ],
    }
    eficiencia = {
        "id": "spacex-eficiencia-capital", "painel": "fala",
        "titulo": "SpaceX: “eficiência de capital”",
        "subtitulo": "Elon Musk, depois da pergunta de Doug Anmuth (JPMorgan) sobre como financiar 13 GW; tradução livre",
        "fonte": CALL,
        "pergunta": {"quem": "Doug Anmuth, JPMorgan",
                     "texto": "O que dá conforto com os 13 GW no fim de 2027, e como pensar a necessidade de financiamento?"},
        "citacao": {"texto": "Se você olhar nosso histórico de eficiência de capital, no Starship e em todos os outros "
                             "projetos, vai ter dificuldade de achar qualquer empresa no mundo tão boa em eficiência de "
                             "capital quanto a SpaceX.",
                    "autor": "Elon Musk", "cor": LARANJA},
        "pontos": [
            "O CFO citou o grau de investimento, várias fontes de dívida em negociação e o retorno rápido do compute, que passa a se financiar sozinho",
            "Capex dos 9 meses: US$ 48,1 bi, contra US$ 13,1 bi de caixa operacional; fluxo de caixa livre de −US$ 35,0 bi",
        ],
    }
    intensidade = {
        "id": "spacex-capex-receita", "painel": "barras",
        "titulo": "Capex em % da receita: SpaceX × hyperscalers",
        "subtitulo": "Capex ÷ receita do trimestre; mede quanto se investe por dólar vendido, não o retorno do investimento",
        "unidade": "pct0",
        "fonte": "SpaceX (release do 3º tri); Alphabet, Meta e Microsoft (resultados do 2º tri de 2026); Amazon (imprensa)",
        "linhas": [{"rot": "SpaceX", "detalhe": "2º tri de 2026", "v": round(CAPEX_TOT[1] / RECEITA_TOT[1] * 100), "cor": LARANJA},
                   {"rot": "SpaceX", "detalhe": "3º tri de 2026", "v": round(CAPEX_TOT[0] / RECEITA_TOT[0] * 100), "cor": LARANJA}]
                  + [{"rot": n, "detalhe": "2º tri de 2026" + (", ano fiscal até junho" if n == "Microsoft" else ""),
                      "v": round(cx / r * 100), "cor": CINZA} for n, cx, r in PARES_CAPEX],
    }

    # ---------- por segmento ----------
    QT = ["3T25", "4T25", "1T26", "2T26", "3T26"]

    def tri_n(t, escala=1):             # fluxo: 1T26 = 9M − 2T − 3T
        return [t[2] / escala, None, primeiro_tri(t) / escala, t[1] / escala, t[0] / escala]

    def saldo(t):                        # fim de período: sem 1T26
        return [t[2], None, None, t[1], t[0]]

    def dre(id_, seg, custos, cor):
        """Receita para cima, custos para baixo, resultado operacional riscado: 3T25, 1T26, 2T26, 3T26."""
        def q(t):
            return [bi(t[2]), bi(primeiro_tri(t)), bi(t[1]), bi(t[0])]
        itens = [{"rot": "Receita", "v": q(RECEITA[seg]), "cor": cor}]
        cores_c = [VERMELHO, "#D99694", "#7F7F7F", "#E8C547"]
        for (nome, t), c in zip(custos.items(), cores_c):
            if not any(q(t)):          # impairment só existe nos 9 meses de 2025
                continue
            itens.append({"rot": nome, "v": [-x if x else None for x in q(t)], "cor": c})
        return {
            "id": id_, "painel": "pilhas",
            "titulo": f"SpaceX, {seg}: da receita ao resultado operacional",
            "subtitulo": "Por trimestre, em US$ bilhões; receita para cima, custos para baixo, e a linha é o resultado operacional",
            "unidade": "usd-bi", "fonte": REL,
            "colunas": ["3º tri 2025", "1º tri 2026", "2º tri 2026", "3º tri 2026"],
            "colunasCurtas": ["3T25", "1T26", "2T26", "3T26"],
            "itens": itens,
            "marcos": [{"rot": "Resultado operacional", "v": q(OPER[seg])}],
        }

    def receita_aberta(id_, seg, partes, cores):
        return {
            "id": id_, "painel": "colunas",
            "titulo": f"SpaceX, {seg}: receita por linha de negócio",
            "subtitulo": "Por trimestre, em US$ bilhões; 1º tri de 2026 = 9 meses − 2º tri − 3º tri",
            "unidade": "usd-bi", "fonte": REL, "periodos": QT,
            "series": [{"nome": n, "cor": c, "v": [None if x is None else bi(x) for x in tri_n(t)]}
                       for (n, t), c in zip(partes.items(), cores)],
        }

    o = ESPACO_OP
    espaco = [
        {"id": "spacex-espaco-lancamentos", "painel": "colunas",
         "titulo": "SpaceX, Espaço: lançamentos por trimestre",
         "subtitulo": "Número de lançamentos, para clientes e internos (Starlink e testes)",
         "unidade": "n", "casas": 0, "fonte": REL, "periodos": QT,
         "series": [{"nome": "Para clientes", "cor": AZUL, "v": tri_n(o["lanc_clientes"])},
                    {"nome": "Internos", "cor": CINZA, "v": tri_n(o["lanc_internos"])}]},
        {"id": "spacex-espaco-massa", "painel": "colunas",
         "titulo": "SpaceX, Espaço: massa levada à órbita",
         "subtitulo": "Toneladas métricas por trimestre, carga de clientes e interna",
         "unidade": "n", "casas": 0, "fonte": REL, "periodos": QT, "totais": tri_n(o["massa"]),
         "series": [{"nome": "Carga de clientes", "cor": AZUL, "v": tri_n(o["carga_clientes"])},
                    {"nome": "Carga interna", "cor": CINZA, "v": tri_n(o["carga_interna"])}]},
        receita_aberta("spacex-espaco-receita", "Espaço", ESPACO_REC, [AZUL, ROXO]),
        dre("spacex-espaco-resultado", "Espaço", ESPACO_CUSTO, ROXO),
    ]
    conectividade = [
        {"id": "spacex-conectividade-assinantes", "painel": "colunas",
         "titulo": "SpaceX, Conectividade: assinantes do Starlink",
         "subtitulo": "Assinantes residenciais e de pequenas empresas, em milhões, no fim do trimestre; sem os contratos de empresas e governo",
         "unidade": "mi", "fonte": REL, "periodos": QT,
         "series": [{"nome": "Assinantes", "cor": AZUL_CLARO, "v": saldo(CONEX_ASSIN)}]},
        {"id": "spacex-conectividade-arpu", "painel": "colunas",
         "titulo": "SpaceX, Conectividade: receita média por assinante",
         "subtitulo": "ARPU mensal do consumidor Starlink, em US$ por mês",
         "unidade": "usd", "casas": 0, "fonte": REL, "periodos": QT,
         "series": [{"nome": "ARPU", "cor": AZUL_CLARO, "v": saldo(CONEX_ARPU)}]},
        receita_aberta("spacex-conectividade-receita", "Conectividade", CONEX_REC, [AZUL_CLARO, AZUL]),
        dre("spacex-conectividade-resultado", "Conectividade", CONEX_CUSTO, AZUL_CLARO),
    ]
    si = [
        {"id": "spacex-si-compute", "painel": "colunas",
         "titulo": "SpaceX, SI: compute nominal instalado",
         "subtitulo": "Gigawatts no fim do trimestre; o guidance para o fim de 2026 é de 2,5 a 3 GW",
         "unidade": "gw", "fonte": REL + "; guidance da teleconferência", "periodos": QT + ["4T26"],
         "series": [{"nome": "Compute nominal", "cor": LARANJA, "v": saldo(SI_GW) + [None]}],
         "guia": [{"p": "4T26", "lo": 2.5, "hi": 3}], "casasGuia": 1},
        receita_aberta("spacex-si-receita", "SI", SI_REC, [CINZA, LARANJA]),
        dre("spacex-si-resultado", "SI", SI_CUSTO, LARANJA),
    ]
    por_segmento = {"titulo": "Por segmento", "subsecoes": [
        {"titulo": "Espaço", "graficos": espaco},
        {"titulo": "Conectividade", "graficos": conectividade},
        {"titulo": "SI", "graficos": si},
    ]}

    # uma seção só, a empresa, com os assuntos dentro (como a Anthropic no menu)
    return [{"titulo": "SpaceX", "subsecoes": [
        {"titulo": "Resultado", "graficos": [pares_resultado, receita_tri, ponte, da_tri]},
        por_segmento,
        {"titulo": "Fluxo de caixa", "graficos": [cascata_caixa, capex_tri, fcl]},
        {"titulo": "Balanço", "graficos": [balanco, liquidez]},
        {"titulo": "Valuation", "graficos": [quadros, ps]},
        {"titulo": "Destaques da teleconferência do 3º tri",
         "graficos": [linha_tempo, compute, tesla, eficiencia, intensidade]},
    ]}]
