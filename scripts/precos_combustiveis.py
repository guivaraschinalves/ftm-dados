#!/usr/bin/env python3
"""
Monta dados/precos-combustiveis.xlsx — a planilha de trabalho com o preço dos
combustíveis cobrado das distribuidoras. Duas séries, de origens diferentes:

  1. **ANP, produtores e importadores** — média ponderada semanal por região,
     de 2002 em diante, sem ICMS. É a série longa, e cobre o mercado inteiro
     (refinaria e importador), não só a Petrobras.
  2. **Petrobras, por UF** — o preço que a própria Petrobras publica, por
     ponto de entrega, de agosto de 2019 em diante. É a série curta, e é a
     única que desce ao estado.

Uso:
    python3 scripts/precos_combustiveis.py

ESTE SCRIPT NÃO ENTRA NA ACTION e, diferente dos outros, **não é só
biblioteca padrão**: ele precisa de `openpyxl` (escrever .xlsx) e, para a
parte da Petrobras, de `pdfplumber` (ler o PDF). Num venv:

    python3 -m venv .venv && .venv/bin/pip install openpyxl pdfplumber
    .venv/bin/python scripts/precos_combustiveis.py

A saída é uma planilha de trabalho, não fonte de dado do site. Se um dia
virar gráfico, a conta vira um script de JSON como os outros.

AS FONTES

  - ANP, "Preços de produtores e importadores de derivados de petróleo e
    biodiesel": dois .xls na pasta dados/, baixados de
    gov.br/anp → Preços e Defesa da Concorrência → Preços. Um cobre 2002–2012
    e o outro 2013 em diante; emendam sem buraco. Semanal, por região
    (Norte, Nordeste, Centro-Oeste, Sul, Sudeste) e Brasil. **Sem ICMS.**
  - Petrobras, "Preços de Gasolina A sem tributos, à vista, por vigência":
    um PDF que ele sobe para dados/. Linhas são ponto de entrega (cidade/UF)
    × modalidade de venda; colunas são as datas de vigência. **R$/m³**, que
    aqui vira R$/litro para bater com a ANP.

O QUE OS NÚMEROS NÃO SÃO

  - A série da ANP não é "o preço da Petrobras": é a média ponderada de todos
    os produtores e importadores. Nos derivados em que a Petrobras é quase
    tudo, a diferença é pequena; não é zero.
  - O diesel **S-10 não existe antes de 2013** — não é lacuna de dado, o
    combustível não existia. Para série longa de diesel, a emenda é "Óleo
    Diesel" (2002–2012) com S-500 (2013 em diante), que é o que a linha
    "Diesel (geral → S-500)" faz.
  - Os preços de 1994 a 2001 **não entram**. Até janeiro de 2002 o preço era
    fixado pelo governo por portaria, não decidido pela empresa: é outro
    regime, e emendar na mesma linha misturaria duas coisas diferentes sem
    avisar.

MODALIDADE DE VENDA (parte da Petrobras). O mesmo produto, na mesma cidade,
tem preço diferente conforme como é entregue: EXA (ex-ponto A, no duto dentro
da refinaria), LPA, LCT, LPC, ETM, LTM, ETT, ETD, LPD. **A média por estado
usa uma modalidade só**, a EXA, e não a média de todas: a composição de
modalidades muda ao longo do tempo (ponto de entrega que some, modalidade que
entra), e média sobre composição que muda gera degrau que não é preço. A
planilha traz as outras modalidades numa aba à parte, para conferência.

O DESCONTO DA MP 1.358. Entre 29/5/2026 e 9/9/2026 houve subvenção de
R$ 0,44/litro na gasolina A, e a tabela da Petrobras traz, nessas vigências,
duas colunas: com e sem o desconto. A série principal usa o preço **sem**
desconto (é o preço da empresa); o com desconto vai numa coluna ao lado, que
é o que a distribuidora de fato pagou.
"""
import csv
import datetime
import glob
import json
import os
import sys

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
DADOS = os.path.join(RAIZ, "dados")
SAIDA = os.path.join(DADOS, "precos-combustiveis.xlsx")

ANP_ANTIGO = "precos-ponderados-semanais-2002-2012.xls"
ANP_NOVO = "precos-medios-ponderados-semanais-2013.xls"
ANP_URL = ("https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/"
           "precos/ppidp/%s")

REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sul", "Sudeste", "Brasil"]

# rótulo na planilha → nomes do produto nos dois arquivos da ANP, na ordem
PRODUTOS = [
    ("Gasolina A", ["Gasolina A (R$/litro)", "Gasolina A Comum (R$/litro)"]),
    ("Diesel S-10", ["Óleo Diesel S-10 (R$/litro)"]),
    ("Diesel (geral → S-500)", ["Óleo Diesel (R$/litro)", "Óleo Diesel S-500 (R$/litro)"]),
]

# a modalidade de venda que serve de referência na média por estado
MODALIDADE_BASE = "EXA"


# --------------------------------------------------------------------- ANP

def baixar(url, destino):
    import urllib.request
    if os.path.exists(destino):
        return destino
    print("  baixando %s…" % os.path.basename(destino))
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (ftm-dados)"})
    with urllib.request.urlopen(req, timeout=180) as r, open(destino, "wb") as f:
        f.write(r.read())
    return destino


def ler_anp():
    """[(produto, data de início da semana, região, R$/litro)], das duas planilhas."""
    import xlrd
    bruto = {}
    for nome in (ANP_ANTIGO, ANP_NOVO):
        caminho = baixar(ANP_URL % nome, os.path.join(DADOS, nome))
        wb = xlrd.open_workbook(caminho)
        s = wb.sheet_by_index(0)
        dm = wb.datemode
        # linha 7 é o cabeçalho de região, 8 o subcabeçalho; o dado começa na 9
        for r in range(9, s.nrows):
            prod = str(s.cell_value(r, 0)).strip()
            if not prod:
                continue
            try:
                ini = datetime.date(*xlrd.xldate_as_tuple(s.cell_value(r, 1), dm)[:3])
            except Exception:         # linha de rodapé, nota de pé de página
                continue
            for k, col in enumerate(range(3, 9)):
                v = s.cell_value(r, col)
                if isinstance(v, float) and v > 0:    # "***" é mês sem dado
                    bruto.setdefault(prod, {}).setdefault(ini, {})[REGIOES[k]] = v
    linhas = []
    for rotulo, partes in PRODUTOS:
        junto = {}
        for p in partes:
            if p not in bruto:
                print("  AVISO: a ANP não trouxe %r — o layout mudou?" % p, file=sys.stderr)
            junto.update(bruto.get(p, {}))
        if not junto:
            raise SystemExit("nenhum dado para %s" % rotulo)
        dias = sorted(junto)
        buracos = [(dias[i], dias[i + 1]) for i in range(len(dias) - 1)
                   if (dias[i + 1] - dias[i]).days > 14]
        print("  %-24s %4d semanas, de %s a %s%s"
              % (rotulo, len(dias), dias[0], dias[-1],
                 "" if not buracos else "  BURACO: %s" % (buracos[:3],)))
        for d in dias:
            for reg in REGIOES:
                if reg in junto[d]:
                    linhas.append((rotulo, d, reg, round(junto[d][reg], 5)))
    return linhas


# ------------------------------------------------------- Petrobras e Acelen
#
# As duas publicam a mesma coisa, por obrigacao da Resolucao ANP 795/2019:
# o preco por ponto de entrega e modalidade de venda, em R$/m3, sem tributos.
# A Petrobras publica num PDF; a Acelen, numa tabela consultavel por produto e
# mes. O que sai daqui tem o mesmo formato nas duas:
#
#     (empresa, produto, vigencia, UF, modalidade, local, R$/litro, desconto)
#
# `desconto` e "" no preco cheio da empresa e traz o rotulo da medida
# provisoria na variante subsidiada ("MP 1.358", "MP 1.363 e MP 1.391"...).
import re                                              # noqa: E402
import time                                            # noqa: E402

UF = re.compile(r"\(([A-Z]{2})\)\s*$")
DATA = re.compile(r"(\d{2})[./](\d{2})[./](\d{4})")

ACELEN_URL = ("https://www.acelen.com.br/precos-as-distribuidoras/"
              "?produto=%d&ano=%d&mes=%d")
# o codigo de cada produto no formulario deles
ACELEN_PRODUTOS = {"Gasolina A": 5, "Diesel S-10": 7, "Diesel S-500": 6}
# a Acelen assumiu a refinaria de Mataripe em 1/12/2021, e a serie comeca ali
ACELEN_INICIO = (2021, 11)
CACHE = os.path.join(DADOS, ".cache-acelen")

# Desempate quando um ponto de entrega tem mais de uma modalidade com o mesmo
# numero de observacoes. A ordem vai do mais "cru" (no duto, dentro da
# refinaria) ao mais entregue, que e a ordem em que o frete entra no preco.
PRIORIDADE = ["EXA", "LPA", "LCT", "LPC", "ETT", "ETD", "LPD", "ETM", "LTM"]


def numero(cru):
    """'R$ 3.849,0000' ou '1.686,70' -> 3849.0 / 1686.7, em R$/m3."""
    cru = cru.replace("R$", "").strip()
    if not cru or cru in ("-", "--"):
        return None
    try:
        return float(cru.replace(".", "").replace(",", "."))
    except ValueError:
        return None


def rotulo_desconto(cabecalho):
    """'Com descontosMP 1.363 e MP 1.391 24/09/2026' -> 'MP 1.363 e MP 1.391'."""
    if "descont" not in cabecalho.lower():
        return ""
    sem_data = DATA.sub("", cabecalho).strip()
    sem_data = re.sub(r"(?i)^com\s*descontos?", "", sem_data).strip(" .-")
    return re.sub(r"\s+", " ", sem_data) or "com desconto"


def colunas_de_data(cabecalho):
    """[(índice, data, rótulo do desconto)] a partir da linha de cabeçalho."""
    fora = []
    for i, c in enumerate(cabecalho[2:], start=2):
        c = (c or "").strip()
        m = DATA.search(c)
        if m:
            d, mes, a = m.groups()
            fora.append((i, datetime.date(int(a), int(mes), int(d)), rotulo_desconto(c)))
    return fora


# ------------------------------------------------------------- Petrobras (PDF)

def ler_petrobras(caminho, produto="Gasolina A"):
    """O PDF de tabelas da Petrobras. Uma tabela por página: as duas primeiras
    colunas são ponto de entrega e modalidade, as demais são vigências. As
    páginas de gasolina Premium e a da legenda ficam de fora."""
    import pdfplumber
    fora = []
    with pdfplumber.open(caminho) as pdf:
        for n, pagina in enumerate(pdf.pages, 1):
            topo = (pagina.extract_text() or "")[:200]
            if "Premium" in topo or "Modalidade de Venda" in topo:
                continue
            tabela = pagina.extract_table()
            if not tabela or len(tabela) < 3:
                print("  página %d: sem tabela legível" % n, file=sys.stderr)
                continue
            colunas = colunas_de_data([(c or "").strip() for c in tabela[0]])
            for linha in tabela[1:]:
                local = (linha[0] or "").strip().replace("\n", " ")
                mod = (linha[1] or "").strip()
                uf = UF.search(local)
                if not uf or not mod:
                    continue
                for i, data, desc in colunas:
                    v = numero((linha[i] or "")) if i < len(linha) else None
                    if v:
                        fora.append(("Petrobras", produto, data, uf.group(1),
                                     mod, local, round(v / 1000.0, 5), desc))
    return fora


# ---------------------------------------------------------------- Acelen (web)

def baixar_acelen(codigo, ano, mes):
    """O HTML de um mês, com cache em disco — a página é estável e a consulta
    é uma por mês e produto."""
    import urllib.request
    os.makedirs(CACHE, exist_ok=True)
    alvo = os.path.join(CACHE, "%d-%04d-%02d.html" % (codigo, ano, mes))
    vencido = (ano, mes) >= (datetime.date.today().year, datetime.date.today().month)
    if os.path.exists(alvo) and not vencido:
        return open(alvo, encoding="utf-8", errors="replace").read()
    req = urllib.request.Request(
        ACELEN_URL % (codigo, ano, mes),
        headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
                               " (KHTML, like Gecko) Chrome/131.0 Safari/537.36"})
    with urllib.request.urlopen(req, timeout=60) as r:
        html_ = r.read().decode("utf-8", "replace")
    open(alvo, "w", encoding="utf-8").write(html_)
    time.sleep(0.6)                                    # educação com o site deles
    return html_


def tabela_do_html(bruto):
    """A primeira <table> da página, como lista de listas de texto."""
    import html as _html
    achado = re.search(r"<table.*?</table>", bruto, re.S | re.I)
    if not achado:
        return []
    fora = []
    for linha in re.findall(r"<tr.*?</tr>", achado.group(0), re.S | re.I):
        celulas = [re.sub(r"\s+", " ",
                          _html.unescape(re.sub(r"<[^>]+>", "", c))).strip()
                   for c in re.findall(r"<t[hd].*?</t[hd]>", linha, re.S | re.I)]
        if celulas:
            fora.append(celulas)
    return fora


def ler_acelen(ate=None):
    """Varre produto × mês desde dez/2021. Devolve o mesmo formato do PDF."""
    hoje = ate or datetime.date.today()
    fora = []
    for nome, codigo in ACELEN_PRODUTOS.items():
        ano, mes = ACELEN_INICIO
        n0 = len(fora)
        while (ano, mes) <= (hoje.year, hoje.month):
            tabela = tabela_do_html(baixar_acelen(codigo, ano, mes))
            if len(tabela) >= 2:
                colunas = colunas_de_data(tabela[0])
                for linha in tabela[1:]:
                    if len(linha) < 3:
                        continue
                    local, mod = linha[0], linha[1]
                    uf = UF.search(local)
                    if not uf or not mod:
                        continue
                    for i, data, desc in colunas:
                        v = numero(linha[i]) if i < len(linha) else None
                        if v:
                            fora.append(("Acelen", nome, data, uf.group(1),
                                         mod, local, round(v / 1000.0, 5), desc))
            mes += 1
            if mes == 13:
                ano, mes = ano + 1, 1
        print("  %-14s %5d linhas" % (nome, len(fora) - n0))
    return fora


# --------------------------------------------- a média por estado, e a regra

def modalidade_de_cada_ponto(linhas):
    """{(empresa, produto, local): modalidade} — uma por ponto de entrega.

    A regra: a modalidade com mais observações naquele ponto, desempatada pela
    lista PRIORIDADE. Fixar uma por ponto é o que impede a média de pular
    quando a composição muda sem o preço ter mudado — e não dá para fixar a
    mesma para todo mundo, porque a Acelen praticamente só tem EXA em
    Candeias: os outros pontos dela são entrega marítima (ETM, LTM)."""
    contagem = {}
    for empresa, produto, _d, _uf, mod, local, _v, desc in linhas:
        if desc:
            continue
        contagem.setdefault((empresa, produto, local), {}).setdefault(mod, 0)
        contagem[(empresa, produto, local)][mod] += 1
    escolha = {}
    for chave, mods in contagem.items():
        escolha[chave] = max(mods, key=lambda m: (mods[m], -(PRIORIDADE.index(m)
                             if m in PRIORIDADE else len(PRIORIDADE))))
    return escolha


def media_por_uf(linhas):
    """{(empresa, produto, data, UF): (cheio, nº de pontos, com desconto, MP)}.

    Sai o preço de tabela e, quando existe, o com a subvenção aplicada —
    separados, porque são coisas diferentes: o primeiro é o preço da empresa,
    o segundo é o que a distribuidora pagou. Em 2026 a diferença chega a
    R$ 2,12/litro no diesel (MP 1.391), o que não é detalhe."""
    escolha = modalidade_de_cada_ponto(linhas)
    cheio, com_desc, mps = {}, {}, {}
    for empresa, produto, data, uf, mod, local, v, desc in linhas:
        if escolha.get((empresa, produto, local)) != mod:
            continue
        alvo = com_desc if desc else cheio
        alvo.setdefault((empresa, produto, data, uf), []).append(v)
        if desc:
            mps[(empresa, produto, data, uf)] = desc
    fora = {}
    for k, v in cheio.items():
        d = com_desc.get(k)
        fora[k] = (round(sum(v) / len(v), 5), len(v),
                   round(sum(d) / len(d), 5) if d else None, mps.get(k, ""))
    return fora


# ----------------------------------------------------------------- planilha

def aba(wb, titulo, cabecalho, linhas, larguras=None, formato=None):
    from openpyxl.styles import Font, Alignment
    ws = wb.create_sheet(titulo)
    ws.append(cabecalho)
    for c in ws[1]:
        c.font = Font(bold=True)
        c.alignment = Alignment(vertical="center")
    for l in linhas:
        ws.append(list(l))
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for i, larg in enumerate(larguras or [], start=1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = larg
    for col, fmt in (formato or {}).items():
        for linha in ws.iter_rows(min_row=2, min_col=col, max_col=col):
            linha[0].number_format = fmt
    return ws


def escrever(anp, refinarias, hoje):
    from openpyxl import Workbook
    wb = Workbook()
    wb.remove(wb.active)

    leia = wb.create_sheet("LEIA-ME")
    for linha in [
        ["Preço dos combustíveis cobrado das distribuidoras"],
        ["Gerado em", hoje.strftime("%d/%m/%Y")],
        [],
        ["Aba", "O que é", "Fonte", "Unidade", "Período"],
        ["ANP semanal", "Média ponderada dos produtores e importadores, por região",
         "ANP, Preços de produtores e importadores", "R$/litro, sem ICMS",
         "2002 em diante, semanal"],
        ["ANP Brasil (largo)", "A mesma série, um produto por coluna",
         "idem", "R$/litro, sem ICMS", "idem"],
        ["Refinarias por UF", "Média dos pontos de entrega de cada estado",
         "Petrobras e Acelen, tabelas da Resolução ANP 795/2019",
         "R$/litro, sem tributos", "Petrobras ago/2019, Acelen dez/2021"],
        ["Refinarias detalhe", "O dado cru: ponto de entrega × modalidade × vigência",
         "idem", "R$/litro, sem tributos", "idem"],
        [],
        ["ATENÇÃO — as duas séries NÃO estão na mesma base tributária:"],
        ["ANP", "o próprio arquivo diz só '(Não inclui ICMS)': PIS/Cofins e CIDE "
                "estão DENTRO do preço."],
        ["Petrobras e Acelen", "as tabelas dizem 'sem tributos'."],
        ["", "Não dá para pôr as três no mesmo eixo sem descontar PIS/Cofins+CIDE "
             "da série da ANP primeiro."],
        [],
        ["Três coisas que o número não é:"],
        ["1", "A série da ANP não é o preço da Petrobras: é a média de todos os "
              "produtores e importadores."],
        ["2", "O diesel S-10 não existe antes de 2013 — o combustível não existia. "
              "A linha 'Diesel (geral → S-500)' é a emenda para série longa."],
        ["3", "1994 a 2001 não entra: até janeiro de 2002 o preço era fixado pelo "
              "governo por portaria, não decidido pela empresa."],
        [],
        ["A média por estado fixa UMA modalidade de venda por ponto de entrega: a "
         "mais frequente naquele ponto."],
        ["Misturar modalidades faria a média pular quando a composição muda, sem o "
         "preço ter mudado. E não dá para usar a mesma"],
        ["para todo mundo: a Acelen só tem EXA em Candeias; os outros pontos dela "
         "são entrega marítima (ETM, LTM)."],
        [],
        ["Houve subvenção em 2026 — R$ 0,44/litro na gasolina A (MP 1.358) e outras "
         "no diesel (MP 1.363, MP 1.391)."],
        ["A série usa o preço SEM desconto, que é o preço da empresa; a aba de "
         "detalhe traz as duas versões, com o rótulo da MP."],
        [],
        ["Petrobras e Acelen não são comparáveis ponto a ponto: a Acelen tem uma "
         "refinaria só (Mataripe, BA) e vende"],
        ["o resto por terminal marítimo, então o preço dela já carrega frete onde o "
         "da Petrobras não carrega."],
    ]:
        leia.append(linha)
    from openpyxl.styles import Font
    leia["A1"].font = Font(bold=True, size=14)
    leia["A4"].font = leia["B4"].font = leia["C4"].font = Font(bold=True)
    leia["D4"].font = leia["E4"].font = Font(bold=True)
    leia["A10"].font = Font(bold=True)
    for col, larg in zip("ABCDE", (22, 62, 46, 22, 26)):
        leia.column_dimensions[col].width = larg

    aba(wb, "ANP semanal", ["produto", "semana", "região", "R$/litro"],
        [(p, d, r, v) for p, d, r, v in anp],
        larguras=[24, 12, 14, 11], formato={2: "DD/MM/YYYY", 4: "0.00000"})

    # o mesmo, em formato largo: uma linha por semana, um produto por coluna
    produtos = [p for p, _ in PRODUTOS]
    por_semana = {}
    for p, d, r, v in anp:
        if r == "Brasil":
            por_semana.setdefault(d, {})[p] = v
    aba(wb, "ANP Brasil (largo)", ["semana"] + produtos,
        [[d] + [por_semana[d].get(p) for p in produtos] for d in sorted(por_semana)],
        larguras=[12] + [22] * len(produtos),
        formato={**{1: "DD/MM/YYYY"},
                 **{i: "0.00000" for i in range(2, 2 + len(produtos))}})

    if refinarias:
        medias = media_por_uf(refinarias)
        aba(wb, "Refinarias por UF",
            ["empresa", "produto", "vigência", "UF", "R$/litro (tabela)",
             "R$/litro (com subvenção)", "medida provisória", "pontos de entrega"],
            [(e, p, d, uf, v, vd, mp, n)
             for (e, p, d, uf), (v, n, vd, mp) in sorted(medias.items())],
            larguras=[11, 14, 12, 6, 17, 22, 20, 18],
            formato={3: "DD/MM/YYYY", 5: "0.00000", 6: "0.00000"})
        escolha = modalidade_de_cada_ponto(refinarias)
        aba(wb, "Refinarias detalhe",
            ["empresa", "produto", "vigência", "UF", "modalidade", "ponto de entrega",
             "R$/litro", "desconto", "entra na média"],
            [(e, p, d, uf, mod, loc, v, desc or "",
              "sim" if (not desc and escolha.get((e, p, loc)) == mod) else "não")
             for e, p, d, uf, mod, loc, v, desc in sorted(refinarias)],
            larguras=[11, 14, 12, 6, 12, 28, 11, 22, 14],
            formato={3: "DD/MM/YYYY", 7: "0.00000"})

    wb.save(SAIDA)
    return wb


def main():
    hoje = datetime.date.today()
    print("ANP, produtores e importadores…")
    anp = ler_anp()

    refinarias = []

    print("Acelen, preços às distribuidoras…")
    try:
        refinarias += ler_acelen(hoje)
    except Exception as e:                    # site fora do ar não derruba o resto
        print("  Acelen falhou: %s" % e, file=sys.stderr)

    pdfs = sorted(glob.glob(os.path.join(DADOS, "*asolina*.pdf"))
                  + glob.glob(os.path.join(DADOS, "*abela*re*.pdf")),
                  key=os.path.getmtime)
    if pdfs:
        print("Petrobras, de %s…" % os.path.basename(pdfs[-1]))
        lidas = ler_petrobras(pdfs[-1])
        refinarias += lidas
        print("  %d linhas" % len(lidas))
    else:
        print("Petrobras: nenhum PDF em dados/ — só a Acelen entra por enquanto.",
              file=sys.stderr)

    if refinarias:
        por_empresa = {}
        for e, prod, d, uf, *_ in refinarias:
            a = por_empresa.setdefault((e, prod), [d, d, set()])
            a[0], a[1] = min(a[0], d), max(a[1], d)
            a[2].add(uf)
        for (e, prod), (d0, d1, ufs) in sorted(por_empresa.items()):
            print("  %-10s %-14s %s a %s, %2d UF" % (e, prod, d0, d1, len(ufs)))
        escolha = modalidade_de_cada_ponto(refinarias)
        mods = {}
        for (e, _p, _loc), m in escolha.items():
            mods.setdefault(e, {}).setdefault(m, 0)
            mods[e][m] += 1
        for e, c in sorted(mods.items()):
            print("  modalidade escolhida em %s: %s" % (e, dict(sorted(c.items()))))

    escrever(anp, refinarias, hoje)
    print("gravado %s (%.0f KB)"
          % (os.path.relpath(SAIDA, RAIZ), os.path.getsize(SAIDA) / 1024))

    with open(os.path.join(DADOS, "anp-precos-produtor.csv"), "w",
              newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["produto", "semana", "regiao", "reais_por_litro"])
        w.writerows([(p, d.isoformat(), r, v) for p, d, r, v in anp])
    print("gravado dados/anp-precos-produtor.csv")


def inspecionar(caminho):
    """Mostra o que o pdfplumber vê, para calibrar o leitor."""
    import pdfplumber
    with pdfplumber.open(caminho) as pdf:
        print("%d páginas" % len(pdf.pages))
        for n, pagina in enumerate(pdf.pages[:3], 1):
            t = pagina.extract_table()
            print("\n== página %d: %s" % (n, (pagina.extract_text() or "")[:90].replace("\n", " | ")))
            if not t:
                print("   extract_table() devolveu nada")
                continue
            print("   %d linhas x %d colunas" % (len(t), max(len(l) for l in t)))
            for linha in t[:4]:
                print("   %s" % [str(c)[:16] for c in linha[:8]])


if __name__ == "__main__":
    if "--inspecionar" in sys.argv:
        alvo = [a for a in sys.argv[1:] if a.endswith(".pdf")]
        inspecionar(alvo[0] if alvo else
                    sorted(glob.glob(os.path.join(DADOS, "*.pdf")))[-1])
    else:
        main()
