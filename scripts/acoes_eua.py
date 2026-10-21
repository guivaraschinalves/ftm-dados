#!/usr/bin/env python3
"""
Grava dados/acoes-eua.json — a categoria "Ações EUA".

MANUAL: não há série pública por trás. Os números são digitados do que foi
divulgado e conferidos aqui; ao chegar dado novo (o S-1 público, o preço do
IPO), trocar as constantes e rodar de novo:

    python3 scripts/acoes_eua.py

ANTHROPIC

Fonte: o rascunho do prospecto (S-1) da Anthropic, como reportado pelo The
Wall Street Journal em 20/10/2026 ("Anthropic S-1 Shows Red-Hot Growth, Risks
and Massive Computing Costs", Anissa Gardizy). O documento não é público;
todo número abaixo é o que a reportagem cita.

- Receita: US$ 1,1 bi no 1º sem. de 2025, US$ 16,3 bi no 1º sem. de 2026.
  "Cerca de um quinto" da receita do 1º sem. de 2026 veio de dois clientes:
  o destaque da barra é 16,3 / 5 = 3,26, e por isso o rótulo diz "cerca de".
- Prejuízo líquido: US$ 13 bi e US$ 80,7 bi. Do de 2026, US$ 72 bi são a
  variação do valor justo das notas conversíveis e de outros instrumentos
  emitidos para captar dinheiro (não caixa); o resto, 8,7, é a diferença.
- Computação e infraestrutura: US$ 2,3 bi e "quase US$ 9 bi" — entra 9,0
  marcado como aproximado.

DEMONSTRAÇÃO DE RESULTADO (o cartão em colunas, como o gráfico do WSJ)

O texto da reportagem só traz receita, computação, valor justo de 2026 e
prejuízo. Juros, pessoal, vendas, a quarta faixa das despesas operacionais
(sem nome no WSJ), outras despesas e o valor justo de 2025 existem só como
altura de barra no gráfico do jornal, e foram MEDIDOS nele, em pixels, em
21/10/2026: grade de 25 em 25 bi a 111,4 px, ou 4,46 px por bilhão, zero em
y = 249,75. A conferência bate com o texto: receita de 2026 mede 16,2 (16,3),
valor justo 72,4 (72) e a linha do prejuízo cai em −80,7. Erro de ±0,3 bi.

- 2026: juros +1,1; pessoal −3,1; vendas −3,1; outras operacionais −1,8; a
  linha do resultado operacional mede −0,7 e a conta dá 16,3 − 17,0 = −0,7.
  Outras despesas fecham a conta no prejuízo de 80,7 (−9,1; medido −8,9).
- 2025: as despesas operacionais medem 3,0 no total, sem divisão visível; a
  computação é 2,3 (texto), e o resto, −0,7, vai para "outras operacionais".
  O valor justo fecha no prejuízo de 13 (−11,1; medido −11,2). Juros e
  outras despesas não aparecem.

IPO: a SpaceX abriu capital na Nasdaq em 12/06/2026 a US$ 135 por ação, o que
dá US$ 1,77 tri; captou US$ 85,7 bi com o lote suplementar (Reuters). A
Anthropic pode chegar a US$ 2 tri no IPO (WSJ), ainda sem preço; a última
rodada privada, a série H de maio/2026, foi a US$ 965 bi pós-money (Orrick).
"""
import json
import os

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SAIDA = os.path.join(RAIZ, "dados", "acoes-eua.json")

S1 = "Anthropic, rascunho do prospecto (S-1), via The Wall Street Journal (20/10/2026)"

CINZA, AZUL, LARANJA, VERMELHO, AZUL_CLARO = "#95A5A6", "#4F81BD", "#F79646", "#C0504D", "#4BACC6"

RECEITA = (1.1, 16.3)
PREJUIZO = (13.0, 80.7)
VALOR_JUSTO = 72.0
COMPUTACAO = (2.3, 9.0)
DOIS_CLIENTES = round(RECEITA[1] / 5, 2)

SPACEX_IPO = 1770        # US$ bi, a US$ 135 por ação
SPACEX_CAPTOU = 85.7
ANTHROPIC_SERIE_H = 965
ANTHROPIC_IPO = 2000     # "could help it reach a valuation of $2 trillion"

SEMESTRES = ("1º sem. 2025", "1º sem. 2026")


def comparacao(id_, titulo, subtitulo, valores, cores, **extra):
    g = {
        "id": id_, "painel": "comparacao", "titulo": titulo, "subtitulo": subtitulo,
        "unidade": "usd-bi", "fonte": S1,
        "barras": [{"rot": r, "v": v, "cor": c} for r, v, c in zip(SEMESTRES, valores, cores)],
    }
    g.update(extra)
    return g


def main():
    assert abs(PREJUIZO[1] - VALOR_JUSTO - 8.7) < 1e-9

    receita = comparacao(
        "anthropic-receita", "Anthropic: receita no semestre",
        "Receita no 1º semestre, em US$ bilhões; variação sobre o 1º semestre do ano anterior",
        [RECEITA[0], RECEITA[1]], [CINZA, AZUL],
        citacao={
            "texto": "A Anthropic espera que “uma parcela significativa” da receita venha de "
                     "“um número limitado de clientes no futuro previsível”.",
            "autor": "rascunho do prospecto (S-1), tradução livre",
            "cor": LARANJA,
        })
    receita["barras"][1]["destaque"] = {
        "v": DOIS_CLIENTES, "cor": LARANJA, "rot": "2 clientes: cerca de 1/5 da receita",
        "rotCurto": "2 clientes: ≈ 1/5"}

    prejuizo = comparacao(
        "anthropic-prejuizo", "Anthropic: prejuízo líquido no semestre",
        "Prejuízo líquido no 1º semestre, em US$ bilhões; variação sobre o 1º semestre do ano anterior",
        [-PREJUIZO[0], -PREJUIZO[1]], [CINZA, VERMELHO])

    ipo = {
        "id": "anthropic-spacex-ipo", "painel": "barras",
        "titulo": "Anthropic × SpaceX: valor de mercado no IPO",
        "subtitulo": "Valor de mercado, em US$; tracejado, o que o IPO da Anthropic pode alcançar (ainda sem preço)",
        "unidade": "usd-bi-tri",
        "fonte": "Reuters (SpaceX), The Wall Street Journal (IPO da Anthropic) e Orrick (série H)",
        "linhas": [
            {"rot": "Anthropic: série H", "detalhe": "Última rodada privada, maio de 2026 (pós-money)",
             "v": ANTHROPIC_SERIE_H, "cor": CINZA},
            {"rot": "SpaceX: IPO", "detalhe": "Nasdaq, junho de 2026; captou US$ 85,7 bi",
             "v": SPACEX_IPO, "cor": AZUL_CLARO},
            {"rot": "Anthropic: IPO", "detalhe": "Valor que a abertura de capital pode alcançar",
             "v": ANTHROPIC_IPO, "cor": LARANJA, "contorno": True, "prefixo": "até "},
        ],
    }

    computacao = comparacao(
        "anthropic-computacao", "Anthropic: gasto com computação no semestre",
        "Capacidade computacional e infraestrutura no 1º semestre, em US$ bilhões; 2026 é aproximado (“quase US$ 9 bi”)",
        [COMPUTACAO[0], COMPUTACAO[1]], [CINZA, AZUL])
    computacao["barras"][1]["aprox"] = True

    composicao = {
        "id": "anthropic-valor-justo", "painel": "composicao",
        "titulo": "Anthropic: US$ 72 bi do prejuízo não saíram do caixa",
        "subtitulo": "Prejuízo líquido do 1º semestre de 2026, em US$ bilhões, por origem",
        "unidade": "usd-bi", "fonte": S1,
        "total": {"rot": "Prejuízo líquido do 1º semestre de 2026", "v": -PREJUIZO[1]},
        "partes": [
            {"rot": "Variação do valor justo de notas conversíveis e de outros instrumentos emitidos para captar recursos",
             "v": VALOR_JUSTO, "cor": VERMELHO, "marca": "não caixa"},
            {"rot": "Demais itens (resultado operacional, juros e outros)",
             "v": round(PREJUIZO[1] - VALOR_JUSTO, 1), "cor": CINZA},
        ],
        "nota": (
            "A Anthropic captou parte do dinheiro com **notas conversíveis** e outros instrumentos que viram "
            "ações. Eles ficam no balanço como passivo, medido a **valor justo**: quando a empresa passa a "
            "valer mais, o direito de converter vale mais, o passivo cresce e a diferença entra no resultado "
            "como despesa. Foram US$ 72 bi no 1º semestre de 2026.\n\n"
            "É uma despesa **não caixa** — nenhum dinheiro saiu da empresa. Ela é o reflexo contábil da "
            "valorização da Anthropic, que foi de US$ 380 bi na série G (fevereiro) a US$ 965 bi na série H "
            "(maio) e mira até US$ 2 tri no IPO. Quando os papéis viram ações, o passivo deixa de existir."
        ),
    }

    # US$ bi; None = não aparece; medido = lido no gráfico do WSJ (ver o cabeçalho)
    juros = (None, 1.1)
    pessoal, vendas, outras_op = (None, -3.1), (None, -3.1), (-0.7, -1.8)
    op = [round(RECEITA[k] - COMPUTACAO[k] - sum(-(x[k] or 0) for x in (pessoal, vendas, outras_op)), 1) for k in (0, 1)]
    outras = (None, round(-PREJUIZO[1] - op[1] - juros[1] + VALOR_JUSTO, 1))
    vj25 = round(-PREJUIZO[0] - op[0], 1)
    assert op == [-1.9, -0.7] and outras[1] == -9.1 and vj25 == -11.1, (op, outras, vj25)
    LARANJA_ESCURO = "#E46C0A"
    demonstrativo = {
        "id": "anthropic-resultado", "painel": "pilhas",
        "titulo": "Anthropic: a demonstração de resultado do semestre",
        "subtitulo": "1º semestre, em US$ bilhões; ≈ é medido no gráfico do WSJ, e em 2025 pessoal e vendas estão em outras operacionais",
        "unidade": "usd-bi",
        "fonte": S1 + "; valores com ≈ medidos no gráfico do WSJ",
        "colunas": ["1º sem. 2025", "1º sem. 2026"],
        "colunasCurtas": ["2025", "2026"],
        "itens": [
            {"rot": "Receita", "v": list(RECEITA), "cor": AZUL_CLARO},
            {"rot": "Juros recebidos", "v": list(juros), "cor": "#9DD3E2", "medido": [False, True]},
            {"rot": "Computação e infraestrutura", "v": [-COMPUTACAO[0], -COMPUTACAO[1]], "cor": LARANJA_ESCURO, "medido": [False, True]},
            {"rot": "Pessoal", "v": list(pessoal), "cor": LARANJA, "medido": [False, True]},
            {"rot": "Vendas e marketing", "v": list(vendas), "cor": LARANJA, "medido": [False, True]},
            {"rot": "Outras despesas operacionais", "v": list(outras_op), "cor": LARANJA, "medido": [True, True]},
            {"rot": "Valor justo dos conversíveis e outros instrumentos", "v": [vj25, -VALOR_JUSTO], "cor": VERMELHO, "medido": [True, False]},
            {"rot": "Outras despesas", "v": list(outras), "cor": "#D99694", "medido": [False, True]},
        ],
        "marcos": [
            {"rot": "Resultado operacional", "v": op, "medido": [True, True]},
            {"rot": "Prejuízo líquido", "v": [-PREJUIZO[0], -PREJUIZO[1]]},
        ],
    }

    riscos = {
        "id": "anthropic-riscos", "painel": "paginas",
        "titulo": "Anthropic: um terço do prospecto são fatores de risco",
        "subtitulo": "Parcela do rascunho do prospecto dedicada a fatores de risco; os riscos citados pelo WSJ",
        "fonte": S1,
        "paginas": {"total": 3, "marcadas": 1, "cor": VERMELHO,
                    "legenda": "Cerca de 1/3 das páginas: fatores de risco"},
        "itens": [
            {"t": "Concentração de clientes",
             "d": "Cerca de 1/5 da receita do 1º semestre veio de dois clientes, e a dependência de poucos deve continuar"},
            {"t": "Falta de capacidade computacional",
             "d": "Os parceiros de nuvem não entregaram toda a capacidade pedida e cada vez mais veem a Anthropic como concorrente"},
            {"t": "US$ 450 bi em contratos de nuvem",
             "d": "Compromissos para os próximos 7 a 10 anos, na maior parte não canceláveis"},
            {"t": "Data centers de terceiros",
             "d": "Operadores com pouco histórico, cujas instalações podem ser menos confiáveis que as dos grandes provedores"},
            {"t": "Danos causados pelos modelos",
             "d": "De ciberataques sofisticados a possível chantagem: modelos podem mostrar “autopreservação” para evitar o desligamento"},
            {"t": "Responsabilidade e seguro",
             "d": "A empresa responde por dados roubados e incidentes causados pelos modelos; uma catástrofe pode ser grande demais para ter seguro"},
            {"t": "Resistência a data centers",
             "d": "Oposição política “mais organizada e coordenada”, e o perfil público da Anthropic atrai atenção para os projetos dela"},
        ],
    }

    doc = {
        "atualizado": "2026-10-20",
        "referencia": "2026-06",
        "fonte": "The Wall Street Journal (rascunho do prospecto da Anthropic), Reuters e Orrick",
        "categoria": "Ações EUA",
        "secoes": [{"titulo": "Anthropic", "graficos": [receita, prejuizo, ipo, computacao, composicao, demonstrativo, riscos]}],
    }
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print("gravado", SAIDA)


if __name__ == "__main__":
    main()
