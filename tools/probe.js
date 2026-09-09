/* Probe headless GENÉRICO — instancia o componente fora do navegador com um
 * shim mínimo de DOM. Não conhece as regras deste card/elemento: só garante
 * que o arquivo carrega, registra o custom element, aceita uma config mínima
 * e oferece editor. É o piso, não o teto — assim que houver comportamento que
 * dói perder (cor por estado, geometria, otimismo do toque), acrescente
 * verificações específicas aqui. Ver IA/lib/mw-devops/README.md.
 *
 * Roda no CI e antes de qualquer PR:  node tools/probe.js
 *
 * GERADO por IA/tools/mw-devops.sh na primeira aplicação; a partir daí é
 * SEU — o script nunca sobrescreve um probe existente.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const mkStyle = () => {
  const s = { _p: {} };
  s.setProperty = (k, v) => { s._p[k] = v; s[k] = v; };
  s.removeProperty = (k) => { delete s._p[k]; delete s[k]; };
  return s;
};

class Node {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.style = mkStyle();
    this.children = [];
    this.dataset = {};
    this._attrs = {};
    this._listeners = {};
  }
  appendChild(n) { this.children.push(n); return n; }
  append(...n) { n.forEach((x) => this.children.push(x)); }
  removeChild(n) { this.children = this.children.filter((c) => c !== n); }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  addEventListener(t, f) { (this._listeners[t] = this._listeners[t] || []).push(f); }
  removeEventListener() {}
  dispatchEvent() { return true; }
  emit(t, ev) { (this._listeners[t] || []).forEach((f) => f(ev)); }
  querySelector() { return new Node("div"); }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 100, height: 100, top: 0, left: 0 }; }
  attachInternals() { return {}; }
}

global.Node = Node;
global.HTMLElement = class extends Node {
  attachShadow() {
    this.shadowRoot = new Node("shadow-root");
    this.shadowRoot.adoptedStyleSheets = [];
    this.shadowRoot.innerHTML = "";
    return this.shadowRoot;
  }
};
const reg = {};
global.customElements = {
  define: (n, c) => { reg[n] = c; },
  get: (n) => reg[n],
  whenDefined: () => Promise.resolve(),
};
global.document = {
  createElement: (t) => new Node(t),
  createElementNS: (_ns, t) => new Node(t),
  head: new Node("head"),
  body: new Node("body"),
};
global.window = { customElements: global.customElements, matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }) };
global.CustomEvent = class { constructor(t, d) { this.type = t; Object.assign(this, d); } };
global.Event = global.CustomEvent;
global.CSSStyleSheet = class { replaceSync(css) { this.css = css; } };
global.requestAnimationFrame = (f) => setTimeout(f, 0);
global.cancelAnimationFrame = clearTimeout;
global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
console.info = () => {};

const root = path.join(__dirname, "..");
const asset = require(path.join(root, "hacs.json")).filename;
const src = fs.readFileSync(path.join(root, "dist", asset), "utf8");

let fails = 0;
const check = (label, cond, extra = "") => {
  if (cond) { console.log(`  ok   ${label}`); return true; }
  fails += 1;
  console.log(`  FAIL ${label}${extra ? " — " + extra : ""}`);
  return false;
};

console.log(`carga (${asset}):`);
let loaded = true;
try { eval(src); } catch (e) { loaded = false; console.log(`  FAIL o arquivo não carrega — ${e.message}`); fails += 1; }

if (loaded) {
  const names = Object.keys(reg);
  check("registra pelo menos um custom element", names.length > 0, names.join(", "));

  const main = names.filter((n) => !n.endsWith("-editor"))[0];
  const editor = names.filter((n) => n.endsWith("-editor"))[0];

  if (main) {
    console.log(`componente (${main}):`);
    let inst = null;
    try { inst = new reg[main](); } catch (e) { check("instancia", false, e.message); }
    if (inst) {
      check("instancia sem explodir", true);
      check("tem setConfig", typeof inst.setConfig === "function");
      check("recusa config vazia", (() => {
        try { inst.setConfig({}); return false; } catch (_) { return true; }
      })(), "setConfig({}) deveria lançar");
      check("oferece editor visual",
        typeof reg[main].getConfigElement === "function",
        "static getConfigElement() ausente");
    }
  }

  if (editor) {
    console.log(`editor (${editor}):`);
    try {
      const ed = new reg[editor]();
      check("editor instancia sem explodir", true);
      check("editor tem setConfig", typeof ed.setConfig === "function");
    } catch (e) { check("editor instancia", false, e.message); }
  } else {
    check("registra um *-editor", false, "sem editor o card não é configurável pela tela");
  }
}

console.log("versão:");
check(
  "banner/const de versão presente",
  /(%c\s*v?\d+\.\d+\.\d+|VERSION\s*=\s*["\']\d+\.\d+\.\d+["\'])/.test(src),
  "o auto-release precisa achar a versão para sincronizar"
);

/* ── verificações próprias do barômetro ──────────────────────────────────── */

// Os blocos canônicos são reavaliados sozinhos para poderem ser testados sem
// DOM — é o mesmo truque dos outros cards da casa.
const bloco = (marcador) => {
  const L = src.split("\n");
  const i = L.findIndex((l) => l.includes(">>> " + marcador));
  const f = L.findIndex((l) => l.includes("<<< " + marcador));
  return i >= 0 && f > i ? L.slice(i, f + 1).join("\n") : null;
};

const escalaSrc = bloco("mw-pressure-scale v1");
const zambrettiSrc = bloco("mw-zambretti v1");

check("o bloco mw-pressure-scale v1 está embutido", !!escalaSrc);
check("o bloco mw-zambretti v1 está embutido", !!zambrettiSrc);

if (escalaSrc && zambrettiSrc) {
  // As quebras de linha importam: o bloco termina em comentário `//`, e
  // concatenar sem "\n" comeria o `return` inteiro.
  const api = eval(
    "(() => {\n" +
      escalaSrc +
      "\n" +
      zambrettiSrc +
      "\nreturn { mwPressureToHpa, mwPressureToMsl, mwPressureTrend," +
      " mwPressureParecePressaoDeEstacao, mwZambretti," +
      " mwZambrettiCorrecaoVento, mwPressureLabel };\n})()"
  );

  console.log("escala de pressão:");
  check("1019,90 hPa cai em «variável»", api.mwPressureLabel(1019.9) === "variável");
  check(
    "unidade vem da entidade (mmHg vira hPa)",
    Math.abs(api.mwPressureToHpa(764.94, "mmHg") - 1019.9) < 0.5
  );
  check(
    "unidade desconhecida não é chutada",
    api.mwPressureToHpa(1000, "quilos") === null
  );
  check(
    "vazio não é zero",
    api.mwPressureToHpa("", "hPa") === null,
    "sensor sem leitura pintaria roxo de furacão"
  );
  check(
    "pressão de estação a 1200 m é denunciada",
    api.mwPressureParecePressaoDeEstacao(887.2, 1200) === true,
    "é o erro que deixa o ponteiro preso em «tempestade» para sempre"
  );
  check(
    "1019,9 hPa a 1200 m NÃO é confundido com pressão de estação",
    api.mwPressureParecePressaoDeEstacao(1019.9, 1200) === false
  );
  check(
    "887,2 hPa a 1200 m reduz para perto de 1019 hPa",
    Math.abs(api.mwPressureToMsl(887.2, 1200, 18.7) - 1019) < 4
  );

  console.log("tendência e Zambretti:");
  check(
    "menos de 1,6 hPa em 3 h ainda é «estável» (o corte do instrumento)",
    api.mwPressureTrend(-1.0).zambretti === "steady" &&
      api.mwPressureTrend(-1.6).zambretti === "falling"
  );
  check(
    "sem leitura anterior o ponteiro de memória some (não vai a zero)",
    api.mwPressureTrend(null) === null
  );
  check(
    "hemisfério SUL inverte a correção de vento",
    api.mwZambrettiCorrecaoVento(0, false) === 2 &&
      api.mwZambrettiCorrecaoVento(0, true) === 0,
    "é o ponto que quase toda implementação erra"
  );
  const bsb = api.mwZambretti(1019.9, "steady", 90, false);
  check("o caso real de Brasília sai confiável", bsb && bsb.confiavel === true);
  check("...e aponta para sol com nuvem", bsb && bsb.pictograma === "sol-nuvem");
  const fora = api.mwZambretti(1045, "steady", null, false);
  check(
    "fora da janela da tabela, a saída DIZ que não é confiável",
    fora && fora.confiavel === false && /fora da janela/.test(fora.motivo)
  );
  check(
    "sem direção de vento, a saída avisa que degradou",
    /sem direção de vento/.test(api.mwZambretti(1010, "steady", null, false).motivo)
  );
}

console.log("desenho:");
check(
  "a geometria é a do instrumento: 4,5° por hPa e 970 às 6 horas",
  /GRAUS_POR_HPA\s*=\s*4\.5/.test(src) && /ANGULO_MIN\s*=\s*180/.test(src)
);
check(
  "todo acabamento declara mostrador e tinta (nenhuma cor solta de tema)",
  /ACABAMENTOS\s*=\s*\{/.test(src) &&
    (src.match(/mostradorBorda:/g) || []).length >= 4,
  "cor cravada que só serve a um tema é defeito"
);
check(
  "anima só transform (a regra de animação da casa)",
  !/transition:\s*[^;]*\b(width|height|top|left|margin|background-position)\b/.test(src)
);
check(
  "sem laço de animação: o mostrador é SVG, não canvas",
  !/requestAnimationFrame/.test(src) && !/getContext\(/.test(src)
);
check(
  "tem rótulo acessível no mostrador",
  /aria-label=/.test(src) && /role="img"/.test(src)
);

console.log(fails ? `\n${fails} FALHA(S)` : "\ntudo verde");
process.exit(fails ? 1 : 0);
