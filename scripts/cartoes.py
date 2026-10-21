#!/usr/bin/env python3
"""
Monta c/ — a imagem e a página de prévia de cada gráfico, para o post no X e
no LinkedIn mostrar o gráfico, e não só um link.

Uso:
    python3 scripts/cartoes.py            # só os gráficos que mudaram
    python3 scripts/cartoes.py --todos    # refaz tudo

Só biblioteca padrão, mais um Chrome ou Chromium instalado (o runner do GitHub
já tem o google-chrome; aqui, a variável CHROME aponta para outro).

POR QUE EXISTE

O X e o LinkedIn não deixam um site anexar imagem num post: o que eles fazem
é ler as etiquetas da página do link (Open Graph e twitter:card) e montar a
prévia com a imagem que ela indicar. A página do site é uma só, com uma
imagem genérica. Então cada gráfico ganha:

  - c/ID.jpg  — o gráfico em 1200×628 (o formato da prévia grande do X), desenhado pelo próprio app.js no modo
    "?imagem=ID" (o mesmo desenho do Baixar) e lido daqui com um Chrome sem
    tela (--dump-dom), que devolve o JPEG como data URL;
  - c/ID.html — uma página mínima com as etiquetas apontando para c/ID.jpg,
    que manda quem clica para o gráfico no site do assinante.

O botão Compartilhar do app usa c/ID.html como link no X, no LinkedIn e no
e-mail. No celular o X recebe a própria imagem pelo menu do aparelho.

SÓ O QUE MUDOU

c/manifesto.json guarda, por gráfico, um resumo (sha1) da especificação dele
no JSON de dados. Só se refaz a imagem do gráfico cujo resumo mudou — senão o
repositório levaria 90 imagens novas por dia. O resumo entra também no
endereço da imagem (?v=), porque o X guarda a prévia por dias e só a renova
se o endereço mudar.
"""
import base64
import concurrent.futures
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import functools
import http.server

# SITE é a pasta servida (a que tem app.js, index.html e a pasta de dados);
# por padrão a raiz deste repositório. No lps-ftm o deploy aponta para o build
# (dist/interno/dados), onde os números moram em protegido/.
RAIZ = os.path.abspath(os.environ.get("SITE") or os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PASTA_DADOS = os.environ.get("PASTA_DADOS", "dados")
# SERVIR é a pasta que o servidor local publica e CAMINHO, onde o site fica
# dentro dela. No lps-ftm o index.html usa caminhos absolutos (/interno/dados/),
# então o deploy serve a raiz do build e abre /interno/dados/.
SERVIR = os.path.abspath(os.environ.get("SERVIR") or RAIZ)
CAMINHO = os.environ.get("CAMINHO", "/")
SAIDA = os.path.abspath(os.environ.get("SAIDA") or os.path.join(RAIZ, "c"))
MANIFESTO = os.path.join(SAIDA, "manifesto.json")

# Onde as páginas de prévia ficam publicadas (o X precisa alcançá-las sem
# login) e para onde elas mandam o leitor.
BASE_PUBLICA = os.environ.get("BASE_PUBLICA", "https://guivaraschinalves.github.io/ftm-dados/")
DESTINO = os.environ.get("DESTINO", "https://ftm.app.br/interno/dados/")
PORTA = 8799


def fontes():
    """Os arquivos de dados, na ordem do app.js (a lista FONTES)."""
    js = open(os.path.join(RAIZ, "app.js"), encoding="utf-8").read()
    bloco = re.search(r"var FONTES = \[(.*?)\];", js, re.S).group(1)
    return [os.path.join(PASTA_DADOS, os.path.basename(n)) for n in re.findall(r'"([^"]+\.json)"', bloco)]


def graficos():
    """[(id, especificação, documento)] de todos os gráficos."""
    fora = []
    for arq in fontes():
        caminho = os.path.join(RAIZ, arq)
        if not os.path.exists(caminho):
            continue
        doc = json.load(open(caminho, encoding="utf-8"))
        pilha = list(doc.get("secoes", []))
        while pilha:                      # seção pode ter "subsecoes" (empresa > assunto)
            sec = pilha.pop(0)
            pilha[:0] = sec.get("subsecoes", [])
            for g in sec.get("graficos", []):
                fora.append((g["id"], g, doc))
    return fora


# Sobe quando muda o desenho da prévia (não os dados): entra no resumo, então
# refaz todas as imagens e muda o endereço delas, que é o que faz o X largar a
# prévia antiga que ele guardou. 2 = 1200×628 (1,91:1), sem corte no X.
VERSAO_IMAGEM = 2


def resumo(g, doc):
    base = json.dumps([g, doc.get("fonte"), doc.get("referencia"), VERSAO_IMAGEM], sort_keys=True,
                      ensure_ascii=False)
    return hashlib.sha1(base.encode("utf-8")).hexdigest()[:10]


def achar_chrome():
    for c in (os.environ.get("CHROME"), "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
              os.path.expanduser("~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome")):
        if c and (shutil.which(c) or os.path.exists(c)):
            return shutil.which(c) or c
    raise SystemExit("nenhum Chrome/Chromium encontrado (defina CHROME)")


def servir():
    """Serve a pasta do repositório num thread, para o Chrome abrir o app."""
    class Calado(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=SERVIR, **k)

        def log_message(self, *a):
            pass
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    s = http.server.ThreadingHTTPServer(("127.0.0.1", PORTA), Calado)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s


def imagem(chrome, id_, tentativas=3):
    url = "http://127.0.0.1:%d%s?imagem=%s" % (PORTA, CAMINHO, id_)
    for _ in range(tentativas):
        # --disable-dev-shm-usage: com vários Chrome juntos a memória
        # compartilhada (/dev/shm) acaba e eles travam sem dar erro
        try:
            r = subprocess.run([chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                                "--disable-dev-shm-usage", "--virtual-time-budget=25000", "--dump-dom", url],
                               capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            m = None
            continue
        m = re.search(r'<pre id="imagem-pronta">([^<]*)</pre>', r.stdout)
        if m and m.group(1).startswith("data:image/jpeg;base64,"):
            return base64.b64decode(m.group(1).split(",", 1)[1])
    raise RuntimeError("não saiu a imagem de %s: %s" % (id_, (m.group(1)[:80] if m else "sem saída")))


def pagina(id_, g, versao):
    titulo = g["titulo"]
    sub = g.get("subtitulo", "")
    if g.get("variantes"):
        sub = (sub + " · " if sub else "") + g["variantes"][0]["rot"]
    img = BASE_PUBLICA + "c/%s.jpg?v=%s" % (id_, versao)
    destino = DESTINO + "#" + id_
    e = lambda s: html.escape(s, quote=True)                         # noqa: E731
    return """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>{t} | Follow the Money</title>
<meta name="description" content="{s}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Follow the Money">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{s}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="628">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{s}">
<meta name="twitter:image" content="{img}">
<meta http-equiv="refresh" content="0; url={d}">
<link rel="canonical" href="{d}">
</head>
<body style="background:#000;color:#fff;font-family:sans-serif">
<p><a href="{d}" style="color:#fff">{t}</a></p>
<script>location.replace({dj});</script>
</body>
</html>
""".format(t=e(titulo), s=e(sub), img=e(img), url=e(BASE_PUBLICA + "c/%s.html" % id_), d=e(destino),
           dj=json.dumps(destino))


def main():
    todos = "--todos" in sys.argv
    os.makedirs(SAIDA, exist_ok=True)
    antes = json.load(open(MANIFESTO)) if os.path.exists(MANIFESTO) else {}
    lista = graficos()
    agora = {id_: resumo(g, doc) for id_, g, doc in lista}
    refazer = [(id_, g) for id_, g, doc in lista
               if todos or antes.get(id_) != agora[id_] or not os.path.exists(os.path.join(SAIDA, id_ + ".jpg"))]
    # LIMITE: no máximo n imagens por rodada (o deploy do lps-ftm tem 20 min no
    # total; as que ficarem saem nas rodadas seguintes, que o manifesto lembra)
    limite = int(os.environ.get("LIMITE") or 0)
    pendentes = 0
    if limite and len(refazer) > limite:
        pendentes = len(refazer) - limite
        for id_, _ in refazer[limite:]:          # adiados: seguem marcados como pendentes
            if id_ in antes:
                agora[id_] = antes[id_]
            else:
                agora.pop(id_, None)
        refazer = refazer[:limite]
    print("%d gráficos, %d a refazer%s" % (len(lista), len(refazer),
                                           ", %d ficam para a próxima rodada" % pendentes if pendentes else ""))
    if refazer:
        chrome = achar_chrome()
        servidor = servir()
        try:
            falhas = []
            # um Chrome por vez: com três juntos eles travaram nesta máquina
            # (cada um leva ~15 s; os 90 gráficos, ~20 min, só na primeira vez)
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                tarefas = {ex.submit(imagem, chrome, id_): id_ for id_, _ in refazer}
                for fut in concurrent.futures.as_completed(tarefas):
                    id_ = tarefas[fut]
                    try:
                        jpg = fut.result()
                    except Exception as e:                    # noqa: BLE001
                        falhas.append(id_)
                        print("  FALHOU %s: %s" % (id_, e))
                        continue
                    with open(os.path.join(SAIDA, id_ + ".jpg"), "wb") as f:
                        f.write(jpg)
                    print("  %-40s %4.0f KB" % (id_, len(jpg) / 1024))
            for id_ in falhas:          # sem imagem nova: fica a antiga, e o resumo antigo
                if id_ in antes:
                    agora[id_] = antes[id_]
        finally:
            servidor.shutdown()
    # as páginas são baratas: refaz todas (pega mudança de título e de endereço)
    for id_, g, doc in lista:
        if id_ not in agora or not os.path.exists(os.path.join(SAIDA, id_ + ".jpg")):
            continue                              # sem imagem ainda: a página espera por ela
        with open(os.path.join(SAIDA, id_ + ".html"), "w", encoding="utf-8") as f:
            f.write(pagina(id_, g, agora[id_]))
    # gráfico que saiu do site: some a imagem e a página
    for arq in os.listdir(SAIDA):
        nome, ext = os.path.splitext(arq)
        if ext in (".jpg", ".html") and nome not in {i for i, _, _ in lista}:
            os.remove(os.path.join(SAIDA, arq))
    json.dump(agora, open(MANIFESTO, "w"), indent=0, sort_keys=True)
    print("c/: %d páginas, %.1f MB de imagens" % (len(lista), sum(
        os.path.getsize(os.path.join(SAIDA, a)) for a in os.listdir(SAIDA) if a.endswith(".jpg")) / 1e6))


if __name__ == "__main__":
    main()
