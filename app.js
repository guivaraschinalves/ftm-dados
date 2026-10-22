/* FtM Dados — desenha os gráficos de dados/ipca.json no estilo dos slides do FtM.
 *
 * Tudo vira SVG com as cores em atributos (nada de CSS dentro do SVG), então o
 * mesmo desenho serve para a tela, para o SVG baixado e para o PNG (que
 * serializa o SVG num canvas por cima da imagem de fundo).
 *
 * Os dados já chegam prontos (em %): as contas ficam em scripts/atualizar.py.
 *
 * O mesmo desenho serve para o cartão da página e para o visor (um gráfico só,
 * grande, com tela cheia e anotação à mão por cima, num <canvas>).
 */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var FONT = "Calibri, Carlito, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  var MESES_LONGOS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
    "Setembro", "Outubro", "Novembro", "Dezembro"];

  var PALETAS = {
    dark: {
      texto: "#ffffff", eixo: "#ffffff", suave: "rgba(255,255,255,.78)", grade: "rgba(255,255,255,.09)",
      zero: "rgba(255,255,255,.85)", logo: "#a3a3a3", bg: "#000000",
      tipBg: "rgba(0,0,0,.9)", tipBorda: "rgba(255,255,255,.3)", fundo: "assets/fundo.jpg"
    },
    light: {
      texto: "#1b1f23", eixo: "#30363d", suave: "#5b6570", grade: "#e3e6e9",
      zero: "#4a525a", logo: "#595959", bg: "#ffffff",
      tipBg: "rgba(255,255,255,.96)", tipBorda: "#b9c1c9", fundo: null
    }
  };

  var LAYOUTS = {
    wide: {
      W: 1920, H: 1080, x0: 108, y1: 945, rotuloX: 14,
      titulo: { x: 35, y: 66, fs: 40, max: 1600 }, sub: { x: 36, y: 104, fs: 24, max: 1600 },
      logo: { x: 1712, y: 20, w: 180 }, legenda: { y: 181, fs: 24, passo: 40, colunas: 5, larguraCol: 318 },
      tick: 24, xlab: 22, xRot: -45, rotulo: 26, fonte: { x: 1905, y: 1070, fs: 16 },
      tip: 22, linha: 7, eixoDuplo: true
    },
    narrow: vertical(1350, 0, 0)
  };

  // Layout em pé (largura 1080). topo/base = margem livre para a interface do
  // Instagram nos Stories (o gráfico fica dentro da área segura).
  function vertical(H, topo, base) {
    var b = H - base;
    return {
      W: 1080, H: H, x0: 96, y1: b - 160, rotuloX: 12,
      titulo: { x: 30, y: topo + 150, fs: 48, max: 1020 }, sub: { x: 31, y: topo + 196, fs: 28, max: 1020 },
      logo: { x: 860, y: topo + 26, w: 190 }, legenda: { y: 0, fs: 28, passo: 42, colunas: 2, larguraCol: 505 },
      tick: 30, xlab: 27, xRot: -60, rotulo: 30, fonte: { x: 1060, y: b - 14, fs: 22 },
      tip: 30, linha: 7, eixoDuplo: false
    };
  }

  // Tamanhos para baixar. escala = quantas vezes os pixels do layout (o desenho
  // é vetorial, então 2× sai nítido, não esticado).
  var TAMANHOS = [
    { id: "slide", nome: "Apresentação 16:9", layout: LAYOUTS.wide, escala: 2 },
    { id: "ig-4x5", nome: "Instagram feed 4:5", layout: LAYOUTS.narrow, escala: 2 },
    { id: "ig-3x4", nome: "Instagram feed 3:4", layout: vertical(1440, 0, 0), escala: 2 },
    { id: "ig-1x1", nome: "Instagram quadrado 1:1", layout: vertical(1080, 0, 0), escala: 2 },
    { id: "ig-story", nome: "Instagram Stories 9:16", layout: vertical(1920, 250, 340), escala: 2 }
  ];

  var cartoes = [];
  // Um arquivo por categoria (IPCA, Dívida Pública…). Cada um traz categoria,
  // fonte, mês de referência e as suas seções; um que faltar é só ignorado.
  // A pasta do site, tirada do endereço deste próprio script: o mesmo app.js
  // roda em guivaraschinalves.github.io/ftm-dados/ e em ftm.app.br/interno/dados/,
  // e tem de achar assets e dados nos dois, com ou sem a barra no fim do endereço.
  var RAIZ_SITE = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/[^/]*$/, "") : "";
  })();
  function noSite(caminho) { return /^(https?:|data:|\/)/.test(caminho) ? caminho : RAIZ_SITE + caminho; }
  // No ftm.app.br os números moram em protegido/, que o Caddy só entrega a
  // assinante (forward_auth no news-access). No github.io, em dados/.
  var NO_DOMINIO = location.hostname === "ftm.app.br";
  var PASTA_DADOS = NO_DOMINIO ? "protegido/" : "dados/";
  var FONTES = ["moedas.json", "bp.json", "ipca.json", "fiscal.json",
                "divida.json", "tesouro-direto.json", "juros.json",
                "reservas.json", "acoes-eua.json"].map(function (f) { return noSite(PASTA_DADOS + f); });
  // ---------- gate de assinante ----------
  // O site roda em dois lugares: ftm.app.br/interno/dados, onde é para
  // assinante, e guivaraschinalves.github.io/ftm-dados, que segue aberto
  // enquanto durar a transição. O gate só liga no primeiro — e lá o Caddy
  // barra os JSON no servidor, que é o bloqueio que de fato vale. Este aqui é
  // a porta de entrada, não a fechadura: esconder a tela não guarda número
  // nenhum, e nunca foi para guardar.
  //
  // "?gate=1" liga o gate em qualquer endereço, para testar. Não existe o
  // contrário: nenhum parâmetro desliga o que o domínio ligou.
  var GATE = {
    ligado: location.hostname === "ftm.app.br" || /[?&]gate=1(&|$)/.test(location.search),
    // A MESMA chave do Follow the News. Mesma origem, mesma assinatura: quem
    // liberou um já entra no outro, e há um lugar só para limpar quando vence.
    chave: "ftn_access",
    api: "https://supabase.liberta.com.vc/functions/v1/news-access",
    checkout: "https://followthemoney.app.br"
  };
  function tokenSalvo() {
    try { return localStorage.getItem(GATE.chave) || null; } catch (e) { return null; }
  }
  function esquecerToken() {
    try { localStorage.removeItem(GATE.chave); } catch (e) {}
  }

  var docs = [];
  var logoSvg = null;   // {viewBox, nos}
  // Imagens que entram dentro do desenho (a nota de R$100 sob a linha do poder
  // de compra, a de US$100 sob a do dólar). Ficam aqui já em data URI, e não
  // como href para o arquivo: na hora de baixar, o SVG é serializado e
  // rasterizado num <img>, e ali referência externa não carrega — a nota
  // sumiria do PNG. Em data URI o desenho é autossuficiente nos quatro
  // formatos, inclusive no .svg, que sai como um arquivo só.
  var IMAGENS = {};     // {caminho: "data:image/jpeg;base64,…"}

  // ---------- utilidades ----------
  function el(nome, attrs, filhos) {
    var n = document.createElementNS(NS, nome);
    for (var k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    (filhos || []).forEach(function (f) { n.appendChild(f); });
    return n;
  }
  function texto(conteudo, attrs) {
    var t = el("text", Object.assign({ "font-family": FONT }, attrs));
    t.textContent = conteudo;
    return t;
  }
  function html(tag, attrs, filhos) {
    var n = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "texto") n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (filhos || []).forEach(function (f) { n.appendChild(f); });
    return n;
  }
  function tema() { return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"; }

  var medidor = document.createElement("canvas").getContext("2d");
  function largura(str, fs, estilo) {
    medidor.font = (estilo || "normal") + " " + fs + "px " + FONT;
    return medidor.measureText(str).width;
  }
  function corpoQueCabe(str, fsMax, disponivel, estilo) {
    return Math.min(fsMax, disponivel / largura(str, 100, estilo) * 100);
  }

  var nfCache = {};
  function nf(casas) {
    if (!nfCache[casas]) {
      nfCache[casas] = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }
    return nfCache[casas];
  }
  var NF_ATE2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  function pct(v, casas) { return nf(casas === undefined ? 2 : casas).format(v) + "%"; }

  // Como cada gráfico escreve os seus números: no eixo (curto) e no valor
  // cheio (rótulo do último ponto e caixa do mouse). "%" é o padrão.
  // casas do eixo conforme o passo da grade: numa janela curta (7,0% a 9,5%) o
  // eixo sem decimal repetiria "7%, 8%, 8%, 9%"
  function casasDoPasso(p) {
    // as casas que o passo pede: 20 → 0, 1,6 → 1, 0,25 → 2. Antes um passo de
    // 1,6 saía sem casa e o eixo mostrava 2%, 3%, 5%, 6%
    p = Math.abs(p || 1);
    for (var c = 0; c < 2; c++) {
      if (Math.abs(p * Math.pow(10, c) - Math.round(p * Math.pow(10, c))) < 1e-6) return c;
    }
    return 2;
  }
  var UNIDADES = {
    "%": { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v) + "%"; },
           valor: function (v) { return pct(v, 2); } },
    bi: { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); },
          valor: function (v) { return "R$ " + nf(1).format(v) + " bi"; } },
    meses: { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); },
             valor: function (v) { return nf(1).format(v) + " meses"; } },
    anos: { eixo: function (v, passo) { return nf(Math.max(1, casasDoPasso(passo))).format(v); },
            valor: function (v) { return nf(2).format(v) + " anos"; } },
    // reservas internacionais: estoque em trilhões de dólares, preço do ouro
    // por onça troy e reserva de ouro em toneladas
    "usd-tri": { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); },
                 valor: function (v) { return "US$ " + nf(2).format(v) + " tri"; } },
    "usd-oz": { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); },
                valor: function (v) { return "US$ " + nf(0).format(v) + "/oz"; } },
    "usd-bi": { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); },
                valor: function (v) { return "US$ " + nf(1).format(v) + " bi"; } },
    // o mesmo, com duas casas: o fluxo mensal de criptos anda na casa dos centavos de bilhão
    // bilhão até mil, trilhão daí para cima: valor de empresa (US$ 965 bi, US$ 1,77 tri)
    "usd-bi-tri": { eixo: function (v) { return nf(0).format(v); },
                    valor: function (v) {
                      return Math.abs(v) >= 1000 ? "US$ " + NF_ATE2.format(v / 1000) + " tri" : "US$ " + nf(0).format(v) + " bi";
                    } },
    // contagem (lançamentos) e gigawatt (compute nominal)
    n: { eixo: function (v) { return nf(0).format(v); }, valor: function (v) { return nf(0).format(v); } },
    gw: { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); }, valor: function (v) { return nf(1).format(v) + " GW"; } },
    "mi": { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); }, valor: function (v) { return nf(1).format(v) + " mi"; } },
    // múltiplo (P/L, P/V): "34,4x"
    x: { eixo: function (v) { return nf(0).format(v) + "x"; }, valor: function (v) { return nf(1).format(v) + "x"; } },
    // porcentagem sem casas, para razões grandes (capex sobre receita: 235%)
    "pct0": { eixo: function (v) { return nf(0).format(v) + "%"; }, valor: function (v) { return nf(0).format(v) + "%"; } },
    "usd-bi2": { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); },
                 valor: function (v) { return "US$ " + nf(2).format(v) + " bi"; } },
    // tonelada: a casa decimal só importa onde o número é pequeno (os −5,4 t
    // dos Estados Unidos); num estoque de 222 mil t ela é ruído
    t: { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); },
         valor: function (v) { return nf(Math.abs(v) >= 1000 ? 0 : 1).format(v) + " t"; } },
    // poder de compra: um índice que começa em 100 e é lido como dinheiro
    brl: { eixo: function (v, passo) { return "R$ " + nf(casasDoPasso(passo)).format(v); },
           valor: function (v) { return "R$ " + nf(2).format(v); } },
    usd: { eixo: function (v, passo) { return "$ " + nf(casasDoPasso(passo)).format(v); },
           valor: function (v) { return "$ " + nf(2).format(v); } },
    // câmbio: duas casas sempre, no eixo também — "R$ 1,5" por US$ se lê mal
    "brl-usd": { eixo: function (v) { return "R$ " + nf(2).format(v); },
                 valor: function (v) { return "R$ " + nf(2).format(v); } }
  };
  function unidade(g) { return UNIDADES[g.unidade] || UNIDADES["%"]; }

  function idxMes(m) { var p = m.split("-"); return (+p[0]) * 12 + (+p[1] - 1); }
  // eixo diário: o índice é o dia corrido (UTC, para não pegar fuso nem horário de verão)
  function idxDia(iso) { var p = iso.split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function dataDeIdx(i) { return new Date(i * 86400000); }
  function mesDeIdx(i) { return Math.floor(i / 12) + "-" + ("0" + (i % 12 + 1)).slice(-2); }
  // eixo trimestral: a chave é "2000-Q1" e o índice é o trimestre corrido
  function idxTri(chave) { var p = chave.split("-Q"); return (+p[0]) * 4 + (+p[1] - 1); }
  function rotuloTriLongo(i) { return (i % 4 + 1) + "\u00ba trimestre de " + Math.floor(i / 4); }
  function rotuloMesCurto(i) { return MESES[i % 12] + "/" + String(Math.floor(i / 12)).slice(-2); }
  function rotuloMesLongo(i) { return MESES_LONGOS[i % 12] + " de " + Math.floor(i / 12); }

  // Eixo X: normalmente é o tempo (um passo por mês); com "categorias" no
  // gráfico, é uma lista de rótulos (o acumulado do cronograma de vencimentos).
  function idxDe(g, chave) {
    if (g.categorias) return +chave;
    if (g.diario) return idxDia(chave);
    if (g.trimestral) return idxTri(chave);
    return idxMes(chave);
  }
  function rotuloX(g, i, longo) {
    if (g.categorias) return g.categorias[i] || "";
    if (g.diario) {
      var d = dataDeIdx(i);
      if (!longo) return MESES[d.getUTCMonth()] + "/" + String(d.getUTCFullYear()).slice(-2);
      return d.getUTCDate() + " de " + MESES_LONGOS[d.getUTCMonth()].toLowerCase() + " de " + d.getUTCFullYear();
    }
    // trimestre: no eixo vai só o ano (a marca é sempre o 1\u00ba trimestre)
    if (g.trimestral) return longo ? rotuloTriLongo(i) : String(Math.floor(i / 4));
    return longo ? rotuloMesLongo(i) : rotuloMesCurto(i);
  }
  // Quantos passos do eixo cabem num ano — o que separa "mês" de "dia" nas
  // contas de período (Tudo / 10 anos / 5 anos…).
  function passosPorAno(g) { return g.diario ? 365.25 : g.trimestral ? 4 : 12; }

  // Um cartão pode ter variantes (agência, moeda, "% ou R$"…): o gráfico que
  // vale é a base com a variante escolhida por cima. O objeto fica guardado
  // para as séries manterem a identidade entre desenho e interação.
  // O cartão com "selecao" deixa o usuário ligar e desligar cada série; a
  // escolha vale por cartão e sobrevive à troca de recorte (pelo nome da série).
  function graficoDe(cartao) {
    var g = comVariante(cartao);
    if (!g.selecao || !cartao.desligadas) return g;
    var fica = g.series.filter(function (s) { return !cartao.desligadas[s.nome]; });
    if (!fica.length || fica.length === g.series.length) return g;
    var copia = {};
    for (var a in g) copia[a] = g[a];
    copia.series = fica;
    return copia;
  }

  function comVariante(cartao) {
    var base = cartao.grafico;
    if (!base.variantes) return base;
    var k = cartao.variante || 0;
    if (!cartao.montados) cartao.montados = {};
    if (!cartao.montados[k]) {
      var v = base.variantes[k] || base.variantes[0], fora = {};
      for (var a in base) if (a !== "variantes") fora[a] = base[a];
      for (var b in v) if (b !== "rot") fora[b] = v[b];
      // o recorte escolhido entra no subtítulo: sem isso, a imagem baixada não
      // diz qual deles está na tela
      fora.subtitulo = (base.subtitulo ? base.subtitulo + " · " : "") + v.rot;
      cartao.montados[k] = fora;
    }
    return cartao.montados[k];
  }

  // Branco e amarelo somem no fundo claro: no tema claro viram tinta escura / ocre.
  function corNoTema(cor, pal) {
    if (tema() !== "light") return cor;
    var c = cor.toUpperCase();
    if (c === "#FFFFFF") return pal.texto;
    if (c === "#FFFF00") return "#C9A800";
    return cor;
  }

  // ---------- escala Y ----------
  function passoBonito(faixa, alvo) {
    var bruto = faixa / alvo;
    var mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    var cands = [1, 2, 5, 10];   // sem 2,5: o eixo mostra % sem casas decimais
    for (var i = 0; i < cands.length; i++) if (cands[i] * mag >= bruto) return cands[i] * mag;
    return 10 * mag;
  }
  function escalaY(mn, mx, eixo) {
    eixo = eixo || {};
    var baixo = mn, alto = mx;
    // série que não chega perto de zero (dívida/PIB, por exemplo) pede
    // "zero: false": aí o piso acompanha os dados da janela escolhida, em vez
    // de descer até zero e espremer a linha na metade de cima
    if (eixo.zero !== false && mn >= 0 && mn <= mx * 0.6) baixo = 0;
    if (eixo.min !== undefined) baixo = eixo.min;
    if (eixo.max !== undefined) alto = eixo.max;
    if (alto - baixo <= 0) alto = baixo + 1;
    // "alvo" é quantas marcas o gráfico quer: o padrão (8) dá passo 5 numa
    // faixa de 0 a 18 e desperdiça metade da grade
    var passo = passoBonito(alto - baixo, eixo.alvo || 8);
    var min = eixo.min !== undefined ? eixo.min : Math.floor(baixo / passo + 1e-9) * passo;
    var max = eixo.max !== undefined ? eixo.max : Math.ceil(alto / passo - 1e-9) * passo;
    var ticks = [];
    for (var k = 0; min + k * passo <= max + passo / 2; k++) ticks.push(+(min + k * passo).toFixed(6));
    return { min: min, max: max, passo: passo, ticks: ticks };
  }

  // Eixo da direita (o preço do ouro ao lado do estoque de reservas). Para as
  // duas grades coincidirem, ele tem de ter o **mesmo número de intervalos**
  // que o da esquerda — então o passo não pode vir de um alvo de marcas, e sim
  // do primeiro degrau redondo que fecha a faixa em n intervalos. A lista de
  // degraus é mais rica que a do eixo principal (entram 1,5, 2,5, 3, 6…):
  // aqui o que importa é fechar a conta sem número quebrado.
  var DEGRAUS_DIR = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  function escalaCasada(mn, mx, eixo, n) {
    eixo = eixo || {};
    var baixo = mn, alto = mx;
    if (eixo.zero !== false && mn >= 0 && mn <= mx * 0.6) baixo = 0;
    if (eixo.min !== undefined) baixo = eixo.min;
    if (eixo.max !== undefined) alto = eixo.max;
    if (alto - baixo <= 0) alto = baixo + 1;
    var base = Math.pow(10, Math.floor(Math.log10((alto - baixo) / n)) - 1), degraus = [];
    for (var d = 0; d < 4; d++) {
      for (var c = 0; c < DEGRAUS_DIR.length; c++) degraus.push(DEGRAUS_DIR[c] * base * Math.pow(10, d));
    }
    var passo = degraus[degraus.length - 1], min = 0;
    for (var i = 0; i < degraus.length; i++) {
      var p = degraus[i];
      var m = eixo.min !== undefined ? eixo.min : Math.floor(baixo / p + 1e-9) * p;
      if (m + n * p >= alto - 1e-9) { passo = p; min = m; break; }
    }
    var ticks = [];
    for (var k = 0; k <= n; k++) ticks.push(+(min + k * passo).toFixed(6));
    return { min: min, max: min + n * passo, passo: passo, ticks: ticks };
  }

  // ---------- legenda ----------
  function itensLegenda(g) {
    return g.series.filter(function (s) { return s.legenda !== false; });
  }
  function montarLegenda(g, L) {
    var itens = itensLegenda(g), lg = L.legenda, fs = lg.fs, sw = 34, gap = 8;
    var larg = itens.map(function (s) { return sw + gap + largura(s.nome, fs); });
    var pos = [];
    var total = larg.reduce(function (a, b) { return a + b; }, 0) + 40 * (itens.length - 1);
    if (itens.length <= lg.colunas && total <= L.W - 80) {
      var x = (L.W - total) / 2;
      itens.forEach(function (s, k) { pos.push({ s: s, x: x, linha: 0 }); x += larg[k] + 40; });
    } else {
      // em grade, como os slides com muitas séries (contribuição por grupo)
      var cols = lg.colunas, cw = lg.larguraCol;
      var fsCab = Math.min.apply(null, itens.map(function (s) { return corpoQueCabe(s.nome, fs, cw - sw - gap - 6); }));
      fs = Math.max(fs * 0.8, fsCab);
      var x0 = (L.W - cols * cw) / 2;
      itens.forEach(function (s, k) { pos.push({ s: s, x: x0 + (k % cols) * cw, linha: Math.floor(k / cols) }); });
    }
    var linhas = pos.length ? pos[pos.length - 1].linha + 1 : 0;
    return { pos: pos, fs: fs, sw: sw, gap: gap, linhas: linhas };
  }

  // ---------- desenho ----------
  function construir(cartao, L0, nomeTema) {
    if (cartao.grafico.painel) return construirPainel(cartao, Object.assign({}, L0), nomeTema);
    var g = graficoDe(cartao), pal = PALETAS[nomeTema], F = unidade(g);
    var L = Object.assign({}, L0);
    var subLinhas = subtituloEmLinhas(g, L);
    var legenda = montarLegenda(g, L);
    var topoLegenda = L.legenda.y || (L.sub.y + (subLinhas.length - 1) * L.sub.fs * 1.2 + 62);
    var y0 = topoLegenda + (legenda.linhas - 1) * L.legenda.passo + 42;

    // período visível
    var todas = g.series.map(function (s) { return s.dados.map(function (d) { return { i: idxDe(g, d[0]), v: d[1] }; }); });
    var ini = Infinity, fim = -Infinity;
    todas.forEach(function (pts) { pts.forEach(function (p) { if (p.i < ini) ini = p.i; if (p.i > fim) fim = p.i; }); });
    var d0 = cartao.inicioIdx === null ? ini : Math.max(ini, cartao.inicioIdx);
    var d1 = cartao.fimIdx === null ? fim + 1 : Math.min(fim + 1, cartao.fimIdx + 1);
    if (d1 - d0 < 2) { d0 = ini; d1 = fim + 1; }     // faixa degenerada volta a ser tudo
    var vis = todas.map(function (pts) { return pts.filter(function (p) { return p.i >= d0 && p.i < d1; }); });

    // extremos: barras entram empilhadas (positivas e negativas em separado).
    // Série marcada com "dir" não entra aqui: ela mede noutra unidade e tem
    // escala própria, no eixo da direita.
    var mn = Infinity, mx = -Infinity, pilhaPos = {}, pilhaNeg = {};
    var mnD = Infinity, mxD = -Infinity, naDireita = g.series.filter(function (s) { return s.dir; });
    g.series.forEach(function (s, k) {
      vis[k].forEach(function (p) {
        if (s.dir) {
          if (p.v < mnD) mnD = p.v;
          if (p.v > mxD) mxD = p.v;
        } else if (s.tipo === "barra") {
          if (p.v >= 0) pilhaPos[p.i] = (pilhaPos[p.i] || 0) + p.v;
          else pilhaNeg[p.i] = (pilhaNeg[p.i] || 0) + p.v;
        } else {
          if (p.v < mn) mn = p.v;
          if (p.v > mx) mx = p.v;
        }
      });
    });
    Object.keys(pilhaPos).forEach(function (i) { mx = Math.max(mx, pilhaPos[i]); mn = Math.min(mn, 0); });
    // barra sai do zero, então o zero entra na escala também quando todas são
    // negativas (sem isto o máximo ficava em −Infinity: criptos em 12 meses)
    Object.keys(pilhaNeg).forEach(function (i) { mn = Math.min(mn, pilhaNeg[i]); mx = Math.max(mx, 0); });
    if (mn === Infinity) { mn = 0; mx = 1; }
    // o texto de um evento tem de caber na escala: a dada ("y") ou, sem ela,
    // uma folga em cima para o texto ficar acima das barras
    var eventosVis = (g.eventos || []).filter(function (ev) { var i = idxDe(g, ev.x); return i >= d0 && i < d1; });
    eventosVis.forEach(function (ev) { if (ev.y !== undefined && ev.y > mx) mx = ev.y; });
    if (eventosVis.some(function (ev) { return ev.y === undefined; })) mx *= 1.22;
    var esc = escalaY(mn, mx, g.eixo);
    var escDir = mnD === Infinity ? null : escalaCasada(mnD, mxD, g.eixo2, esc.ticks.length - 1);
    var F2 = escDir ? (UNIDADES[g.unidade2] || F) : F;
    // de que eixo cada série é, para o rótulo e a caixa do mouse
    function fDe(s) { return s.dir && escDir ? F2 : F; }

    var tw = Math.max.apply(null, esc.ticks.map(function (t) { return largura(F.eixo(t, esc.passo), L.tick); }));
    var twD = escDir ? Math.max.apply(null, escDir.ticks.map(function (t) {
      return largura(F2.eixo(t, escDir.passo), L.tick);
    })) : 0;
    var rotulos = [];
    g.series.forEach(function (s, k) {
      if (!s.rotulo || !vis[k].length) return;
      var u = vis[k][vis[k].length - 1];
      rotulos.push({ s: s, p: u, txt: fDe(s).valor(u.v) });
    });
    var rw = Math.max.apply(null, [0].concat(rotulos.map(function (r) { return largura(r.txt, L.rotulo, "bold"); })));
    L.x0 = 26 + tw + 14;
    L.x1 = L.W - (22 + Math.max(escDir ? twD + 14 : L.eixoDuplo ? tw + 14 : 0, rw + L.rotuloX + 10));
    L.y0 = y0;
    var pw = L.x1 - L.x0, ph = L.y1 - L.y0;
    var X = function (i) { return L.x0 + (i - d0) / (d1 - d0) * pw; };
    var Y = function (v) { return L.y1 - (v - esc.min) / (esc.max - esc.min) * ph; };
    var YD = escDir ? function (v) { return L.y1 - (v - escDir.min) / (escDir.max - escDir.min) * ph; } : Y;
    var yDe = function (s) { return s.dir && escDir ? YD : Y; };
    var pxMes = pw / (d1 - d0);

    var svg = el("svg", {
      xmlns: NS, viewBox: "0 0 " + L.W + " " + L.H, width: L.W, height: L.H,
      role: "img", "aria-label": g.titulo + (g.subtitulo ? ". " + g.subtitulo : "")
    });
    var idClip = "clip-" + g.id + "-" + nomeTema;
    svg.appendChild(el("defs", {}, [el("clipPath", { id: idClip }, [
      el("rect", { x: L.x0, y: L.y0 - 2, width: pw, height: ph + 4 })
    ])]));

    // Onde cada rótulo do último ponto vai ficar, afastando os que se
    // encostam. Fica antes do eixo porque o eixo da direita só imprime o
    // número onde não houver rótulo — e o que vale é a posição final dele.
    var rotY = rotulos.map(function (r) { return Math.min(Math.max(yDe(r.s)(r.p.v), L.y0), L.y1); });
    var ordem = rotulos.map(function (r, k) { return { r: r, y: rotY[k] }; }).sort(function (a, b) { return a.y - b.y; });
    var passoRot = L.rotulo * 1.08;
    for (var a = 1; a < ordem.length; a++) {
      if (ordem[a].y - ordem[a - 1].y < passoRot) ordem[a].y = ordem[a - 1].y + passoRot;
    }
    for (var b2 = ordem.length - 1; b2 >= 0; b2--) {
      var teto = b2 === ordem.length - 1 ? L.y1 : ordem[b2 + 1].y - passoRot;
      if (ordem[b2].y > teto) ordem[b2].y = teto;
    }

    // grade e eixo Y (dos dois lados, como nos slides)
    esc.ticks.forEach(function (t) {
      var y = Y(t), zero = Math.abs(t) < 1e-9;
      svg.appendChild(el("line", {
        x1: L.x0, x2: L.x1, y1: y, y2: y, stroke: zero && esc.min < 0 ? pal.zero : pal.grade,
        "stroke-width": zero && esc.min < 0 ? 1.5 : 1.2
      }));
      var at = { y: y, "font-size": L.tick, fill: pal.eixo, "dominant-baseline": "central" };
      svg.appendChild(texto(F.eixo(t, esc.passo), Object.assign({ x: L.x0 - 14, "text-anchor": "end" }, at)));
      var livre = ordem.every(function (o) { return Math.abs(o.y - y) > L.rotulo * 0.9; });
      if (escDir) {
        // a mesma marca, na outra unidade: as duas escalas têm o mesmo número
        // de intervalos, então cada número da direita cai numa linha da grade.
        // Com uma única série ali, o número sai na cor dela — é o que diz a
        // quem a escala pertence.
        var tD = escDir.ticks[esc.ticks.indexOf(t)];
        if (tD !== undefined && livre) {
          svg.appendChild(texto(F2.eixo(tD, escDir.passo), Object.assign({}, at, {
            x: L.x1 + 14, "text-anchor": "start",
            fill: naDireita.length === 1 ? corNoTema(naDireita[0].cor, pal) : pal.eixo
          })));
        }
      } else if (L.eixoDuplo && livre) {
        svg.appendChild(texto(F.eixo(t, esc.passo), Object.assign({ x: L.x1 + 14, "text-anchor": "start" }, at)));
      }
    });
    // eixo X: linha de base (zero, se estiver no gráfico; senão a base)
    var yBase = esc.min <= 0 && esc.max >= 0 ? Y(0) : L.y1;
    if (!(esc.min < 0)) {
      svg.appendChild(el("line", { x1: L.x0, x2: L.x1, y1: yBase, y2: yBase, stroke: pal.zero, "stroke-width": 1.5 }));
    }

    // rótulos do eixo X
    if (g.categorias) {
      // uma coluna por categoria: rótulo em pé, do tamanho que couber na coluna
      var fsCat = Math.min(L.xlab * 1.2, corpoQueCabe(
        g.categorias.reduce(function (a, b) { return a.length > b.length ? a : b; }, ""),
        L.xlab * 1.2, pxMes * 0.95));
      for (var ci = d0; ci < d1; ci++) {
        var cxc = X(ci + 0.5);
        svg.appendChild(el("line", { x1: cxc, x2: cxc, y1: L.y1, y2: L.y1 + 7, stroke: pal.zero, "stroke-width": 1.5 }));
        svg.appendChild(texto(rotuloX(g, ci), {
          x: cxc, y: L.y1 + 14, "font-size": fsCat, fill: pal.eixo,
          "text-anchor": "middle", "dominant-baseline": "hanging"
        }));
      }
    } else if (g.diario) {
      // 1º de janeiro de cada ano (de 1, 2, 5 ou 10 em 10, conforme couber);
      // em janela curta, o primeiro dia de cada mês
      var marcas = [], ini0 = dataDeIdx(d0), fim0 = dataDeIdx(d1);
      if (d1 - d0 > 365.25 * 2.5) {
        for (var y = ini0.getUTCFullYear(); y <= fim0.getUTCFullYear(); y++) {
          var iy = Math.round(Date.UTC(y, 0, 1) / 86400000);
          if (iy >= d0 && iy < d1) marcas.push(iy);
        }
      } else {
        var ym = ini0.getUTCFullYear(), mm = ini0.getUTCMonth();
        for (var k2 = 0; k2 < 400; k2++) {
          var im = Math.round(Date.UTC(ym, mm, 1) / 86400000);
          if (im >= d1) break;
          if (im >= d0) marcas.push(im);
          if (++mm > 11) { mm = 0; ym++; }
        }
      }
      // rareia até os rótulos não se encostarem, em degraus redondos
      var espaco = marcas.length > 1 ? pw / (marcas.length - 1) : pw;
      var pulo = Math.max(1, Math.ceil(L.xlab * 1.3 / espaco));
      [1, 2, 3, 5, 6, 10, 12, 20, 24].some(function (n) { if (n >= pulo) { pulo = n; return true; } });
      marcas.forEach(function (im, k3) {
        if (k3 % pulo !== 0) return;
        var cxd = X(im + 0.5);
        svg.appendChild(el("line", { x1: cxd, x2: cxd, y1: L.y1, y2: L.y1 + 7, stroke: pal.zero, "stroke-width": 1.5 }));
        svg.appendChild(texto(rotuloX(g, im), {
          x: cxd + 4, y: L.y1 + 16, "font-size": L.xlab, fill: pal.eixo, "text-anchor": "end",
          "dominant-baseline": "hanging", transform: "rotate(" + L.xRot + " " + (cxd + 4) + " " + (L.y1 + 16) + ")"
        }));
      });
    } else if (g.trimestral) {
      // o 1\u00ba trimestre de cada ano, rareando de 1, 2, 3, 5 ou 10 anos
      // conforme couber; o r\u00f3tulo \u00e9 o ano, curto, e fica em p\u00e9 no lugar de deitado
      var passoT = 4, degrausT = [4, 8, 12, 20, 40, 80], folga = largura("2000", L.xlab) * 1.4;
      while (pxMes * passoT < folga) {
        var proxT = degrausT.filter(function (n) { return n > passoT; })[0];
        if (!proxT) break;
        passoT = proxT;
      }
      for (var ti = d0; ti < d1; ti++) {
        if (ti % passoT !== 0) continue;
        var cxt = X(ti + 0.5);
        svg.appendChild(el("line", { x1: cxt, x2: cxt, y1: L.y1, y2: L.y1 + 7, stroke: pal.zero, "stroke-width": 1.5 }));
        svg.appendChild(texto(rotuloX(g, ti), {
          x: cxt, y: L.y1 + 14, "font-size": L.xlab, fill: pal.eixo,
          "text-anchor": "middle", "dominant-baseline": "hanging"
        }));
      }
    } else {
      // janeiro de cada ano; trimestral em janela curta
      var passoX = g.passoX || 12;
      if (d1 - d0 <= 72) passoX = Math.min(passoX, 3);
      var degraus = [3, 6, 12, 24, 36, 60];
      while (pxMes * passoX < L.xlab * 1.3) {
        var prox = degraus.filter(function (n) { return n > passoX; })[0];
        if (!prox) break;
        passoX = prox;
      }
      for (var i = d0; i < d1; i++) {
        if (i % passoX !== 0) continue;
        var cx = X(i + 0.5);
        svg.appendChild(el("line", { x1: cx, x2: cx, y1: L.y1, y2: L.y1 + 7, stroke: pal.zero, "stroke-width": 1.5 }));
        svg.appendChild(texto(rotuloMesCurto(i), {
          x: cx + 4, y: L.y1 + 16, "font-size": L.xlab, fill: pal.eixo, "text-anchor": "end",
          "dominant-baseline": "hanging", transform: "rotate(" + L.xRot + " " + (cx + 4) + " " + (L.y1 + 16) + ")"
        }));
      }
    }

    // barras empilhadas
    var area = el("g", { "clip-path": "url(#" + idClip + ")" });
    svg.appendChild(area);
    // barra=1 (composição): 1px a mais tira a fresta entre uma coluna e outra,
    // e a pilha fica com cara de área empilhada
    var fBarra = g.barra || 0.86;
    var baseP = {}, baseN = {}, bw = Math.max(2, pxMes * fBarra + (fBarra >= 1 ? 1 : 0));
    // com "buracoMax" (série que antes era anual), a barra de um ponto
    // isolado se alarga até o ponto anterior: o estoque de dezembro cobre o
    // ano, e o gráfico não fica com colunas soltas
    var ateAnterior = !!g.buracoMax && !g.diario;
    g.series.forEach(function (s, k) {
      if (s.tipo !== "barra") return;
      var cor = corNoTema(s.cor, pal), ant = null;
      vis[k].forEach(function (p) {
        var salto = ant === null ? 1 : Math.min(p.i - ant, g.buracoMax || 1);
        ant = p.i;
        if (!p.v) return;
        var bwP = ateAnterior && salto > 1 ? pxMes * salto + (fBarra >= 1 ? 1 : 0) : bw;
        var xP = ateAnterior && salto > 1 ? X(p.i + 1) - bwP : X(p.i + 0.5) - bw / 2;
        var b = p.v >= 0 ? baseP : baseN, antes = b[p.i] || 0, depois = antes + p.v;
        b[p.i] = depois;
        var ya = yDe(s)(antes), yb = yDe(s)(depois);
        // "contorno": só a borda, vazada (as reservas no balanço de
        // pagamentos, como no slide). O traço entra meio traço para dentro,
        // para não invadir a coluna vizinha.
        var h = Math.max(0.6, Math.abs(yb - ya));
        area.appendChild(el("rect", s.contorno ? {
          x: xP + 0.6, y: Math.min(ya, yb) + 0.6, width: Math.max(0.6, bwP - 1.2),
          height: Math.max(0.6, h - 1.2), fill: "none", stroke: cor, "stroke-width": 1.2
        } : {
          x: xP, y: Math.min(ya, yb), width: bwP, height: h, fill: cor
        }));
      });
    });
    // linhas, na ordem da lista (a última fica por cima)
    // no eixo diário, todo fim de semana é um salto de 3 dias: a linha só corta
    // quando o buraco for maior que isso (ali o título não estava em oferta)
    var buracoMax = g.buracoMax || (g.diario ? 6 : 1);
    g.series.forEach(function (s, k) {
      if (s.tipo === "barra" || !vis[k].length) return;
      var d = "", ant = null, YS = yDe(s), trechos = [], atual = [];
      vis[k].forEach(function (p) {
        var corta = ant === null || p.i - ant > buracoMax;
        if (corta && atual.length) { trechos.push(atual); atual = []; }
        atual.push([X(p.i + 0.5), YS(p.v)]);
        d += (corta ? "M" : "L") + X(p.i + 0.5).toFixed(1) + " " + YS(p.v).toFixed(1);
        ant = p.i;
      });
      if (atual.length) trechos.push(atual);
      // "area": fecha cada trecho contínuo até a linha do zero e pinta. Um
      // polígono por trecho, e não um só, para o buraco na série continuar
      // sendo buraco — emendar por cima dele inventaria o mês que falta.
      // O traço vai por cima, que é o que dá a borda nítida.
      if (s.area) {
        var yz = YS(0), cf = corNoTema(s.cor, pal), formas = [];
        trechos.forEach(function (t) {
          if (t.length < 2) return;
          var da = "M" + t[0][0].toFixed(1) + " " + yz.toFixed(1);
          t.forEach(function (q) { da += "L" + q[0].toFixed(1) + " " + q[1].toFixed(1); });
          da += "L" + t[t.length - 1][0].toFixed(1) + " " + yz.toFixed(1) + "Z";
          formas.push(da);
        });
        var fonteImg = s.imagem && IMAGENS[s.imagem];
        if (fonteImg && formas.length) {
          // a nota preenche o quadro do gráfico e a área sob a linha é o
          // recorte: é a linha que decide quanto da nota aparece. Esticada
          // (preserveAspectRatio="none") de propósito — o que importa é ela
          // cobrir o quadro, não ficar na proporção da cédula de verdade.
          var idImg = idClip + "-nota-" + k;
          svg.insertBefore(el("defs", {}, [el("clipPath", { id: idImg },
            formas.map(function (d2) { return el("path", { d: d2 }); }))]), svg.firstChild);
          area.appendChild(el("image", {
            href: fonteImg, x: L.x0, y: L.y0, width: pw, height: ph,
            preserveAspectRatio: "none", "clip-path": "url(#" + idImg + ")",
            opacity: s.opacidadeImagem || 1
          }));
        } else {
          formas.forEach(function (d2) {
            area.appendChild(el("path", { d: d2, fill: cf, opacity: s.opacidadeArea || 0.5, stroke: "none" }));
          });
        }
      }
      var w = s.largura || L.linha, op = s.opacidade || null;
      var traco = function (cor, clip) {
        area.appendChild(el("path", {
          d: d, fill: "none", stroke: corNoTema(cor, pal), "stroke-width": w, opacity: op,
          "stroke-linejoin": "round", "stroke-linecap": s.traco ? "butt" : "round",
          "stroke-dasharray": s.traco === "pontilhado" ? (w * 1.2) + " " + (w * 1.6) : null,
          "clip-path": clip ? "url(#" + clip + ")" : null
        }));
      };
      if (s.corNegativa) {
        // "corNegativa": a mesma linha, cortada no zero, numa cor acima e
        // noutra abaixo (dívida externa líquida: devedor e credor)
        var yz0 = YS(0), idA = idClip + "-acima-" + k, idB = idClip + "-abaixo-" + k;
        svg.insertBefore(el("defs", {}, [
          el("clipPath", { id: idA }, [el("rect", { x: L.x0, y: L.y0 - 10, width: pw, height: Math.max(0, yz0 - L.y0 + 10) })]),
          el("clipPath", { id: idB }, [el("rect", { x: L.x0, y: yz0, width: pw, height: Math.max(0, L.y1 - yz0 + 10) })])
        ]), svg.firstChild);
        traco(s.cor, idA);
        traco(s.corNegativa, idB);
      } else {
        traco(s.cor, null);
      }
    });

    // "eventos": um fato marcado no tempo (a falência do Lehman Brothers), com
    // o texto em cima e uma seta até o topo do gráfico naquele mês. "y" é onde
    // fica a base do texto, na unidade do gráfico; sem ele, um pouco acima do
    // topo. "\n" no texto quebra a linha.
    // topo do gráfico (pilha positiva ou linha mais alta) num índice
    function topoEm(i) {
      var t = baseP[i] || 0;
      g.series.forEach(function (s, k) {
        if (s.tipo === "barra" || s.dir) return;
        vis[k].forEach(function (p) { if (p.i === i && p.v > t) t = p.v; });
      });
      return t;
    }
    eventosVis.forEach(function (ev) {
      var i = idxDe(g, ev.x);
      var fs = L.xlab * 0.9, lh = fs * 1.25, linhas = ev.texto.split("\n"), xe = X(i + 0.5), yp = Y(topoEm(i)) - 4;
      var meia = Math.max.apply(null, linhas.map(function (t) { return largura(t, fs); })) / 2;
      var xt = Math.min(Math.max(xe, L.x0 + meia), L.x1 - meia);
      // sem altura dada, o texto fica acima de tudo o que está embaixo dele
      var alto = 0;
      for (var j = d0; j < d1; j++) {
        if (Math.abs(X(j + 0.5) - xt) <= meia + 6) alto = Math.max(alto, topoEm(j));
      }
      var base = ev.y !== undefined ? Y(ev.y) : Math.min(yp - fs * 2, Y(alto) - fs * 0.9);
      base = Math.max(base, L.y0 + lh * (linhas.length - 1) + fs);
      linhas.forEach(function (t, k) {
        svg.appendChild(texto(t, {
          x: xt, y: base - (linhas.length - 1 - k) * lh, "font-size": fs, fill: pal.texto, "text-anchor": "middle"
        }));
      });
      var y1 = base + fs * 0.5;
      if (yp - y1 > 10) {
        svg.appendChild(el("line", { x1: xe, x2: xe, y1: y1, y2: yp - 7, stroke: pal.texto, "stroke-width": 1.5 }));
        svg.appendChild(el("polygon", {
          points: (xe - 5) + "," + (yp - 9) + " " + (xe + 5) + "," + (yp - 9) + " " + xe + "," + yp, fill: pal.texto
        }));
      }
    });

    ordem.forEach(function (o) {
      var cor = corNoTema(o.r.s.corNegativa && o.r.p.v < 0 ? o.r.s.corNegativa : o.r.s.cor, pal);
      var px = X(o.r.p.i + 0.5), py = yDe(o.r.s)(o.r.p.v), lx = L.x1 + L.rotuloX;
      svg.appendChild(el("polyline", {
        points: px + "," + py + " " + (lx - 4) + "," + o.y, fill: "none", stroke: cor,
        "stroke-width": 1.5, opacity: 0.9
      }));
      svg.appendChild(texto(o.r.txt, {
        x: lx, y: o.y, "font-size": L.rotulo, "font-weight": "bold", fill: cor, "dominant-baseline": "central"
      }));
    });

    // legenda
    legenda.pos.forEach(function (it) {
      var y = topoLegenda + it.linha * L.legenda.passo, s = it.s, cor = corNoTema(s.cor, pal);
      if (s.tipo === "barra") {
        svg.appendChild(el("rect", s.contorno
          ? { x: it.x + 7, y: y - 9, width: 20, height: 18, fill: "none", stroke: cor, "stroke-width": 2 }
          : { x: it.x + 6, y: y - 10, width: 22, height: 20, fill: cor }));
      } else {
        var w = Math.min(s.largura || L.linha, 8);
        svg.appendChild(el("line", {
          x1: it.x + 4, x2: it.x + legenda.sw - 2, y1: y, y2: y, stroke: cor, "stroke-width": w,
          "stroke-linecap": s.traco ? "butt" : "round",
          "stroke-dasharray": s.traco === "pontilhado" ? (w * 1.2) + " " + (w * 1.6) : null
        }));
      }
      svg.appendChild(texto(s.nome, {
        x: it.x + legenda.sw + legenda.gap, y: y, "font-size": legenda.fs, fill: pal.texto, "dominant-baseline": "central"
      }));
    });

    pintarMoldura(svg, g, L, pal, subLinhas);
    return { svg: svg, L: L, pal: pal, X: X, Y: Y, yDe: yDe, fDe: fDe, d0: d0, d1: d1, vis: vis, esc: esc };
  }

  // subtítulo que não cabe numa linha quebra em duas, no ponto e vírgula
  function subtituloEmLinhas(g, L) {
    if (!g.subtitulo || largura(g.subtitulo, L.sub.fs, "italic") <= L.sub.max) return [g.subtitulo || ""];
    var partes = g.subtitulo.split("; ");
    return partes.length > 1 ? [partes[0] + ";", partes.slice(1).join("; ")] : [g.subtitulo];
  }

  // título, subtítulo, fonte e logo — iguais em todo cartão
  function pintarMoldura(svg, g, L, pal, subLinhas) {
    svg.appendChild(texto(g.titulo, {
      x: L.titulo.x, y: L.titulo.y, "font-weight": "bold", fill: pal.texto,
      "font-size": corpoQueCabe(g.titulo, L.titulo.fs, L.titulo.max, "bold")
    }));
    subLinhas.forEach(function (linha, k) {
      if (!linha) return;
      svg.appendChild(texto(linha, {
        x: L.sub.x, y: L.sub.y + k * L.sub.fs * 1.2, "font-style": "italic", fill: pal.texto,
        "font-size": corpoQueCabe(linha, L.sub.fs, L.sub.max, "italic")
      }));
    });
    svg.appendChild(texto("Fonte: " + g.fonte + ".", {
      x: L.fonte.x, y: L.fonte.y, "font-size": corpoQueCabe("Fonte: " + g.fonte + ".", L.fonte.fs, L.fonte.x - 30),
      fill: pal.texto, "text-anchor": "end"
    }));
    if (logoSvg) {
      var lh = L.logo.w * logoSvg.razao;
      var gl = el("svg", { x: L.logo.x, y: L.logo.y, width: L.logo.w, height: lh, viewBox: logoSvg.viewBox });
      var gg = el("g", { fill: pal.logo });
      logoSvg.nos.forEach(function (n) { gg.appendChild(n.cloneNode(true)); });
      gl.appendChild(gg);
      svg.appendChild(gl);
    }
  }

  // ---------- painéis: cartões que não são série no tempo ----------
  // Um número contra o outro (receita de um semestre contra o do ano
  // anterior), as partes de um total, barras deitadas e as páginas de um
  // documento. O gráfico traz "painel" com o nome do desenho; a moldura
  // (título, subtítulo, fonte, logo) é a mesma dos outros, então baixar,
  // compartilhar e tela cheia funcionam igual. Não há eixo de tempo, período
  // nem caixa do mouse: o número está escrito no próprio desenho.
  function quebrar(str, fs, maxW, estilo) {
    var linhas = [], atual = "";
    String(str).split(" ").forEach(function (p) {
      var t = atual ? atual + " " + p : p;
      if (atual && largura(t, fs, estilo) > maxW) { linhas.push(atual); atual = p; } else atual = t;
    });
    if (atual) linhas.push(atual);
    return linhas;
  }
  function linhasDeTexto(alvo, linhas, x, y, fs, attrs, entre) {
    var passo = fs * (entre || 1.25);
    linhas.forEach(function (l, k) {
      alvo.appendChild(texto(l, Object.assign({ x: x, y: y + k * passo + fs * 0.8, "font-size": fs }, attrs)));
    });
    return linhas.length * passo;
  }
  // valor com o sinal na frente da moeda: "−US$ 80,7 bi", e não "US$ -80,7 bi"
  function valorPainel(F, b) {
    var v = b.v, s = (b.prefixo || "") + (b.aprox ? "≈ " : "") + F.valor(Math.abs(v));
    return v < 0 ? "−" + s : s;
  }
  function variacao(a, b) {
    var v = (Math.abs(b) / Math.abs(a) - 1) * 100;
    return (v >= 0 ? "+" : "−") + nf(0).format(Math.abs(v)) + "%";
  }
  function seta2(alvo, x, y, para, cor, t) {
    // ponta de seta em (x, y), apontando para baixo (para = 1) ou para cima (−1)
    alvo.appendChild(el("polygon", {
      points: (x - t) + "," + (y - para * t * 1.6) + " " + (x + t) + "," + (y - para * t * 1.6) + " " + x + "," + y,
      fill: cor
    }));
  }

  function construirPainel(cartao, L, nomeTema) {
    var g = comVariante(cartao), pal = PALETAS[nomeTema], F = unidade(g);
    var subLinhas = subtituloEmLinhas(g, L);
    var svg = el("svg", {
      xmlns: NS, viewBox: "0 0 " + L.W + " " + L.H, width: L.W, height: L.H,
      role: "img", "aria-label": g.titulo + (g.subtitulo ? ". " + g.subtitulo : "")
    });
    var estreito = L.W < L.H * 1.2;
    var caixa = {
      x0: estreito ? 44 : 80, x1: L.W - (estreito ? 44 : 80),
      y0: L.sub.y + (subLinhas.length - 1) * L.sub.fs * 1.2 + (estreito ? 74 : 70),
      y1: L.fonte.y - (estreito ? 56 : 50)
    };
    PAINEIS[g.painel](svg, g, caixa, { pal: pal, F: F, estreito: estreito, u: L.tick });
    pintarMoldura(svg, g, L, pal, subLinhas);
    return { svg: svg, L: L, pal: pal, painel: true };
  }

  // Citação com um fio na cor de destaque à esquerda. Devolve a altura.
  function citacao(svg, cit, x, y, w, fs, ctx, medir) {
    var linhas = quebrar(cit.texto, fs, w - fs * 1.4, "italic");
    var hTexto = linhas.length * fs * 1.32, fsA = fs * 0.78;
    var h = hTexto + fsA * 1.9;
    if (medir) return h;
    svg.appendChild(el("rect", { x: x, y: y, width: 6, height: h, fill: corNoTema(cit.cor || "#F79646", ctx.pal) }));
    linhasDeTexto(svg, linhas, x + fs * 1.1, y, fs, { "font-style": "italic", fill: ctx.pal.texto }, 1.32);
    svg.appendChild(texto(cit.autor, {
      x: x + fs * 1.1, y: y + hTexto + fsA * 1.3, "font-size": fsA, fill: ctx.pal.suave
    }));
    return h;
  }

  var PAINEIS = {
    // Duas (ou mais) barras, uma por período, com o valor na ponta e a
    // variação entre uma e a seguinte numa seta. Valor negativo (prejuízo)
    // desce do zero, e tudo se espelha. "destaque" pinta, na base da barra,
    // a parte dela que se quer apontar (a receita de dois clientes).
    comparacao: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, F = ctx.F, area = { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 };
      if (g.citacao) {
        if (ctx.estreito) {
          var fsC = u * 1.0, hC = citacao(svg, g.citacao, c.x0, 0, c.x1 - c.x0, fsC, ctx, true);
          citacao(svg, g.citacao, c.x0, c.y1 - hC, c.x1 - c.x0, fsC, ctx);
          area.y1 = c.y1 - hC - u * 2.2;
        } else {
          var xq = c.x0 + (c.x1 - c.x0) * 0.6, fsQ = u * 1.25;
          var hQ = citacao(svg, g.citacao, xq, 0, c.x1 - xq, fsQ, ctx, true);
          citacao(svg, g.citacao, xq, (c.y0 + c.y1) / 2 - hQ / 2, c.x1 - xq, fsQ, ctx);
          area.x1 = xq - u * 3;
        }
      }
      var bs = g.barras, n = bs.length, neg = bs.every(function (b) { return b.v < 0; }), sg = neg ? -1 : 1;
      var fsVal = u * 1.7, fsCat = u * 1.2, fsVar = u * 2;
      var maxAbs = Math.max.apply(null, bs.map(function (b) { return Math.abs(b.v); }));
      var reservaPonta = fsVal * 1.4 + u * 1.2 + fsVar * 1.3, reservaBase = fsCat * 1.9;
      var hPlot = area.y1 - area.y0 - reservaPonta - reservaBase;
      var yBase = neg ? area.y0 + reservaBase : area.y1 - reservaBase;
      var slot = (area.x1 - area.x0) / n, bw = Math.min(slot * 0.44, 300);
      function cx(k) { return area.x0 + slot * (k + 0.5); }
      function alt(v) { return Math.abs(v) / maxAbs * hPlot; }
      // a ponta da barra, e a borda de fora do rótulo de valor
      function ponta(k) { return yBase - sg * alt(bs[k].v); }
      function foraDoRotulo(k) { return ponta(k) - sg * fsVal * 1.35; }

      svg.appendChild(el("line", { x1: area.x0, x2: area.x1, y1: yBase, y2: yBase, stroke: pal.zero, "stroke-width": 1.5 }));
      bs.forEach(function (b, k) {
        var h = alt(b.v), x = cx(k) - bw / 2;
        svg.appendChild(el("rect", { x: x, y: neg ? yBase : yBase - h, width: bw, height: Math.max(1, h), fill: corNoTema(b.cor, pal) }));
        if (b.destaque) {
          var d = b.destaque, hd = alt(d.v), cd = corNoTema(d.cor, pal);
          var yd = neg ? yBase : yBase - hd;
          svg.appendChild(el("rect", { x: x, y: yd, width: bw, height: hd, fill: cd }));
          // o rótulo vai dentro do pedaço, encolhendo até caber
          // ("rotCurto" é a segunda tentativa, quando o pedaço é baixo demais)
          var fsD, ls, hl;
          [d.rot, d.rotCurto || d.rot].some(function (rot) {
            for (fsD = u * 0.95; ; fsD *= 0.93) {
              ls = quebrar(rot, fsD, bw - u * 1.2, "bold");
              hl = ls.length * fsD * 1.2;
              if (hl < hd - u * 0.6 || fsD <= u * 0.7) break;
            }
            return hl < hd - u * 0.6;
          });
          if (hl < hd - u * 0.6) {
            linhasDeTexto(svg, ls, cx(k), yd + (hd - hl) / 2 - fsD * 0.05, fsD,
              { "font-weight": "bold", fill: "#1b1f23", "text-anchor": "middle" }, 1.2);
          } else {
            // não coube dentro: vai ao lado, com um fio
            ls = quebrar(d.rot, fsD, slot / 2 - bw / 2 - u, "bold");
            var xl = x + bw + u * 0.8;
            svg.appendChild(el("line", { x1: x + bw, x2: xl - 6, y1: yd + hd / 2, y2: yd + hd / 2, stroke: cd, "stroke-width": 2 }));
            linhasDeTexto(svg, ls, xl, yd + hd / 2 - ls.length * fsD * 0.6, fsD, { "font-weight": "bold", fill: cd }, 1.2);
          }
        }
        svg.appendChild(texto(valorPainel(F, b), {
          x: cx(k), y: neg ? ponta(k) + fsVal * 1.05 : ponta(k) - fsVal * 0.35, "font-size": fsVal,
          "font-weight": "bold", fill: corNoTema(b.corRotulo || b.cor, pal), "text-anchor": "middle"
        }));
        svg.appendChild(texto(b.rot, {
          x: cx(k), y: neg ? yBase - fsCat * 0.55 : yBase + fsCat * 1.3, "font-size": fsCat,
          fill: pal.texto, "text-anchor": "middle"
        }));
        if (k === 0) return;
        // a variação: sai de cima do rótulo anterior, cruza e desce no seguinte
        var x0 = cx(k - 1), x1 = cx(k), t = u * 0.4, cor = pal.suave;
        var yA = neg ? Math.max(foraDoRotulo(k - 1), foraDoRotulo(k)) + u * 1.1
                     : Math.min(foraDoRotulo(k - 1), foraDoRotulo(k)) - u * 1.1;
        var y0 = foraDoRotulo(k - 1) - sg * u * 0.3, y1 = foraDoRotulo(k) - sg * u * 0.3;
        svg.appendChild(el("path", {
          d: "M" + x0 + " " + y0 + "V" + yA + "H" + x1 + "V" + (y1 - sg * t * 1.4),
          fill: "none", stroke: cor, "stroke-width": 2.5, "stroke-linejoin": "round"
        }));
        seta2(svg, x1, y1, sg, cor, t * 1.3);
        var fv = corpoQueCabe(variacao(bs[k - 1].v, b.v), fsVar, (x1 - x0) * 0.8, "bold");
        svg.appendChild(texto(variacao(bs[k - 1].v, b.v), {
          x: (x0 + x1) / 2, y: neg ? yA + fv * 1.05 : yA - fv * 0.3, "font-size": fv, "font-weight": "bold",
          fill: pal.texto, "text-anchor": "middle"
        }));
      });
    },

    // Um total partido em pedaços, numa barra deitada; embaixo, uma coluna
    // por pedaço com o valor e o que ele é.
    composicao: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, F = ctx.F, W = c.x1 - c.x0, ps = g.partes;
      var soma = ps.reduce(function (a, p) { return a + Math.abs(p.v); }, 0);
      // o bloco inteiro (total, barra, legenda) fica no meio da altura
      var fsT = u * 1.35, fsV = u * 1.55, fsR = u * 1.05, n = ps.length, cw = W / n;
      var linhasR = Math.max.apply(null, ps.map(function (p) { return quebrar(p.rot, fsR, cw - u * 2.5).length; }));
      var hb = Math.min(ctx.estreito ? 190 : 230, (c.y1 - c.y0) * 0.3);
      var hBloco = fsT * 1.9 + hb + u * 1.8 + fsV * 1.3 + linhasR * fsR * 1.25;
      var y = c.y0 + Math.max(0, (c.y1 - c.y0 - hBloco) / 2) - fsT * 0.2;
      var tot = (g.total.rot ? g.total.rot + ": " : "") + valorPainel(F, g.total);
      svg.appendChild(texto(tot, {
        x: c.x0, y: y + fsT, "font-size": corpoQueCabe(tot, fsT, W, "bold"), "font-weight": "bold", fill: pal.texto
      }));
      var yb = y + fsT * 1.9, x = c.x0;
      ps.forEach(function (p) {
        var w = Math.abs(p.v) / soma * W, cor = corNoTema(p.cor, pal);
        svg.appendChild(el("rect", { x: x, y: yb, width: w, height: hb, fill: cor }));
        var pc = nf(0).format(Math.abs(p.v) / soma * 100) + "%", fsP = u * 1.6;
        if (largura(pc, fsP, "bold") < w - u) {
          svg.appendChild(texto(pc, { x: x + u * 0.7, y: yb + fsP * 1.15, "font-size": fsP, "font-weight": "bold", fill: "#ffffff" }));
          if (p.marca && largura(p.marca, u * 1.05) < w - u) {
            svg.appendChild(texto(p.marca, { x: x + u * 0.7, y: yb + hb - u * 0.7, "font-size": u * 1.05, fill: "#ffffff" }));
          }
        }
        x += w;
      });
      // colunas de legenda
      var yL = yb + hb + u * 1.8;
      ps.forEach(function (p, k) {
        var xc = c.x0 + k * cw, cor = corNoTema(p.cor, pal);
        svg.appendChild(el("rect", { x: xc, y: yL + fsV * 0.15, width: fsV * 0.8, height: fsV * 0.8, fill: cor }));
        svg.appendChild(texto(valorPainel(F, p), { x: xc + fsV * 1.2, y: yL + fsV * 0.85, "font-size": fsV, "font-weight": "bold", fill: pal.texto }));
        linhasDeTexto(svg, quebrar(p.rot, fsR, cw - u * 2.5), xc + fsV * 1.2, yL + fsV * 1.3, fsR, { fill: pal.suave });
      });
    },

    // Barras deitadas, uma por linha: nome e detalhe à esquerda (em cima, no
    // celular), barra e valor à direita. "contorno": barra vazada e tracejada,
    // para o que ainda é intenção, não fato.
    barras: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, F = ctx.F, ls = g.linhas, n = ls.length, W = c.x1 - c.x0;
      var maxV = Math.max.apply(null, ls.map(function (l) { return Math.abs(l.v); }));
      var fsN = u * 1.15, fsD = u * 0.92, fsV = u * 1.5;
      var xRot = c.x0, wRot = ctx.estreito ? W : W * 0.34;
      var xb = ctx.estreito ? c.x0 : c.x0 + wRot + u * 1.5;
      var wVal = Math.max.apply(null, ls.map(function (l) { return largura(valorPainel(F, l), fsV, "bold"); })) + u;
      var wMax = c.x1 - xb - wVal;
      var hRow = (c.y1 - c.y0) / n;
      ls.forEach(function (l, k) {
        var y = c.y0 + k * hRow, cor = corNoTema(l.cor, pal);
        var nome = quebrar(l.rot, fsN, wRot, "bold"), det = l.detalhe ? quebrar(l.detalhe, fsD, wRot) : [];
        var hTxt = nome.length * fsN * 1.2 + det.length * fsD * 1.25;
        var hb = Math.min(ctx.estreito ? hRow * 0.34 : hRow * 0.52, 110), yb, yt;
        if (ctx.estreito) {
          var bloco = hTxt + u * 0.6 + hb;
          yt = y + (hRow - bloco) / 2; yb = yt + hTxt + u * 0.6;
        } else {
          yb = y + (hRow - hb) / 2; yt = y + (hRow - hTxt) / 2;
        }
        var yy = yt + linhasDeTexto(svg, nome, xRot, yt, fsN, { "font-weight": "bold", fill: pal.texto }, 1.2);
        linhasDeTexto(svg, det, xRot, yy, fsD, { fill: pal.suave });
        var w = Math.abs(l.v) / maxV * wMax;
        svg.appendChild(el("rect", l.contorno ? {
          x: xb + 1.5, y: yb + 1.5, width: w - 3, height: hb - 3, fill: cor, "fill-opacity": 0.12, stroke: cor,
          "stroke-width": 3, "stroke-dasharray": "12 8"
        } : { x: xb, y: yb, width: w, height: hb, fill: cor }));
        svg.appendChild(texto(valorPainel(F, l), {
          x: xb + w + u * 0.6, y: yb + hb / 2, "font-size": fsV, "font-weight": "bold", fill: cor,
          "dominant-baseline": "central"
        }));
      });
    },

    // Demonstração de resultado em colunas empilhadas, uma por período, como
    // no WSJ: o que entra sobe do zero (na ordem da lista), o que sai desce.
    // "marcos" são as linhas de subtotal (resultado operacional, prejuízo)
    // riscadas sobre as colunas. À direita, uma tabela com uma linha por
    // faixa, na altura dela na última coluna, e um valor por período;
    // "medido" põe "≈" no valor, null vira "—".
    pilhas: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, F = ctx.F, nC = g.colunas.length, ult = nC - 1;
      // a tabela: nome + uma coluna de valor por período
      var fsN = u * (ctx.estreito ? 0.82 : 0.95), fsV = fsN;
      // na tabela e no celular, o período curto ("2026")
      var curtas = g.colunasCurtas || g.colunas;
      function txtV(v, aprox) {
        if (v === null || v === undefined) return "n/d";
        // o que arredonda para zero sai sem sinal ("0,0", não "−0,0")
        return (aprox ? "≈ " : "") + (v < -0.05 ? "−" : "") + nf(1).format(Math.abs(v));
      }
      var linhasT = g.itens.map(function (it) { return { it: it, marco: false }; })
        .concat((g.marcos || []).map(function (m) { return { it: m, marco: true }; }));
      // a tabela tem a largura do texto dela: nome mais longo (até um teto) e
      // valores. Com muitos períodos (cinco trimestres, no celular) a letra
      // diminui até sobrar para o nome ao menos a palavra mais longa dele.
      var wValor, pad, nomeMax, wNome, tetoTabela = ctx.estreito ? (c.x1 - c.x0) * 0.62 : 700;
      var palavraMax = Math.max.apply(null, linhasT.map(function (l) {
        return Math.max.apply(null, l.it.rot.split(" ").map(function (p) { return largura(p, 100, "bold"); }));
      }));
      for (var tent = 0; tent < 12; tent++) {
        wValor = Math.max.apply(null, linhasT.map(function (l) {
          return Math.max.apply(null, l.it.v.map(function (v, k) {
            return largura(txtV(v, l.it.medido && l.it.medido[k]), fsV, "bold");
          }));
        }).concat([largura(curtas[0], fsV * 0.85, "bold")])) + u * 0.9;
        pad = fsN * 0.8 + u * 0.3;
        nomeMax = Math.max.apply(null, linhasT.map(function (l) { return largura(l.it.rot, fsN, l.marco ? "bold" : null); }));
        wNome = Math.min(nomeMax, tetoTabela - wValor * nC - pad - u);
        if (wNome >= palavraMax * fsN / 100 * 1.05 || fsN < u * 0.55) break;
        fsN *= 0.93; fsV = fsN;
      }
      var xT = c.x1 - (pad + wNome + u + wValor * nC), xV0 = c.x1 - wValor * nC;

      // escala: do maior empilhado para cima ao maior para baixo
      var topo = 0, fundo = 0;
      for (var k = 0; k < nC; k++) {
        var p = 0, n = 0;
        g.itens.forEach(function (it) { var v = it.v[k] || 0; if (v > 0) p += v; else n += v; });
        topo = Math.max(topo, p); fundo = Math.min(fundo, n);
      }
      var esc = escalaY(fundo, topo, { alvo: 6 });
      var y0 = c.y0 + u * 2.6, y1 = c.y1;   // cabeçalho das colunas em cima
      var Y = function (v) { return y1 - (v - esc.min) / (esc.max - esc.min) * (y1 - y0); };
      var tw = Math.max.apply(null, esc.ticks.map(function (t) { return largura(F.eixo(t, esc.passo), u); }));
      var xg0 = c.x0 + tw + u * 0.6, xg1 = xT - u * (ctx.estreito ? 2.2 : 5);
      var slot = (xg1 - xg0) / nC, bw = Math.min(slot * 0.62, 260);
      function cx(k) { return xg0 + slot * (k + 0.5); }

      esc.ticks.forEach(function (t) {
        var y = Y(t), zero = Math.abs(t) < 1e-9;
        svg.appendChild(el("line", { x1: xg0, x2: xg1, y1: y, y2: y, stroke: zero ? pal.zero : pal.grade, "stroke-width": zero ? 1.5 : 1.2 }));
        svg.appendChild(texto(F.eixo(t, esc.passo), { x: xg0 - u * 0.5, y: y, "font-size": u, fill: pal.eixo, "text-anchor": "end", "dominant-baseline": "central" }));
      });
      (ctx.estreito ? curtas : g.colunas).forEach(function (rot, k) {
        svg.appendChild(texto(rot, { x: cx(k), y: c.y0 + u, "font-size": corpoQueCabe(rot, u * 1.05, slot * 0.92, "bold"),
          "font-weight": "bold", fill: pal.texto, "text-anchor": "middle" }));
      });

      // as faixas; guarda o meio de cada uma na última coluna, para a tabela
      var meio = [];
      for (var k2 = 0; k2 < nC; k2++) {
        var bp = 0, bn = 0;
        g.itens.forEach(function (it, j) {
          var v = it.v[k2] || 0;
          var pos = v ? v > 0 : !it.v.some(function (x) { return x < 0; });
          var a = pos ? bp : bn, b = a + v;
          if (pos) bp = b; else bn = b;
          if (k2 === ult) meio[j] = Y((a + b) / 2);
          if (!v) return;
          // 1px de folga em cada ponta: o fundo aparece entre uma faixa e outra
          var ya = Y(Math.max(a, b)), yb = Y(Math.min(a, b));
          svg.appendChild(el("rect", { x: cx(k2) - bw / 2, y: ya + 1, width: bw, height: Math.max(1, yb - ya - 2), fill: corNoTema(it.cor, pal) }));
        });
      }
      (g.marcos || []).forEach(function (m) {
        m.v.forEach(function (v, k) {
          if (v === null) return;
          svg.appendChild(el("line", { x1: cx(k) - bw / 2 - u * 0.5, x2: cx(k) + bw / 2 + u * 0.5, y1: Y(v), y2: Y(v), stroke: pal.texto, "stroke-width": 3.5 }));
        });
      });

      // a tabela, afastando as linhas que se encostam (como os rótulos da ponta)
      svg.appendChild(texto("US$ bi", { x: xT, y: c.y0 + u, "font-size": fsV * 0.85, fill: pal.suave }));
      curtas.forEach(function (rot, k) {
        svg.appendChild(texto(rot, { x: xV0 + wValor * (k + 1), y: c.y0 + u, "font-size": fsV * 0.85, "font-weight": "bold", fill: pal.suave, "text-anchor": "end" }));
      });
      var blocos = linhasT.map(function (l, j) {
        var nome = quebrar(l.it.rot, fsN, wNome, l.marco ? "bold" : null);
        return { l: l, nome: nome, h: nome.length * fsN * 1.18 + u * 0.55,
                 alvo: l.marco ? Y(l.it.v[ult]) : meio[j] };
      }).sort(function (a, b) { return a.alvo - b.alvo; });
      blocos.forEach(function (b, j) {
        b.y = Math.max(b.alvo - b.h / 2, c.y0 + u * 1.5);   // abaixo do cabeçalho
        if (j && b.y < blocos[j - 1].y + blocos[j - 1].h) b.y = blocos[j - 1].y + blocos[j - 1].h;
      });
      for (var j = blocos.length - 1; j >= 0; j--) {
        var teto = j === blocos.length - 1 ? c.y1 + u : blocos[j + 1].y;
        if (blocos[j].y + blocos[j].h > teto) blocos[j].y = teto - blocos[j].h;
      }
      blocos.forEach(function (b) {
        var it = b.l.it, cor = b.l.marco ? pal.texto : corNoTema(it.cor, pal);
        var yc = b.y + b.h / 2, xc = cx(ult) + bw / 2;
        // fio da faixa (ou do marco) até a linha da tabela
        svg.appendChild(el("polyline", {
          points: (xc + (b.l.marco ? u * 0.5 : 0)) + "," + b.alvo + " " + (xT - u * 1.6) + "," + b.alvo + " " + (xT - u * 0.4) + "," + yc,
          fill: "none", stroke: cor, "stroke-width": 1.5, opacity: 0.8
        }));
        if (!b.l.marco) svg.appendChild(el("rect", { x: xT - u * 0.4, y: yc - fsN * 0.4, width: fsN * 0.8, height: fsN * 0.8, fill: cor }));
        var xNome = xT + (b.l.marco ? 0 : pad);
        var yN = yc - b.nome.length * fsN * 1.18 / 2;
        linhasDeTexto(svg, b.nome, xNome, yN, fsN, { fill: pal.texto, "font-weight": b.l.marco ? "bold" : null }, 1.18);
        it.v.forEach(function (v, k) {
          svg.appendChild(texto(txtV(v, it.medido && it.medido[k]), {
            x: xV0 + wValor * (k + 1), y: yc, "font-size": fsV, "font-weight": k === ult || b.l.marco ? "bold" : null,
            fill: k === ult || b.l.marco ? pal.texto : pal.suave, "text-anchor": "end", "dominant-baseline": "central"
          }));
        });
      });
    },

    // Métricas lado a lado, cada uma com uma barra por período (3T25 × 3T26)
    // na mesma escala, e em cima a variação: % quando os dois têm o mesmo
    // sinal, e sempre a diferença em US$.
    pares: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, F = ctx.F, ms = g.metricas, nM = ms.length, cols = g.colunas;
      var cores = g.cores || ["#95A5A6", "#4F81BD"], est = ctx.estreito;
      var fsL = u * 0.95, xl = c.x0;
      cols.forEach(function (rot, k) {
        svg.appendChild(el("rect", { x: xl, y: c.y0, width: fsL * 0.85, height: fsL * 0.85, fill: corNoTema(cores[k], pal) }));
        svg.appendChild(texto(rot, { x: xl + fsL * 1.2, y: c.y0 + fsL * 0.75, "font-size": fsL, fill: pal.texto }));
        xl += fsL * 2.6 + largura(rot, fsL);
      });
      var slot = (c.x1 - c.x0) / nM, bw = Math.min(slot * (est ? 0.36 : 0.3), 150);
      // em pé e com muitas métricas, o valor vai sem "US$ … bi" (o subtítulo diz a unidade)
      var curto = est && nM > 3;
      function rotV(v) { return curto ? (v < 0 ? "−" : "") + nf(1).format(Math.abs(v)) : valorPainel(F, { v: v }); }
      function rotD(d) { return (d >= 0 ? "+" : "−") + (curto ? nf(1).format(Math.abs(d)) : F.valor(Math.abs(d))); }
      function rotVar(m) {
        var a = m.v[0], b = m.v[1];
        return a !== 0 && (a > 0) === (b > 0) ? variacao(a, b) : rotD(b - a);
      }
      var maisLargo = ms.reduce(function (r, m) { return Math.max(r, largura(rotVar(m), 100, "bold")); }, 0);
      var fsVar = Math.min(u * 1.35, slot * 0.9 / maisLargo * 100);
      var fsV = Math.min(u * 0.95, ms.reduce(function (r, m) {
        return Math.min(r, corpoQueCabe(rotV(m.v[0]), u * 0.95, bw + 6, "bold"), corpoQueCabe(rotV(m.v[1]), u * 0.95, bw + 6, "bold"));
      }, u * 0.95) * (curto ? 1 : 1.25));
      var fsM = u * (est ? 0.82 : 0.95);
      var linhasM = ms.map(function (m) { return quebrar(m.rot, fsM, slot * 0.92); });
      var hM = Math.max.apply(null, linhasM.map(function (l) { return l.length; })) * fsM * 1.2 + u * 0.4;
      var yVar = c.y0 + fsL * 2.4, yPlot0 = yVar + fsVar * 1.2 + fsV * 1.6, yPlot1 = c.y1 - hM;
      var mx = 0, mn = 0;
      ms.forEach(function (m) { m.v.forEach(function (v) { mx = Math.max(mx, v); mn = Math.min(mn, v); }); });
      var lab = fsV * 1.5, hUtil = yPlot1 - yPlot0 - (mx > 0 ? lab : 0) - (mn < 0 ? lab : 0);
      var k1 = hUtil / (mx - mn || 1), yZero = yPlot0 + (mx > 0 ? lab : 0) + mx * k1;
      svg.appendChild(el("line", { x1: c.x0, x2: c.x1, y1: yZero, y2: yZero, stroke: pal.zero, "stroke-width": 1.5 }));
      ms.forEach(function (m, j) {
        var cx = c.x0 + slot * (j + 0.5);
        m.v.forEach(function (v, k) {
          var x = cx + (k === 0 ? -bw - 4 : 4), h = Math.abs(v) * k1;
          svg.appendChild(el("rect", { x: x, y: v >= 0 ? yZero - h : yZero, width: bw, height: Math.max(1, h), fill: corNoTema(cores[k], pal) }));
          svg.appendChild(texto(rotV(v), {
            x: x + bw / 2, y: v >= 0 ? yZero - h - fsV * 0.4 : yZero + h + fsV * 1.05, "font-size": fsV,
            "font-weight": k === 1 ? "bold" : null, fill: k === 1 ? pal.texto : pal.suave, "text-anchor": "middle"
          }));
        });
        var a = m.v[0], b = m.v[1], d = b - a;
        var dif = rotD(d);
        var mesmoSinal = a !== 0 && (a > 0) === (b > 0);
        svg.appendChild(texto(rotVar(m), {
          x: cx, y: yVar + fsVar * 0.9, "font-size": fsVar, "font-weight": "bold", fill: pal.texto, "text-anchor": "middle"
        }));
        if (mesmoSinal) {
          svg.appendChild(texto(dif, { x: cx, y: yVar + fsVar * 0.9 + fsV * 1.25, "font-size": fsV * 0.9, fill: pal.suave, "text-anchor": "middle" }));
        }
        linhasDeTexto(svg, linhasM[j], cx, yPlot1 + u * 0.3, fsM, { fill: pal.texto, "text-anchor": "middle", "font-weight": "bold" }, 1.2);
      });
    },

    // Colunas por trimestre, empilhadas por série, com o total em cima. Um
    // período sem número fica vazio, com "n.d."; "guia" desenha a faixa de
    // guidance da empresa (tracejada até o topo, preenchida entre o piso e o teto).
    colunas: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, F = ctx.F, ps = g.periodos, nP = ps.length, est = ctx.estreito;
      var guia = {};
      (g.guia || []).forEach(function (x) { guia[x.p] = x; });
      // legenda
      var fsL = u * (est ? 0.82 : 0.92), xl = c.x0, yl = c.y0;
      var itensL = g.series.map(function (s) { return { nome: s.nome, cor: s.cor }; });
      if (g.guia) itensL.push({ nome: "Guidance", cor: g.corGuia || "#F79646", guia: true });
      itensL.forEach(function (it) {
        var w = fsL * 2 + largura(it.nome, fsL);
        if (xl + w > c.x1) { xl = c.x0; yl += fsL * 1.6; }
        var cor = corNoTema(it.cor, pal);
        svg.appendChild(el("rect", it.guia
          ? { x: xl + 1, y: yl + 1, width: fsL * 0.85 - 2, height: fsL * 0.85 - 2, fill: cor, "fill-opacity": 0.35, stroke: cor, "stroke-width": 2, "stroke-dasharray": "4 3" }
          : { x: xl, y: yl, width: fsL * 0.85, height: fsL * 0.85, fill: cor }));
        svg.appendChild(texto(it.nome, { x: xl + fsL * 1.2, y: yl + fsL * 0.75, "font-size": fsL, fill: pal.texto }));
        xl += w + fsL * 1.2;
      });
      var tot = ps.map(function (p, k) {
        var t = null;
        g.series.forEach(function (s) { if (s.v[k] !== null && s.v[k] !== undefined) t = (t || 0) + s.v[k]; });
        return t;
      });
      var mx = Math.max.apply(null, tot.map(function (t) { return t || 0; }).concat((g.guia || []).map(function (x) { return x.hi; })));
      var esc = escalaY(0, mx, { alvo: 5 });
      var fsX = u * (est ? 0.85 : 1), fsT = u * (est ? 0.9 : 1.05);
      var y0 = yl + fsL * 1.6 + fsT * 1.8, y1 = c.y1 - fsX * 1.8;
      var Y = function (v) { return y1 - (v - esc.min) / (esc.max - esc.min) * (y1 - y0); };
      var tw = Math.max.apply(null, esc.ticks.map(function (t) { return largura(F.eixo(t, esc.passo), u * 0.9); }));
      var xg0 = c.x0 + tw + u * 0.6, slot = (c.x1 - xg0) / nP, bw = slot * 0.62;
      esc.ticks.forEach(function (t) {
        svg.appendChild(el("line", { x1: xg0, x2: c.x1, y1: Y(t), y2: Y(t), stroke: t === 0 ? pal.zero : pal.grade, "stroke-width": t === 0 ? 1.5 : 1.2 }));
        svg.appendChild(texto(F.eixo(t, esc.passo), { x: xg0 - u * 0.4, y: Y(t), "font-size": u * 0.9, fill: pal.eixo, "text-anchor": "end", "dominant-baseline": "central" }));
      });
      ps.forEach(function (p, k) {
        var cx = xg0 + slot * (k + 0.5), base = 0;
        g.series.forEach(function (s) {
          var v = s.v[k];
          if (!v) return;
          svg.appendChild(el("rect", { x: cx - bw / 2, y: Y(base + v) + 0.5, width: bw, height: Math.max(1, Y(base) - Y(base + v) - 1), fill: corNoTema(s.cor, pal) }));
          base += v;
        });
        var gk = guia[p], topo;
        if (gk) {
          var cg = corNoTema(g.corGuia || "#F79646", pal);
          svg.appendChild(el("rect", { x: cx - bw / 2 + 1.5, y: Y(gk.hi), width: bw - 3, height: Y(0) - Y(gk.hi), fill: "none", stroke: cg, "stroke-width": 2.5, "stroke-dasharray": "10 7" }));
          svg.appendChild(el("rect", { x: cx - bw / 2 + 1.5, y: Y(gk.hi), width: bw - 3, height: Y(gk.lo) - Y(gk.hi), fill: cg, "fill-opacity": 0.35 }));
          topo = Y(gk.hi);
          var cg2 = g.casasGuia || 0;
          svg.appendChild(texto(nf(cg2).format(gk.lo) + "–" + nf(cg2).format(gk.hi), {
            x: cx, y: topo - fsT * 0.4, "font-size": corpoQueCabe("00–00", fsT, slot * 0.95, "bold"), "font-weight": "bold", fill: cg, "text-anchor": "middle"
          }));
        } else if (tot[k] === null) {
          svg.appendChild(texto("n.d.", { x: cx, y: Y(0) - fsT * 0.4, "font-size": fsT * 0.8, fill: pal.suave, "text-anchor": "middle" }));
        } else {
          // "totais": o total publicado, quando ele não é a soma das partes
          // arredondadas (massa em órbita: 119 + 358 = 477, publicado 476)
          var totK = g.totais && g.totais[k] !== null && g.totais[k] !== undefined ? g.totais[k] : tot[k];
          var tx = nf(g.casas === undefined ? 1 : g.casas).format(totK);
          svg.appendChild(texto(tx, { x: cx, y: Y(tot[k]) - fsT * 0.4, "font-size": corpoQueCabe(tx, fsT, slot * 0.95, "bold"), "font-weight": "bold", fill: pal.texto, "text-anchor": "middle" }));
        }
        svg.appendChild(texto(p, { x: cx, y: y1 + fsX * 1.25, "font-size": corpoQueCabe(p, fsX, slot * 0.95), fill: pal.texto, "text-anchor": "middle" }));
      });
    },

    // Cascata deitada: o primeiro e o último são totais (saem do zero), os
    // do meio andam a partir do acumulado. Valor numa coluna à direita.
    cascata: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, F = ctx.F, est = ctx.estreito;
      var linhas = [{ rot: g.inicio.rot, v: g.inicio.v, total: true }]
        .concat(g.passos).concat([{ rot: g.fim.rot, v: g.fim.v, total: true }]);
      var acum = 0, mn = 0, mx = 0;
      linhas.forEach(function (l) {
        if (l.total) { l.a = 0; l.b = l.v; acum = l.v; } else { l.a = acum; acum += l.v; l.b = acum; }
        mn = Math.min(mn, l.a, l.b); mx = Math.max(mx, l.a, l.b);
      });
      var n = linhas.length, hRow = (c.y1 - c.y0) / n;
      var fsN = Math.min(u * (est ? 0.82 : 0.95), hRow * 0.36), fsV = fsN * 1.05;
      var wNome = (c.x1 - c.x0) * (est ? 0.36 : 0.3);
      var wVal = Math.max.apply(null, linhas.map(function (l) { return largura(valorPainel(F, l), fsV, "bold"); })) + u;
      var xb0 = c.x0 + wNome + u, xb1 = c.x1 - wVal;
      var X = function (v) { return xb0 + (v - mn) / (mx - mn || 1) * (xb1 - xb0); };
      var hb = Math.min(hRow * 0.62, 64);
      svg.appendChild(el("line", { x1: X(0), x2: X(0), y1: c.y0, y2: c.y1, stroke: pal.zero, "stroke-width": 1.5 }));
      linhas.forEach(function (l, k) {
        var y = c.y0 + k * hRow, yb = y + (hRow - hb) / 2;
        var cor = corNoTema(l.cor || (l.total ? (g.corTotal || "#4F81BD") : l.v >= 0 ? "#9BBB59" : "#C0504D"), pal);
        var xa = X(Math.min(l.a, l.b)), xz = X(Math.max(l.a, l.b));
        svg.appendChild(el("rect", { x: xa, y: yb, width: Math.max(2, xz - xa), height: hb, fill: cor }));
        if (k < n - 1) {
          // fio do acumulado até a linha de baixo
          svg.appendChild(el("line", { x1: X(l.b), x2: X(l.b), y1: yb + hb, y2: yb + hRow, stroke: pal.suave, "stroke-width": 1.2, "stroke-dasharray": "4 4" }));
        }
        var nome = quebrar(l.rot, fsN, wNome, l.total ? "bold" : null);
        linhasDeTexto(svg, nome, c.x0, y + hRow / 2 - nome.length * fsN * 1.15 / 2, fsN,
          { fill: l.total ? pal.texto : pal.suave, "font-weight": l.total ? "bold" : null }, 1.15);
        // passo pequeno (câmbio de −US$ 43 mi) com duas casas, senão vira "US$ 0,0 bi"
        var Fp = Math.abs(l.v) < 0.1 && UNIDADES[g.unidade + "2"] ? UNIDADES[g.unidade + "2"] : F;
        var txt = l.total ? valorPainel(F, l) : (l.v >= 0 ? "+" : "−") + Fp.valor(Math.abs(l.v));
        svg.appendChild(texto(txt, { x: c.x1, y: y + hRow / 2, "font-size": fsV, "font-weight": "bold", fill: l.total ? pal.texto : cor,
          "text-anchor": "end", "dominant-baseline": "central" }));
      });
    },

    // Quadros de número grande: rótulo, valor e a conta que deu o valor.
    numeros: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, est = ctx.estreito, qs = g.quadros;
      var nc = est ? 2 : 3, nl = Math.ceil(qs.length / nc), gap = u * 0.8;
      var w = (c.x1 - c.x0 - gap * (nc - 1)) / nc, h = (c.y1 - c.y0 - gap * (nl - 1)) / nl;
      qs.forEach(function (q, k) {
        var x = c.x0 + (k % nc) * (w + gap), y = c.y0 + Math.floor(k / nc) * (h + gap), p = u * 0.8;
        svg.appendChild(el("rect", { x: x, y: y, width: w, height: h, rx: 10, fill: pal.texto, "fill-opacity": 0.05, stroke: pal.grade, "stroke-width": 1.5 }));
        var fsR = u * 1.05, fsQ = Math.min(u * 3.4, h * 0.3), fsD = u * (est ? 0.85 : 0.95);
        fsQ = corpoQueCabe(q.valor, fsQ, w - 2 * p, "bold");
        var ld = quebrar(q.detalhe || "", fsD, w - 2 * p);
        function altura() { return fsR * 1.5 + fsQ * 1.25 + ld.length * fsD * 1.25; }
        while (altura() > h - 2 * p && fsD > u * 0.55) { fsD *= 0.94; fsR *= 0.97; ld = quebrar(q.detalhe, fsD, w - 2 * p); }
        var yq = y + (h - altura()) / 2;
        svg.appendChild(texto(q.rot, { x: x + p, y: yq + fsR * 0.85, "font-size": corpoQueCabe(q.rot, fsR, w - 2 * p), fill: pal.suave }));
        svg.appendChild(texto(q.valor, { x: x + p, y: yq + fsR * 1.5 + fsQ * 0.9, "font-size": fsQ,
          "font-weight": "bold", fill: corNoTema(q.cor || "#FFFFFF", pal) }));
        linhasDeTexto(svg, ld, x + p, yq + fsR * 1.5 + fsQ * 1.25, fsD, { fill: pal.suave });
      });
    },

    // Linha do tempo em pé: quando à esquerda, ponto no eixo (cheio para
    // guidance, vazado para meta), o que à direita. O corpo encolhe até caber.
    linhaTempo: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, est = ctx.estreito, its = g.itens, cor = corNoTema(g.cor || "#4BACC6", pal);
      var wQ = (c.x1 - c.x0) * (est ? 0.26 : 0.17), xEixo = c.x0 + wQ + u * 0.9, xT = xEixo + u * 1.1;
      var fsL = u * 0.85, legY = c.y0;
      [["Guidance da empresa", true], ["Meta ou aspiração citada na teleconferência", false]].forEach(function (lg, k) {
        var x = c.x0 + k * (largura("Guidance da empresa", fsL) + fsL * 4);
        svg.appendChild(el("circle", { cx: x + fsL * 0.45, cy: legY + fsL * 0.45, r: fsL * 0.38, fill: lg[1] ? cor : "none", stroke: cor, "stroke-width": 2.5 }));
        svg.appendChild(texto(lg[0], { x: x + fsL * 1.2, y: legY + fsL * 0.8, "font-size": fsL, fill: pal.suave }));
      });
      var y0 = c.y0 + fsL * 2.4, kk = 1.4, m;
      function montar(k) {
        var fsQ = u * 0.95 * k, fsT = u * 0.95 * k, wT = c.x1 - xT, total = 0;
        var bl = its.map(function (it) {
          var lq = quebrar(it.quando, fsQ, wQ, "bold"), lt = quebrar(it.t, fsT, wT);
          var h = Math.max(lq.length * fsQ * 1.2, lt.length * fsT * 1.25);
          total += h;
          return { it: it, lq: lq, lt: lt, h: h };
        });
        return { fsQ: fsQ, fsT: fsT, bl: bl, vao: u * 0.75 * k, total: total + (its.length - 1) * u * 0.75 * k };
      }
      do { m = montar(kk); kk *= 0.97; } while (m.total > (c.y1 - y0) * 0.95 && kk > 0.45);
      var y = y0 + Math.max(0, (c.y1 - y0 - m.total) / 2);
      svg.appendChild(el("line", { x1: xEixo, x2: xEixo, y1: y, y2: y + m.total, stroke: pal.grade, "stroke-width": 3 }));
      m.bl.forEach(function (b) {
        linhasDeTexto(svg, b.lq, xEixo - u * 0.9, y, m.fsQ, { "font-weight": "bold", fill: pal.texto, "text-anchor": "end" }, 1.2);
        svg.appendChild(el("circle", { cx: xEixo, cy: y + m.fsQ * 0.55, r: m.fsQ * 0.42, fill: b.it.guidance ? cor : pal.bg, stroke: cor, "stroke-width": 2.5 }));
        linhasDeTexto(svg, b.lt, xT, y, m.fsT, { fill: pal.texto });
        y += b.h + m.vao;
      });
    },

    // Um trecho da teleconferência: a pergunta (se houver), a resposta em
    // citação e os pontos que a acompanham.
    fala: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, est = ctx.estreito, W = c.x1 - c.x0, kk = 1.6, partes;
      function montar(k) {
        var r = { k: k, fsP: u * 0.9 * k, fsQ: u * (est ? 1.12 : 1.3) * k, fsB: u * 0.95 * k };
        r.lp = g.pergunta ? quebrar(g.pergunta.texto, r.fsP, W) : [];
        r.hP = g.pergunta ? r.fsP * 1.3 + r.lp.length * r.fsP * 1.25 + u * 1.2 * k : 0;
        r.hQ = citacao(svg, g.citacao, c.x0, 0, W, r.fsQ, ctx, true);
        r.pts = (g.pontos || []).map(function (p) { return quebrar(p, r.fsB, W - r.fsB * 1.3); });
        r.hB = r.pts.reduce(function (a, l) { return a + l.length * r.fsB * 1.25 + u * 0.55 * k; }, 0);
        r.total = r.hP + r.hQ + (r.pts.length ? u * 1.4 * k + r.hB : 0);
        return r;
      }
      do { partes = montar(kk); kk *= 0.97; } while (partes.total > (c.y1 - c.y0) * 0.92 && kk > 0.45);
      var p = partes, y = c.y0 + Math.max(0, (c.y1 - c.y0 - p.total) / 2);
      if (g.pergunta) {
        svg.appendChild(texto("PERGUNTA · " + g.pergunta.quem, { x: c.x0, y: y + p.fsP, "font-size": p.fsP, "font-weight": "bold", fill: pal.suave, "letter-spacing": 1 }));
        linhasDeTexto(svg, p.lp, c.x0, y + p.fsP * 1.3, p.fsP, { fill: pal.suave });
        y += p.hP;
      }
      y += citacao(svg, g.citacao, c.x0, y, W, p.fsQ, ctx);
      if (p.pts.length) y += u * 1.4 * p.k;
      var corP = corNoTema(g.citacao.cor || "#F79646", pal);
      p.pts.forEach(function (l) {
        svg.appendChild(el("rect", { x: c.x0, y: y + p.fsB * 0.3, width: p.fsB * 0.55, height: p.fsB * 0.55, fill: corP }));
        y += linhasDeTexto(svg, l, c.x0 + p.fsB * 1.3, y, p.fsB, { fill: pal.texto }) + u * 0.55 * p.k;
      });
    },

    // As páginas de um documento, com a fração que interessa pintada, e a
    // lista do que há nela.
    paginas: function (svg, g, c, ctx) {
      var u = ctx.u, pal = ctx.pal, W = c.x1 - c.x0, H = c.y1 - c.y0, P = g.paginas;
      var corD = corNoTema(P.cor || "#C0504D", pal);
      // onde ficam as páginas e onde fica a lista
      var pg, li;
      if (ctx.estreito) {
        pg = { x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y0 + H * 0.3 };
        li = { x0: c.x0, x1: c.x1, y0: pg.y1 + u * 1.6, y1: c.y1 };
      } else {
        pg = { x0: c.x0, x1: c.x0 + W * 0.38, y0: c.y0, y1: c.y1 };
        li = { x0: c.x0 + W * 0.44, x1: c.x1, y0: c.y0, y1: c.y1 };
      }
      var fsCap = u * 1.35, capL = quebrar(P.legenda, fsCap, pg.x1 - pg.x0, "bold");
      var hCap = capL.length * fsCap * 1.2 + u;
      var gap = u * 1.1, nP = P.total, pw = (pg.x1 - pg.x0 - gap * (nP - 1)) / nP;
      var ph = Math.min(pw * 1.38, pg.y1 - pg.y0 - hCap);
      pw = Math.min(pw, ph / 1.38);
      var larguraTodas = pw * nP + gap * (nP - 1), xp = pg.x0 + (ctx.estreito ? (pg.x1 - pg.x0 - larguraTodas) / 2 : 0);
      var yp = pg.y0 + (pg.y1 - pg.y0 - ph - hCap) / 2;
      for (var k = 0; k < nP; k++) {
        var x = xp + k * (pw + gap), marcada = k >= nP - P.marcadas, dob = pw * 0.2;
        var cor = marcada ? corD : pal.suave;
        svg.appendChild(el("path", {
          d: "M" + x + " " + yp + "H" + (x + pw - dob) + "L" + (x + pw) + " " + (yp + dob) + "V" + (yp + ph) + "H" + x + "Z",
          fill: marcada ? corD : "none", "fill-opacity": marcada ? 0.22 : null, stroke: cor, "stroke-width": 3, "stroke-linejoin": "round"
        }));
        svg.appendChild(el("path", {
          d: "M" + (x + pw - dob) + " " + yp + "V" + (yp + dob) + "H" + (x + pw),
          fill: "none", stroke: cor, "stroke-width": 3, "stroke-linejoin": "round"
        }));
        // as linhas de texto da página
        var m = pw * 0.14, passo = Math.max(8, ph / 16);
        for (var yl = yp + dob + passo * 0.6, j = 0; yl < yp + ph - m; yl += passo, j++) {
          var wl = (pw - 2 * m) * (j % 4 === 3 ? 0.6 : 1);
          svg.appendChild(el("rect", { x: x + m, y: yl, width: wl, height: Math.max(3, passo * 0.28), rx: 1.5, fill: cor, opacity: marcada ? 0.85 : 0.35 }));
        }
      }
      var yc = yp + ph + u * 1.2;
      linhasDeTexto(svg, capL, ctx.estreito ? (pg.x0 + pg.x1) / 2 : pg.x0, yc, fsCap,
        { "font-weight": "bold", fill: corD, "text-anchor": ctx.estreito ? "middle" : "start" }, 1.2);

      // a lista: o corpo encolhe até caber
      var its = g.itens, k2 = 1, montado;
      function montar(k) {
        var fsI = u * 1.08 * k, fsS = u * 0.9 * k, wT = li.x1 - li.x0 - fsI * 1.3, total = 0;
        var blocos = its.map(function (it) {
          var a = quebrar(it.t, fsI, wT, "bold"), b = quebrar(it.d, fsS, wT);
          var h = a.length * fsI * 1.2 + b.length * fsS * 1.25;
          total += h;
          return { a: a, b: b, h: h };
        });
        var vao = (its.length - 1) * u * 0.9 * k;
        return { fsI: fsI, fsS: fsS, blocos: blocos, total: total + vao, vao: u * 0.9 * k };
      }
      do { montado = montar(k2); k2 *= 0.96; } while (montado.total > li.y1 - li.y0 && k2 > 0.5);
      var y = li.y0 + Math.max(0, (li.y1 - li.y0 - montado.total) / 2);
      montado.blocos.forEach(function (b) {
        svg.appendChild(el("rect", { x: li.x0, y: y + montado.fsI * 0.28, width: montado.fsI * 0.62, height: montado.fsI * 0.62, fill: corD }));
        var xT = li.x0 + montado.fsI * 1.3;
        var yy = y + linhasDeTexto(svg, b.a, xT, y, montado.fsI, { "font-weight": "bold", fill: pal.texto }, 1.2);
        linhasDeTexto(svg, b.b, xT, yy, montado.fsS, { fill: pal.suave });
        y += b.h + montado.vao;
      });
    }
  };

  // o que vai no CSV de um painel: um rótulo e um valor por linha
  function linhasDoPainel(g) {
    if (g.painel === "comparacao") {
      var r = [];
      g.barras.forEach(function (b) {
        r.push([b.rot, b.v]);
        if (b.destaque) r.push([b.rot + ": " + b.destaque.rot, b.destaque.v]);
      });
      return r;
    }
    if (g.painel === "composicao") {
      return [[g.total.rot, g.total.v]].concat(g.partes.map(function (p) { return [p.rot, p.v]; }));
    }
    if (g.painel === "barras") return g.linhas.map(function (l) { return [l.rot, l.v]; });
    if (g.painel === "paginas") return g.itens.map(function (it) { return [it.t, it.d]; });
    if (g.painel === "pares") {
      return g.metricas.map(function (m) { return [m.rot].concat(m.v); });
    }
    if (g.painel === "colunas") {
      var r2 = g.periodos.map(function (p, k) {
        var gk = (g.guia || []).filter(function (x) { return x.p === p; })[0];
        return [p].concat(g.series.map(function (s) { return s.v[k] === null ? "" : s.v[k]; }))
          .concat(g.guia ? [gk ? gk.lo + " a " + gk.hi : ""] : []);
      });
      return [["período"].concat(g.series.map(function (s) { return s.nome; })).concat(g.guia ? ["guidance"] : [])].concat(r2);
    }
    if (g.painel === "cascata") {
      return [[g.inicio.rot, g.inicio.v]].concat(g.passos.map(function (p) { return [p.rot, p.v]; })).concat([[g.fim.rot, g.fim.v]]);
    }
    if (g.painel === "numeros") return g.quadros.map(function (q) { return [q.rot, q.valor, q.detalhe || ""]; });
    if (g.painel === "linhaTempo") return g.itens.map(function (it) { return [it.quando, it.t, it.guidance ? "guidance" : "meta"]; });
    if (g.painel === "fala") return [[g.citacao.autor, g.citacao.texto]].concat((g.pontos || []).map(function (p) { return ["", p]; }));
    if (g.painel === "pilhas") {
      return g.itens.concat(g.marcos || []).map(function (it) {
        return [it.rot].concat(it.v.map(function (v) { return v === null ? "" : v; }));
      });
    }
    return [];
  }

  // ---------- passar o mouse ----------
  // Mouse fino: a faixa é escolhida arrastando no gráfico. Dedo (pointer
  // grosso) não arrasta — ali o arrasto é a rolagem da página —, e por isso o
  // celular continua com os botões de 20/10/5 anos.
  function mouseFino() {
    try { return window.matchMedia("(pointer: fine)").matches; } catch (e) { return true; }
  }

  // Um só ouvinte para o Esc, e não um por redesenho: `ligarHover` roda a cada
  // pintura do cartão, e registrar ali em `document` ia empilhando ouvinte.
  var cancelarArrasto = null;
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && cancelarArrasto) cancelarArrasto();
  });

  function aplicarJanela(cartao, ini, fim) {
    cartao.inicioIdx = ini;
    cartao.fimIdx = fim;
    cartao.periodo = ini === null && fim === null ? "tudo" : "faixa";
    if (cartao.atualizarPeriodos) cartao.atualizarPeriodos();
    desenhar(cartao, true);
    if (visor && visor.cartao === cartao && !visor.box.hidden) pintarVisor();
  }

  function ligarHover(cartao, desenho) {
    if (desenho.painel) return;
    var svg = desenho.svg, L = desenho.L, pal = desenho.pal, g = graficoDe(cartao);
    var camada = el("g", { "pointer-events": "none" });
    var alvo = el("rect", { x: L.x0, y: L.y0, width: L.x1 - L.x0, height: L.y1 - L.y0, fill: "transparent" });
    svg.appendChild(alvo);
    svg.appendChild(camada);
    var porSerie = desenho.vis.map(function (pts) {
      return pts.reduce(function (o, p) { o[p.i] = p.v; return o; }, {});
    });

    function limpar() { while (camada.firstChild) camada.removeChild(camada.firstChild); }
    function mover(ev) {
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      var p = pt.matrixTransform(svg.getScreenCTM().inverse());
      var i = Math.floor(desenho.d0 + (p.x - L.x0) / (L.x1 - L.x0) * (desenho.d1 - desenho.d0));
      if (g.diario) {
        // fim de semana e feriado não têm pregão: vale o último dia com taxa
        for (var volta = 0; volta < 7; volta++) {
          var achou = porSerie.some(function (m) { return m[i - volta] !== undefined; });
          if (achou) { i -= volta; break; }
        }
      }
      var linhas = [];
      g.series.forEach(function (s, k) {
        if (s.legenda === false || porSerie[k][i] === undefined) return;
        linhas.push({ s: s, v: porSerie[k][i] });
      });
      limpar();
      if (!linhas.length) return;
      var x = desenho.X(i + 0.5), fs = L.tip, pad = fs * 0.6;
      camada.appendChild(el("line", {
        x1: x, x2: x, y1: L.y0, y2: L.y1, stroke: pal.suave, "stroke-width": 1.5, "stroke-dasharray": "6 6"
      }));
      var titulo = rotuloX(g, i, true);
      var w = Math.max(largura(titulo, fs, "bold"), Math.max.apply(null, linhas.map(function (l) {
        return largura(l.s.nome + "  " + desenho.fDe(l.s).valor(l.v), fs) + fs * 1.1;
      }))) + pad * 2;
      var h = (linhas.length + 1) * fs * 1.3 + pad;
      var bx = x + 22; if (bx + w > L.x1) bx = x - 22 - w;
      var by = Math.max(L.y0 + 8, Math.min(p.y - h / 2, L.y1 - h - 8));
      camada.appendChild(el("rect", { x: bx, y: by, width: w, height: h, rx: 8, fill: pal.tipBg, stroke: pal.tipBorda, "stroke-width": 1.5 }));
      camada.appendChild(texto(titulo, { x: bx + pad, y: by + pad + fs * 0.8, "font-size": fs, "font-weight": "bold", fill: pal.texto }));
      linhas.forEach(function (l, k) {
        var ty = by + pad + fs * 0.8 + (k + 1) * fs * 1.3;
        camada.appendChild(el("rect", { x: bx + pad, y: ty - fs * 0.62, width: fs * 0.7, height: fs * 0.7, rx: 2, fill: corNoTema(l.s.cor, pal) }));
        camada.appendChild(texto(l.s.nome, { x: bx + pad + fs * 1.1, y: ty, "font-size": fs, fill: pal.suave }));
        camada.appendChild(texto(desenho.fDe(l.s).valor(l.v), { x: bx + w - pad, y: ty, "font-size": fs, "font-weight": "bold", fill: pal.texto, "text-anchor": "end" }));
        if (desenho.vis[g.series.indexOf(l.s)] && l.s.tipo !== "barra") {
          camada.appendChild(el("circle", { cx: x, cy: desenho.yDe(l.s)(l.v), r: 6, fill: corNoTema(l.s.cor, pal), stroke: pal.bg, "stroke-width": 2 }));
        }
      });
    }
    // ---- escolher o período arrastando, como no FRED ----
    // A faixa fica numa camada própria, abaixo da do mouse: `limpar()` apaga a
    // caixa de valores a cada movimento, e levaria o retângulo junto.
    var g0 = graficoDe(cartao);
    var faixa = el("rect", {
      y: L.y0, height: L.y1 - L.y0, width: 0, fill: pal.suave, opacity: 0.2,
      "pointer-events": "none", visibility: "hidden"
    });
    svg.insertBefore(faixa, camada);
    var arrasto = null;

    function xNoSvg(ev) {
      var pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      return pt.matrixTransform(svg.getScreenCTM().inverse()).x;
    }
    function idxNoX(x) {
      var t = Math.min(Math.max(x, L.x0), L.x1);
      return Math.floor(desenho.d0 + (t - L.x0) / (L.x1 - L.x0) * (desenho.d1 - desenho.d0));
    }
    function pintarFaixa() {
      var a = Math.min(arrasto.a, arrasto.b), b = Math.max(arrasto.a, arrasto.b);
      faixa.setAttribute("x", Math.max(L.x0, a));
      faixa.setAttribute("width", Math.min(L.x1, b) - Math.max(L.x0, a));
      faixa.setAttribute("visibility", "visible");
    }
    function encerrar() {
      arrasto = null;
      cancelarArrasto = null;
      faixa.setAttribute("visibility", "hidden");
    }

    if (!g0.categorias && mouseFino()) {
      // sem trocar o cursor: a seta de duas pontas tomava o gráfico inteiro e
      // atrapalhava a leitura dos valores, que é o uso comum do mouse aqui
      alvo.addEventListener("pointerdown", function (ev) {
        if (ev.button !== 0 || ev.pointerType === "touch") return;
        arrasto = { a: xNoSvg(ev), b: xNoSvg(ev) };
        cancelarArrasto = encerrar;
        try { alvo.setPointerCapture(ev.pointerId); } catch (e) {}
        ev.preventDefault();
      });
      alvo.addEventListener("pointermove", function (ev) {
        if (!arrasto) return;
        arrasto.b = xNoSvg(ev);
        pintarFaixa();
      });
      alvo.addEventListener("pointerup", function (ev) {
        if (!arrasto) return;
        var a = Math.min(arrasto.a, arrasto.b), b = Math.max(arrasto.a, arrasto.b);
        var i0 = idxNoX(a), i1 = idxNoX(b);
        encerrar();
        // arrasto curto é clique, não seleção: dois passos é o mínimo que dá
        // um gráfico, e 8px separa o engano do gesto
        if (b - a < 8 || i1 - i0 < 1) return;
        aplicarJanela(cartao, i0, i1);
      });
      alvo.addEventListener("pointercancel", encerrar);
      alvo.addEventListener("dblclick", function () { aplicarJanela(cartao, null, null); });
    }

    alvo.addEventListener("pointermove", function (ev) { if (!arrasto) mover(ev); else limpar(); });
    alvo.addEventListener("pointerdown", function (ev) { if (!arrasto) mover(ev); });
    alvo.addEventListener("pointerleave", function () { if (!arrasto) limpar(); });
  }

  // ---------- retrátil (categorias, seções e cartões) ----------
  // Tudo começa fechado, toda vez que o site abre: a página inicial é o índice
  // dos gráficos, e o usuário abre o que quiser ver.
  function seta() {
    return el("svg", { "class": "seta", viewBox: "0 0 16 16", width: "13", height: "13", "aria-hidden": "true" }, [
      el("path", {
        d: "M5 3l5 5-5 5", fill: "none", stroke: "currentColor",
        "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round"
      })
    ]);
  }
  function icone(d, tam) {
    return el("svg", { viewBox: "0 0 24 24", width: tam || 16, height: tam || 16, fill: "none",
      stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round",
      "aria-hidden": "true" }, [el("path", { d: d })]);
  }
  var ICO_ENTRAR = "M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6";
  var ICO_ZOOM = "M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM20 20l-4.2-4.2M11 8v6M8 11h6";

  // ---------- tela cheia (API do navegador, com o prefixo do Safari) ----------
  // requestFullscreen devolve Promise nos navegadores atuais e undefined nos
  // antigos — daí o teste antes do .catch. Uma recusa (gesto fora do clique,
  // política de permissão) não deve virar erro no console.
  function elFullscreen() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function fullscreenSuportado(n) { return !!(n.requestFullscreen || n.webkitRequestFullscreen); }
  function entrarFullscreen(n) {
    var p = n.requestFullscreen ? n.requestFullscreen()
          : n.webkitRequestFullscreen ? n.webkitRequestFullscreen() : null;
    if (p && p.catch) p.catch(function () {});
  }
  function sairFullscreen() {
    if (!elFullscreen()) return;
    var p = document.exitFullscreen ? document.exitFullscreen()
          : document.webkitExitFullscreen ? document.webkitExitFullscreen() : null;
    if (p && p.catch) p.catch(function () {});
  }
  function telaCheiaDaPagina() {
    var btn = document.getElementById("tela-cheia-pagina");
    if (!btn) return;
    if (!fullscreenSuportado(document.documentElement)) { btn.hidden = true; return; }
    function sincronizar() {
      var ativo = !!elFullscreen() && !(visor && !visor.box.hidden);
      btn.setAttribute("aria-pressed", ativo ? "true" : "false");
      var rot = ativo ? "Sair da tela cheia" : "Ver a página em tela cheia";
      btn.setAttribute("aria-label", rot);
      btn.title = rot;
    }
    btn.addEventListener("click", function () {
      if (elFullscreen()) sairFullscreen(); else entrarFullscreen(document.documentElement);
    });
    // Tela cheia da página: só o botão sai dela. Nenhum site impede o Esc por
    // completo, mas no Chrome e no Edge a Keyboard Lock API passa o Esc para a
    // página (sair passa a exigir segurar o Esc por uns 2 s). Safari e Firefox
    // não têm a API, e lá o Esc segue saindo.
    function travarEsc() {
      var k = navigator.keyboard;
      if (!k || !k.lock) return;
      if (elFullscreen() === document.documentElement) {
        var p = k.lock(["Escape"]);
        if (p && p.catch) p.catch(function () {});
      } else if (!elFullscreen() && k.unlock) {
        k.unlock();
      }
    }
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (t) {
      document.addEventListener(t, sincronizar);
      document.addEventListener(t, travarEsc);
    });
    sincronizar();
  }

  // ---------- anotação à mão sobre o gráfico ----------
  // Os traços ficam guardados como listas de pontos nas coordenadas do layout
  // (1920×1080 e afins) e são repintados do zero a cada mudança: por isso o
  // canvas acompanha o SVG em qualquer tamanho de tela, e o mesmo traço pode
  // ser redesenhado em escala 2× no PNG baixado.
  function anotacao(tela) {
    var ctx = tela.getContext("2d"), tracos = [], atual = null;
    function cor() { return tema() === "light" ? "#D92B1F" : "#FF4B3E"; }
    function espessura() { return Math.max(3, tela.width / 320); }
    function tracar(c) {
      c.strokeStyle = cor(); c.lineWidth = espessura(); c.lineCap = "round"; c.lineJoin = "round";
      tracos.forEach(function (t) {
        if (t.length < 2) return;
        c.beginPath(); c.moveTo(t[0].x, t[0].y);
        for (var i = 1; i < t.length; i++) c.lineTo(t[i].x, t[i].y);
        c.stroke();
      });
    }
    function repintar() { ctx.clearRect(0, 0, tela.width, tela.height); tracar(ctx); }
    function ponto(ev) {
      var r = tela.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * (tela.width / r.width), y: (ev.clientY - r.top) * (tela.height / r.height) };
    }
    tela.addEventListener("pointerdown", function (ev) {
      ev.preventDefault();
      try { tela.setPointerCapture(ev.pointerId); } catch (e) {}
      atual = [ponto(ev)]; tracos.push(atual);
    });
    tela.addEventListener("pointermove", function (ev) {
      if (!atual) return;
      atual.push(ponto(ev)); repintar();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (t) {
      tela.addEventListener(t, function () { atual = null; });
    });
    return {
      tamanho: function (w, h) { tela.width = w; tela.height = h; repintar(); },
      limpar: function () { tracos = []; atual = null; repintar(); },
      desfazer: function () { tracos.pop(); repintar(); },
      desenhando: function () { return !!atual; },
      tem: function () { return tracos.length > 0; },
      // para o PNG baixado: mesmo traço, na escala do arquivo
      pintar: function (c, k) { c.save(); c.scale(k, k); tracar(c); c.restore(); }
    };
  }

  // ---------- visor: um gráfico só, grande, em tela cheia e anotável ----------
  var visor = null;

  function montarVisor() {
    var box = html("div", { "class": "visor", role: "dialog", "aria-modal": "true",
      "aria-label": "Gráfico ampliado", hidden: "" });

    var btnFechar = html("button", { type: "button", "class": "visor-fechar", "aria-label": "Fechar", texto: "✕" });
    btnFechar.addEventListener("click", fecharVisor);

    var palco = html("div", { "class": "visor-palco" });
    var tela = html("canvas", { "class": "visor-tela", "aria-hidden": "true" });
    palco.appendChild(tela);
    var anot = anotacao(tela);

    var barra = html("div", { "class": "visor-barra" });
    var inline = html("div", { "class": "visor-barra-inline" });
    var dica = html("span", { "class": "visor-dica" });

    var btnFs = html("button", { type: "button", "class": "visor-btn", texto: "Tela cheia", "aria-pressed": "false" });
    btnFs.hidden = !fullscreenSuportado(box);
    btnFs.addEventListener("click", function () {
      if (elFullscreen()) sairFullscreen(); else entrarFullscreen(box);
    });

    var desenhando = false;
    function alternarDesenho(ligar) {
      desenhando = ligar === undefined ? !desenhando : ligar;
      box.classList.toggle("desenhando", desenhando);
      btnDesenho.setAttribute("aria-pressed", String(desenhando));
      btnDesenho.textContent = desenhando ? "Parar de desenhar" : "Desenhar";
      itemDesenho.textContent = btnDesenho.textContent;
      dica.textContent = desenhando ? "Arraste sobre o gráfico para anotar" : "";
    }
    var btnDesenho = html("button", { type: "button", "class": "visor-btn", "aria-pressed": "false", texto: "Desenhar" });
    btnDesenho.addEventListener("click", function () { alternarDesenho(); });
    var btnDesfazer = html("button", { type: "button", "class": "visor-btn", texto: "Desfazer" });
    btnDesfazer.addEventListener("click", function () { anot.desfazer(); });
    var btnLimpar = html("button", { type: "button", "class": "visor-btn", texto: "Limpar anotações" });
    btnLimpar.addEventListener("click", function () { anot.limpar(); });

    // Recortes do gráfico (Consolidado, SI…): ficam fora de "inline", que em
    // tela cheia vira o hambúrguer, para dar para trocar sem sair dela
    var recortes = html("div", { "class": "visor-recortes", role: "group", "aria-label": "Recorte do gráfico" });
    barra.appendChild(recortes);
    inline.appendChild(btnFs);
    inline.appendChild(btnDesenho);
    inline.appendChild(btnDesfazer);
    inline.appendChild(btnLimpar);
    inline.appendChild(dica);

    // Em tela cheia os controles passam a flutuar sobre o próprio gráfico —
    // então viram um hambúrguer só, que abre com um clique, em vez de quatro
    // botões brotando a cada movimento do mouse (é assim no chart book).
    var btnMenu = html("button", { type: "button", "class": "visor-menu-btn",
      "aria-haspopup": "true", "aria-expanded": "false", "aria-label": "Menu" });
    btnMenu.appendChild(el("svg", { viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true" },
      [4, 8, 12].map(function (y) {
        return el("line", { x1: 2, y1: y, x2: 14, y2: y, stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round" });
      })));
    var menu = html("div", { "class": "visor-menu", role: "menu", hidden: "" });
    var menuAberto = false;
    function abrirMenu() {
      menuAberto = true; menu.hidden = false;
      btnMenu.setAttribute("aria-expanded", "true");
      mostrarChrome(false);   // enquanto o menu está aberto, nada some
    }
    function fecharMenu() {
      menuAberto = false; menu.hidden = true;
      btnMenu.setAttribute("aria-expanded", "false");
    }
    btnMenu.addEventListener("click", function (ev) { ev.stopPropagation(); if (menuAberto) fecharMenu(); else abrirMenu(); });
    document.addEventListener("click", function (ev) {
      if (!menuAberto || ev.target === btnMenu || menu.contains(ev.target)) return;
      fecharMenu();
    });

    function itemMenu(rot, acao) {
      var b = html("button", { type: "button", role: "menuitem", texto: rot });
      b.addEventListener("click", function () { fecharMenu(); acao(); });
      menu.appendChild(b);
      return b;
    }
    itemMenu("Sair da tela cheia", function () { sairFullscreen(); });
    var itemDesenho = itemMenu("Desenhar", function () { alternarDesenho(); });
    itemMenu("Desfazer", function () { anot.desfazer(); });
    itemMenu("Limpar anotações", function () { anot.limpar(); });
    itemMenu("Baixar PNG", function () { baixarDoVisor(); });

    var caixaMenu = html("div", { "class": "visor-menu-caixa" });
    caixaMenu.appendChild(btnMenu);
    caixaMenu.appendChild(menu);
    barra.appendChild(inline);
    barra.appendChild(caixaMenu);

    var btnBaixar = html("button", { type: "button", "class": "visor-baixar", texto: "Baixar PNG" });
    btnBaixar.addEventListener("click", function () { baixarDoVisor(); });

    function baixarDoVisor() {
      if (!visor.cartao) return;
      exportar(visor.cartao, visor.tamanho, "png", anot.tem() ? anot.pintar : null);
    }

    // Controles que somem sozinhos depois de um tempo parado e voltam a
    // qualquer movimento, toque ou foco de teclado — como num player de vídeo.
    // Só vale em tela cheia: fora dela eles ficam na margem escura, longe do
    // gráfico, e não atrapalham ninguém.
    var OCULTAR_APOS = 2600, timerChrome = null;
    function focoDeTeclado() {
      var a = document.activeElement;
      if (!a || a === box || !box.contains(a)) return false;
      try { return a.matches(":focus-visible"); } catch (e) { return false; }
    }
    function mostrarChrome(agendar) {
      box.classList.remove("chrome-oculto");
      if (timerChrome) { clearTimeout(timerChrome); timerChrome = null; }
      if (!agendar || !elFullscreen()) return;
      timerChrome = setTimeout(function () {
        timerChrome = null;
        if (focoDeTeclado() || menuAberto) return;   // não some com o foco ou o menu dentro
        box.classList.add("chrome-oculto");
      }, OCULTAR_APOS);
    }
    box.addEventListener("pointermove", function () { if (!anot.desenhando()) mostrarChrome(true); });
    box.addEventListener("pointerdown", function () { mostrarChrome(true); });
    box.addEventListener("focusin", function () { mostrarChrome(true); });
    box.addEventListener("focusout", function () { mostrarChrome(true); });

    // Em tela cheia os controles passam a flutuar sobre o gráfico. Colados no
    // topo eles cobririam o título — então descem para ~11,5% da altura do
    // palco (entre o subtítulo e a legenda), medida do retângulo real dele:
    // numa tela que não seja 16:9 o gráfico entra centralizado, com faixa
    // preta em volta, e a mesma porcentagem da janela cairia em outro lugar.
    function posicionarChrome() {
      if (!elFullscreen()) {
        barra.style.top = barra.style.left = "";
        btnFechar.style.top = btnFechar.style.right = "";
        return;
      }
      var r = palco.getBoundingClientRect();
      if (!r.height) return;
      var topo = (r.top + r.height * 0.115) + "px";
      barra.style.top = topo;
      barra.style.left = (r.left + 22) + "px";
      btnFechar.style.top = topo;
      btnFechar.style.right = (window.innerWidth - r.right + 22) + "px";
    }
    window.addEventListener("resize", posicionarChrome);

    // "Tela cheia" e "Zoom" são dois modos do visor. Sair da tela cheia (pelo
    // Esc ou pelo botão) volta à página, não ao Zoom: quem quis tela cheia não
    // pediu o zoom. emTelaCheia lembra se o visor chegou a estar em tela cheia.
    var emTelaCheia = false;
    function sincronizarFs() {
      var ativo = elFullscreen() === box;
      if (!ativo && emTelaCheia && !box.hidden) { emTelaCheia = false; fecharVisor(); return; }
      emTelaCheia = ativo;
      btnFs.textContent = ativo ? "Sair da tela cheia" : "Tela cheia";
      btnFs.setAttribute("aria-pressed", String(ativo));
      if (!ativo) fecharMenu();   // o hambúrguer nem aparece fora da tela cheia
      mostrarChrome(ativo);
      posicionarChrome();
      // o retângulo do palco só vale depois que o navegador repinta em tela cheia
      requestAnimationFrame(posicionarChrome);
    }
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (t) {
      document.addEventListener(t, sincronizarFs);
    });

    box.addEventListener("click", function (ev) { if (ev.target === box) fecharVisor(); });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape" || box.hidden) return;
      // Esc fecha o visor nos dois modos e volta à página (de tela cheia, o
      // navegador costuma sair sozinho e quem fecha é o sincronizarFs)
      fecharVisor();
    });

    // setas para o gráfico anterior e o seguinte, na ordem da página
    function seta(dir) {
      var b = html("button", { type: "button", "class": "visor-seta visor-seta-" + (dir < 0 ? "ant" : "prox"),
        "aria-label": dir < 0 ? "Gráfico anterior" : "Próximo gráfico" });
      b.appendChild(el("svg", { viewBox: "0 0 24 24", width: "22", height: "22", "aria-hidden": "true" }, [
        el("path", { d: dir < 0 ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7", fill: "none", stroke: "currentColor",
          "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" })
      ]));
      b.addEventListener("click", function (ev) { ev.stopPropagation(); irNoVisor(dir); });
      box.appendChild(b);
      return b;
    }
    var setaAnt = seta(-1), setaProx = seta(1);
    // ← e → do teclado fazem o mesmo (menos com o foco num campo ou desenhando)
    document.addEventListener("keydown", function (ev) {
      if (box.hidden || desenhando || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      irNoVisor(ev.key === "ArrowLeft" ? -1 : 1);
    });

    box.appendChild(btnFechar);
    box.appendChild(barra);
    box.appendChild(palco);
    box.appendChild(btnBaixar);
    document.body.appendChild(box);

    visor = { box: box, palco: palco, tela: tela, anot: anot, fechar: btnFechar, recortes: recortes,
              setaAnt: setaAnt, setaProx: setaProx,
              mostrarChrome: mostrarChrome, fecharMenu: fecharMenu, desenho: alternarDesenho,
              cartao: null, tamanho: TAMANHOS[0], layout: "wide" };
    alternarDesenho(false);
  }

  function montarRecortesDoVisor() {
    var box = visor.recortes, c = visor.cartao, vs = c.grafico.variantes;
    box.innerHTML = "";
    box.hidden = !vs;
    if (!vs) return;
    vs.forEach(function (v, k) {
      var b = html("button", { type: "button", "class": "visor-btn", texto: v.rot, "aria-pressed": String(k === (c.variante || 0)) });
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        c.escolherVariante(k);
        Array.prototype.forEach.call(box.children, function (x, j) { x.setAttribute("aria-pressed", String(j === k)); });
        pintarVisor();
      });
      box.appendChild(b);
    });
  }

  function pintarVisor() {
    if (!visor || !visor.cartao) return;
    var L = LAYOUTS[visor.layout];
    var d = construir(visor.cartao, L, tema());
    ligarHover(visor.cartao, d);
    var antigo = visor.palco.querySelector("svg");
    if (antigo) visor.palco.removeChild(antigo);
    visor.palco.insertBefore(d.svg, visor.tela);
    visor.palco.style.setProperty("--ar", L.W / L.H);
  }

  // Passa o visor para o gráfico vizinho (dir = −1 ou 1). Não dá a volta: no
  // primeiro e no último a seta daquele lado some.
  function irNoVisor(dir) {
    if (!visor || !visor.cartao) return;
    var j = cartoes.indexOf(visor.cartao) + dir;
    if (j < 0 || j >= cartoes.length) return;
    visor.cartao = cartoes[j];
    montarRecortesDoVisor();
    visor.anot.limpar();
    visor.desenho(false);
    pintarVisor();
    atualizarSetas();
    visor.mostrarChrome(true);
  }
  function atualizarSetas() {
    var i = cartoes.indexOf(visor.cartao);
    [[visor.setaAnt, cartoes[i - 1], "Anterior: "], [visor.setaProx, cartoes[i + 1], "Próximo: "]].forEach(function (x) {
      x[0].hidden = !x[1];
      if (x[1]) x[0].title = x[2] + x[1].grafico.titulo;
    });
  }

  function abrirVisor(cartao, comTelaCheia) {
    if (!visor) montarVisor();
    visor.cartao = cartao;
    visor.abertoEm = cartao;
    montarRecortesDoVisor();
    atualizarSetas();
    visor.layout = window.innerWidth < 700 ? "narrow" : "wide";
    visor.tamanho = visor.layout === "wide" ? TAMANHOS[0] : TAMANHOS[1];
    pintarVisor();
    visor.anot.tamanho(LAYOUTS[visor.layout].W, LAYOUTS[visor.layout].H);
    visor.anot.limpar();
    visor.desenho(false);
    visor.box.hidden = false;
    document.body.classList.add("visor-aberto");
    visor.mostrarChrome(false);
    visor.fechar.focus();
    // o clique é o gesto que a API exige — pedir a tela cheia aqui funciona;
    // se o navegador recusar, o visor continua aberto com o botão à mão.
    if (comTelaCheia && fullscreenSuportado(visor.box)) entrarFullscreen(visor.box);
  }

  function fecharVisor() {
    if (!visor || visor.box.hidden) return;
    // sem isto, fechar pelo ✕ estando em tela cheia deixaria o navegador em
    // tela cheia exibindo um elemento já escondido (tela preta). Só a tela
    // cheia do visor: a da página inteira, se estiver ligada, continua.
    if (elFullscreen() === visor.box) sairFullscreen();
    visor.mostrarChrome(false);
    visor.fecharMenu();
    visor.box.hidden = true;
    visor.anot.limpar();
    var antigo = visor.palco.querySelector("svg");
    if (antigo) visor.palco.removeChild(antigo);
    document.body.classList.remove("visor-aberto");
    var volta = visor.cartao;
    visor.cartao = null;
    // andou pelas setas: a página vai até o último gráfico visto (abrindo o
    // que estiver fechado no caminho), em vez de voltar ao de partida
    if (volta && volta !== visor.abertoEm) {
      // depois de a tela cheia terminar de sair, senão a rolagem se perde
      setTimeout(function () {
        irPara(volta.grafico.id);
        if (volta.botaoTelaCheia) volta.botaoTelaCheia.focus({ preventScroll: true });
      }, 150);
    } else if (volta && volta.botaoTelaCheia) volta.botaoTelaCheia.focus({ preventScroll: true });
  }

  // ---------- cartão ----------
  function extensao(g) {
    var ini = Infinity, fim = -Infinity;
    g.series.forEach(function (s) {
      if (!s.dados.length) return;
      ini = Math.min(ini, idxDe(g, s.dados[0][0]));
      fim = Math.max(fim, idxDe(g, s.dados[s.dados.length - 1][0]));
    });
    return { ini: ini, fim: fim };
  }
  function periodosDisponiveis(g) {
    if (g.categorias || g.painel) return [];   // eixo de categorias não tem janela de tempo
    var e = extensao(g), passo = passosPorAno(g), anos = (e.fim - e.ini + 1) / passo;
    var lista = [{ id: "tudo", rot: "Tudo" }];
    (g.diario ? [20, 10, 5, 2, 1] : [20, 10, 5]).forEach(function (a) {
      if (anos > a * 1.1) lista.push({ id: String(a), rot: a === 1 ? "1 ano" : a + " anos" });
    });
    return lista;
  }
  function inicioDoPeriodo(g, id) {
    return id === "tudo" ? null : extensao(g).fim - Math.round((+id) * passosPorAno(g)) + 1;
  }

  function criarCartao(g) {
    var cartao = { grafico: g, variante: 0, periodo: "tudo", inicioIdx: null, fimIdx: null, chave: null };
    var raiz = html("details", { "class": "card", id: g.id });

    var cabecalho = html("summary", { "class": "card-cabecalho" });
    cabecalho.appendChild(seta());
    var titulos = html("div", {}, [html("h3", { "class": "card-titulo", texto: g.titulo })]);
    if (g.subtitulo) titulos.appendChild(html("p", { "class": "card-sub", texto: g.subtitulo }));
    cabecalho.appendChild(titulos);
    raiz.appendChild(cabecalho);

    var ferramentas = html("div", { "class": "card-tools" });
    var esquerda = html("div", { "class": "card-escolhas" });

    // variantes: o mesmo cartão mostrando um recorte por vez (dívida interna ou
    // externa, % ou R$, um título ou um detentor…)
    if (g.variantes) {
      var grupoVar = html("div", { "class": "periodos", role: "group", "aria-label": "Recorte de " + g.titulo });
      g.variantes.forEach(function (v, k) {
        var b = html("button", { type: "button", texto: v.rot, "aria-pressed": String(k === 0) });
        b.addEventListener("click", function () { cartao.escolherVariante(k); });
        grupoVar.appendChild(b);
      });
      esquerda.appendChild(grupoVar);
      // o visor (tela cheia) chama esta mesma função, e os botões do cartão
      // acompanham a escolha feita lá
      cartao.escolherVariante = function (k) {
        cartao.variante = k;
        Array.prototype.forEach.call(grupoVar.children, function (x, j) {
          x.setAttribute("aria-pressed", String(j === k));
        });
        montarPeriodos();
        montarSelecao();
        desenhar(cartao, true);
      };
    }

    // seleção de séries: um botão por linha do gráfico, para o leitor tirar o
    // que não interessa. A escolha é guardada pelo nome, então sobrevive à
    // troca de recorte; desligar a última fica bloqueado (gráfico vazio não é
    // gráfico). O botão leva a cor da série, senão não dá para saber qual é qual.
    var grupoSel = html("div", { "class": "series", role: "group", "aria-label": "Séries de " + g.titulo });
    function montarSelecao() {
      var efetivo = comVariante(cartao);
      grupoSel.innerHTML = "";
      grupoSel.hidden = !efetivo.selecao;
      if (grupoSel.hidden) return;
      // só as séries da legenda ganham botão: a que serve de pano de fundo
      // leva o nome da sua principal e acende e apaga com ela, então um botão
      // a mais seria o mesmo botão duas vezes.
      itensLegenda(efetivo).forEach(function (s) {
        var ligada = !(cartao.desligadas || {})[s.nome];
        var b = html("button", { type: "button", "aria-pressed": String(ligada), title: s.nome });
        b.appendChild(html("span", { "class": "tinta", style: "background:" + s.cor }));
        b.appendChild(html("span", { texto: s.nome }));
        b.addEventListener("click", function () {
          cartao.desligadas = cartao.desligadas || {};
          var vaiDesligar = !cartao.desligadas[s.nome];
          var ligadas = itensLegenda(comVariante(cartao)).filter(function (x) { return !cartao.desligadas[x.nome]; });
          if (vaiDesligar && ligadas.length < 2) return;   // a última não desliga
          if (vaiDesligar) cartao.desligadas[s.nome] = true;
          else delete cartao.desligadas[s.nome];
          b.setAttribute("aria-pressed", String(!vaiDesligar));
          desenhar(cartao, true);
        });
        grupoSel.appendChild(b);
      });
    }
    montarSelecao();
    esquerda.appendChild(grupoSel);

    // períodos: dependem da variante (a que tem eixo de categorias não tem)
    var grupo = html("div", { "class": "periodos", role: "group", "aria-label": "Período de " + g.titulo });
    // Com mouse, o período é escolhido arrastando no gráfico, e aqui fica só a
    // dica de como se faz e a volta ao começo. Sem mouse fino (celular e
    // tablet), onde arrastar é rolar a página, continuam os botões de sempre.
    function montarPeriodos() {
      var efetivo = graficoDe(cartao);
      var periodos = periodosDisponiveis(efetivo);
      grupo.innerHTML = "";
      // sem mouse o controle só aparece quando há mais de um recorte a oferecer;
      // com mouse ele aparece em todo gráfico de tempo, porque a dica e o "Ver
      // tudo" valem mesmo numa série curta, que os botões de 20/10/5 não cobriam
      grupo.hidden = mouseFino() ? !periodos.length : periodos.length < 2;
      if (grupo.hidden) {
        cartao.periodo = "tudo";
        cartao.inicioIdx = cartao.fimIdx = null;
        return;
      }
      if (mouseFino()) {
        // a faixa de um recorte não vale para o outro: trocar de variante volta tudo
        if (cartao.periodo !== "faixa") { cartao.inicioIdx = cartao.fimIdx = null; }
        grupo.appendChild(html("span", { "class": "periodos-dica",
          texto: "Arraste no gráfico para escolher o período" }));
        var volta = html("button", { type: "button", texto: "Ver tudo",
          title: "Volta à série inteira (duplo clique no gráfico faz o mesmo)" });
        volta.addEventListener("click", function () { aplicarJanela(cartao, null, null); });
        grupo.appendChild(volta);
        atualizarDica();
        return;
      }
      if (!periodos.some(function (p) { return p.id === cartao.periodo; })) cartao.periodo = "tudo";
      cartao.inicioIdx = inicioDoPeriodo(efetivo, cartao.periodo);
      cartao.fimIdx = null;
      periodos.forEach(function (p) {
        var b = html("button", { type: "button", texto: p.rot, "data-p": p.id, "aria-pressed": String(p.id === cartao.periodo) });
        b.addEventListener("click", function () {
          cartao.periodo = p.id;
          cartao.inicioIdx = inicioDoPeriodo(graficoDe(cartao), p.id);
          cartao.fimIdx = null;
          Array.prototype.forEach.call(grupo.children, function (x) {
            x.setAttribute("aria-pressed", String(x.getAttribute("data-p") === p.id));
          });
          desenhar(cartao, true);
        });
        grupo.appendChild(b);
      });
    }
    // Com a faixa escolhida, a dica dá lugar ao recorte que está na tela — e o
    // "Ver tudo" só aparece aí, que é quando ele tem o que desfazer.
    function atualizarDica() {
      var dica = grupo.querySelector(".periodos-dica");
      var botao = grupo.querySelector("button");
      if (!dica || !botao) return;
      var efetivo = graficoDe(cartao), zoom = cartao.periodo === "faixa";
      function minusculo(t) { return t.charAt(0).toLowerCase() + t.slice(1); }
      dica.textContent = zoom && cartao.inicioIdx !== null
        ? minusculo(rotuloX(efetivo, cartao.inicioIdx, true)) + " a "
          + minusculo(rotuloX(efetivo, cartao.fimIdx, true))
        : "Arraste no gráfico para escolher o período";
      dica.classList.toggle("escolhido", zoom);
      botao.hidden = !zoom;
    }
    cartao.atualizarPeriodos = atualizarDica;
    cartao.periodo = g.periodoPadrao || "tudo";
    montarPeriodos();
    esquerda.appendChild(grupo);
    ferramentas.appendChild(esquerda);

    var acoes = html("div", { "class": "card-acoes" });
    // Zoom: o gráfico ampliado dentro da janela. Tela cheia: ocupa a tela toda,
    // e o Esc volta direto à página.
    var btnZoom = html("button", { type: "button", "class": "btn", title: "Ampliar este gráfico na janela, com anotação à mão" });
    btnZoom.appendChild(icone(ICO_ZOOM));
    btnZoom.appendChild(html("span", { texto: "Zoom" }));
    btnZoom.addEventListener("click", function () { cartao.botaoTelaCheia = btnZoom; abrirVisor(cartao, false); });
    var btnFs = html("button", { type: "button", "class": "btn", title: "Ver só este gráfico, em tela cheia, com anotação à mão" });
    btnFs.appendChild(icone(ICO_ENTRAR));
    btnFs.appendChild(html("span", { texto: "Tela cheia" }));
    btnFs.addEventListener("click", function () { cartao.botaoTelaCheia = btnFs; abrirVisor(cartao, true); });
    cartao.botaoTelaCheia = btnFs;
    // sem a API (o Safari do iPhone, por exemplo), fica só o Zoom
    if (!fullscreenSuportado(document.documentElement)) btnFs.hidden = true;
    acoes.appendChild(btnZoom);
    acoes.appendChild(btnFs);
    acoes.appendChild(menuCompartilhar(cartao));
    acoes.appendChild(menuBaixar(cartao));
    ferramentas.appendChild(acoes);
    raiz.appendChild(ferramentas);

    cartao.frame = html("div", { "class": "frame" });
    raiz.appendChild(cartao.frame);
    // a nota aceita parágrafos (linha em branco entre eles) e **negrito**. Notas
    // de um parágrafo só, sem asterisco, caem no mesmo lugar de sempre.
    if (g.nota) {
      g.nota.split(/\n\s*\n/).forEach(function (paragrafo) {
        var p = html("p", { "class": "nota" });
        paragrafo.split(/\*\*/).forEach(function (pedaco, i) {
          if (!pedaco) return;
          p.appendChild(i % 2 ? html("b", { texto: pedaco }) : document.createTextNode(pedaco));
        });
        raiz.appendChild(p);
      });
    }

    // fechado não tem largura: o desenho espera o cartão abrir
    raiz.addEventListener("toggle", function () {
      if (raiz.open) desenhar(cartao, true);
    });

    cartao.raiz = raiz;
    return cartao;
  }

  function desenhar(cartao, forcar) {
    // cartão (ou seção) fechado mede zero: redesenha quando voltar a aparecer
    if (!cartao.frame.clientWidth) { cartao.chave = null; return; }
    var nomeLayout = cartao.frame.clientWidth < 700 || window.innerWidth < 700 ? "narrow" : "wide";
    var chave = nomeLayout + "|" + tema() + "|" + cartao.periodo + "|" + cartao.inicioIdx +
      "|" + cartao.fimIdx + "|" + cartao.variante +
      "|" + Object.keys(cartao.desligadas || {}).sort().join(",");
    if (!forcar && cartao.chave === chave) return;
    cartao.chave = chave;
    var L = LAYOUTS[nomeLayout];
    var d = construir(cartao, L, tema());
    ligarHover(cartao, d);
    cartao.frame.style.aspectRatio = L.W + " / " + L.H;
    cartao.frame.innerHTML = "";
    cartao.frame.appendChild(d.svg);
  }

  // ---------- baixar ----------
  var FORMATOS = [
    { id: "png", nome: "PNG", nota: "sem perda, o mais nítido" },
    { id: "jpg", nome: "JPG", nota: "arquivo menor, para redes e WhatsApp" },
    { id: "pdf", nome: "PDF", nota: "para imprimir ou anexar" },
    { id: "svg", nome: "SVG", nota: "vetor editável (Illustrator/Figma)" }
  ];
  var tamanhoEscolhido = "slide";
  try { tamanhoEscolhido = localStorage.getItem("ftm_dados_tamanho") || "slide"; } catch (e) {}

  function tamanhoPorId(id) {
    return TAMANHOS.filter(function (t) { return t.id === id; })[0] || TAMANHOS[0];
  }
  function dimensoes(t) { return (t.layout.W * t.escala) + "×" + (t.layout.H * t.escala); }

  function menuBaixar(cartao) {
    var caixa = html("div", { "class": "baixar" });
    var botao = html("button", { type: "button", "class": "btn", "aria-haspopup": "menu", "aria-expanded": "false" });
    botao.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 20h16"/></svg><span>Baixar</span>';
    var menu = html("div", { "class": "menu", role: "menu", hidden: "" });

    var rotTam = html("label", { "class": "menu-rotulo", texto: "Tamanho" });
    var sel = html("select", { "class": "menu-tamanho", "aria-label": "Tamanho da imagem" });
    TAMANHOS.forEach(function (t) {
      var o = html("option", { value: t.id, texto: t.nome + " · " + dimensoes(t) });
      if (t.id === tamanhoPorId(tamanhoEscolhido).id) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      tamanhoEscolhido = sel.value;
      try { localStorage.setItem("ftm_dados_tamanho", sel.value); } catch (e) {}
      document.querySelectorAll(".menu-tamanho").forEach(function (x) { x.value = sel.value; });
    });
    rotTam.appendChild(sel);
    menu.appendChild(rotTam);

    FORMATOS.forEach(function (f) {
      var b = html("button", { type: "button", role: "menuitem" });
      b.innerHTML = "Imagem (" + f.nome + ")<small>" + f.nota + ", no tema atual</small>";
      b.addEventListener("click", function () { fechar(); exportar(cartao, tamanhoPorId(sel.value), f.id); });
      menu.appendChild(b);
    });
    menu.appendChild(html("hr"));
    var bc = html("button", { type: "button", role: "menuitem" });
    bc.innerHTML = "Dados (CSV)<small>uma coluna por série, para o Excel</small>";
    bc.addEventListener("click", function () { fechar(); baixarCSV(cartao); });
    menu.appendChild(bc);

    function fechar() { menu.hidden = true; botao.setAttribute("aria-expanded", "false"); }
    // O menu nasce alinhado à direita do botão. Quando a fileira de escolhas do
    // cartão quebra, o botão "Baixar" vai para o começo da linha de baixo — e
    // aí os 260px dele caíam para fora do cartão e sumiam atrás da lateral da
    // página. Depois de aberto o menu é medido e, se escapar do cartão para um
    // lado, vira para o outro; se nem assim couber, encosta na borda. Para
    // baixo ele passa do cartão à vontade, como todo menu.
    function encaixar() {
      menu.style.left = menu.style.right = "";
      var cartao = caixa.closest(".card");
      var lim = cartao ? cartao.getBoundingClientRect() : null;
      var janela = document.documentElement.clientWidth;
      var esq = Math.max(4, lim ? lim.left : 0);
      var dir = Math.min(janela - 4, lim ? lim.right : janela);
      var r = menu.getBoundingClientRect();
      if (r.left < esq || r.right > dir) {
        menu.style.right = "auto";
        menu.style.left = "0";
        r = menu.getBoundingClientRect();
        if (r.left < esq || r.right > dir) {
          // não cabe de nenhum lado: encosta na borda esquerda do limite, para
          // o começo do menu (onde está o seletor de tamanho) ficar visível
          menu.style.left = (esq - caixa.getBoundingClientRect().left) + "px";
          r = menu.getBoundingClientRect();
        }
      }
    }
    botao.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = menu.hidden;
      document.querySelectorAll(".menu").forEach(function (m) { m.hidden = true; });
      menu.hidden = !abrir;
      botao.setAttribute("aria-expanded", String(abrir));
      if (abrir) encaixar();
    });
    window.addEventListener("resize", function () { if (!menu.hidden) encaixar(); });
    document.addEventListener("click", function (e) { if (!caixa.contains(e.target)) fechar(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
    caixa.appendChild(botao);
    caixa.appendChild(menu);
    return caixa;
  }

  // ---------- compartilhar ----------
  // Botão "Compartilhar" que abre quatro opções: X, Instagram, LinkedIn e
  // e-mail. Nenhuma rede deixa um site anexar imagem num post, então:
  //  - X, LinkedIn e e-mail vão direto para a rede (como na Oaktree), em
  //    qualquer aparelho, com o link da PÁGINA DE PRÉVIA do
  //    gráfico (c/ID.html, feita pelo scripts/cartoes.py), cujas etiquetas
  //    apontam para a imagem dele: o post mostra o gráfico grande, e quem
  //    clica vai para o gráfico no site do assinante;
  //  - Instagram não tem post pela web: no celular vai a imagem 4:5 pelo menu
  //    do aparelho; no computador, baixa a imagem 4:5.
  // as páginas de prévia ficam ao lado do site, fora de protegido/: o X precisa
  // ler sem login
  var LINK_PREVIA = NO_DOMINIO ? "https://ftm.app.br/interno/dados/c/"
                               : "https://guivaraschinalves.github.io/ftm-dados/c/";
  var REDES = [
    { id: "x", nome: "X",
      svg: '<path fill="currentColor" stroke="none" d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.12z"/>' },
    { id: "instagram", nome: "Instagram",
      svg: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>' +
           '<circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>' },
    { id: "linkedin", nome: "LinkedIn",
      svg: '<path fill="currentColor" stroke="none" d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.75h4v11H3zm6.5 0h3.8v1.5h.05c.53-1 1.83-1.8 3.65-1.8 3.9 0 4.5 2.4 4.5 5.6v6.2h-4v-5.5c0-1.3 0-3-1.85-3s-2.15 1.4-2.15 2.9v5.6h-4z"/>' },
    { id: "email", nome: "E-mail",
      svg: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>' }
  ];
  var ICO_COMPARTILHAR = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>' +
    '<path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  function icoRede(r) {
    return '<span class="rede-ico" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + r.svg + "</svg></span>";
  }

  function podeCompartilharArquivo() {
    try {
      return !!(navigator.canShare && navigator.canShare({
        files: [new File([""], "x.png", { type: "image/png" })] }));
    } catch (e) { return false; }
  }
  function textoDoPost(cartao) {
    var g = graficoDe(cartao);
    return g.titulo + (g.subtitulo ? ". " + g.subtitulo : "") + ". Fonte: " + (g.fonte || "") + ".";
  }
  function linkDoGrafico(cartao) { return LINK_PREVIA + cartao.grafico.id + ".html"; }

  function menuCompartilhar(cartao) {
    var caixa = html("div", { "class": "baixar compartilhar" });
    var botao = html("button", { type: "button", "class": "btn", "aria-haspopup": "menu", "aria-expanded": "false",
                                 title: "Compartilhar no X, Instagram, LinkedIn ou por e-mail" });
    botao.innerHTML = ICO_COMPARTILHAR + "<span>Compartilhar</span>";
    var menu = html("div", { "class": "menu menu-redes", role: "menu", hidden: "" });
    var nativo = podeCompartilharArquivo();
    // As imagens são preparadas quando o menu abre: no iPhone o compartilhar
    // só abre logo depois do toque, e gerar a imagem leva um instante.
    var prontas = {};
    function preparar(id) {
      if (!prontas[id]) {
        prontas[id] = { p: gerarCanvas(cartao, tamanhoPorId(id)).then(function (c) { return blobDe(c, "image/png"); })
                          .then(function (b) { prontas[id].blob = b; return b; }) };
      }
      return prontas[id].p;
    }
    function nome(id) { return nomeArquivo(cartao, "png", tamanhoPorId(id)); }
    function compartilharImagem(id) {
      var enviar = function (b) {
        return navigator.share({ files: [new File([b], nome(id), { type: "image/png" })],
                                 text: textoDoPost(cartao) + " " + linkDoGrafico(cartao) });
      };
      var falhou = function (e) {
        if (e && e.name === "AbortError") return;           // a pessoa desistiu
        preparar(id).then(function (b) { salvar(b, nome(id)); });
      };
      if (prontas[id] && prontas[id].blob) enviar(prontas[id].blob).catch(falhou);
      else preparar(id).then(enviar).catch(falhou);
    }
    function abrir(url) { window.open(url, "_blank", "noopener"); }
    var link = function () { return encodeURIComponent(linkDoGrafico(cartao)); };
    var texto = function () { return encodeURIComponent(textoDoPost(cartao)); };
    var acoes = {
      // direto para a rede, como na Oaktree, em qualquer aparelho: o link é o da
      // página de prévia, e é ela que faz o gráfico aparecer como imagem no post
      x: function () { abrir("https://x.com/intent/post?text=" + texto() + "&url=" + link()); },
      instagram: function () {
        if (nativo) return compartilharImagem("ig-4x5");
        preparar("ig-4x5").then(function (b) {
          salvar(b, nome("ig-4x5"));
          avisar(caixa, "Imagem 4:5 baixada; publique pelo app do Instagram");
        });
      },
      linkedin: function () { abrir("https://www.linkedin.com/sharing/share-offsite/?url=" + link()); },
      email: function () {
        location.href = "mailto:?subject=" + encodeURIComponent(graficoDe(cartao).titulo + " | Follow the Money") +
          "&body=" + texto() + "%0D%0A%0D%0A" + link();
      }
    };
    REDES.forEach(function (r) {
      var b = html("button", { type: "button", role: "menuitem", "class": "item-rede" });
      b.innerHTML = icoRede(r) + '<span class="item-rede-txt">' + r.nome + "</span>";
      b.addEventListener("click", function () { fechar(); acoes[r.id](); });
      menu.appendChild(b);
    });

    function fechar() { menu.hidden = true; botao.setAttribute("aria-expanded", "false"); }
    botao.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrirMenu = menu.hidden;
      document.querySelectorAll(".menu").forEach(function (m) { m.hidden = true; });
      menu.hidden = !abrirMenu;
      botao.setAttribute("aria-expanded", String(abrirMenu));
      if (abrirMenu) {
        prontas = {};                    // tema, período ou recorte podem ter mudado
        if (nativo) preparar("ig-4x5");
        menu.style.left = menu.style.right = "";
        var r = menu.getBoundingClientRect(), lim = caixa.closest(".card");
        if (lim && r.left < lim.getBoundingClientRect().left) { menu.style.right = "auto"; menu.style.left = "0"; }
      }
    });
    document.addEventListener("click", function (e) { if (!caixa.contains(e.target)) fechar(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
    caixa.appendChild(botao);
    caixa.appendChild(menu);
    return caixa;
  }

  // Aviso curto embaixo da barra, que some sozinho.
  function avisar(perto, texto) {
    var v = html("div", { "class": "aviso-curto", role: "status", texto: texto });
    perto.appendChild(v);
    setTimeout(function () { v.remove(); }, 3500);
  }

  function salvar(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function nomeArquivo(cartao, ext, t) {
    var g = cartao.grafico;
    var recorte = g.variantes ? "-" + slug(g.variantes[cartao.variante || 0].rot) : "";
    return "ftm-" + g.id + recorte + (t && t.id !== "slide" ? "-" + t.id : "") + "." + ext;
  }
  function carregarImagem(src) {
    return new Promise(function (ok, erro) {
      var im = new Image();
      im.onload = function () { ok(im); };
      im.onerror = function () { erro(new Error("não carregou " + src.slice(0, 60))); };
      im.src = src;
    });
  }
  function serializar(svg) { return new XMLSerializer().serializeToString(svg); }

  // O gráfico num <canvas> no tamanho t, com o fundo do tema. É o que o
  // download e o compartilhar usam. pintar: função opcional que desenha as
  // anotações do visor por cima (ctx, escala).
  function gerarCanvas(cartao, t, pintar) {
    var nomeTema = tema(), L = t.layout, d = construir(cartao, L, nomeTema);
    var W = L.W * t.escala, H = L.H * t.escala;
    // o SVG é rasterizado já no tamanho final: texto e linhas saem nítidos
    d.svg.setAttribute("width", W); d.svg.setAttribute("height", H);
    return Promise.all([
      carregarImagem("data:image/svg+xml;charset=utf-8," + encodeURIComponent(serializar(d.svg))),
      d.pal.fundo ? carregarImagem(noSite(d.pal.fundo)) : Promise.resolve(null)
    ]).then(function (r) {
      var c = document.createElement("canvas");
      c.width = W; c.height = H;
      var x = c.getContext("2d");
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
      x.fillStyle = d.pal.bg; x.fillRect(0, 0, W, H);
      if (r[1]) {
        // fundo em "cover": preenche o quadro sem distorcer (recorta o excesso)
        var f = r[1], k = Math.max(W / f.naturalWidth, H / f.naturalHeight);
        var fw = f.naturalWidth * k, fh = f.naturalHeight * k;
        x.drawImage(f, (W - fw) / 2, (H - fh) / 2, fw, fh);
      }
      x.drawImage(r[0], 0, 0, W, H);
      if (pintar) pintar(x, t.escala);
      return c;
    });
  }
  function blobDe(c, tipo, q) {
    return new Promise(function (ok) { c.toBlob(ok, tipo, q); });
  }

  function exportar(cartao, t, formato, pintar) {
    if (formato === "svg") return baixarSVG(cartao, t);
    var L = t.layout, W = L.W * t.escala, H = L.H * t.escala;
    gerarCanvas(cartao, t, pintar).then(function (c) {
      if (formato === "png") {
        c.toBlob(function (b) { salvar(b, nomeArquivo(cartao, "png", t)); }, "image/png");
      } else if (formato === "jpg") {
        c.toBlob(function (b) { salvar(b, nomeArquivo(cartao, "jpg", t)); }, "image/jpeg", 0.95);
      } else {
        c.toBlob(function (b) {
          b.arrayBuffer().then(function (buf) {
            salvar(pdfComJpeg(new Uint8Array(buf), W, H, L.W * 0.75, L.H * 0.75), nomeArquivo(cartao, "pdf", t));
          });
        }, "image/jpeg", 0.97);
      }
    }).catch(function (e) { alert("Não consegui gerar a imagem: " + e.message); });
  }

  // PDF de uma página com a imagem (JPEG) ocupando a página toda.
  // pw/ph em pontos: 1 px do layout = 0,75 pt (96 dpi), então 16:9 vira 1440×810 pt.
  function pdfComJpeg(jpeg, iw, ih, pw, ph) {
    var enc = new TextEncoder(), partes = [], tam = 0, offs = [];
    function add(x) { var b = typeof x === "string" ? enc.encode(x) : x; partes.push(b); tam += b.length; }
    function obj(n, corpo) { offs[n] = tam; add(n + " 0 obj\n" + corpo + "\nendobj\n"); }
    var conteudo = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im0 Do Q";
    add("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] " +
      "/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>");
    offs[4] = tam;
    add("4 0 obj\n<< /Type /XObject /Subtype /Image /Width " + iw + " /Height " + ih +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n");
    add(jpeg);
    add("\nendstream\nendobj\n");
    obj(5, "<< /Length " + conteudo.length + " >>\nstream\n" + conteudo + "\nendstream");
    var xref = tam, linhas = "xref\n0 6\n0000000000 65535 f \n";
    for (var i = 1; i <= 5; i++) linhas += String(offs[i]).padStart(10, "0") + " 00000 n \n";
    add(linhas + "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(partes, { type: "application/pdf" });
  }

  function baixarSVG(cartao, t) {
    var L = t.layout, d = construir(cartao, L, tema());
    d.svg.insertBefore(el("rect", { x: 0, y: 0, width: L.W, height: L.H, fill: d.pal.bg }), d.svg.firstChild);
    salvar(new Blob([serializar(d.svg)], { type: "image/svg+xml" }), nomeArquivo(cartao, "svg", t));
  }

  function baixarCSV(cartao) {
    // o arquivo leva toda série desenhada, inclusive a que serve de pano de
    // fundo (legenda: false): na tela ela é contexto, no CSV é dado
    var g = graficoDe(cartao), cols = g.series;
    if (g.painel) {
      var cab = g.painel === "colunas" ? [] : [["item"].concat(g.painel === "pilhas" || g.painel === "pares" ? g.colunas : ["valor"])];
      var ls = cab.concat(linhasDoPainel(g)).map(function (l) {
        return l.map(function (x) { return String(x).replace(/;/g, ",").replace(/^(-?\d+)\.(\d+)$/, "$1,$2"); }).join(";");
      });
      salvar(new Blob(["\ufeff" + ls.join("\r\n")], { type: "text/csv;charset=utf-8" }), nomeArquivo(cartao, "csv"));
      return;
    }
    var meses = {};
    cols.forEach(function (s) { s.dados.forEach(function (d) { meses[d[0]] = true; }); });
    var mapas = cols.map(function (s) { return s.dados.reduce(function (o, d) { o[d[0]] = d[1]; return o; }, {}); });
    var nomes = cols.map(function (s, k) {
      var n = s.nome.replace(/;/g, ",");
      return cols.filter(function (t, j) { return j < k && t.nome === s.nome; }).length ? n + " (2)" : n;
    });
    var linhas = [(g.categorias ? "faixa" : g.diario ? "data" : g.trimestral ? "trimestre" : "mes") + ";" + nomes.join(";")];
    Object.keys(meses).sort().forEach(function (m) {
      linhas.push((g.categorias ? g.categorias[+m] : m) + ";" + mapas.map(function (mp) {
        return mp[m] === undefined ? "" : String(mp[m]).replace(".", ",");
      }).join(";"));
    });
    salvar(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }), nomeArquivo(cartao, "csv"));
  }

  // ---------- tema ----------
  function alternarTema() {
    var novo = tema() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    var cor = document.querySelector('meta[name="theme-color"]');
    if (cor) cor.setAttribute("content", novo === "light" ? "#f3f4f5" : "#0b0b0b");
    try { localStorage.setItem("ftm_dados_tema", novo); } catch (e) {}
    cartoes.forEach(function (c) { desenhar(c, true); });
    if (visor && !visor.box.hidden) pintarVisor();
  }

  // ---------- carga ----------
  function carregarLogo() {
    return fetch(noSite("assets/logo-ftm.svg")).then(function (r) { return r.text(); }).then(function (txt) {
      var raiz = new DOMParser().parseFromString(txt, "image/svg+xml").documentElement;
      var vb = raiz.getAttribute("viewBox").split(/\s+/).map(Number);
      var nos = [];
      Array.prototype.forEach.call(raiz.childNodes, function (n) {
        if (n.nodeType !== 1 || n.nodeName === "style") return;
        var c = document.importNode(n, true);
        c.querySelectorAll ? c.querySelectorAll("[class]").forEach(function (x) { x.removeAttribute("class"); }) : null;
        nos.push(c);
      });
      logoSvg = { viewBox: vb.join(" "), razao: vb[3] / vb[2], nos: nos };
      ["logo-topo", "logo-gate"].forEach(function (id) {
        var onde = document.getElementById(id);
        if (!onde) return;
        var s = el("svg", { viewBox: logoSvg.viewBox, "aria-hidden": "true" });
        var gg = el("g", { fill: "currentColor" });
        nos.forEach(function (n) { gg.appendChild(n.cloneNode(true)); });
        s.appendChild(gg);
        onde.appendChild(s);
      });
    }).catch(function () {});
  }

  function carregarImagens(docs) {
    // Uma volta por tudo que está desenhado, recolhendo os caminhos de imagem
    // das séries. Imagem que não baixar não quebra nada: a série cai no
    // preenchimento liso, que é o desenho de sempre.
    var caminhos = {};
    docs.forEach(function (d) {
      (d.secoes || []).forEach(function (sec) {
        graficosDaSecao(sec).forEach(function (g) {
          (g.variantes || [{ series: g.series }]).forEach(function (v) {
            (v.series || []).forEach(function (s) { if (s.imagem) caminhos[s.imagem] = 1; });
          });
        });
      });
    });
    return Promise.all(Object.keys(caminhos).map(function (url) {
      return fetch(noSite(url)).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.blob();
      }).then(function (b) {
        return new Promise(function (ok, erro) {
          var fr = new FileReader();
          fr.onload = function () { IMAGENS[url] = fr.result; ok(); };
          fr.onerror = erro;
          fr.readAsDataURL(b);
        });
      }).catch(function () {});
    }));
  }

  function rotuloNav(sec, g, acima) {
    // o menu inteiro já está dentro de "IPCA": repetir o prefixo em cada linha
    // só faz o texto quebrar em três linhas na barra lateral. O mesmo vale
    // para o nome da seção de cima ("SpaceX: …" dentro de SpaceX)
    var t = g.titulo.replace(/^IPCA: /, "");
    // "SpaceX: …" dentro de SpaceX, "SpaceX, Espaço: …" dentro de Espaço:
    // sai o prefixo quando cada parte dele é o nome de uma seção de cima
    var pre = t.match(/^([^:]+): /);
    if (pre && pre[1].split(", ").every(function (x) { return (acima || []).indexOf(x) >= 0; })) {
      t = t.slice(pre[0].length);
    }
    t = t.replace(/^([“"]?)(\S)/, function (_, aspa, letra) { return aspa + letra.toUpperCase(); });
    // dois gráficos com o mesmo título na mesma seção (contribuição em 12 e em
    // 3 meses) só se distinguem pelo fim do subtítulo ("... em 12 meses")
    var repetido = sec.graficos.filter(function (o) { return o.titulo === g.titulo; }).length > 1;
    if (!repetido || !g.subtitulo) return t;
    return t + " (" + g.subtitulo.split(";")[0].trim().split(" ").slice(-2).join(" ") + ")";
  }

  // Uma seção tem gráficos ou "subsecoes" (a empresa com resultado, fluxo de
  // caixa, balanço…), cada uma com os seus gráficos. Aqui sai tudo numa lista.
  function graficosDaSecao(sec) {
    if (!sec.subsecoes) return sec.graficos || [];
    return sec.subsecoes.reduce(function (l, sub) { return l.concat(graficosDaSecao(sub)); }, []);
  }
  function contarGraficos(dados) {
    return dados.secoes.reduce(function (n, sec) { return n + graficosDaSecao(sec).length; }, 0);
  }

  function montarNav(dados, host) {
    var total = contarGraficos(dados);
    var grupo = html("details", { "class": "nav-grupo", "data-cat": idCategoria(dados) });
    var rotulo = html("summary", { "class": "nav-rotulo" });
    rotulo.appendChild(seta());
    rotulo.appendChild(html("span", { texto: dados.categoria }));
    rotulo.appendChild(html("span", { "class": "nav-conta", texto: total + " gráficos" }));
    grupo.appendChild(rotulo);

    function navSecao(sec, onde, acima) {
      acima = (acima || []).concat([sec.titulo]);
      var sub = html("details", { "class": "nav-sub" });
      var subRotulo = html("summary", { "class": "nav-sub-rotulo" });
      subRotulo.appendChild(seta());
      subRotulo.appendChild(html("span", { texto: sec.titulo }));
      sub.appendChild(subRotulo);
      if (sec.subsecoes) sec.subsecoes.forEach(function (s2) { navSecao(s2, sub, acima); });
      (sec.subsecoes ? [] : sec.graficos).forEach(function (g) {
        var a = html("a", { href: "#" + g.id, texto: rotuloNav(sec, g, acima) });
        a.addEventListener("click", function (ev) {
          // Cmd/Ctrl/Shift/clique do meio: deixa o navegador abrir em outra aba
          if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
          ev.preventDefault();
          irPara(g.id);
        });
        sub.appendChild(a);
      });
      onde.appendChild(sub);
    }
    dados.secoes.forEach(function (sec) { navSecao(sec, grupo); });
    host.appendChild(grupo);
  }

  // Link do menu para um gráfico dentro de categoria, seção ou cartão fechado:
  // abre tudo que estiver no caminho antes de rolar até lá.
  function irPara(id) {
    var alvo = document.getElementById(id);
    if (!alvo) return;
    abrirTemas(false);
    for (var n = alvo; n; n = n.parentElement) if (n.tagName === "DETAILS") n.open = true;
    cartoes.forEach(function (c) { desenhar(c, false); });
    alvo.scrollIntoView({ block: "start" });
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
  }

  function idCategoria(dados) { return "cat-" + slug(dados.categoria); }
  function slug(t) {
    return t.toLowerCase().replace(/%/g, "pct").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  // Resumo da abertura: quantos gráficos e temas a página tem e a data da
  // atualização mais recente, tudo contado dos próprios arquivos de dados.
  function montarResumo(lista) {
    var caixa = document.getElementById("resumo");
    if (!caixa) return;
    var graficos = lista.reduce(function (n, d) { return n + contarGraficos(d); }, 0);
    var ultima = lista.map(function (d) { return d.atualizado; }).sort().pop().split("-");
    caixa.innerHTML = "";
    [[String(graficos), "gráficos"], [String(lista.length), "temas"],
     [ultima[2] + "/" + ultima[1], "última atualização"]].forEach(function (item) {
      caixa.appendChild(html("li", {}, [html("strong", { texto: item[0] }), html("span", { texto: item[1] })]));
    });
    caixa.hidden = false;
  }

  // As categorias entram ao aparecer na tela, uma depois da outra. Sem
  // IntersectionObserver (navegador antigo), tudo aparece de uma vez.
  function observarCategorias() {
    var cats = Array.prototype.slice.call(document.querySelectorAll(".categoria"));
    if (!("IntersectionObserver" in window)) {
      cats.forEach(function (c) { c.classList.add("is-in"); });
      return;
    }
    var fila = 0;
    var entrada = new IntersectionObserver(function (vistas) {
      vistas.forEach(function (v) {
        if (!v.isIntersecting) return;
        v.target.style.transitionDelay = (fila++ * 0.06) + "s";
        v.target.classList.add("is-in");
        entrada.unobserve(v.target);
      });
      fila = 0;
    }, { rootMargin: "0px 0px -6% 0px" });
    cats.forEach(function (c) { entrada.observe(c); });
  }

  // A categoria acesa no menu é a última cujo título já passou de um terço da
  // tela. No topo da página, com tudo fechado, nenhuma acende: o destaque só
  // aparece quando o leitor de fato entrou num tema.
  function acenderCategoriaAtual() {
    var linha = window.innerHeight / 3, atual = null;
    document.querySelectorAll(".categoria").forEach(function (c) {
      if (c.open && c.getBoundingClientRect().top <= linha) atual = c.id;
    });
    document.querySelectorAll(".nav-grupo").forEach(function (g) {
      var acesa = g.getAttribute("data-cat") === atual;
      if ((g.getAttribute("data-atual") === "true") !== acesa) g.setAttribute("data-atual", String(acesa));
    });
  }

  // Celular: a barra lateral vira cabeçalho fixo, e a lista de temas, uma
  // gaveta aberta pelo botão de menu. Esc e a escolha de um gráfico fecham.
  function lateral() { return document.querySelector(".lateral"); }
  function abrirTemas(abrir) {
    var btn = document.getElementById("menu-temas");
    if (!btn) return;
    lateral().setAttribute("data-aberto", String(abrir));
    btn.setAttribute("aria-expanded", String(abrir));
    btn.setAttribute("aria-label", abrir ? "Fechar a lista de temas" : "Abrir a lista de temas");
  }
  function ligarMenuTemas() {
    var btn = document.getElementById("menu-temas");
    if (!btn) return;
    btn.addEventListener("click", function () {
      abrirTemas(btn.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
        abrirTemas(false);
        btn.focus();
      }
    });
    // clique fora da gaveta fecha a gaveta
    document.addEventListener("click", function (ev) {
      if (btn.getAttribute("aria-expanded") === "true" && !lateral().contains(ev.target)) abrirTemas(false);
    });
    // Na rolagem: o cabeçalho do celular ganha fundo depois que a página sai
    // do topo, e o menu acende a categoria em que o leitor está. Um quadro
    // de animação por vez, para não medir a página a cada pixel rolado.
    var rolado = null, pedido = false;
    function aoRolar() {
      pedido = false;
      var agora = window.scrollY > 8;
      if (agora !== rolado) {
        rolado = agora;
        lateral().setAttribute("data-rolado", String(agora));
      }
      acenderCategoriaAtual();
    }
    window.addEventListener("scroll", function () {
      if (!pedido) { pedido = true; requestAnimationFrame(aoRolar); }
    }, { passive: true });
    document.addEventListener("toggle", function () { acenderCategoriaAtual(); }, true);
    aoRolar();
  }

  // Uma linha por categoria — até onde o dado vai, quando foi atualizado e de
  // onde veio. Com cinco categorias isso virava um bloco de texto maior que o
  // menu, então fica dentro de um retrátil "Fontes", fechado como o resto da
  // página.
  function montarRodape(lista) {
    var rodape = document.getElementById("rodape");
    var caixa = html("details", { "class": "fontes" });
    var rotulo = html("summary", { "class": "fontes-rotulo" });
    rotulo.appendChild(seta());
    rotulo.appendChild(html("span", { texto: "Fontes" }));
    caixa.appendChild(rotulo);
    lista.forEach(function (dados) {
      var at = dados.atualizado.split("-"), ref = idxMes(dados.referencia);
      caixa.appendChild(html("p", {
        texto: dados.categoria + " até " + rotuloMesLongo(ref).toLowerCase() +
               ", atualizado em " + at[2] + "/" + at[1] + "/" + at[0] + ". Fonte: " + dados.fonte + "."
      }));
    });
    rodape.appendChild(caixa);
  }

  // Monta uma categoria inteira na página: categoria > seções > gráficos,
  // tudo fechado — a página inicial é o índice.
  function montarCategoria(dados, host) {
    var cat = html("details", { "class": "categoria revela", id: idCategoria(dados) });
    var rotulo = html("summary", { "class": "categoria-rotulo" });
    rotulo.appendChild(seta());
    // h2 dentro do summary: o leitor de tela navega pelos temas como títulos
    rotulo.appendChild(html("h2", { "class": "categoria-titulo", texto: dados.categoria }));
    rotulo.appendChild(html("span", { "class": "categoria-conta", texto: contarGraficos(dados) + " gráficos" }));
    cat.appendChild(rotulo);

    // seção com "subsecoes" vira uma seção dentro da outra, do mesmo jeito
    function montarSecao(sec, id, onde) {
      var secao = html("details", { "class": "secao", id: id });
      var rotuloSecao = html("summary", { "class": "secao-rotulo" });
      rotuloSecao.appendChild(seta());
      rotuloSecao.appendChild(html("span", { texto: sec.titulo }));
      secao.appendChild(rotuloSecao);
      if (sec.subsecoes) {
        sec.subsecoes.forEach(function (sub, j) { montarSecao(sub, id + "-" + j, secao); });
        onde.appendChild(secao);
        return;
      }
      var listaGraficos = html("div", { "class": "secao-graficos" });
      var daSecao = [];
      sec.graficos.forEach(function (g) {
        g.fonte = g.fonte || dados.fonte;
        var c = criarCartao(g);
        cartoes.push(c);
        daSecao.push(c);
        listaGraficos.appendChild(c.raiz);
      });
      secao.appendChild(listaGraficos);
      secao.addEventListener("toggle", function () {
        if (secao.open) daSecao.forEach(function (c) { desenhar(c, true); });
      });
      onde.appendChild(secao);
    }
    dados.secoes.forEach(function (sec, k) { montarSecao(sec, "secao-" + slug(dados.categoria) + "-" + k, cat); });
    host.appendChild(cat);
  }

  // Mostra a porta e espera o e-mail. Só é chamada quando o gate está ligado e
  // não há token guardado — ou quando o servidor recusou o que havia.
  function mostrarGate() {
    var gate = document.getElementById("gate");
    var app = document.getElementById("app");
    var form = document.getElementById("gate-form");
    var campo = document.getElementById("gate-email");
    var botao = document.getElementById("gate-botao");
    var erro = document.getElementById("gate-erro");
    if (!gate || !form) return;                 // index.html antigo: não trava
    gate.hidden = false;
    app.hidden = true;
    carregarLogo();
    campo.focus();

    function falha(txt) {
      erro.innerHTML = "";
      erro.appendChild(html("p", { texto: txt }));
      var p = html("span", { "class": "assine", texto: "Ainda não assina? " });
      var a = html("a", { href: GATE.checkout, target: "_blank", rel: "noopener noreferrer",
                          texto: "clique aqui para assinar" });
      p.appendChild(a);
      p.appendChild(document.createTextNode("."));
      erro.appendChild(p);
      erro.hidden = false;
    }

    // mostrarGate pode ser chamada duas vezes — na abertura e de novo quando o
    // servidor recusa um token vencido. Sem esta trava, o segundo "Liberar" ia
    // disparar dois pedidos iguais.
    if (form.dataset.ligado) return;
    form.dataset.ligado = "1";

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var email = (campo.value || "").trim();
      if (!email) return;
      erro.hidden = true;
      botao.disabled = true;
      botao.textContent = "Verificando…";
      fetch(GATE.api + "?action=validate", {
        method: "POST",
        // Sem chave nenhuma: o news-access roda com verify_jwt=false e o
        // gateway não exige apikey (conferido com curl). Quem decide se o
        // e-mail é de assinante é a função, por dentro, com service_role.
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.ok && d.token) {
          try { localStorage.setItem(GATE.chave, d.token); } catch (e) {}
          gate.hidden = true;
          app.hidden = false;
          // a marca do <html> veio do script do <head>; sem tirá-la o CSS
          // continuaria escondendo o site mesmo com o portão liberado
          document.documentElement.removeAttribute("data-portao");
          carregar();
          return;
        }
        // Resposta genérica de propósito, como no Follow the News: dizer "este
        // e-mail não existe" entregaria a base de assinantes a quem perguntar.
        falha("Não encontramos uma assinatura ativa para este e-mail.");
      }).catch(function () {
        falha("Não consegui falar com o servidor. Tente de novo em instantes.");
      }).then(function () {
        botao.disabled = false;
        botao.textContent = "Liberar acesso";
      });
    });
  }

  // ---------- modo imagem (prévia do link no X e no LinkedIn) ----------
  // "?imagem=ID" desenha só aquele gráfico, em 1200×675 (o tamanho da prévia
  // grande do X), e deixa o JPEG em <pre id="imagem-pronta"> como data URL.
  // Quem usa é o scripts/cartoes.py, que lê a página com um navegador sem
  // tela e grava c/ID.jpg. Nada aqui roda na navegação normal.
  var MODO_IMAGEM = (location.search.match(/[?&]imagem=([^&]+)/) || [])[1] || null;
  // A prévia grande do X é 1,91:1 (1200×628), mais larga que o 16:9: um 16:9
  // ali perde o alto e o pé. Aqui o gráfico 16:9 entra inteiro, a 88% da
  // altura, encostado no alto e centrado, com o fundo do tema preenchendo as
  // laterais e a faixa de baixo — que é onde o X escreve o título do link por
  // cima da imagem.
  var PREVIA = { W: 1200, H: 628, altura: 0.88 };
  function canvasDaPrevia(cartao) {
    var nomeTema = tema(), L = LAYOUTS.wide, d = construir(cartao, L, nomeTema);
    var h = Math.round(PREVIA.H * PREVIA.altura), w = Math.round(h * L.W / L.H);
    var x0 = Math.round((PREVIA.W - w) / 2), y0 = 4;
    d.svg.setAttribute("width", w); d.svg.setAttribute("height", h);
    return Promise.all([
      carregarImagem("data:image/svg+xml;charset=utf-8," + encodeURIComponent(serializar(d.svg))),
      d.pal.fundo ? carregarImagem(noSite(d.pal.fundo)) : Promise.resolve(null)
    ]).then(function (r) {
      var c = document.createElement("canvas");
      c.width = PREVIA.W; c.height = PREVIA.H;
      var x = c.getContext("2d");
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
      x.fillStyle = d.pal.bg; x.fillRect(0, 0, PREVIA.W, PREVIA.H);
      if (r[1]) {
        var f = r[1], k = Math.max(PREVIA.W / f.naturalWidth, PREVIA.H / f.naturalHeight);
        x.drawImage(f, (PREVIA.W - f.naturalWidth * k) / 2, (PREVIA.H - f.naturalHeight * k) / 2,
                    f.naturalWidth * k, f.naturalHeight * k);
      }
      x.drawImage(r[0], x0, y0, w, h);
      return c;
    });
  }

  function gerarImagemDaPrevia(id) {
    var cartao = cartoes.filter(function (c) { return c.grafico.id === decodeURIComponent(id); })[0];
    var saida = html("pre", { id: "imagem-pronta" });
    if (!cartao) { saida.textContent = "ERRO: gráfico não encontrado"; document.body.appendChild(saida); return; }
    // "&tam=ig-4x5" (um dos TAMANHOS) desenha no formato em pé: serve para conferir
    var tam = (location.search.match(/[?&]tam=([^&]+)/) || [])[1];
    var gerar = tam ? function () { return gerarCanvas(cartao, tamanhoPorId(tam)); }
                    : function () { return canvasDaPrevia(cartao); };
    carregarImagens(docs).then(gerar).then(function (c) {
      saida.textContent = c.toDataURL("image/jpeg", 0.88);
      document.body.appendChild(saida);
    }).catch(function (e) { saida.textContent = "ERRO: " + e.message; document.body.appendChild(saida); });
  }

  function iniciar() {
    // A fiação da página fica aqui, e não no `carregar`: o carregar roda de
    // novo quando o leitor libera o acesso, e ligar o mesmo ouvinte duas vezes
    // faria o botão do tema piscar e o resize redesenhar em dobro.
    document.getElementById("tema").addEventListener("click", alternarTema);
    telaCheiaDaPagina();
    ligarMenuTemas();
    var espera;
    window.addEventListener("resize", function () {
      clearTimeout(espera);
      espera = setTimeout(function () { cartoes.forEach(function (c) { desenhar(c, false); }); }, 120);
    });
    if (GATE.ligado && !tokenSalvo()) return mostrarGate();
    carregar();
  }

  function carregar() {
    document.documentElement.removeAttribute("data-portao");
    var host = document.getElementById("graficos");
    var nav = document.getElementById("nav");
    var token = tokenSalvo();
    // 401 é o servidor dizendo que o token venceu ou nunca valeu: apaga e volta
    // para a porta. Qualquer outra falha continua virando null, que o
    // `if (!docs.length)` lá embaixo transforma na mensagem de erro de sempre.
    var expirou = false;
    var buscas = FONTES.map(function (url) {
      return fetch(url, token ? { headers: { "Authorization": "Bearer " + token } } : undefined)
        .then(function (r) {
          if (r.status === 401) { expirou = true; return null; }
          return r.ok ? r.json() : null;
        }).catch(function () { return null; });
    });
    Promise.all(buscas.concat([carregarLogo()])).then(function (r) {
      if (expirou) { esquecerToken(); return mostrarGate(); }
      docs = r.slice(0, FONTES.length).filter(Boolean);
      if (!docs.length) throw new Error("nenhum arquivo de dados foi carregado");
      host.innerHTML = "";
      docs.forEach(function (dados) {
        montarCategoria(dados, host);
        montarNav(dados, nav);
      });
      montarRodape(docs);
      montarResumo(docs);
      observarCategorias();
      cartoes.forEach(function (c) { desenhar(c, true); });
      if (MODO_IMAGEM) return gerarImagemDaPrevia(MODO_IMAGEM);
      if (location.hash.length > 1) irPara(location.hash.slice(1));
      // as imagens vêm depois do primeiro desenho: o gráfico aparece na hora,
      // com o preenchimento liso, e ganha a nota quando ela chega
      carregarImagens(docs).then(function () {
        if (Object.keys(IMAGENS).length) cartoes.forEach(function (c) { desenhar(c, true); });
      });
    }).catch(function (e) {
      host.innerHTML = "";
      host.appendChild(html("p", { "class": "estado erro", texto: "Não foi possível carregar os dados. " + e.message }));
    });

  }

  iniciar();
})();
