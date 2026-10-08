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


# ---------------------------------------------------------------- Petrobras

# UF a partir do nome do ponto de entrega: "Duque de Caxias (RJ)" → RJ
import re  # noqa: E402

UF = re.compile(r"\(([A-Z]{2})\)\s*$")


def ler_petrobras(caminho):
    """[(data de vigência, UF, modalidade, local, R$/litro, com_desconto)].

    O PDF tem uma tabela por página: as duas primeiras colunas são o ponto de
    entrega e a modalidade, e as demais são datas de vigência. As páginas de
    gasolina Premium e a da legenda das modalidades ficam de fora."""
    import pdfplumber
    fora = []
    with pdfplumber.open(caminho) as pdf:
        for n, pagina in enumerate(pdf.pages, 1):
            texto = (pagina.extract_text() or "")[:200]
            if "Premium" in texto or "Modalidade de Venda" in texto:
                continue
            tabela = pagina.extract_table()
            if not tabela or len(tabela) < 3:
                print("  página %d: sem tabela legível" % n, file=sys.stderr)
                continue
            cabecalho = [(c or "").strip() for c in tabela[0]]
            colunas = []                      # (índice, data, tem_desconto)
            for i, c in enumerate(cabecalho[2:], start=2):
                achado = re.search(r"(\d{2})\.(\d{2})\.(\d{4})", c)
                if not achado:
                    continue
                d, m, a = achado.groups()
                colunas.append((i, datetime.date(int(a), int(m), int(d)),
                                "desconto" in c.lower()))
            for linha in tabela[1:]:
                local = (linha[0] or "").strip()
                mod = (linha[1] or "").strip()
                uf = UF.search(local)
                if not uf or not mod:
                    continue
                for i, data, desconto in colunas:
                    cru = (linha[i] or "").strip() if i < len(linha) else ""
                    if not cru:
                        continue
                    try:                       # "1.686,70" → 1686.70 R$/m³
                        v = float(cru.replace(".", "").replace(",", "."))
                    except ValueError:
                        continue
                    fora.append((data, uf.group(1), mod, local,
                                 round(v / 1000.0, 5), desconto))
    return fora


def media_por_uf(bruto):
    """{(data, UF): (R$/litro, nº de pontos)} na modalidade de referência."""
    junta = {}
    for data, uf, mod, _local, v, desconto in bruto:
        if mod != MODALIDADE_BASE or desconto:
            continue
        junta.setdefault((data, uf), []).append(v)
    return {k: (round(sum(v) / len(v), 5), len(v)) for k, v in junta.items()}


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


def escrever(anp, petro, hoje):
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
        ["Petrobras por UF", "Média dos pontos de entrega de cada estado, modalidade "
         + MODALIDADE_BASE, "Petrobras, Tabelas de Preços (Resolução ANP 795/2019)",
         "R$/litro, sem tributos", "ago/2019 em diante, por vigência"],
        ["Petrobras detalhe", "O dado cru: ponto de entrega × modalidade × vigência",
         "idem", "R$/litro, sem tributos", "idem"],
        [],
        ["Três coisas que o número não é:"],
        ["1", "A série da ANP não é o preço da Petrobras: é a média de todos os "
              "produtores e importadores."],
        ["2", "O diesel S-10 não existe antes de 2013 — o combustível não existia. "
              "A linha 'Diesel (geral → S-500)' é a emenda para série longa."],
        ["3", "1994 a 2001 não entra: até janeiro de 2002 o preço era fixado pelo "
              "governo por portaria, não decidido pela empresa."],
        [],
        ["Na parte da Petrobras, a média por estado usa só a modalidade "
         + MODALIDADE_BASE + " (ex-ponto A)."],
        ["Misturar modalidades faria a média pular quando a composição muda, sem o "
         "preço ter mudado."],
        ["Entre 29/5/2026 e 9/9/2026 houve subvenção de R$ 0,44/litro na gasolina A "
         "(MP 1.358)."],
        ["A série usa o preço SEM o desconto; a aba de detalhe marca as duas versões."],
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

    if petro:
        medias = media_por_uf(petro)
        aba(wb, "Petrobras por UF", ["vigência", "UF", "R$/litro", "pontos de entrega"],
            [(d, uf, v, n) for (d, uf), (v, n) in sorted(medias.items())],
            larguras=[12, 6, 11, 18], formato={1: "DD/MM/YYYY", 3: "0.00000"})
        aba(wb, "Petrobras detalhe",
            ["vigência", "UF", "modalidade", "ponto de entrega", "R$/litro", "com desconto"],
            [(d, uf, mod, loc, v, "sim" if desc else "não")
             for d, uf, mod, loc, v, desc in sorted(petro)],
            larguras=[12, 6, 13, 30, 11, 14],
            formato={1: "DD/MM/YYYY", 5: "0.00000"})

    wb.save(SAIDA)
    return wb


def main():
    hoje = datetime.date.today()
    print("ANP, produtores e importadores…")
    anp = ler_anp()

    petro = []
    pdfs = sorted(glob.glob(os.path.join(DADOS, "*asolina*.pdf"))
                  + glob.glob(os.path.join(DADOS, "*abela*re*.pdf")),
                  key=os.path.getmtime)
    if pdfs:
        print("Petrobras, de %s…" % os.path.basename(pdfs[-1]))
        petro = ler_petrobras(pdfs[-1])
        if petro:
            datas = sorted({d for d, *_ in petro})
            ufs = sorted({uf for _, uf, *_ in petro})
            print("  %d linhas, %d vigências de %s a %s, %d UF: %s"
                  % (len(petro), len(datas), datas[0], datas[-1], len(ufs), " ".join(ufs)))
            m = media_por_uf(petro)
            print("  média por UF na modalidade %s: %d pares (data, UF)"
                  % (MODALIDADE_BASE, len(m)))
        else:
            print("  nada extraído — rode com --inspecionar para ver o que o "
                  "pdfplumber enxerga", file=sys.stderr)
    else:
        print("Petrobras: nenhum PDF em dados/ — a planilha sai só com a ANP.",
              file=sys.stderr)

    escrever(anp, petro, hoje)
    print("gravado %s (%.0f KB)"
          % (os.path.relpath(SAIDA, RAIZ), os.path.getsize(SAIDA) / 1024))

    # CSV ao lado, para quem não quiser abrir o Excel
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
