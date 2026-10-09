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
  var FONTES = ["dados/moedas.json", "dados/ipca.json", "dados/fiscal.json",
                "dados/divida.json", "dados/tesouro-direto.json", "dados/juros.json",
                "dados/reservas.json"];
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
  function pct(v, casas) { return nf(casas === undefined ? 2 : casas).format(v) + "%"; }

  // Como cada gráfico escreve os seus números: no eixo (curto) e no valor
  // cheio (rótulo do último ponto e caixa do mouse). "%" é o padrão.
  // casas do eixo conforme o passo da grade: numa janela curta (7,0% a 9,5%) o
  // eixo sem decimal repetiria "7%, 8%, 8%, 9%"
  function casasDoPasso(p) {
    p = Math.abs(p || 1);
    return p >= 1 ? 0 : p >= 0.1 ? 1 : 2;
  }
  var UNIDADES = {
    "%": { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v) + "%"; },
           valor: function (v) { return pct(v, 2); } },
    bi: { eixo: function (v, passo) { return nf(casasDoPasso(passo)).format(v); },
          valor: function (v) { return "R$ " + nf(1).format(v) + " bi"; } },
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
    var g = graficoDe(cartao), pal = PALETAS[nomeTema], F = unidade(g);
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
    Object.keys(pilhaNeg).forEach(function (i) { mn = Math.min(mn, pilhaNeg[i]); });
    if (mn === Infinity) { mn = 0; mx = 1; }
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
    g.series.forEach(function (s, k) {
      if (s.tipo !== "barra") return;
      var cor = corNoTema(s.cor, pal);
      vis[k].forEach(function (p) {
        if (!p.v) return;
        var b = p.v >= 0 ? baseP : baseN, antes = b[p.i] || 0, depois = antes + p.v;
        b[p.i] = depois;
        var ya = yDe(s)(antes), yb = yDe(s)(depois);
        area.appendChild(el("rect", {
          x: X(p.i + 0.5) - bw / 2, y: Math.min(ya, yb), width: bw, height: Math.max(0.6, Math.abs(yb - ya)), fill: cor
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
      area.appendChild(el("path", {
        d: d, fill: "none", stroke: corNoTema(s.cor, pal), "stroke-width": w, opacity: op,
        "stroke-linejoin": "round", "stroke-linecap": s.traco ? "butt" : "round",
        "stroke-dasharray": s.traco === "pontilhado" ? (w * 1.2) + " " + (w * 1.6) : null
      }));
    });

    ordem.forEach(function (o) {
      var cor = corNoTema(o.r.s.cor, pal);
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

    return { svg: svg, L: L, pal: pal, X: X, Y: Y, yDe: yDe, fDe: fDe, d0: d0, d1: d1, vis: vis, esc: esc };
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
        : "Ligue “Desenhar” para anotar. Desligado, o gráfico mostra os valores do mês";
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
      ini = Math.min(ini, idxDe(g, s.dados[0][0]));
      fim = Math.max(fim, idxDe(g, s.dados[s.dados.length - 1][0]));
    });
    return { ini: ini, fim: fim };
  }
  function periodosDisponiveis(g) {
    if (g.categorias) return [];   // eixo de categorias não tem janela de tempo
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
        b.addEventListener("click", function () {
          cartao.variante = k;
          Array.prototype.forEach.call(grupoVar.children, function (x, j) {
            x.setAttribute("aria-pressed", String(j === k));
          });
          montarPeriodos();
          montarSelecao();
          desenhar(cartao, true);
        });
        grupoVar.appendChild(b);
      });
      esquerda.appendChild(grupoVar);
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
    // o arquivo leva toda série desenhada, inclusive a que serve de pano de
    // fundo (legenda: false): na tela ela é contexto, no CSV é dado
    var g = graficoDe(cartao), cols = g.series;
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
        (sec.graficos || []).forEach(function (g) {
          (g.variantes || [{ series: g.series }]).forEach(function (v) {
            (v.series || []).forEach(function (s) { if (s.imagem) caminhos[s.imagem] = 1; });
          });
        });
      });
    });
    return Promise.all(Object.keys(caminhos).map(function (url) {
      return fetch(url).then(function (r) {
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

  function contarGraficos(dados) {
    return dados.secoes.reduce(function (n, sec) { return n + sec.graficos.length; }, 0);
  }

  function montarNav(dados, host) {
    var total = contarGraficos(dados);
    var grupo = html("details", { "class": "nav-grupo", "data-cat": idCategoria(dados) });
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
        a.addEventListener("click", function (ev) {
          // Cmd/Ctrl/Shift/clique do meio: deixa o navegador abrir em outra aba
          if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
          ev.preventDefault();
          irPara(g.id);
        });
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
