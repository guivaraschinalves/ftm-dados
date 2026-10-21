#!/usr/bin/env python3
"""
Monta dados/moedas.json — a categoria "Moedas e câmbio" do site, a partir da
planilha `dados/Moedas brasileiras 5.xlsx`.

Uso:
    python3 scripts/moedas.py
    python3 scripts/moedas.py "dados/outra planilha.xlsx"

Só usa a biblioteca padrão: a leitura do .xlsx é a classe `Planilha` do
scripts/divida.py (zipfile + ElementTree). Não entra na Action — a planilha
chega à mão, como o Relatório da Dívida e a de reservas.

AS QUATRO ABAS

  - **1-BRL PP Chart** — o poder de compra do real desde a estreia dele, em
    índice com base 100 em junho de 1994 (o mês fechado antes de 1º de julho,
    quando o real entrou em circulação). A data do gráfico é a **coluna C**, e
    não a A: a coluna A é outro eixo, que começa em 1942 e serve a outro
    desenho da planilha. As colunas D e E são a mesma série, duplicada.
  - **USD PP Chart** — o mesmo para o dólar, de dezembro de 1912 em diante. É o
    índice `CUUR0000SA0R` do BLS baixado do FRED ("Purchasing Power of the
    Consumer Dollar"), reindexado para 100 no primeiro mês. Aqui a data é a
    coluna A mesmo, e o cabeçalho está na linha 11 — acima dela vêm seis linhas
    de cabeçalho do FRED e uma linha solta com dois 100 que não é dado.
  - **2-Chart Câmbio Justo** — o dólar de mercado (coluna D) e o dólar pela
    paridade do poder de compra (coluna F), em R$ por US$, com o mês na coluna
    C. A série da PPC parte de R$ 1,00 = US$ 1,00 em junho de 1994 e anda pelo
    diferencial de inflação; o gráfico começa em março de 1999, no câmbio
    flutuante.
  - **3-BRL USD 99 Depr %** — a sobre/(sub)valorização do real, coluna B, de
    março de 1999 em diante. Não é dado independente: confere exatamente com
    PPC ÷ mercado − 1 nos 329 meses, e o script reconfere isso a cada rodada.
  - **Diferencial Inflação** — IPCA menos CPI, os dois acumulados em 12 meses,
    repartido em duas colunas que nunca se sobrepõem: a **B** guarda o mês em
    que o Brasil teve a inflação maior e a **C**, o mês em que os Estados
    Unidos tiveram. Juntas são uma série só, e é assim que entram aqui.

O BURACO DE OUTUBRO DE 2025. Quatro das cinco séries param um mês no caminho, e
é o mesmo mês em todas: a paralisação de 43 dias do governo americano (1º de
outubro a 12 de novembro de 2025) impediu a coleta de preços, e o BLS cancelou
o CPI daquele mês em vez de atrasá-lo — os dados não podem ser coletados
retroativamente, então out/2025 não existe e nunca vai existir. Sem o CPI não
há diferencial de inflação, sem diferencial não há câmbio pela PPC e sem ele
não há sobre/(sub)valorização. O buraco fica à vista nos gráficos: emendar a
linha por cima dele seria inventar o mês.
"""
import datetime
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from divida import Planilha, serial_para_mes          # noqa: E402

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA = os.path.join(RAIZ, "dados", "moedas.json")

# Cores do tema do Office, as mesmas dos outros scripts.
AZUL, VERMELHO, VERDE, LARANJA = "#4F81BD", "#C0504D", "#9BBB59", "#F79646"
BRANCO = "#FFFFFF"

# A cédula que preenche a área sob a linha de cada gráfico de poder de compra.
# O desenho estica a imagem no quadro do gráfico e recorta no traço: quanto da
# nota aparece é o que ainda sobrou do dinheiro. A do real é a da **primeira
# família**, a que circulava em 1994, onde a linha começa — e não a atual, que
# só saiu em 2010.
NOTA_REAL = "assets/nota-real-1994.jpg"
NOTA_DOLAR = "assets/nota-dolar.jpg"

# Teto do eixo dos dois gráficos de poder de compra. Sem ele o do dólar sobe a
# 120, porque o índice passa de 100 em 1913 (bate em 100,71 em maio), e os dois
# gráficos deixam de ser lidos na mesma régua — que é o que faz a comparação.
TETO_PODER = 100

ABA_REAL = "1-BRL PP Chart"
ABA_DOLAR = "USD PP Chart"
ABA_CAMBIO = "2-Chart Câmbio Justo"
ABA_VALORIZACAO = "3-BRL USD 99 Depr %"
ABA_DIFERENCIAL = "Diferencial Inflação"

# O câmbio flutuante começa aqui, e é onde os três gráficos de câmbio abrem.
INICIO_FLUTUANTE = "1999-03"

FONTE_REAL = "IBGE (IPCA)"
FONTE_DOLAR = "BLS (CPI-U, Purchasing Power of the Consumer Dollar), via FRED"
FONTE_CAMBIO = "Banco Central (PTAX), IBGE (IPCA) e BLS (CPI-U), via FRED"

# O que a planilha chama de #DIV/0!, #N/D e afins: texto onde se espera número.
def numero(v):
    return v if isinstance(v, float) else None


def coluna(pl, aba, col_data, col_valor, minimo=4000):
    """Duas colunas soltas de uma aba (data em serial do Excel + valor) →
    {"AAAA-MM": valor}.

    `minimo` descarta o que não é data: as abas do FRED trazem seis linhas de
    cabeçalho, e uma delas tem número na coluna do valor. 4000 é o chão (serial
    4000 é 1910), baixo o bastante para o dólar, que começa em 1912."""
    fora = {}
    grade = pl.grade(aba)
    for linha in grade.values():
        d, v = numero(linha.get(col_data)), numero(linha.get(col_valor))
        if d is None or v is None or d < minimo:
            continue
        fora[serial_para_mes(d)] = v
    return fora


def juntar(a, b, nome):
    """Duas colunas que são a mesma série repartida por sinal (o diferencial de
    inflação) → uma só. Mês nas duas é erro de montagem da planilha, não um
    caso a tratar: aborta."""
    dobrado = sorted(set(a) & set(b))
    if dobrado:
        raise SystemExit("%s: %d meses preenchidos nas duas colunas (%s…). "
                         "Elas deveriam se excluir." % (nome, len(dobrado), dobrado[0]))
    fora = dict(a)
    fora.update(b)
    return fora


def desde(serie, mes):
    return {m: v for m, v in serie.items() if m >= mes}


def buracos(serie):
    """Os meses que faltam entre o primeiro e o último — para o log dizer onde a
    linha vai cortar, em vez de o buraco aparecer calado no desenho."""
    ms = sorted(serie)
    fora, cur = [], ms[0]
    while cur < ms[-1]:
        ano, mes = map(int, cur.split("-"))
        t = ano * 12 + mes
        cur = "%04d-%02d" % (t // 12, t % 12 + 1)
        if cur not in serie and cur < ms[-1]:
            fora.append(cur)
    return fora


def conta(serie):
    ms = sorted(serie)
    return "%4d meses, %s a %s; último %.4f" % (len(ms), ms[0], ms[-1], serie[ms[-1]])


def confere(nome, calculado, planilha, folga=1e-9):
    """A sobre/(sub)valorização da planilha contra a conta que a define. Se um
    dia as duas descolarem, é porque a coluna F passou a ser outra coisa — e aí
    é melhor parar do que publicar um gráfico que não é o que o título diz."""
    com = sorted(m for m in calculado if m in planilha)
    if not com:
        raise SystemExit("%s: as duas séries não têm nenhum mês em comum" % nome)
    pior, onde = max((abs(calculado[m] - planilha[m]), m) for m in com)
    if pior > folga:
        raise SystemExit("%s: a conta erra %.3e em %s (%d meses conferidos)"
                         % (nome, pior, onde, len(com)))
    print("  %s: confere com a planilha em %d meses (pior erro %.1e)" % (nome, len(com), pior))


def serie(nome, cor, dados, casas=2, **extra):
    pares = [[m, round(v, casas)] for m, v in sorted(dados.items())]
    return dict(nome=nome, cor=cor, dados=pares, **extra)


# --------------------------------------------------------------------------
# os cinco gráficos
# --------------------------------------------------------------------------

def grafico_poder_real(pp):
    ultimo = max(pp)
    return dict(
        id="moedas-pp-real",
        titulo="Perda de poder de compra do real",
        subtitulo="R$ 100 de junho de 1994, deflacionados pelo IPCA",
        unidade="brl",
        eixo=dict(max=TETO_PODER),
        fonte=FONTE_REAL,
        series=[serie("Real", BRANCO, pp, 2, largura=5, rotulo=True,
                      area=True, imagem=NOTA_REAL)],
    )


def grafico_poder_dolar(pp):
    ultimo = max(pp)
    return dict(
        id="moedas-pp-dolar",
        titulo="Perda de poder de compra do dólar",
        subtitulo="US$ 100 de dezembro de 1912, deflacionados pelo CPI",
        unidade="usd",
        eixo=dict(max=TETO_PODER),
        # um rótulo por década: em 113 anos de série, o passo que o eixo escolhe
        # sozinho (dois anos) cabe mas vira um paredão de texto inclinado
        passoX=120,
        fonte=FONTE_DOLAR,
        series=[serie("Dólar", BRANCO, pp, 2, largura=5, rotulo=True,
                      area=True, imagem=NOTA_DOLAR)],
    )


def grafico_cambio(mercado, ppc):
    return dict(
        id="moedas-cambio-ppc",
        titulo="A taxa de câmbio de equilíbrio",
        subtitulo="Dólar de mercado e dólar pela paridade do poder de compra, em R$ por US$",
        unidade="brl-usd",
        fonte=FONTE_CAMBIO,
        eixo=dict(zero=False),
        series=[
            serie("Dólar de mercado", VERDE, mercado, 4, largura=5, rotulo=True),
            serie("Câmbio pela PPC", AZUL, ppc, 4, largura=6, rotulo=True),
        ],
    )


def grafico_valorizacao(sv):
    return dict(
        id="moedas-sobrevalorizacao",
        titulo="Sobre/(sub)valorização do real",
        subtitulo="Dólar pela PPC ÷ dólar de mercado − 1, em %",
        unidade="%",
        fonte=FONTE_CAMBIO,
        series=[serie("Sobre/(sub)valorização do real", LARANJA, sv, 2,
                      largura=4, area=True, rotulo=True)],
    )


def grafico_diferencial(br_maior, us_maior):
    return dict(
        id="moedas-diferencial",
        titulo="Diferencial de inflação entre Brasil e Estados Unidos",
        subtitulo="IPCA − CPI, acumulados em 12 meses, em p.p.",
        unidade="%",
        fonte="IBGE (IPCA) e BLS (CPI-U), via FRED",
        series=[
            serie("Inflação do Brasil maior", AZUL, br_maior, 3, tipo="barra"),
            serie("Inflação dos EUA maior", VERMELHO, us_maior, 3, tipo="barra"),
        ],
    )


# --------------------------------------------------------------------------

def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else None
    if not caminho:
        achados = glob.glob(os.path.join(RAIZ, "dados", "*oeda*.xlsx"))
        if not achados:
            raise SystemExit("nenhuma planilha de moedas em dados/")
        caminho = max(achados, key=os.path.getmtime)
    print("Lendo %s" % os.path.basename(caminho))
    pl = Planilha(caminho)

    # --- poder de compra ---
    pp_real = coluna(pl, ABA_REAL, 3, 4)
    pp_dolar = coluna(pl, ABA_DOLAR, 1, 2)
    print("  real:  %s" % conta(pp_real))
    print("  dólar: %s" % conta(pp_dolar))

    # --- câmbio de equilíbrio ---
    mercado = desde(coluna(pl, ABA_CAMBIO, 3, 4), INICIO_FLUTUANTE)
    ppc = desde(coluna(pl, ABA_CAMBIO, 3, 6), INICIO_FLUTUANTE)
    sv_planilha = desde(coluna(pl, ABA_VALORIZACAO, 1, 2), INICIO_FLUTUANTE)
    print("  dólar de mercado: %s" % conta(mercado))
    print("  câmbio pela PPC:  %s" % conta(ppc))

    # a coluna B da aba 3 é PPC ÷ mercado − 1; conferir antes de publicar
    calculado = {m: ppc[m] / mercado[m] - 1 for m in ppc if m in mercado}
    confere("sobre/(sub)valorização", calculado, sv_planilha)
    sv = {m: v * 100 for m, v in sv_planilha.items()}

    # --- diferencial de inflação ---
    br_maior = coluna(pl, ABA_DIFERENCIAL, 1, 2)
    us_maior = coluna(pl, ABA_DIFERENCIAL, 1, 3)
    juntos = juntar(br_maior, us_maior, "diferencial de inflação")
    print("  diferencial: %s (%d meses com o Brasil à frente, %d com os EUA)"
          % (conta(juntos), len(br_maior), len(us_maior)))

    for nome, s in (("dólar (poder de compra)", pp_dolar), ("câmbio pela PPC", ppc),
                    ("sobre/(sub)valorização", sv), ("diferencial", juntos)):
        falta = buracos(s)
        if falta:
            print("  buraco em %s: %s" % (nome, ", ".join(falta)))

    secoes = [
        dict(titulo="Poder de compra",
             graficos=[grafico_poder_real(pp_real), grafico_poder_dolar(pp_dolar)]),
        dict(titulo="Câmbio de equilíbrio",
             graficos=[grafico_cambio(mercado, ppc), grafico_valorizacao(sv),
                       grafico_diferencial({m: v * 100 for m, v in br_maior.items()},
                                           {m: v * 100 for m, v in us_maior.items()})]),
    ]
    ref = max(mercado)
    doc = dict(
        atualizado=datetime.date.today().isoformat(),
        referencia=ref,
        fonte="IBGE (IPCA), BLS (CPI-U, via FRED) e Banco Central (PTAX)",
        categoria="Moedas e câmbio",
        secoes=secoes,
    )
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")
    print("gravado %s (%.0f KB), referência %s"
          % (SAIDA, os.path.getsize(SAIDA) / 1024, doc["referencia"]))
    for sec in secoes:
        print("  %-22s %s" % (sec["titulo"] + ":", ", ".join(g["id"] for g in sec["graficos"])))


if __name__ == "__main__":
    main()
