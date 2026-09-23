#!/usr/bin/env python3
"""
Monta dados/tesouro-direto.json com as taxas do Tesouro Direto por prazo, a
partir do dado aberto do Tesouro Transparente (sem chave, atualiza em dia útil).

Uso:
    python3 scripts/tesouro_direto.py

Só usa a biblioteca padrão. Roda junto com o IPCA na Action
.github/workflows/atualizar.yml.

A "API do Tesouro Direto" da B3 (treasurybondsinfo.json) responde 410 desde que
foi desativada; o que existe de público é o CSV do CKAN abaixo — 14 MB com
taxas e preços de compra e de venda de todo título, todo pregão, desde 2004.

Como as séries por prazo são feitas:

  - **taxa** = média entre a taxa de compra e a de venda da manhã;
  - **prazo** de cada título no dia = (vencimento − data base) / 365,25;
  - a taxa de 2, 5, 10 ou 20 anos sai por **interpolação linear** entre os dois
    vencimentos vizinhos ofertados naquele dia. Quando o prazo pedido cai fora
    do que está em oferta, vale o vencimento mais próximo desde que ele esteja
    a menos de um ano do alvo; passou disso, o dia fica sem ponto — e o site
    corta a linha, em vez de inventar;
  - título a menos de 3 meses do vencimento não entra na conta: anualizar a
    diferença de preço de poucos dias faz a taxa explodir (o arquivo traz −1,5%
    e +15% em papéis vincendos).

Por isso algumas linhas têm buracos: são períodos em que o Tesouro Direto
simplesmente não ofertava nada naquele prazo. O prefixado de 10 anos não entra
porque nunca existiu: o mais longo já ofertado tinha 6,9 anos.
"""
import csv
import datetime
import statistics
import io
import json
import os
import sys
import time
import urllib.request

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SAIDA = os.path.join(RAIZ, "dados", "tesouro-direto.json")

CKAN = ("https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show"
        "?id=taxas-dos-titulos-ofertados-pelo-tesouro-direto")
CSV_RESERVA = ("https://www.tesourotransparente.gov.br/ckan/dataset/"
               "df56aa42-484a-4a59-8184-7676580c81e3/resource/"
               "796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv")
HEADERS = {"User-Agent": "Mozilla/5.0 (ftm-dados)"}

AZUL, VERMELHO, VERDE, CIANO, LARANJA, ROXO = "#4F81BD", "#C0504D", "#9BBB59", "#4BACC6", "#F79646", "#8064A2"

# Um ano do calendário, em dias — o mesmo divisor que o Tesouro usa para prazo médio.
ANO = 365.25
# Fora do intervalo ofertado, até quanto o vencimento mais próximo ainda serve.
BORDA = 1.0
# Título a menos de um ano do vencimento fica de fora da conta. Papel vincendo
# tem taxa anualizada instável (o arquivo traz −1,5% e +15%), e no IPCA+ a taxa
# curta ainda é dominada pelo carrego da inflação já conhecida: em mai/2026, por
# exemplo, o papel de 3 meses marcava 10,0% contra 8,0% do de três anos. Usar
# esse papel como âncora deformava a linha de 2 anos.
PRAZO_MINIMO = 1.0
# O arquivo do Tesouro tem cotação furada: a NTN-F mais longa aparece a 0,03% em
# 14 pregões de 2010, o que derrubava a linha de 10 anos de 13% para 2,7%. Papel
# que se afasta mais que isto da mediana do dia fica de fora. A separação é
# limpa: fora esses 14, o maior desvio de todo o arquivo é de 3 p.p.
DESVIO_MAXIMO = 5.0


def baixar(url, tentativas=4):
    ultimo = None
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:                      # rede do Actions falha de vez em quando
            ultimo = e
            time.sleep(1.5 * 2 ** i)
    raise SystemExit(f"Não consegui baixar {url}: {ultimo}")


def url_do_csv():
    """Pergunta ao CKAN qual é o arquivo; se ele não responder, usa a URL fixa."""
    try:
        d = json.loads(baixar(CKAN, tentativas=2))
        for rec in d["result"]["resources"]:
            if rec["format"].upper() == "CSV":
                return rec["url"]
    except Exception as e:
        print("  (CKAN não respondeu, usando a URL fixa:", e, ")")
    return CSV_RESERVA


def num(s):
    return float(s.replace(".", "").replace(",", "."))


def dia(s):
    return datetime.datetime.strptime(s, "%d/%m/%Y").date()


def ler(bruto):
    """CSV → {tipo: {data base: [(prazo em anos, taxa média)]}}."""
    texto = io.StringIO(bruto.decode("latin-1"))
    fora = {}
    for r in csv.DictReader(texto, delimiter=";"):
        tipo = r["Tipo Titulo"].strip()
        base, venc = dia(r["Data Base"]), dia(r["Data Vencimento"])
        taxa = (num(r["Taxa Compra Manha"]) + num(r["Taxa Venda Manha"])) / 2
        fora.setdefault(tipo, {}).setdefault(base, []).append(((venc - base).days / ANO, taxa))
    return fora


def taxa_no_prazo(pontos, alvo):
    """Taxa do dia no prazo pedido: interpola entre os vizinhos, ou usa o
    vencimento mais próximo se ele estiver a menos de BORDA ano do alvo."""
    p = sorted(pontos)
    if p[0][0] <= alvo <= p[-1][0]:
        for (x0, y0), (x1, y1) in zip(p, p[1:]):
            if x0 <= alvo <= x1:
                return y0 if x1 == x0 else y0 + (y1 - y0) * (alvo - x0) / (x1 - x0)
    x, y = min(p, key=lambda q: abs(q[0] - alvo))
    return y if abs(x - alvo) <= BORDA else None


def sem_furos(pontos):
    """Tira o papel vincendo e a cotação que destoa do resto da curva do dia."""
    uteis = [q for q in pontos if q[0] >= PRAZO_MINIMO]
    if len(uteis) < 3:
        return uteis
    meio = statistics.median([q[1] for q in uteis])
    return [q for q in uteis if abs(q[1] - meio) <= DESVIO_MAXIMO]


def serie_por_prazo(por_dia, alvo):
    fora = {}
    for base, pontos in por_dia.items():
        uteis = sem_furos(pontos)
        if not uteis:
            continue
        v = taxa_no_prazo(uteis, alvo)
        if v is not None:
            fora[base.isoformat()] = v
    return fora


def serie(nome, cor, dados, **extra):
    return dict(nome=nome, cor=cor, dados=[[d, round(v, 2)] for d, v in sorted(dados.items())], **extra)


def main():
    t0 = time.time()
    url = url_do_csv()
    print("Baixando", url.rsplit("/", 1)[-1], "…")
    dados = ler(baixar(url))
    for tipo in ("Tesouro Prefixado", "Tesouro Prefixado com Juros Semestrais", "Tesouro IPCA+"):
        if tipo not in dados:
            raise SystemExit(f"O CSV não trouxe '{tipo}' — o layout mudou?")

    PRAZOS = [(2, CIANO), (5, LARANJA), (10, VERMELHO), (20, ROXO)]
    MEDIA = "média entre a taxa de compra e a de venda"

    def cartao(id_, titulo, subtitulo, tipo, alvos, nota):
        series = []
        for anos, cor in PRAZOS:
            if anos not in alvos:
                continue
            s = serie_por_prazo(dados[tipo], anos)
            if not s:
                print(f"  {tipo} {anos} anos: nenhum pregão — fora")
                continue
            dias = sorted(s)
            print(f"  {tipo:<18} {anos:2d} anos: {len(s):5d} pregões, de {dias[0]} a {dias[-1]}")
            series.append(serie(f"{anos} anos", cor, s, rotulo=True))
        return dict(id=id_, titulo=titulo, subtitulo=subtitulo, unidade="%",
                    diario=True, series=series, nota=nota)

    secoes = [dict(titulo="Taxa por prazo", graficos=[
        cartao("td-prefixado", "Tesouro Prefixado",
               "Taxa contratada na compra, em % a.a. — " + MEDIA,
               "Tesouro Prefixado", [2, 5],
               "Sem o de 10 anos: o prefixado sem cupom mais longo que o Tesouro Direto já "
               "ofertou tinha 6,9 anos — o de 10 está no cartão seguinte, com juros semestrais. "
               "A linha de 5 anos começa em 2015, quando passou a existir papel desse prazo."),
        cartao("td-prefixado-js", "Tesouro Prefixado com Juros Semestrais",
               "Taxa contratada na compra, em % a.a. — " + MEDIA,
               "Tesouro Prefixado com Juros Semestrais", [2, 5, 10],
               "É aqui que existe o prefixado de 10 anos: a NTN-F chega a 11 anos de prazo, "
               "enquanto o prefixado sem cupom nunca passou de 6,9. A linha de 2 anos é "
               "interrompida em 2013-2014 e 2016-2017, quando não havia papel curto em oferta."),
        cartao("td-ipca", "Tesouro IPCA+",
               "Juro real contratado na compra, em % a.a. — " + MEDIA,
               "Tesouro IPCA+", [5, 10, 20],
               "A linha de 20 anos começa em 2010, quando passou a existir papel desse prazo."),
    ])]

    ref = max(max(s["dados"][-1][0] for s in g["series"]) for sec in secoes for g in sec["graficos"])
    doc = dict(
        atualizado=datetime.date.today().isoformat(),
        referencia=ref,
        fonte="Tesouro Nacional e FtM",
        categoria="Tesouro Direto",
        secoes=secoes,
    )
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    n = sum(len(g["series"]) for sec in secoes for g in sec["graficos"])
    print(f"OK: {n} séries em {os.path.relpath(SAIDA, RAIZ)} "
          f"({os.path.getsize(SAIDA) / 1024:.0f} KB, até {ref}, {time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
