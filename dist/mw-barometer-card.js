/* mw-ha-barometer-card — custom:mw-barometer-card
 *
 * Um barômetro aneroide de verdade na tela: aro de latão, mostrador creme,
 * escala em hPa com a de mmHg por dentro, dois ponteiros e os pictogramas de
 * chuva, variável e sol — o instrumento que o dono já tem no celular.
 *
 * O QUE ELE FAZ QUE UM MOSTRADOR BONITO NÃO FAZ
 * ─────────────────────────────────────────────
 * 1. O ponteiro dourado é MEMÓRIA. No instrumento de parede ele se acerta à
 *    mão para marcar "onde estava". Aqui ele vai sozinho para a pressão de 3 h
 *    atrás, e o vão entre os dois ponteiros É a tendência, lida de relance.
 * 2. Os pictogramas não são decoração: a previsão sai do algoritmo Zambretti
 *    (Negretti & Zambra, 1915) — pressão + tendência + vento — com a correção
 *    de vento ESPELHADA para o hemisfério sul, que é o ponto que quase toda
 *    implementação erra.
 * 3. Pressão é AO NÍVEL DO MAR. Esta casa está a 1200 m, onde a pressão de
 *    estação é ~887 hPa: alimentar o mostrador com ela deixaria o ponteiro
 *    preso em "tempestade" para sempre, sem erro nenhum no log. O card detecta
 *    e AVISA em vez de desenhar errado.
 *
 * DESENHO: SVG, não canvas. O mostrador é geometria estática; só os dois
 * ponteiros se movem, e movem por `transform: rotate()`. Sem laço de animação,
 * sem devicePixelRatio, nítido em qualquer tela.
 *
 * Repo: https://github.com/visaodeempresa/mw-ha-barometer-card
 * Releases automáticas: merge na main → bump semântico → tag → HACS.
 */
(() => {
  "use strict";
  const VERSION = "0.1.0";

  // >>> mw-pressure-scale v1 — fonte canônica: /Volumes/SSD-T1-01/CLAUDE-SSD/IA/lib/mw-pressure-scale/mw-pressure-scale.js
  // Escala canônica de pressão atmosférica (hPa ao nível do mar) + tendência.
  // Doc: IA/knowledge/ha-pressao-msl-vs-estacao.md.
  const MW_PRESSURE_ALPHA = 0.5;

  // Limites SUPERIORES inclusivos, em hPa MSL. Seis faixas.
  // Os cortes são os do mostrador de barômetro aneroide clássico, que é o que
  // o morador já sabe ler: abaixo de 1000 chove, perto de 1013 (a atmosfera
  // padrão) é variável, acima de 1020 firma.
  const MW_PRESSURE_STOPS = [980, 1000, 1010, 1020, 1030];
  const MW_PRESSURE_RGB = [
    "106, 27, 154",   // <=980   — tempestade / ciclone
    "40, 90, 180",    // <=1000  — chuva
    "70, 140, 175",   // <=1010  — instável
    "120, 144, 156",  // <=1020  — variável (1013,25 = atmosfera padrão)
    "205, 173, 76",   // <=1030  — firme
    "230, 145, 40",   // >1030   — muito firme, ar seco
  ];
  const MW_PRESSURE_LABELS = [
    "tempestade",
    "chuva",
    "instável",
    "variável",
    "firme",
    "muito firme",
  ];

  // Janela de PLAUSIBILIDADE para pressão MSL: os extremos já observados no
  // planeta (870 hPa no olho do tufão Tip, 1084 hPa em Agata, Sibéria). Fora
  // dela é sensor com defeito ou unidade errada, e o consumidor TEM de tratar
  // `null` como "fora de escala" e avisar — nunca grudar o ponteiro no
  // batente, que é mentir com desenho.
  const MW_PRESSURE_PLAUSIVEL = [870, 1085];

  // ATENÇÃO: a janela acima NÃO pega o erro mais comum desta casa. Pressão de
  // ESTAÇÃO a 1200 m (887,2 hPa, medido em 2026-09-09) cabe dentro dela e
  // pintaria "tempestade" para sempre. Só a altitude denuncia. Fórmula
  // barométrica padrão (ISA), a mesma da conversão inversa.
  const mwPressureEsperadaNaAltitude = (alt) => {
    const h = Number(alt);
    if (!Number.isFinite(h)) return null;
    return 1013.25 * Math.pow(1 - 2.25577e-5 * h, 5.25588);
  };

  // Verdadeiro quando o número cheira a pressão de estação em vez de MSL: a
  // casa está alta o bastante para a diferença importar E o valor está na
  // vizinhança do que a altitude prevê. ±25 hPa cobre a variação real do
  // tempo (a medição de 2026-09-09 deu 887,2 contra 877,2 previstos pela ISA).
  const mwPressureParecePressaoDeEstacao = (hpa, alt, tolerancia) => {
    const v = Number(hpa);
    const h = Number(alt);
    if (!Number.isFinite(v) || !Number.isFinite(h) || h < 200) return false;
    const esperada = mwPressureEsperadaNaAltitude(h);
    return Math.abs(v - esperada) <= (Number.isFinite(Number(tolerancia)) ? Number(tolerancia) : 25);
  };

  // Conversão pela unidade DA ENTIDADE, nunca chutada. hPa e mbar são a mesma
  // coisa; kPa aparece em sensor chinês; inHg em fonte americana; mmHg no
  // mostrador interno do barômetro da foto.
  const MW_PRESSURE_PARA_HPA = {
    hpa: 1, hPa: 1, mbar: 1, mb: 1, millibar: 1,
    kpa: 10, kPa: 10,
    pa: 0.01, Pa: 0.01,
    psi: 68.9476,
    inhg: 33.8639, inHg: 33.8639, "in": 33.8639, '"hg': 33.8639,
    mmhg: 1.33322, mmHg: 1.33322, torr: 1.33322,
  };

  const mwPressureRgba = (triplet, alpha) =>
    `rgba(${triplet}, ${alpha === undefined || alpha === null ? MW_PRESSURE_ALPHA : alpha})`;

  // Vazio/nulo NÃO é zero (a mesma guarda de mw-level-scale, pelo mesmo motivo:
  // Number("") é 0, e 0 hPa pintaria roxo de furacão).
  const mwPressureNum = (value) => {
    if (value === null || value === undefined || value === "") return null;
    const v = Number(value);
    return Number.isFinite(v) ? v : null;
  };

  // Normaliza qualquer unidade para hPa. `unit` vem de
  // attributes.unit_of_measurement — se vier vazia, assume hPa e o consumidor
  // deve dizer que assumiu.
  const mwPressureToHpa = (value, unit) => {
    const v = mwPressureNum(value);
    if (v === null) return null;
    const u = String(unit || "hPa").trim();
    const f = MW_PRESSURE_PARA_HPA[u] ?? MW_PRESSURE_PARA_HPA[u.toLowerCase()];
    return f === undefined ? null : v * f;
  };

  // Barometria: reduz a pressão da estação ao nível do mar. `alt` em metros,
  // `tempC` a temperatura do ar (se faltar, 15 °C da atmosfera padrão — o erro
  // por 10 °C de engano é ~0,4 % da altitude, aceitável e declarado).
  const mwPressureToMsl = (hpaEstacao, alt, tempC) => {
    const p = mwPressureNum(hpaEstacao);
    const h = mwPressureNum(alt);
    if (p === null || h === null) return null;
    const t = mwPressureNum(tempC);
    const tk = (t === null ? 15 : t) + 273.15;
    return p * Math.pow(1 - (0.0065 * h) / (tk + 0.0065 * h), -5.257);
  };

  // Mesma forma de mwClimateScale/mwLevelScale: um caminho de pintura só.
  const mwPressureScale = (alpha) => ({
    stops: MW_PRESSURE_STOPS.slice(),
    colors: MW_PRESSURE_RGB.map((c) => mwPressureRgba(c, alpha)),
    clamp: null,
  });

  // Devolve null fora da janela plausível — de propósito (ver acima).
  const mwPressureIndex = (hpa) => {
    const v = mwPressureNum(hpa);
    if (v === null) return null;
    if (v < MW_PRESSURE_PLAUSIVEL[0] || v > MW_PRESSURE_PLAUSIVEL[1]) return null;
    const i = MW_PRESSURE_STOPS.findIndex((stop) => v <= stop);
    return i === -1 ? MW_PRESSURE_STOPS.length : i;
  };

  const mwPressureColor = (hpa, alpha) => {
    const i = mwPressureIndex(hpa);
    return i === null ? null : mwPressureRgba(MW_PRESSURE_RGB[i], alpha);
  };

  const mwPressureLabel = (hpa) => {
    const i = mwPressureIndex(hpa);
    return i === null ? null : MW_PRESSURE_LABELS[i];
  };

  // --- TENDÊNCIA ---------------------------------------------------------
  // Variação em 3 h, em hPa. O corte de 1,6 hPa/3 h é o do próprio Zambretti
  // (é o que separa "subindo" de "estável"); os degraus mais finos existem
  // para o texto na tela, não para a previsão.
  const MW_PRESSURE_TREND_STOPS = [0.5, 1.6, 3.5];
  const MW_PRESSURE_TREND = {
    estavel:   { label: "estável",           seta: "→", zambretti: "steady" },
    lenta:     { label: "mudando devagar",   seta: null, zambretti: "steady" },
    moderada:  { label: "mudando",           seta: null, zambretti: null },
    rapida:    { label: "mudando rápido",    seta: null, zambretti: null },
  };

  // Devolve {classe, label, seta, delta, zambretti} — `zambretti` é
  // "rising" | "steady" | "falling", já com o corte de 1,6 hPa aplicado.
  const mwPressureTrend = (delta3h) => {
    const d = mwPressureNum(delta3h);
    if (d === null) return null;
    const a = Math.abs(d);
    const subindo = d > 0;
    const classe = a <= MW_PRESSURE_TREND_STOPS[0] ? "estavel"
      : a <= MW_PRESSURE_TREND_STOPS[1] ? "lenta"
      : a <= MW_PRESSURE_TREND_STOPS[2] ? "moderada" : "rapida";
    const base = MW_PRESSURE_TREND[classe];
    const seta = classe === "estavel" ? "→"
      : classe === "rapida" ? (subindo ? "⇈" : "⇊") : (subindo ? "↑" : "↓");
    const label = classe === "estavel" ? "estável"
      : `${base.label} ${subindo ? "para cima" : "para baixo"}`;
    return {
      classe,
      label,
      seta,
      delta: d,
      zambretti: a < 1.6 ? "steady" : (subindo ? "rising" : "falling"),
    };
  };
  // <<< mw-pressure-scale v1

  // >>> mw-zambretti v1 — fonte canônica: /Volumes/SSD-T1-01/CLAUDE-SSD/IA/lib/mw-zambretti/mw-zambretti.js
  // Previsor Zambretti (Negretti & Zambra, 1915) em pt-BR, com hemisfério sul.
  // Doc: IA/knowledge/ha-pressao-msl-vs-estacao.md.

  // As 32 posições das três tabelas (26 frases distintas; algumas se repetem
  // entre tabelas, como no instrumento original). Índice 0 não existe.
  const MW_ZAMBRETTI_TEXTOS = [
    null,
    // --- caindo (1..9) ---
    "Tempo firme",
    "Bom tempo",
    "Bom, ficando menos firme",
    "Razoável, pancadas mais tarde",
    "Pancadas, tempo se fechando",
    "Instável, chuva mais tarde",
    "Chuva por períodos, piorando",
    "Chuva por períodos, ficando muito instável",
    "Muito instável, com chuva",
    // --- estável (10..19) ---
    "Tempo firme",
    "Bom tempo",
    "Bom, possibilidade de pancadas",
    "Razoável, pancadas prováveis",
    "Pancadas com aberturas de sol",
    "Variável, com alguma chuva",
    "Instável, chuva por períodos",
    "Chuva frequente",
    "Muito instável, com chuva",
    "Tempestuoso, muita chuva",
    // --- subindo (20..32) ---
    "Tempo firme",
    "Bom tempo",
    "Melhorando",
    "Razoável, melhorando",
    "Razoável, pancadas no início",
    "Pancadas no início, melhorando",
    "Variável, em recuperação",
    "Bem instável, abrindo mais tarde",
    "Instável, provável melhora",
    "Instável, com breves aberturas",
    "Muito instável, com melhoras passageiras",
    "Tempestuoso, possível melhora",
    "Tempestuoso, muita chuva",
  ];

  // Pictograma do mostrador: é o desenho para onde o ponteiro "aponta".
  // sol · sol-nuvem · nuvem · chuva · tempestade
  const MW_ZAMBRETTI_PICTOGRAMAS = [
    null,
    "sol", "sol", "sol-nuvem", "sol-nuvem", "nuvem", "nuvem", "chuva", "chuva", "chuva",
    "sol", "sol", "sol-nuvem", "sol-nuvem", "nuvem", "nuvem", "chuva", "chuva", "chuva", "tempestade",
    "sol", "sol", "sol-nuvem", "sol-nuvem", "sol-nuvem", "nuvem", "nuvem",
    "chuva", "chuva", "chuva", "chuva", "tempestade", "tempestade",
  ];

  // Fórmula, janela de validade e faixa de índice de cada tendência.
  const MW_ZAMBRETTI_TABELAS = {
    falling: { a: 127, b: 0.12, min: 985, max: 1050, lo: 1,  hi: 9  },
    steady:  { a: 144, b: 0.13, min: 960, max: 1033, lo: 10, hi: 19 },
    rising:  { a: 185, b: 0.16, min: 947, max: 1030, lo: 20, hi: 32 },
  };

  // Correção de vento do instrumento, pela direção DE ONDE o vento vem (é o que
  // `wind_bearing` do Home Assistant traz). Sul quente e úmido piora em 2;
  // leste/oeste em 1; norte não mexe. No hemisfério sul, espelha-se 180° antes.
  const mwZambrettiCorrecaoVento = (bearing, hemisferioNorte) => {
    const b = Number(bearing);
    if (!Number.isFinite(b)) return 0;
    let d = ((b % 360) + 360) % 360;
    if (hemisferioNorte === false) d = (d + 180) % 360;
    if (d >= 135 && d <= 225) return 2;   // do sul (equador, no norte)
    if (d >= 315 || d <= 45) return 0;    // do norte (polo, no norte)
    return 1;                             // de leste ou oeste
  };

  /* Entrada:
   *   hpa              pressão AO NÍVEL DO MAR, em hPa (converta antes!)
   *   tendencia        "rising" | "steady" | "falling"
   *   windBearing      graus de onde o vento vem (opcional)
   *   hemisferioNorte  true/false (padrão: true, como o instrumento original)
   * Saída: { z, texto, pictograma, tendencia, confiavel, motivo, vento }
   *   confiavel=false quando a pressão está fora da janela da tabela ou quando
   *   o índice precisou ser preso na ponta — o consumidor DEVE mostrar isso.
   */
  const mwZambretti = (hpa, tendencia, windBearing, hemisferioNorte) => {
    // Vazio/nulo NÃO é zero: Number("") e Number(null) devolvem 0, e 0 hPa
    // atravessaria a conta inteira produzindo uma previsão de tempestade
    // inventada a partir de sensor sem leitura. Mesma guarda de
    // mw-pressure-scale, pelo mesmo motivo.
    if (hpa === null || hpa === undefined || hpa === "") return null;
    const p = Number(hpa);
    const t = MW_ZAMBRETTI_TABELAS[tendencia];
    if (!Number.isFinite(p) || !t) return null;

    const motivos = [];
    if (p < t.min || p > t.max) {
      motivos.push(`pressão ${p.toFixed(1)} hPa fora da janela ${t.min}–${t.max} desta tendência`);
    }
    const vento = mwZambrettiCorrecaoVento(windBearing, hemisferioNorte);
    if (windBearing === undefined || windBearing === null || windBearing === "") {
      motivos.push("sem direção de vento: previsão sem a correção do instrumento");
    }

    const bruto = Math.round(t.a - t.b * p) + vento;
    const z = Math.min(Math.max(bruto, t.lo), t.hi);
    if (z !== bruto) motivos.push(`índice ${bruto} preso em ${z} (a tabela vai de ${t.lo} a ${t.hi})`);

    return {
      z,
      texto: MW_ZAMBRETTI_TEXTOS[z],
      pictograma: MW_ZAMBRETTI_PICTOGRAMAS[z],
      tendencia,
      vento,
      confiavel: motivos.length === 0,
      motivo: motivos.length ? motivos.join("; ") : null,
    };
  };
  // <<< mw-zambretti v1

  // ── geometria do mostrador ────────────────────────────────────────────────
  // Fiel ao instrumento da foto: 970 hPa às 6 horas, 990 às 9, 1010 no topo,
  // 1030 às 3 e 1040 embaixo à direita. São 4,5° por hPa, varredura de 315°,
  // com a boca de 45° embaixo — o único lugar onde um mostrador pode ter boca
  // sem confundir a leitura.
  const P_MIN = 970;
  const P_MAX = 1040;
  const GRAUS_POR_HPA = 4.5;
  const ANGULO_MIN = 180; // graus de relógio (0 = 12 h, sentido horário)

  const anguloDe = (hpa) => ANGULO_MIN + (hpa - P_MIN) * GRAUS_POR_HPA;
  const naEscala = (hpa) => hpa >= P_MIN && hpa <= P_MAX;

  // Polar → cartesiano no sistema do SVG (y cresce para baixo), já no sentido
  // do relógio a partir das 12 h.
  const ponto = (cx, cy, raio, grausRelogio) => {
    const rad = ((grausRelogio - 90) * Math.PI) / 180;
    return [cx + raio * Math.cos(rad), cy + raio * Math.sin(rad)];
  };

  const MMHG_POR_HPA = 0.750062;

  // Rótulo do mostrador acompanha a inclinação da marca — mas NUNCA de cabeça
  // para baixo. Um mostrador que sweep 315° passa pela metade de baixo, e
  // rotacionar cegamente escreve «0Z6» onde deveria estar «970».
  const legivel = (grausRelogio) => {
    const g = ((grausRelogio % 360) + 360) % 360;
    return g > 90 && g < 270 ? g + 180 : g;
  };

  // ── acabamentos ───────────────────────────────────────────────────────────
  // Cada acabamento declara as DUAS tintas (clara e escura). Cor cravada que
  // só funciona num tema é defeito pelo inspetor de design, e um aro dourado é
  // exatamente o tipo de coisa que nasce cravada.
  const ACABAMENTOS = {
    latao: {
      rotulo: "Latão",
      aro: ["#6b4d14", "#f6e3a1", "#b98c27", "#8a6418", "#e8d089"],
      mostrador: "#f3ecd8",
      mostradorBorda: "#ddd2b4",
      tinta: "#2a2620",
      tintaFraca: "#7c7264",
      ponteiro: "#171512",
      referencia: "#c99b2e",
      hub: "#c9a227",
      fundo: "var(--card-background-color, #fff)",
    },
    "latao-noite": {
      rotulo: "Latão noturno",
      aro: ["#4a3510", "#d8bf7a", "#9a742a", "#5f4614", "#c2a86a"],
      mostrador: "#26262a",
      mostradorBorda: "#3a3a40",
      tinta: "#ece7dc",
      tintaFraca: "#9a9489",
      ponteiro: "#f2efe8",
      referencia: "#e0b64a",
      hub: "#c9a227",
      fundo: "var(--card-background-color, #1c1c1e)",
    },
    aco: {
      rotulo: "Aço escovado",
      aro: ["#5c6166", "#e6eaee", "#9aa2a9", "#6f767c", "#c9d1d8"],
      mostrador: "#fbfbfc",
      mostradorBorda: "#dfe3e7",
      tinta: "#1e2226",
      tintaFraca: "#79818a",
      ponteiro: "#12161a",
      referencia: "#3f7fbf",
      hub: "#8c959c",
      fundo: "var(--card-background-color, #fff)",
    },
    papel: {
      rotulo: "Papel MW",
      aro: ["#b3a179", "#efe6d2", "#cdbf9f", "#a89877", "#e3d7bb"],
      mostrador: "#f7f1e3",
      mostradorBorda: "#e0d5bd",
      tinta: "#332f28",
      tintaFraca: "#877f70",
      ponteiro: "#241f19",
      referencia: "#a9812c",
      hub: "#b59a5a",
      fundo: "var(--ha-card-background, var(--card-background-color, #fff))",
    },
  };

  const DEFAULTS = {
    acabamento: "latao",
    tamanho: "medio",
    mostrar_tira: true,
    mostrar_mmhg: true,
    mostrar_pictogramas: true,
    mostrar_previsao: true,
    ponteiro_referencia: "3h",
    hemisferio: "auto",
    unidade_pressao: "hPa",
  };

  const LABELS = {
    entity: "Sensor de pressão",
    temperatura_entity: "Sensor de temperatura",
    umidade_entity: "Sensor de umidade",
    vento_entity: "Direção do vento (para o Zambretti)",
    referencia_entity: "Pressão de referência (opcional)",
    name: "Título",
    acabamento: "Acabamento",
    tamanho: "Tamanho",
    mostrar_tira: "Mostrar a tira de leitura",
    mostrar_mmhg: "Mostrar a escala em mmHg",
    mostrar_pictogramas: "Mostrar os pictogramas de tempo",
    mostrar_previsao: "Mostrar a previsão do Zambretti",
    ponteiro_referencia: "Ponteiro dourado (memória)",
    hemisferio: "Hemisfério",
    altitude: "Altitude do local (m)",
    unidade_pressao: "Unidade exibida",
  };

  const TAMANHOS = { compacto: 180, medio: 260, grande: 340 };

  const PICTOGRAMAS = {
    chuva: 985,
    "sol-nuvem": 1013,
    sol: 1032,
  };

  // ── desenho ───────────────────────────────────────────────────────────────
  const svgPictograma = (tipo, x, y, escala, cor) => {
    const s = escala;
    const g = (d, extra = "") =>
      `<path d="${d}" fill="none" stroke="${cor}" stroke-width="${1.6 * s}" ` +
      `stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
    const nuvem =
      `M ${-9 * s} ${2 * s} a ${4 * s} ${4 * s} 0 0 1 ${1 * s} ${-7.6 * s} ` +
      `a ${5.4 * s} ${5.4 * s} 0 0 1 ${10 * s} ${-1.2 * s} ` +
      `a ${3.6 * s} ${3.6 * s} 0 0 1 ${1.4 * s} ${7 * s} z`;
    if (tipo === "chuva") {
      return (
        `<g transform="translate(${x} ${y})">${g(nuvem)}` +
        [0, 4, 8]
          .map((dx) => g(`M ${(-6 + dx) * s} ${4.5 * s} l ${-1.6 * s} ${4.4 * s}`))
          .join("") +
        `</g>`
      );
    }
    if (tipo === "sol") {
      const raios = Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return g(
          `M ${Math.cos(a) * 6.4 * s} ${Math.sin(a) * 6.4 * s} ` +
            `L ${Math.cos(a) * 9.4 * s} ${Math.sin(a) * 9.4 * s}`
        );
      }).join("");
      return (
        `<g transform="translate(${x} ${y})">` +
        `<circle r="${4.4 * s}" fill="none" stroke="${cor}" stroke-width="${1.6 * s}"/>` +
        raios +
        `</g>`
      );
    }
    // sol atrás da nuvem
    return (
      `<g transform="translate(${x} ${y})">` +
      `<circle cx="${5 * s}" cy="${-5 * s}" r="${3.4 * s}" fill="none" ` +
      `stroke="${cor}" stroke-width="${1.4 * s}"/>` +
      Array.from({ length: 6 }, (_, i) => {
        const a = (i * Math.PI) / 3;
        return g(
          `M ${5 * s + Math.cos(a) * 5 * s} ${-5 * s + Math.sin(a) * 5 * s} ` +
            `L ${5 * s + Math.cos(a) * 7.2 * s} ${-5 * s + Math.sin(a) * 7.2 * s}`
        );
      }).join("") +
      g(nuvem) +
      `</g>`
    );
  };

  const desenharMostrador = (cfg, tinta) => {
    const R = 100;
    const cx = 0;
    const cy = 0;
    const t = tinta;
    const partes = [];

    // marcas de hPa: maiores a cada 10, médias a cada 5, finas a cada 1
    for (let p = P_MIN; p <= P_MAX; p += 2) {
      const a = anguloDe(p);
      const grande = p % 10 === 0;
      const media = !grande && p % 5 === 0;
      const r1 = grande ? 78 : media ? 82 : 84;
      const [x1, y1] = ponto(cx, cy, r1, a);
      const [x2, y2] = ponto(cx, cy, 88, a);
      partes.push(
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" ` +
          `y2="${y2.toFixed(2)}" stroke="${grande ? t.tinta : t.tintaFraca}" ` +
          `stroke-width="${grande ? 2 : media ? 1.2 : 0.7}" stroke-linecap="round"/>`
      );
      if (grande) {
        const [tx, ty] = ponto(cx, cy, 71, a);
        partes.push(
          `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" fill="${t.tinta}" ` +
            `font-size="11" font-weight="600" text-anchor="middle" ` +
            `dominant-baseline="central" transform="rotate(${legivel(a)} ` +
            `${tx.toFixed(2)} ${ty.toFixed(2)})">${p}</text>`
        );
      }
    }

    // escala interna em mmHg
    if (cfg.mostrar_mmhg) {
      for (let mm = 730; mm <= 780; mm += 2) {
        const hpa = mm / MMHG_POR_HPA;
        if (!naEscala(hpa)) continue;
        const a = anguloDe(hpa);
        const grande = mm % 10 === 0;
        const [x1, y1] = ponto(cx, cy, grande ? 58 : 60, a);
        const [x2, y2] = ponto(cx, cy, 63, a);
        partes.push(
          `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" ` +
            `y2="${y2.toFixed(2)}" stroke="${t.tintaFraca}" ` +
            `stroke-width="${grande ? 1.4 : 0.6}" stroke-linecap="round"/>`
        );
        if (grande) {
          const [tx, ty] = ponto(cx, cy, 51, a);
          partes.push(
            `<text x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" fill="${t.tintaFraca}" ` +
              `font-size="7.5" text-anchor="middle" dominant-baseline="central" ` +
              `transform="rotate(${legivel(a)} ${tx.toFixed(2)} ` +
              `${ty.toFixed(2)})">${mm}</text>`
          );
        }
      }
      const [ux, uy] = ponto(cx, cy, 47, ANGULO_MIN - 22.5);
      partes.push(
        `<text x="${ux.toFixed(2)}" y="${uy.toFixed(2)}" fill="${t.tintaFraca}" ` +
          `font-size="7" text-anchor="middle" dominant-baseline="central">mmHg</text>`
      );
    }

    if (cfg.mostrar_pictogramas) {
      for (const [tipo, hpa] of Object.entries(PICTOGRAMAS)) {
        const [px, py] = ponto(cx, cy, 33, anguloDe(hpa));
        partes.push(svgPictograma(tipo, px, py, 0.9, t.tintaFraca));
      }
    }

    // a legenda da unidade, onde o instrumento da foto a põe: na boca de baixo
    const [lx, ly] = ponto(cx, cy, 66, ANGULO_MIN - 22.5);
    partes.push(
      `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" fill="${t.tinta}" ` +
        `font-size="9" font-weight="700" text-anchor="middle" ` +
        `dominant-baseline="central">hPa</text>`
    );
    return partes.join("");
  };

  const ESTILO = `
    :host { display: block; }
    ha-card { padding: 12px; display: flex; flex-direction: column; gap: 8px;
              align-items: center; }
    .tira { display: flex; align-items: baseline; gap: 14px; width: 100%;
            justify-content: center; flex-wrap: wrap; }
    .leitura { display: inline-flex; align-items: baseline; gap: 4px;
               font-size: 13px; color: var(--secondary-text-color); }
    .leitura b { font-size: 15px; color: var(--primary-text-color);
                 font-weight: 600; }
    .principal { font-size: 26px; font-weight: 700; letter-spacing: -0.5px;
                 font-variant-numeric: tabular-nums; }
    .unidade { font-size: 12px; font-weight: 600; opacity: .7; margin-left: 2px; }
    .seta { font-size: 18px; margin-left: 2px; }
    .mostrador { width: 100%; max-width: var(--mw-baro-tamanho, 260px);
                 aspect-ratio: 1 / 1; }
    .agulha, .memoria { transition: transform .9s cubic-bezier(.22,.61,.36,1); }
    @media (prefers-reduced-motion: reduce) {
      .agulha, .memoria { transition: none; }
    }
    .previsao { text-align: center; font-size: 13px; line-height: 1.35;
                color: var(--primary-text-color); }
    .previsao small { display: block; color: var(--secondary-text-color);
                      font-size: 11px; margin-top: 2px; }
    .aviso { display: flex; gap: 6px; align-items: flex-start; width: 100%;
             font-size: 12px; line-height: 1.35; padding: 6px 8px;
             border-radius: 8px; background: rgba(219, 68, 55, .12);
             color: var(--primary-text-color);
             border-left: 3px solid var(--error-color, #db4437); }
    .vazio { padding: 22px 8px; text-align: center; font-size: 13px;
             color: var(--secondary-text-color); }
    button.face { all: unset; cursor: pointer; display: block; width: 100%;
                  border-radius: 50%; }
    button.face:focus-visible { outline: 2px solid var(--primary-color);
                                outline-offset: 3px; }
  `;

  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const fmt = (v, casas) =>
    v === null || v === undefined
      ? "—"
      : Number(v).toFixed(casas).replace(".", ",");

  class BarometerCard extends HTMLElement {
    setConfig(config) {
      if (!config || !config.entity) {
        throw new Error("Informe `entity`: o sensor de pressão.");
      }
      if (config.acabamento && !ACABAMENTOS[config.acabamento]) {
        throw new Error(
          `acabamento desconhecido: ${config.acabamento}. ` +
            `Use um de: ${Object.keys(ACABAMENTOS).join(", ")}.`
        );
      }
      this._config = { ...DEFAULTS, ...config };
      this._estatico = null; // força redesenhar o mostrador
      this._chave = null;
      if (this._hass) this._atualizar();
    }

    set hass(hass) {
      this._hass = hass;
      this._atualizar();
    }

    getCardSize() {
      return this._config && this._config.tamanho === "compacto" ? 3 : 5;
    }

    static getConfigElement() {
      return document.createElement("mw-barometer-card-editor");
    }

    static getStubConfig(hass) {
      const candidato = Object.keys(hass && hass.states ? hass.states : {}).find(
        (id) =>
          id.startsWith("sensor.") &&
          hass.states[id].attributes.device_class === "atmospheric_pressure"
      );
      return { type: "custom:mw-barometer-card", entity: candidato || "" };
    }

    // ── leitura ─────────────────────────────────────────────────────────────
    _ler() {
      const h = this._hass;
      const c = this._config;
      const st = h && h.states[c.entity];
      if (!st) return { erro: `Entidade não encontrada: ${c.entity}` };

      // A unidade vem DA ENTIDADE, nunca do palpite do card.
      const unidade = st.attributes.unit_of_measurement;
      const hpa = mwPressureToHpa(st.state, unidade);
      if (hpa === null) {
        return {
          erro: unidade
            ? `Não sei converter «${unidade}» para hPa.`
            : "Sem leitura de pressão.",
        };
      }

      const altitude = num(c.altitude) ?? num(h.config && h.config.elevation) ?? 0;
      const deEstacao = mwPressureParecePressaoDeEstacao(hpa, altitude);

      // Referência: entidade própria, atributo do sensor (é o que a integração
      // MW Letícia Weather publica) ou nada. Sem referência, o ponteiro dourado
      // fica OCULTO — nunca em zero, que seria desenhar um dado inexistente.
      let referencia = null;
      if (c.ponteiro_referencia !== "off") {
        if (c.referencia_entity && h.states[c.referencia_entity]) {
          const rst = h.states[c.referencia_entity];
          referencia = mwPressureToHpa(
            rst.state,
            rst.attributes.unit_of_measurement
          );
        } else {
          const attr =
            c.ponteiro_referencia === "24h"
              ? st.attributes.pressao_24h_atras
              : st.attributes.pressao_3h_atras;
          referencia = mwPressureToHpa(attr, unidade);
        }
      }

      const temperatura = c.temperatura_entity
        ? num((h.states[c.temperatura_entity] || {}).state)
        : null;
      const umidade = c.umidade_entity
        ? num((h.states[c.umidade_entity] || {}).state)
        : null;

      let direcao = null;
      if (c.vento_entity && h.states[c.vento_entity]) {
        const v = h.states[c.vento_entity];
        direcao = num(v.state) ?? num(v.attributes.wind_bearing);
      } else if (st.attributes.direcao !== undefined) {
        direcao = num(st.attributes.direcao);
      }

      const delta =
        referencia !== null ? hpa - referencia : num(st.attributes.variacao_3h);
      const tendencia = mwPressureTrend(delta);

      const hemisferio =
        c.hemisferio === "norte"
          ? true
          : c.hemisferio === "sul"
            ? false
            : num(h.config && h.config.latitude) === null
              ? true
              : h.config.latitude >= 0;

      const previsao = tendencia
        ? mwZambretti(hpa, tendencia.zambretti, direcao, hemisferio)
        : null;

      return {
        hpa,
        unidade,
        deEstacao,
        altitude,
        referencia,
        tendencia,
        previsao,
        temperatura,
        umidade,
        direcao,
        hemisferio,
        forade: !naEscala(hpa),
      };
    }

    // ── render ──────────────────────────────────────────────────────────────
    _atualizar() {
      if (!this._config || !this._hass) return;
      const d = this._ler();
      // Chave de render: o mostrador só se redesenha quando algo que ele
      // desenha mudou. É o que segura o custo por quadro perto de zero.
      const chave = JSON.stringify([
        d.erro || null,
        d.hpa === undefined ? null : Math.round(d.hpa * 10),
        d.referencia === null || d.referencia === undefined
          ? null
          : Math.round(d.referencia * 10),
        d.temperatura,
        d.umidade,
        d.previsao ? d.previsao.z : null,
        this._config.acabamento,
        this._config.tamanho,
      ]);
      if (chave === this._chave) return;
      this._chave = chave;
      this._render(d);
    }

    _render(d) {
      if (!this.shadowRoot) this.attachShadow({ mode: "open" });
      const c = this._config;
      const t = ACABAMENTOS[c.acabamento] || ACABAMENTOS.latao;

      if (d.erro) {
        this.shadowRoot.innerHTML =
          `<style>${ESTILO}</style><ha-card><div class="vazio">${d.erro}</div></ha-card>`;
        return;
      }

      const preso = Math.min(Math.max(d.hpa, P_MIN), P_MAX);
      const anguloAgulha = anguloDe(preso);
      const anguloMemoria =
        d.referencia === null || d.referencia === undefined
          ? null
          : anguloDe(Math.min(Math.max(d.referencia, P_MIN), P_MAX));

      const exibido =
        c.unidade_pressao === "mmHg" ? d.hpa * MMHG_POR_HPA : d.hpa;
      const casas = c.unidade_pressao === "mmHg" ? 1 : 2;

      const tira = c.mostrar_tira
        ? `<div class="tira">
             ${
               d.temperatura !== null
                 ? `<span class="leitura"><span aria-hidden="true">🌡️</span>
                      <b>${fmt(d.temperatura, 0)}</b> °C</span>`
                 : ""
             }
             <span class="principal" style="color:${t.tinta === "#ece7dc" ? "var(--primary-text-color)" : "var(--primary-text-color)"}">
               ${fmt(exibido, casas)}<span class="unidade">${c.unidade_pressao}</span>
               ${
                 d.tendencia
                   ? `<span class="seta" title="${d.tendencia.label}">${d.tendencia.seta}</span>`
                   : ""
               }
             </span>
             ${
               d.umidade !== null
                 ? `<span class="leitura"><span aria-hidden="true">💧</span>
                      <b>${fmt(d.umidade, 0)}</b> %</span>`
                 : ""
             }
           </div>`
        : "";

      const avisos = [];
      if (d.deEstacao) {
        avisos.push(
          `Esta leitura parece <b>pressão de estação</b> (o local está a ` +
            `${Math.round(d.altitude)} m). Um mostrador de barômetro trabalha ao ` +
            `nível do mar: aponte o card para um sensor de pressão reduzida.`
        );
      } else if (d.forade) {
        avisos.push(
          `<b>Fora de escala.</b> ${fmt(d.hpa, 1)} hPa está fora de ` +
            `${P_MIN}–${P_MAX}; o ponteiro parou no fim do curso.`
        );
      }

      const previsao =
        c.mostrar_previsao && d.previsao
          ? `<div class="previsao">
               ${d.previsao.texto}
               <small>Zambretti · ${d.tendencia.label}${
                 d.previsao.confiavel
                   ? ""
                   : ` · ${d.previsao.motivo}`
               }</small>
             </div>`
          : "";

      const memoria =
        anguloMemoria === null
          ? ""
          : `<g class="memoria" style="transform: rotate(${anguloMemoria}deg)">
               <line x1="0" y1="0" x2="0" y2="-86" stroke="${t.referencia}"
                     stroke-width="2" stroke-linecap="round"/>
             </g>`;

      this.shadowRoot.innerHTML = `
        <style>${ESTILO}</style>
        <ha-card style="--mw-baro-tamanho:${TAMANHOS[c.tamanho] || 260}px">
          ${c.name ? `<div class="previsao"><b>${c.name}</b></div>` : ""}
          ${tira}
          <button class="face" type="button"
                  aria-label="${
                    c.name || "Barômetro"
                  }: ${fmt(exibido, casas)} ${c.unidade_pressao}${
                    d.tendencia ? ", " + d.tendencia.label : ""
                  }${d.previsao ? ". Previsão: " + d.previsao.texto : ""}">
            <svg class="mostrador" viewBox="-110 -110 220 220" role="img"
                 aria-hidden="true">
              <defs>
                <linearGradient id="aro" x1="0" y1="0" x2="0.4" y2="1">
                  <stop offset="0"   stop-color="${t.aro[1]}"/>
                  <stop offset="0.35" stop-color="${t.aro[4]}"/>
                  <stop offset="0.55" stop-color="${t.aro[2]}"/>
                  <stop offset="0.8"  stop-color="${t.aro[3]}"/>
                  <stop offset="1"    stop-color="${t.aro[0]}"/>
                </linearGradient>
                <radialGradient id="face" cx="0.38" cy="0.32" r="0.85">
                  <stop offset="0" stop-color="${t.mostrador}"/>
                  <stop offset="1" stop-color="${t.mostradorBorda}"/>
                </radialGradient>
              </defs>
              <circle r="105" fill="url(#aro)"/>
              <circle r="96" fill="none" stroke="${t.aro[0]}" stroke-width="1.5"
                      opacity="0.5"/>
              <circle r="94" fill="url(#face)"/>
              ${this._estaticoOu(c, t)}
              ${memoria}
              <g class="agulha" style="transform: rotate(${anguloAgulha}deg)">
                <path d="M -2.6 6 L 0 -84 L 2.6 6 Z" fill="${t.ponteiro}"/>
                <path d="M -4.5 8 L 0 30 L 4.5 8 Z" fill="${t.ponteiro}"/>
              </g>
              <circle r="8" fill="${t.hub}"/>
              <circle r="8" fill="none" stroke="${t.aro[0]}" stroke-width="0.8"
                      opacity="0.6"/>
              <circle r="2.6" fill="${t.aro[0]}" opacity="0.35"/>
            </svg>
          </button>
          ${previsao}
          ${avisos.map((a) => `<div class="aviso"><span>⚠️</span><span>${a}</span></div>`).join("")}
        </ha-card>`;

      const face = this.shadowRoot.querySelector("button.face");
      if (face) face.addEventListener("click", () => this._detalhe());
    }

    _estaticoOu(cfg, tinta) {
      // O mostrador (centenas de marcas e rótulos) é caro de montar e nunca
      // muda com o dado. Fica em cache por acabamento+opções.
      const chave = [
        cfg.acabamento,
        cfg.mostrar_mmhg,
        cfg.mostrar_pictogramas,
      ].join("|");
      if (!this._estatico || this._estatico.chave !== chave) {
        this._estatico = { chave, svg: desenharMostrador(cfg, tinta) };
      }
      return this._estatico.svg;
    }

    _detalhe() {
      const ev = new Event("hass-more-info", { bubbles: true, composed: true });
      ev.detail = { entityId: this._config.entity };
      this.dispatchEvent(ev);
    }
  }

  // ── editor ────────────────────────────────────────────────────────────────
  class BarometerCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = { ...config };
      this._renderar();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._form) this._form.hass = hass;
    }

    _schema() {
      return [
        {
          name: "entity",
          selector: {
            entity: { domain: "sensor", device_class: "atmospheric_pressure" },
          },
        },
        { name: "name", selector: { text: {} } },
        {
          name: "acabamento",
          selector: {
            select: {
              mode: "dropdown",
              options: Object.entries(ACABAMENTOS).map(([v, a]) => ({
                value: v,
                label: a.rotulo,
              })),
            },
          },
        },
        {
          name: "tamanho",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "compacto", label: "Compacto" },
                { value: "medio", label: "Médio" },
                { value: "grande", label: "Grande" },
              ],
            },
          },
        },
        {
          name: "ponteiro_referencia",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "3h", label: "Pressão de 3 horas atrás" },
                { value: "24h", label: "Pressão de 24 horas atrás" },
                { value: "off", label: "Sem ponteiro de memória" },
              ],
            },
          },
        },
        {
          name: "unidade_pressao",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "hPa", label: "hPa" },
                { value: "mmHg", label: "mmHg" },
              ],
            },
          },
        },
        { name: "mostrar_tira", selector: { boolean: {} } },
        { name: "mostrar_mmhg", selector: { boolean: {} } },
        { name: "mostrar_pictogramas", selector: { boolean: {} } },
        { name: "mostrar_previsao", selector: { boolean: {} } },
        {
          name: "temperatura_entity",
          selector: { entity: { domain: "sensor", device_class: "temperature" } },
        },
        {
          name: "umidade_entity",
          selector: { entity: { domain: "sensor", device_class: "humidity" } },
        },
        { name: "vento_entity", selector: { entity: {} } },
        { name: "referencia_entity", selector: { entity: { domain: "sensor" } } },
        {
          name: "hemisferio",
          selector: {
            select: {
              mode: "dropdown",
              options: [
                { value: "auto", label: "Automático (pela casa)" },
                { value: "sul", label: "Sul" },
                { value: "norte", label: "Norte" },
              ],
            },
          },
        },
        {
          name: "altitude",
          selector: { number: { min: 0, max: 6000, step: 10, mode: "box",
                                unit_of_measurement: "m" } },
        },
      ];
    }

    _renderar() {
      if (!this._form) {
        this._form = document.createElement("ha-form");
        this._form.computeLabel = (f) => LABELS[f.name] || f.name;
        this._form.addEventListener("value-changed", (ev) => this._mudou(ev));
        this.appendChild(this._form);
      }
      if (this._hass) this._form.hass = this._hass;
      this._form.schema = this._schema();
      const dados = { ...DEFAULTS, ...this._config };
      for (const k of Object.keys(dados)) {
        if (dados[k] === "" || dados[k] === null) delete dados[k];
      }
      this._form.data = dados;
    }

    _mudou(ev) {
      ev.stopPropagation();
      // Default não polui o YAML: só entra o que o dono realmente escolheu
      // diferente do padrão.
      const limpo = { type: this._config.type, entity: this._config.entity };
      for (const [k, v] of Object.entries({ ...ev.detail.value })) {
        if (v === undefined || v === null || v === "") continue;
        if (v !== DEFAULTS[k]) limpo[k] = v;
      }
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          bubbles: true,
          composed: true,
          detail: { config: limpo },
        })
      );
    }
  }

  if (!customElements.get("mw-barometer-card")) {
    customElements.define("mw-barometer-card", BarometerCard);
    customElements.define("mw-barometer-card-editor", BarometerCardEditor);
  }

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "mw-barometer-card",
    name: "MW Barometer Card",
    description:
      "Barômetro aneroide com dois ponteiros: o valor e a memória de 3 h. " +
      "Os pictogramas vêm do Zambretti, com hemisfério sul tratado.",
    preview: true,
    documentationURL: "https://github.com/visaodeempresa/mw-ha-barometer-card",
  });

  console.info(
    `%c MW-BAROMETER-CARD %c ${VERSION} `,
    "background:#1a1a1a;color:#fdfaf3;font-weight:700;",
    "background:#e8d089;color:#1a1a1a;font-weight:700;"
  );
})();
