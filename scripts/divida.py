#!/usr/bin/env python3
"""
Lê o Relatório Mensal da Dívida do Tesouro Nacional (o .xlsx dos anexos que
fica em dados/) e grava dados/divida.json — a categoria "Dívida Pública" do
site, no mesmo formato do ipca.json.

Uso:
    python3 scripts/divida.py                      # pega o .xlsx mais novo de dados/
    python3 scripts/divida.py "dados/outro.xlsx"

Só usa a biblioteca padrão (zipfile + ElementTree): o Python daqui não tem
openpyxl, e o site não lê o Excel — lê o JSON gerado a partir dele.

Para atualizar todo mês: baixar o novo "Relatório da Dívida <Mês><Ano>.xlsx"
em https://www.gov.br/tesouronacional (Relatório Mensal da Dívida → anexos),
jogar em dados/ e rodar este script.

Uma função por gráfico, e cada uma diz de que anexo vem e o que faz com ele.
Os percentuais são sempre recalculados aqui (valor ÷ total da linha): as
colunas de % da planilha ora vêm em fração, ora em pontos percentuais.
"""
import datetime
import glob
import json
import os
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA = os.path.join(RAIZ, "dados", "divida.json")

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

# Cores do tema do Office, as mesmas dos gráficos do IPCA.
AZUL, VERMELHO, VERDE, ROXO, CIANO, LARANJA = "#4F81BD", "#C0504D", "#9BBB59", "#8064A2", "#4BACC6", "#F79646"
AZUL_ESCURO, VINHO, OLIVA, AMARELO, BRANCO = "#1F497D", "#632523", "#77933C", "#FFFF00", "#FFFFFF"
CINZA, AREIA, PETROLEO = "#95A5A6", "#D9B382", "#2E6E7E"

MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


# --------------------------------------------------------------------------
# leitura do .xlsx
# --------------------------------------------------------------------------

class Planilha:
    """Só o necessário: valores das células, por aba, em {linha: {coluna: valor}}."""

    def __init__(self, caminho):
        self.z = zipfile.ZipFile(caminho)
        self.textos = []
        if "xl/sharedStrings.xml" in self.z.namelist():
            for si in ET.fromstring(self.z.read("xl/sharedStrings.xml")):
                self.textos.append("".join(t.text or "" for t in si.iter(NS + "t")))
        rels = {r.get("Id"): r.get("Target") for r in
                ET.fromstring(self.z.read("xl/_rels/workbook.xml.rels"))}
        self.abas = {}
        for sh in ET.fromstring(self.z.read("xl/workbook.xml")).iter(NS + "sheet"):
            alvo = rels[sh.get(RNS + "id")].lstrip("/")
            self.abas[sh.get("name")] = alvo if alvo.startswith("xl/") else "xl/" + alvo

    def grade(self, aba):
        fora = {}
        for c in ET.fromstring(self.z.read(self.abas[aba])).iter(NS + "c"):
            ref, tipo = c.get("r"), c.get("t")
            v, ins = c.find(NS + "v"), c.find(NS + "is")
            if tipo == "s" and v is not None:
                val = self.textos[int(v.text)]
            elif tipo == "inlineStr" and ins is not None:
                val = "".join(x.text or "" for x in ins.iter(NS + "t"))
            elif v is not None:
                try:
                    val = float(v.text)
                except ValueError:
                    val = v.text
            else:
                continue
            if val == "":
                continue
            m = re.match(r"([A-Z]+)(\d+)", ref)
            col = 0
            for ch in m.group(1):
                col = col * 26 + ord(ch) - 64
            fora.setdefault(int(m.group(2)), {})[col] = val
        return fora


def numero(x):
    return x if isinstance(x, float) else None


# --------------------------------------------------------------------------
# datas
# --------------------------------------------------------------------------

def serial_para_mes(n):
    """Serial do Excel (dia do fim do mês) → "AAAA-MM"."""
    d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(n))
    return "%04d-%02d" % (d.year, d.month)


def rotulo_para_mes(txt):
    """"Nov/06", "mar/18*" → "AAAA-MM". Ano de dois dígitos: 90+ é 19xx."""
    m = re.match(r"\s*([A-Za-zçÇ]{3})[a-z]*/(\d{2,4})", str(txt).strip())
    if not m:
        return None
    nome = m.group(1).lower()
    if nome not in MESES:
        return None
    ano = int(m.group(2))
    if ano < 100:
        ano += 1900 if ano >= 90 else 2000
    return "%04d-%02d" % (ano, MESES.index(nome) + 1)


def mes_da_celula(v):
    """Coluna A das abas em pé: ora serial, ora texto tipo "mar/18*"."""
    if isinstance(v, float):
        return serial_para_mes(v) if v > 30000 else None
    return rotulo_para_mes(v)


def meses_do_cabecalho(linha):
    """Abas deitadas (1.2, 3.8, 4.1, 4.2): linha 5 = "Nov/06", "Dez/06"…"""
    fora = {}
    for col, v in linha.items():
        mes = rotulo_para_mes(v)
        if mes:
            fora[col] = mes
    return fora


# --------------------------------------------------------------------------
# montagem das séries
# --------------------------------------------------------------------------

def serie(nome, cor, dados, casas=2, **extra):
    pares = [[m, round(v, casas)] for m, v in sorted(dados.items())]
    return dict(nome=nome, cor=cor, dados=pares, **extra)


def grafico(id_, titulo, subtitulo, **extra):
    return dict(id=id_, titulo=titulo, subtitulo=subtitulo, **extra)


def variante(rot, series, unidade, **extra):
    return dict(rot=rot, series=series, unidade=unidade, **extra)


def deitada(grade, linha, meses, escala=1.0):
    """Uma linha de aba deitada → {mês: valor}."""
    fora = {}
    for col, v in grade.get(linha, {}).items():
        n = numero(v)
        if n is not None and col in meses:
            fora[meses[col]] = n * escala
    return fora


def em_pe(grade, linhas, col, escala=1.0):
    """Uma coluna de aba em pé → {mês: valor}, para as linhas dadas."""
    fora = {}
    for r in linhas:
        mes = mes_da_celula(grade[r].get(1))
        n = numero(grade[r].get(col))
        if mes and n is not None:
            fora[mes] = n * escala
    return fora


def linhas_de_dados(grade, ini, fim):
    """Linhas do bloco [ini, fim) cuja coluna A é um mês."""
    return [r for r in sorted(grade) if ini <= r < fim and mes_da_celula(grade[r].get(1))]


def participacao(grade, linhas, colunas, total_col):
    """Colunas de valor → {nome: {mês: % do total da linha}}. O % vem sempre da
    divisão, nunca das colunas de % da planilha (que misturam fração e p.p.)."""
    fora = {nome: {} for _, nome in colunas}
    for r in linhas:
        mes = mes_da_celula(grade[r].get(1))
        total = numero(grade[r].get(total_col))
        if not mes or not total:
            continue
        for col, nome in colunas:
            n = numero(grade[r].get(col))
            if n is not None:
                fora[nome][mes] = n / total * 100
    return fora


def valores(grade, linhas, colunas):
    fora = {nome: {} for _, nome in colunas}
    for r in linhas:
        mes = mes_da_celula(grade[r].get(1))
        if not mes:
            continue
        for col, nome in colunas:
            n = numero(grade[r].get(col))
            if n is not None:
                fora[nome][mes] = n
    return fora


# --------------------------------------------------------------------------
# gráficos
# --------------------------------------------------------------------------

# Cor fixa por categoria, para a mesma coisa ter a mesma cor em todos os gráficos.
COR_INDEXADOR = {"Prefixado": AZUL, "Prefixados": AZUL, "Índice de Preços": LARANJA,
                 "Taxa Flutuante": CIANO, "Câmbio": VERMELHO, "Demais": CINZA}
COR_TITULO = {"LFT": CIANO, "LTN": AZUL, "NTN-B": LARANJA, "NTN-C": VINHO,
              "NTN-F": VERDE, "LTN / NTN-F": AZUL, "Outros": CINZA, "Demais": CINZA}
COR_DETENTOR = {"Instituições Financeiras": AZUL, "Fundos de Investimento": LARANJA,
                "Previdência": VERDE, "Não-residentes": VERMELHO, "Tesouro Direto": CIANO,
                "Governo": ROXO, "Seguradoras": AREIA, "Outros": CINZA}
# do vencimento mais curto para o mais longo
COR_PRAZO = [VERMELHO, LARANJA, "#E8C547", VERDE, CIANO, AZUL]   # do curto para o longo

BI = "R$ bilhões"
PCT = "% do total"


def emissoes_resgates(p):
    """Anexo 1.2 — emissões (para cima) e resgates (para baixo) por indexador,
    em R$ bilhões. A planilha traz os resgates positivos; aqui eles descem."""
    g = p.grade("1.2")
    meses = meses_do_cabecalho(g[5])
    blocos = {
        "dpmfi": ("Dívida interna (DPMFi)", [
            ("Prefixados", 10, 25), ("Índice de Preços", 11, 26), ("Taxa Flutuante", 12, 27),
            ("Câmbio", 13, 28), ("Demais", 14, 29)]),
        "dpfe": ("Dívida externa (DPFe)", [
            ("Dólar", 17, 32), ("Euro", 18, 33), ("Real", 19, 34), ("Demais", 20, 35)]),
    }
    cores = {"Dólar": VERDE, "Euro": AZUL, "Real": LARANJA}
    vars_ = []
    for chave, (rot, itens) in blocos.items():
        series = []
        for nome, lin_e, lin_r in itens:
            cor = COR_INDEXADOR.get(nome) or cores.get(nome) or CINZA
            emi = deitada(g, lin_e, meses, 0.001)
            res = {m: -v for m, v in deitada(g, lin_r, meses, 0.001).items()}
            series.append(serie(nome, cor, emi, tipo="barra"))
            series.append(serie(nome + " (resgate)", cor, res, tipo="barra", legenda=False))
        vars_.append(variante(rot, series, "bi"))
    return grafico("divida-emissoes-resgates", "Emissões e resgates da Dívida Pública Federal",
                   "Por indexador, em R$ bilhões — resgates com sinal negativo",
                   variantes=vars_, periodoPadrao="10")


def composicao_dpf(p):
    """Anexo 2.4 — composição da DPF por indexador, em % e em R$ bilhões."""
    g = p.grade("2.4")
    linhas = linhas_de_dados(g, 5, 315)
    cols = [(2, "Prefixado"), (4, "Índice de Preços"), (6, "Taxa Flutuante"),
            (8, "Câmbio"), (10, "Demais")]
    pct = participacao(g, linhas, cols, 12)
    val = valores(g, linhas, cols)
    def series(fonte):
        return [serie(n, COR_INDEXADOR[n], fonte[n], tipo="barra") for _, n in cols]
    return grafico("divida-composicao", "Composição da Dívida Pública Federal", "Por indexador",
                   variantes=[
                       variante(PCT, series(pct), "%", eixo=dict(min=0, max=100), barra=1),
                       variante(BI, series(val), "bi", barra=1),
                   ])


def detentores(p):
    """Anexo 2.7 — detentores dos títulos da DPMFi, em % e em R$ bilhões."""
    g = p.grade("2.7")
    linhas = linhas_de_dados(g, 5, 241)
    cols = [(2, "Instituições Financeiras"), (4, "Fundos de Investimento"), (6, "Previdência"),
            (8, "Não-residentes"), (10, "Tesouro Direto"), (12, "Governo"),
            (14, "Seguradoras"), (16, "Outros")]
    pct = participacao(g, linhas, cols, 18)
    val = valores(g, linhas, cols)
    def series(fonte):
        return [serie(n, COR_DETENTOR[n], fonte[n], tipo="barra") for _, n in cols]
    return grafico("divida-detentores", "Detentores da dívida interna (DPMFi)", "Quem carrega os títulos",
                   variantes=[
                       variante(PCT, series(pct), "%", eixo=dict(min=0, max=100), barra=1),
                       variante(BI, series(val), "bi", barra=1),
                   ])


BLOCOS_2_8 = [(5, 195, "LFT"), (195, 385, "LTN"), (385, 575, "NTN-B"),
              (575, 765, "NTN-F"), (765, 956, "Outros")]
COLS_2_8 = [(2, "Instituições Financeiras"), (4, "Fundos de Investimento"), (6, "Não-residentes"),
            (8, "Previdência"), (10, "Tesouro Direto"), (12, "Governo"),
            (14, "Seguradoras"), (16, "Outros")]


def le_2_8(p):
    """Anexo 2.8 → {título: {detentor: {mês: % daquele título}}}."""
    g = p.grade("2.8")
    fora = {}
    for ini, fim, titulo in BLOCOS_2_8:
        linhas = linhas_de_dados(g, ini, fim)
        fora[titulo] = participacao(g, linhas, COLS_2_8, 18)
    return fora


def detentores_por_titulo(p, tabela):
    """Um título por vez: como os detentores dele se dividem."""
    vars_ = []
    for _, _, titulo in BLOCOS_2_8:
        series = [serie(n, COR_DETENTOR[n], tabela[titulo][n], tipo="barra") for _, n in COLS_2_8]
        vars_.append(variante(titulo, series, "%", eixo=dict(min=0, max=100), barra=1))
    return grafico("divida-detentores-por-titulo", "Detentores de cada título",
                   "Participação no estoque do título, em %", variantes=vars_)


def titulos_por_detentor(p, tabela):
    """O mesmo anexo 2.8 lido de lado: um detentor por vez, e quanto de cada
    título ele carrega. Como a aba só traz o % dentro de cada título, aqui a
    conta volta para reais (participação × estoque do título) e daí sai o % da
    carteira do detentor."""
    g = p.grade("2.8")
    estoque = {}
    for ini, fim, titulo in BLOCOS_2_8:
        linhas = linhas_de_dados(g, ini, fim)
        estoque[titulo] = {mes_da_celula(g[r][1]): numero(g[r].get(18)) for r in linhas}
    vars_ = []
    for _, detentor in COLS_2_8:
        carteira, total = {}, {}
        for _, _, titulo in BLOCOS_2_8:
            carteira[titulo] = {}
            for mes, pc in tabela[titulo][detentor].items():
                v = pc / 100 * (estoque[titulo].get(mes) or 0)
                carteira[titulo][mes] = v
                total[mes] = total.get(mes, 0) + v
        series = []
        for _, _, titulo in BLOCOS_2_8:
            dados = {m: v / total[m] * 100 for m, v in carteira[titulo].items() if total.get(m)}
            series.append(serie(titulo, COR_TITULO[titulo], dados, tipo="barra"))
        vars_.append(variante(detentor, series, "%", eixo=dict(min=0, max=100), barra=1))
    return grafico("divida-titulos-por-detentor", "Carteira de cada detentor",
                   "Composição por título, em % da carteira", variantes=vars_)


def vencimentos(p):
    """Anexo 3.1 — estrutura de vencimentos por faixa de prazo."""
    g = p.grade("3.1")
    cols = [(2, "Até 12 meses"), (4, "De 1 a 2 anos"), (6, "De 2 a 3 anos"),
            (8, "De 3 a 4 anos"), (10, "De 4 a 5 anos"), (12, "Acima de 5 anos")]
    vars_ = []
    for ini, fim, rot in [(5, 258, "DPF"), (258, 584, "DPMFi"), (584, 837, "DPFe")]:
        linhas = linhas_de_dados(g, ini, fim)
        pct = participacao(g, linhas, cols, 14)
        series = [serie(n, COR_PRAZO[k], pct[n], tipo="barra") for k, (_, n) in enumerate(cols)]
        vars_.append(variante(rot, series, "%", eixo=dict(min=0, max=100), barra=1))
    return grafico("divida-vencimentos", "Estrutura de vencimentos da dívida",
                   "Participação de cada faixa de prazo, em %", variantes=vars_)


def vencimentos_por_indexador(p):
    """Anexo 3.2 — a mesma estrutura de vencimentos, um indexador por vez."""
    g = p.grade("3.2")
    cols = [(2, "Até 1 ano"), (4, "De 1 a 2 anos"), (6, "De 2 a 3 anos"),
            (8, "De 3 a 4 anos"), (10, "De 4 a 5 anos"), (12, "Acima de 5 anos")]
    blocos = [(5, 333, "Prefixados"), (333, 661, "Taxa Flutuante"), (661, 989, "Índice de Preços"),
              (989, 1318, "Câmbio"), (1318, 1646, "Demais")]
    vars_ = []
    for ini, fim, rot in blocos:
        linhas = linhas_de_dados(g, ini, fim)
        pct = participacao(g, linhas, cols, 14)
        series = [serie(n, COR_PRAZO[k], pct[n], tipo="barra") for k, (_, n) in enumerate(cols)]
        vars_.append(variante(rot, series, "%", eixo=dict(min=0, max=100), barra=1))
    return grafico("divida-vencimentos-indexador", "Estrutura de vencimentos por indexador",
                   "Participação de cada faixa de prazo, em %", variantes=vars_)


def cronograma(p, fechamento):
    """Anexo 3.4 — o que vence mês a mês nos próximos cinco anos (por título) e
    a tabela do fim da aba, com o acumulado em 12, 24, 36, 48 e 60 meses."""
    g = p.grade("3.4")
    cols = [(2, "LTN / NTN-F"), (3, "LFT"), (4, "NTN-B"), (5, "NTN-C"), (6, "Demais")]
    linhas = linhas_de_dados(g, 6, 69)
    mensal = {}
    for col, nome in cols:
        mensal[nome] = {}
        for r in linhas:
            mes, n = mes_da_celula(g[r][1]), numero(g[r].get(col))
            if mes and n is not None:
                mensal[nome][mes] = n / 1000
    faixas = [(69, "Em 12 meses"), (70, "Em 24 meses"), (71, "Em 36 meses"),
              (72, "Em 48 meses"), (73, "Em 60 meses"), (74, "Após 5 anos")]
    acum = {}
    for col, nome in cols:
        acum[nome] = {str(k): (numero(g[r].get(col)) or 0) / 1000 for k, (r, _) in enumerate(faixas)}
    return grafico("divida-cronograma", "Cronograma de vencimentos da DPF",
                   "Fechamento de " + fechamento, variantes=[
                       variante("Mês a mês", [serie(n, COR_TITULO[n], mensal[n], tipo="barra")
                                              for _, n in cols], "bi", passoX=3),
                       variante("Acumulado", [serie(n, COR_TITULO[n], acum[n], tipo="barra")
                                              for _, n in cols], "bi",
                                categorias=[nome for _, nome in faixas]),
                   ])


def prazo_medio(p):
    """Anexo 3.8 — prazo médio, em anos."""
    g = p.grade("3.8")
    meses = meses_do_cabecalho(g[5])
    def linha(r, nome, cor, **extra):
        return serie(nome, cor, deitada(g, r, meses), casas=3, **extra)
    interna = grafico("divida-prazo-dpmfi", "Prazo médio da dívida interna (DPMFi)",
                      "Em anos, por indexador", unidade="anos", series=[
                          linha(9, "DPMFi", BRANCO, rotulo=True),
                          linha(10, "Prefixados", AZUL, rotulo=True),
                          linha(11, "Índice de Preços", LARANJA, rotulo=True),
                          linha(12, "Taxa Flutuante", CIANO, rotulo=True),
                          linha(13, "Câmbio", VERMELHO)])
    externa = grafico("divida-prazo-dpfe", "Prazo médio da dívida externa (DPFe)",
                      "Em anos, por tipo de dívida", unidade="anos", series=[
                          linha(16, "DPFe", BRANCO, rotulo=True),
                          linha(18, "Global USD", VERDE, rotulo=True),
                          linha(19, "Euros", AZUL, rotulo=True),
                          linha(20, "Global BRL", LARANJA, rotulo=True),
                          linha(23, "Dívida Contratual", ROXO, rotulo=True)])
    return interna, externa


def custo(p):
    """Anexos 4.1 (custo médio mensal) e 4.2 (acumulado em 12 meses), em % a.a."""
    g41, g42 = p.grade("4.1"), p.grade("4.2")
    m41, m42 = meses_do_cabecalho(g41[5]), meses_do_cabecalho(g42[5])

    def cartao(id_, titulo, sub, grade, meses, linhas, **extra_g):
        return grafico(id_, titulo, sub, unidade="%", series=[
            serie(nome, cor, deitada(grade, r, meses), **extra)
            for r, nome, cor, extra in linhas], **extra_g)

    interna = [(9, "DPMFi", BRANCO, dict(rotulo=True)), (10, "LFT", CIANO, dict(rotulo=True)),
               (11, "LTN", AZUL, dict(rotulo=True)), (12, "NTN-B", LARANJA, dict(rotulo=True)),
               (14, "NTN-C", VINHO, {}), (16, "NTN-F", VERDE, dict(rotulo=True))]
    externa = [(21, "DPFe", BRANCO, dict(rotulo=True)), (23, "Global USD", VERDE, dict(rotulo=True)),
               (24, "Euro", AZUL, {}), (25, "Global BRL", LARANJA, dict(rotulo=True)),
               (28, "Dívida Contratual", ROXO, dict(rotulo=True))]
    MENSAL = "Custo médio mensal, em % a.a."
    NOTA_MENSAL = ("O custo de um mês só é anualizado, então oscila muito — na dívida externa, "
                   "com a variação cambial do mês. Para a tendência, veja o acumulado em 12 meses.")
    ACUM = "Custo médio acumulado em 12 meses, em % a.a."
    saida = [
        cartao("divida-custo-mensal-dpmfi", "Custo da dívida interna (DPMFi)", MENSAL, g41, m41, interna, nota=NOTA_MENSAL),
        cartao("divida-custo-mensal-dpfe", "Custo da dívida externa (DPFe)", MENSAL, g41, m41, externa, nota=NOTA_MENSAL),
        cartao("divida-custo-12m-dpmfi", "Custo da dívida interna (DPMFi)", ACUM, g42, m42, interna),
        cartao("divida-custo-12m-dpfe", "Custo da dívida externa (DPFe)", ACUM, g42, m42, externa),
        grafico("divida-custo-dpmfi-mensal-e-12m", "Custo da dívida interna (DPMFi)",
                "Custo médio mensal e acumulado em 12 meses, em % a.a.", unidade="%", series=[
                    serie("Custo médio mensal", CIANO, deitada(g41, 9, m41), rotulo=True),
                    serie("Acumulado em 12 meses", LARANJA, deitada(g42, 9, m42), rotulo=True)]),
    ]
    return saida


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def achar_planilha():
    """O .xlsx mais novo de dados/ — assim, no mês que vem, basta jogar o novo
    relatório na pasta."""
    achados = sorted(glob.glob(os.path.join(RAIZ, "dados", "*.xlsx")), key=os.path.getmtime)
    if not achados:
        raise SystemExit("Nenhum .xlsx em dados/ — baixe o Relatório Mensal da Dívida e coloque lá.")
    return achados[-1]


def main():
    caminho = sys.argv[1] if len(sys.argv) > 1 else achar_planilha()
    print("Lendo", os.path.relpath(caminho, RAIZ))
    p = Planilha(caminho)

    g34 = p.grade("3.4")
    fechamento = str(g34.get(5, {}).get(8, "")).replace("Fechamento de ", "").strip()
    tabela28 = le_2_8(p)
    prazo_interna, prazo_externa = prazo_medio(p)

    secoes = [
        dict(titulo="Emissões e resgates", graficos=[emissoes_resgates(p)]),
        dict(titulo="Composição e detentores", graficos=[
            composicao_dpf(p), detentores(p),
            detentores_por_titulo(p, tabela28), titulos_por_detentor(p, tabela28)]),
        dict(titulo="Vencimentos", graficos=[
            vencimentos(p), vencimentos_por_indexador(p), cronograma(p, fechamento)]),
        dict(titulo="Prazo médio", graficos=[prazo_interna, prazo_externa]),
        dict(titulo="Custo", graficos=custo(p)),
    ]

    # mês de referência: o último mês de dados que não é vencimento futuro
    ref = ""
    for sec in secoes:
        for gr in sec["graficos"]:
            if gr["id"] == "divida-cronograma":
                continue
            for v in gr.get("variantes", [dict(series=gr.get("series", []))]):
                for s in v["series"]:
                    if s["dados"] and s["dados"][-1][0][0].isdigit():
                        ref = max(ref, s["dados"][-1][0])

    doc = dict(
        atualizado=datetime.date.today().isoformat(),
        referencia=ref,
        fonte="Tesouro Nacional e FtM",
        categoria="Dívida Pública",
        secoes=secoes,
    )
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    n = sum(len(sec["graficos"]) for sec in secoes)
    tam = os.path.getsize(SAIDA) / 1024
    print(f"OK: {n} gráficos em {os.path.relpath(SAIDA, RAIZ)} "
          f"({tam:.0f} KB, dados até {ref}, fechamento {fechamento})")


if __name__ == "__main__":
    main()
