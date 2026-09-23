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
  var FONTES = ["dados/ipca.json", "dados/divida.json"];
  var docs = [];
  var logoSvg = null;   // {viewBox, nos}

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
  function pct(v, casas) { return nf(casas === undefined ? 2 : casas).format(v) + "%"; }

  function idxMes(m) { var p = m.split("-"); return (+p[0]) * 12 + (+p[1] - 1); }
  function rotuloMesCurto(i) { return MESES[i % 12] + "/" + String(Math.floor(i / 12)).slice(-2); }
  function rotuloMesLongo(i) { return MESES_LONGOS[i % 12] + " de " + Math.floor(i / 12); }

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
    if (mn >= 0 && mn <= mx * 0.6) baixo = 0;
    if (eixo.min !== undefined) baixo = eixo.min;
    if (eixo.max !== undefined) alto = eixo.max;
    if (alto - baixo <= 0) alto = baixo + 1;
    var passo = passoBonito(alto - baixo, 8);
    var min = eixo.min !== undefined ? eixo.min : Math.floor(baixo / passo + 1e-9) * passo;
    var max = eixo.max !== undefined ? eixo.max : Math.ceil(alto / passo - 1e-9) * passo;
    var ticks = [];
    for (var k = 0; min + k * passo <= max + passo / 2; k++) ticks.push(+(min + k * passo).toFixed(6));
    return { min: min, max: max, passo: passo, ticks: ticks };
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
    var g = cartao.grafico, pal = PALETAS[nomeTema];
    var L = Object.assign({}, L0);

    // subtítulo que não cabe numa linha quebra em duas (versão estreita)
    var subLinhas = [g.subtitulo || ""];
    if (g.subtitulo && largura(g.subtitulo, L.sub.fs, "italic") > L.sub.max) {
      var partes = g.subtitulo.split("; ");
      subLinhas = partes.length > 1 ? [partes[0] + ";", partes.slice(1).join("; ")] : [g.subtitulo];
    }
    var legenda = montarLegenda(g, L);
    var topoLegenda = L.legenda.y || (L.sub.y + (subLinhas.length - 1) * L.sub.fs * 1.2 + 62);
    var y0 = topoLegenda + (legenda.linhas - 1) * L.legenda.passo + 42;

    // período visível
    var todas = g.series.map(function (s) { return s.dados.map(function (d) { return { i: idxMes(d[0]), v: d[1] }; }); });
    var ini = Infinity, fim = -Infinity;
    todas.forEach(function (pts) { pts.forEach(function (p) { if (p.i < ini) ini = p.i; if (p.i > fim) fim = p.i; }); });
    var d0 = cartao.inicioIdx === null ? ini : Math.max(ini, cartao.inicioIdx), d1 = fim + 1;
    var vis = todas.map(function (pts) { return pts.filter(function (p) { return p.i >= d0; }); });

    // extremos: barras entram empilhadas (positivas e negativas em separado)
    var mn = Infinity, mx = -Infinity, pilhaPos = {}, pilhaNeg = {};
    g.series.forEach(function (s, k) {
      vis[k].forEach(function (p) {
        if (s.tipo === "barra") {
          if (p.v >= 0) pilhaPos[p.i] = (pilhaPos[p.i] || 0) + p.v;
          else pilhaNeg[p.i] = (pilhaNeg[p.i] || 0) + p.v;
        } else {
          if (p.v < mn) mn = p.v;
          if (p.v > mx) mx = p.v;
        }
      });
    });
    Object.keys(pilhaPos).forEach(function (i) { mx = Math.max(mx, pilhaPos[i]); mn = Math.min(mn, 0); });
    Object.keys(pilhaNeg).forEach(function (i) { mn = Math.min(mn, pilhaNeg[i]); });
    var esc = escalaY(mn, mx, g.eixo);

    var tw = Math.max.apply(null, esc.ticks.map(function (t) { return largura(pct(t, 0), L.tick); }));
    var rotulos = [];
    g.series.forEach(function (s, k) {
      if (!s.rotulo || !vis[k].length) return;
      var u = vis[k][vis[k].length - 1];
      rotulos.push({ s: s, p: u, txt: pct(u.v, 2) });
    });
    var rw = Math.max.apply(null, [0].concat(rotulos.map(function (r) { return largura(r.txt, L.rotulo, "bold"); })));
    L.x0 = 26 + tw + 14;
    L.x1 = L.W - (22 + Math.max(L.eixoDuplo ? tw + 14 : 0, rw + L.rotuloX + 10));
    L.y0 = y0;
    var pw = L.x1 - L.x0, ph = L.y1 - L.y0;
    var X = function (i) { return L.x0 + (i - d0) / (d1 - d0) * pw; };
    var Y = function (v) { return L.y1 - (v - esc.min) / (esc.max - esc.min) * ph; };
    var pxMes = pw / (d1 - d0);

    var svg = el("svg", {
      xmlns: NS, viewBox: "0 0 " + L.W + " " + L.H, width: L.W, height: L.H,
      role: "img", "aria-label": g.titulo + (g.subtitulo ? " — " + g.subtitulo : "")
    });
    var idClip = "clip-" + g.id + "-" + nomeTema;
    svg.appendChild(el("defs", {}, [el("clipPath", { id: idClip }, [
      el("rect", { x: L.x0, y: L.y0 - 2, width: pw, height: ph + 4 })
    ])]));

    // grade e eixo Y (dos dois lados, como nos slides)
    var rotY = rotulos.map(function (r) { return Math.min(Math.max(Y(r.p.v), L.y0), L.y1); });
    esc.ticks.forEach(function (t) {
      var y = Y(t), zero = Math.abs(t) < 1e-9;
      svg.appendChild(el("line", {
        x1: L.x0, x2: L.x1, y1: y, y2: y, stroke: zero && esc.min < 0 ? pal.zero : pal.grade,
        "stroke-width": zero && esc.min < 0 ? 1.5 : 1.2
      }));
      var at = { y: y, "font-size": L.tick, fill: pal.eixo, "dominant-baseline": "central" };
      svg.appendChild(texto(pct(t, 0), Object.assign({ x: L.x0 - 14, "text-anchor": "end" }, at)));
      if (L.eixoDuplo && rotY.every(function (ry) { return Math.abs(ry - y) > L.rotulo * 0.9; })) {
        svg.appendChild(texto(pct(t, 0), Object.assign({ x: L.x1 + 14, "text-anchor": "start" }, at)));
      }
    });
    // eixo X: linha de base (zero, se estiver no gráfico; senão a base)
    var yBase = esc.min <= 0 && esc.max >= 0 ? Y(0) : L.y1;
    if (!(esc.min < 0)) {
      svg.appendChild(el("line", { x1: L.x0, x2: L.x1, y1: yBase, y2: yBase, stroke: pal.zero, "stroke-width": 1.5 }));
    }

    // rótulos do eixo X: janeiro de cada ano; trimestral em janela curta
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

    // barras empilhadas
    var area = el("g", { "clip-path": "url(#" + idClip + ")" });
    svg.appendChild(area);
    var baseP = {}, baseN = {}, bw = Math.max(2, pxMes * 0.86);
    g.series.forEach(function (s, k) {
      if (s.tipo !== "barra") return;
      var cor = corNoTema(s.cor, pal);
      vis[k].forEach(function (p) {
        if (!p.v) return;
        var b = p.v >= 0 ? baseP : baseN, antes = b[p.i] || 0, depois = antes + p.v;
        b[p.i] = depois;
        var ya = Y(antes), yb = Y(depois);
        area.appendChild(el("rect", {
          x: X(p.i + 0.5) - bw / 2, y: Math.min(ya, yb), width: bw, height: Math.max(0.6, Math.abs(yb - ya)), fill: cor
        }));
      });
    });
    // linhas, na ordem da lista (a última fica por cima)
    g.series.forEach(function (s, k) {
      if (s.tipo === "barra" || !vis[k].length) return;
      var d = "", ant = null;
      vis[k].forEach(function (p) {
        d += (ant === null || p.i - ant > 1 ? "M" : "L") + X(p.i + 0.5).toFixed(1) + " " + Y(p.v).toFixed(1);
        ant = p.i;
      });
      var w = s.largura || L.linha;
      area.appendChild(el("path", {
        d: d, fill: "none", stroke: corNoTema(s.cor, pal), "stroke-width": w,
        "stroke-linejoin": "round", "stroke-linecap": s.traco ? "butt" : "round",
        "stroke-dasharray": s.traco === "pontilhado" ? (w * 1.2) + " " + (w * 1.6) : null
      }));
    });

    // rótulo colorido no último ponto, afastando os que se encostam
    var ordem = rotulos.map(function (r, k) { return { r: r, y: rotY[k] }; }).sort(function (a, b) { return a.y - b.y; });
    var passoRot = L.rotulo * 1.08;
    for (var a = 1; a < ordem.length; a++) {
      if (ordem[a].y - ordem[a - 1].y < passoRot) ordem[a].y = ordem[a - 1].y + passoRot;
    }
    for (var b2 = ordem.length - 1; b2 >= 0; b2--) {
      var teto = b2 === ordem.length - 1 ? L.y1 : ordem[b2 + 1].y - passoRot;
      if (ordem[b2].y > teto) ordem[b2].y = teto;
    }
    ordem.forEach(function (o) {
      var cor = corNoTema(o.r.s.cor, pal);
      var px = X(o.r.p.i + 0.5), py = Y(o.r.p.v), lx = L.x1 + L.rotuloX;
      svg.appendChild(el("polyline", {
        points: px + "," + py + " " + (lx - 4) + "," + o.y, fill: "none", stroke: pal.suave, "stroke-width": 1.2
      }));
      svg.appendChild(texto(o.r.txt, {
        x: lx, y: o.y, "font-size": L.rotulo, "font-weight": "bold", fill: cor, "dominant-baseline": "central"
      }));
    });

    // legenda
    legenda.pos.forEach(function (it) {
      var y = topoLegenda + it.linha * L.legenda.passo, s = it.s, cor = corNoTema(s.cor, pal);
      if (s.tipo === "barra") {
        svg.appendChild(el("rect", { x: it.x + 6, y: y - 10, width: 22, height: 20, fill: cor }));
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

    // título, subtítulo, fonte e logo
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
      x: L.fonte.x, y: L.fonte.y, "font-size": L.fonte.fs, fill: pal.texto, "text-anchor": "end"
    }));
    if (logoSvg) {
      var lh = L.logo.w * logoSvg.razao;
      var gl = el("svg", { x: L.logo.x, y: L.logo.y, width: L.logo.w, height: lh, viewBox: logoSvg.viewBox });
      var gg = el("g", { fill: pal.logo });
      logoSvg.nos.forEach(function (n) { gg.appendChild(n.cloneNode(true)); });
      gl.appendChild(gg);
      svg.appendChild(gl);
    }

    return { svg: svg, L: L, pal: pal, X: X, Y: Y, d0: d0, d1: d1, vis: vis, esc: esc };
  }

  // ---------- passar o mouse ----------
  function ligarHover(cartao, desenho) {
    var svg = desenho.svg, L = desenho.L, pal = desenho.pal, g = cartao.grafico;
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
      var titulo = rotuloMesLongo(i);
      var w = Math.max(largura(titulo, fs, "bold"), Math.max.apply(null, linhas.map(function (l) {
        return largura(l.s.nome + "  " + pct(l.v, 2), fs) + fs * 1.1;
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
        camada.appendChild(texto(pct(l.v, 2), { x: bx + w - pad, y: ty, "font-size": fs, "font-weight": "bold", fill: pal.texto, "text-anchor": "end" }));
        if (desenho.vis[g.series.indexOf(l.s)] && l.s.tipo !== "barra") {
          camada.appendChild(el("circle", { cx: x, cy: desenho.Y(l.v), r: 6, fill: corNoTema(l.s.cor, pal), stroke: pal.bg, "stroke-width": 2 }));
        }
      });
    }
    alvo.addEventListener("pointermove", mover);
    alvo.addEventListener("pointerdown", mover);
    alvo.addEventListener("pointerleave", limpar);
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
    ["fullscreenchange", "webkitfullscreenchange"].forEach(function (t) {
      document.addEventListener(t, sincronizar);
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
      dica.textContent = desenhando
        ? "Arraste sobre o gráfico para anotar"
        : "Ligue “Desenhar” para anotar — com ele desligado, o gráfico mostra os valores do mês";
    }
    var btnDesenho = html("button", { type: "button", "class": "visor-btn", "aria-pressed": "false", texto: "Desenhar" });
    btnDesenho.addEventListener("click", function () { alternarDesenho(); });
    var btnDesfazer = html("button", { type: "button", "class": "visor-btn", texto: "Desfazer" });
    btnDesfazer.addEventListener("click", function () { anot.desfazer(); });
    var btnLimpar = html("button", { type: "button", "class": "visor-btn", texto: "Limpar anotações" });
    btnLimpar.addEventListener("click", function () { anot.limpar(); });

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

    function sincronizarFs() {
      var ativo = !!elFullscreen();
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
      // Em tela cheia, Escape quer dizer "sair da tela cheia" — fechar o visor
      // junto tiraria o gráfico da tela num passo só.
      if (elFullscreen()) { sairFullscreen(); return; }
      fecharVisor();
    });

    box.appendChild(btnFechar);
    box.appendChild(barra);
    box.appendChild(palco);
    box.appendChild(btnBaixar);
    document.body.appendChild(box);

    visor = { box: box, palco: palco, tela: tela, anot: anot, fechar: btnFechar,
              mostrarChrome: mostrarChrome, fecharMenu: fecharMenu, desenho: alternarDesenho,
              cartao: null, tamanho: TAMANHOS[0], layout: "wide" };
    alternarDesenho(false);
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

  function abrirVisor(cartao, comTelaCheia) {
    if (!visor) montarVisor();
    visor.cartao = cartao;
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
    // tela cheia exibindo um elemento já escondido — tela preta
    sairFullscreen();
    visor.mostrarChrome(false);
    visor.fecharMenu();
    visor.box.hidden = true;
    visor.anot.limpar();
    var antigo = visor.palco.querySelector("svg");
    if (antigo) visor.palco.removeChild(antigo);
    document.body.classList.remove("visor-aberto");
    var volta = visor.cartao;
    visor.cartao = null;
    if (volta && volta.botaoTelaCheia) volta.botaoTelaCheia.focus();
  }

  // ---------- cartão ----------
  function extensao(g) {
    var ini = Infinity, fim = -Infinity;
    g.series.forEach(function (s) {
      if (!s.dados.length) return;
      ini = Math.min(ini, idxMes(s.dados[0][0]));
      fim = Math.max(fim, idxMes(s.dados[s.dados.length - 1][0]));
    });
    return { ini: ini, fim: fim };
  }
  function periodosDisponiveis(g) {
    var e = extensao(g), meses = e.fim - e.ini + 1, lista = [{ id: "tudo", rot: "Tudo" }];
    [20, 10, 5].forEach(function (a) { if (meses > a * 12 * 1.1) lista.push({ id: String(a), rot: a + " anos" }); });
    return lista;
  }
  function inicioDoPeriodo(g, id) {
    return id === "tudo" ? null : extensao(g).fim - (+id) * 12 + 1;
  }

  function criarCartao(g) {
    var cartao = { grafico: g, periodo: "tudo", inicioIdx: null, chave: null };
    var raiz = html("details", { "class": "card", id: g.id });

    var cabecalho = html("summary", { "class": "card-cabecalho" });
    cabecalho.appendChild(seta());
    var titulos = html("div", {}, [html("h3", { "class": "card-titulo", texto: g.titulo })]);
    if (g.subtitulo) titulos.appendChild(html("p", { "class": "card-sub", texto: g.subtitulo }));
    cabecalho.appendChild(titulos);
    raiz.appendChild(cabecalho);

    var ferramentas = html("div", { "class": "card-tools" });
    var grupo = html("div", { "class": "periodos", role: "group", "aria-label": "Período de " + g.titulo });
    var periodos = periodosDisponiveis(g);
    if (periodos.length > 1) {
      periodos.forEach(function (p) {
        var b = html("button", { type: "button", texto: p.rot, "data-p": p.id, "aria-pressed": String(p.id === cartao.periodo) });
        b.addEventListener("click", function () {
          cartao.periodo = p.id;
          cartao.inicioIdx = inicioDoPeriodo(g, p.id);
          Array.prototype.forEach.call(grupo.children, function (x) {
            x.setAttribute("aria-pressed", String(x.getAttribute("data-p") === p.id));
          });
          desenhar(cartao, true);
        });
        grupo.appendChild(b);
      });
    }
    ferramentas.appendChild(grupo);

    var acoes = html("div", { "class": "card-acoes" });
    var btnFs = html("button", { type: "button", "class": "btn", title: "Ver só este gráfico, em tela cheia, com anotação à mão" });
    btnFs.appendChild(icone(ICO_ENTRAR));
    btnFs.appendChild(html("span", { texto: "Tela cheia" }));
    btnFs.addEventListener("click", function () { abrirVisor(cartao, true); });
    cartao.botaoTelaCheia = btnFs;
    acoes.appendChild(btnFs);
    acoes.appendChild(menuBaixar(cartao));
    ferramentas.appendChild(acoes);
    raiz.appendChild(ferramentas);

    cartao.frame = html("div", { "class": "frame" });
    raiz.appendChild(cartao.frame);
    if (g.nota) raiz.appendChild(html("p", { "class": "nota", texto: g.nota }));

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
    var chave = nomeLayout + "|" + tema() + "|" + cartao.periodo;
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
    botao.addEventListener("click", function (e) {
      e.stopPropagation();
      var abrir = menu.hidden;
      document.querySelectorAll(".menu").forEach(function (m) { m.hidden = true; });
      menu.hidden = !abrir;
      botao.setAttribute("aria-expanded", String(abrir));
    });
    document.addEventListener("click", function (e) { if (!caixa.contains(e.target)) fechar(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });
    caixa.appendChild(botao);
    caixa.appendChild(menu);
    return caixa;
  }

  function salvar(blob, nome) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function nomeArquivo(cartao, ext, t) {
    return "ftm-" + cartao.grafico.id + (t && t.id !== "slide" ? "-" + t.id : "") + "." + ext;
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

  // pintar: função opcional que desenha as anotações do visor por cima (ctx, escala)
  function exportar(cartao, t, formato, pintar) {
    if (formato === "svg") return baixarSVG(cartao, t);
    var nomeTema = tema(), L = t.layout, d = construir(cartao, L, nomeTema);
    var W = L.W * t.escala, H = L.H * t.escala;
    // o SVG é rasterizado já no tamanho final: texto e linhas saem nítidos
    d.svg.setAttribute("width", W); d.svg.setAttribute("height", H);
    Promise.all([
      carregarImagem("data:image/svg+xml;charset=utf-8," + encodeURIComponent(serializar(d.svg))),
      d.pal.fundo ? carregarImagem(d.pal.fundo) : Promise.resolve(null)
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
    var g = cartao.grafico, cols = g.series.filter(function (s) { return s.legenda !== false || s.traco; });
    var meses = {};
    cols.forEach(function (s) { s.dados.forEach(function (d) { meses[d[0]] = true; }); });
    var mapas = cols.map(function (s) { return s.dados.reduce(function (o, d) { o[d[0]] = d[1]; return o; }, {}); });
    var nomes = cols.map(function (s, k) {
      var n = s.nome.replace(/;/g, ",");
      return cols.filter(function (t, j) { return j < k && t.nome === s.nome; }).length ? n + " (2)" : n;
    });
    var linhas = ["mes;" + nomes.join(";")];
    Object.keys(meses).sort().forEach(function (m) {
      linhas.push(m + ";" + mapas.map(function (mp) {
        return mp[m] === undefined ? "" : String(mp[m]).replace(".", ",");
      }).join(";"));
    });
    salvar(new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }), nomeArquivo(cartao, "csv"));
  }

  // ---------- tema ----------
  function alternarTema() {
    var novo = tema() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", novo);
    try { localStorage.setItem("ftm_dados_tema", novo); } catch (e) {}
    cartoes.forEach(function (c) { desenhar(c, true); });
    if (visor && !visor.box.hidden) pintarVisor();
  }

  // ---------- carga ----------
  function carregarLogo() {
    return fetch("assets/logo-ftm.svg").then(function (r) { return r.text(); }).then(function (txt) {
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
      var topo = document.getElementById("logo-topo");
      var s = el("svg", { viewBox: logoSvg.viewBox, "aria-hidden": "true" });
      var gg = el("g", { fill: "currentColor" });
      nos.forEach(function (n) { gg.appendChild(n.cloneNode(true)); });
      s.appendChild(gg);
      topo.appendChild(s);
    }).catch(function () {});
  }

  function rotuloNav(sec, g) {
    // o menu inteiro já está dentro de "IPCA": repetir o prefixo em cada linha
    // só faz o texto quebrar em três linhas na barra lateral
    var t = g.titulo.replace(/^IPCA: /, "");
    // dois gráficos com o mesmo título na mesma seção (contribuição em 12 e em
    // 3 meses) só se distinguem pelo fim do subtítulo ("... em 12 meses")
    var repetido = sec.graficos.filter(function (o) { return o.titulo === g.titulo; }).length > 1;
    if (!repetido || !g.subtitulo) return t;
    return t + " (" + g.subtitulo.split(";")[0].trim().split(" ").slice(-2).join(" ") + ")";
  }

  function montarNav(dados, host) {
    var total = dados.secoes.reduce(function (n, sec) { return n + sec.graficos.length; }, 0);
    var grupo = html("details", { "class": "nav-grupo" });
    var rotulo = html("summary", { "class": "nav-rotulo" });
    rotulo.appendChild(seta());
    rotulo.appendChild(html("span", { texto: dados.categoria }));
    rotulo.appendChild(html("span", { "class": "nav-conta", texto: total + " gráficos" }));
    grupo.appendChild(rotulo);

    dados.secoes.forEach(function (sec, k) {
      var sub = html("details", { "class": "nav-sub" });
      var subRotulo = html("summary", { "class": "nav-sub-rotulo" });
      subRotulo.appendChild(seta());
      subRotulo.appendChild(html("span", { texto: sec.titulo }));
      sub.appendChild(subRotulo);
      sec.graficos.forEach(function (g) {
        var a = html("a", { href: "#" + g.id, texto: rotuloNav(sec, g) });
        a.addEventListener("click", function (ev) { ev.preventDefault(); irPara(g.id); });
        sub.appendChild(a);
      });
      grupo.appendChild(sub);
    });
    host.appendChild(grupo);
  }

  // Link do menu para um gráfico dentro de categoria, seção ou cartão fechado:
  // abre tudo que estiver no caminho antes de rolar até lá.
  function irPara(id) {
    var alvo = document.getElementById(id);
    if (!alvo) return;
    for (var n = alvo; n; n = n.parentElement) if (n.tagName === "DETAILS") n.open = true;
    cartoes.forEach(function (c) { desenhar(c, false); });
    alvo.scrollIntoView({ block: "start" });
    try { history.replaceState(null, "", "#" + id); } catch (e) {}
  }

  function idCategoria(dados) { return "cat-" + slug(dados.categoria); }
  function slug(t) {
    return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function montarRodape(lista) {
    var rodape = document.getElementById("rodape");
    lista.forEach(function (dados) {
      var at = dados.atualizado.split("-"), ref = idxMes(dados.referencia);
      rodape.appendChild(html("p", { style: "margin:0 0 6px",
        texto: dados.categoria + " até " + rotuloMesLongo(ref).toLowerCase() +
               ", atualizado em " + at[2] + "/" + at[1] + "/" + at[0] + ". Fonte: " + dados.fonte + "." }));
    });
  }

  // Monta uma categoria inteira na página: categoria > seções > gráficos,
  // tudo fechado — a página inicial é o índice.
  function montarCategoria(dados, host) {
    var cat = html("details", { "class": "categoria", id: idCategoria(dados) });
    var rotulo = html("summary", { "class": "categoria-rotulo" });
    rotulo.appendChild(seta());
    rotulo.appendChild(html("span", { texto: dados.categoria }));
    cat.appendChild(rotulo);

    dados.secoes.forEach(function (sec, k) {
      var secao = html("details", { "class": "secao", id: "secao-" + slug(dados.categoria) + "-" + k });
      var rotuloSecao = html("summary", { "class": "secao-rotulo" });
      rotuloSecao.appendChild(seta());
      rotuloSecao.appendChild(html("span", { texto: sec.titulo }));
      secao.appendChild(rotuloSecao);

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
      cat.appendChild(secao);
    });
    host.appendChild(cat);
  }

  function iniciar() {
    var host = document.getElementById("graficos");
    var nav = document.getElementById("nav");
    var buscas = FONTES.map(function (url) {
      return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    });
    Promise.all(buscas.concat([carregarLogo()])).then(function (r) {
      docs = r.slice(0, FONTES.length).filter(Boolean);
      if (!docs.length) throw new Error("nenhum arquivo de dados foi carregado");
      host.innerHTML = "";
      docs.forEach(function (dados) {
        montarCategoria(dados, host);
        montarNav(dados, nav);
      });
      montarRodape(docs);
      cartoes.forEach(function (c) { desenhar(c, true); });
      if (location.hash.length > 1) irPara(location.hash.slice(1));
    }).catch(function (e) {
      host.innerHTML = "";
      host.appendChild(html("p", { "class": "estado erro", texto: "Não foi possível carregar os dados. " + e.message }));
    });

    document.getElementById("tema").addEventListener("click", alternarTema);
    telaCheiaDaPagina();
    var espera;
    window.addEventListener("resize", function () {
      clearTimeout(espera);
      espera = setTimeout(function () { cartoes.forEach(function (c) { desenhar(c, false); }); }, 120);
    });
  }

  iniciar();
})();
