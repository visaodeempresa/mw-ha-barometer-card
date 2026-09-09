<!-- MW-BRAND:BEGIN — gerado por IA/tools/mw-brand.sh · não editar à mão -->
<p align="center">
  <a href="https://github.com/visaodeempresa">
    <img src="https://mayconsoftware.github.io/assets/ve/LOGO_VISAO_DE_EMPRESA_HEIGHT-64px.png" alt="Visão de Empresa — MAYCON WILLIAN OLIVEIRA" height="64">
  </a>
  <br>
  <sub><b>Visão de Empresa</b> · componente de Home Assistant por MAYCON WILLIAN OLIVEIRA</sub>
</p>
<!-- MW-BRAND:END -->

# MW Barometer Card

Um **barômetro aneroide de verdade** no Home Assistant: aro de latão, mostrador
creme, escala em hPa com a de mmHg por dentro, dois ponteiros e os pictogramas
de chuva, variável e sol.

```yaml
type: custom:mw-barometer-card
entity: sensor.pressao_ao_nivel_do_mar
temperatura_entity: sensor.temperatura_externa
umidade_entity: sensor.umidade_externa
vento_entity: sensor.direcao_do_vento
```

## O que ele faz que um mostrador bonito não faz

### 1. O ponteiro dourado é memória, não enfeite

No instrumento de parede, o ponteiro dourado se acerta à mão para marcar «onde
a pressão estava». Aqui ele vai sozinho para a **pressão de 3 horas atrás**, e o
vão entre os dois ponteiros **é** a tendência — lida de relance, sem número.

Sem leitura anterior, ele fica **oculto**. Nunca em zero: desenhar zero seria
inventar um dado.

### 2. Os pictogramas têm conta por trás

A previsão sai do algoritmo **Zambretti** (Negretti & Zambra, 1915): pressão ao
nível do mar + tendência de 3 h + direção do vento → uma das 26 frases. O
ponteiro aponta para «chuva» **porque a conta diz chuva**, não porque parou em
cima do desenho.

**Hemisfério sul tratado.** A correção de vento do instrumento é geográfica:
vento de sul, no hemisfério norte, vem do equador — quente, úmido, piora a
previsão. No hemisfério sul quem vem do equador é o vento de **norte**. A
maioria das implementações não espelha isso; esta espelha.

### 3. Pressão ao nível do mar, e ele avisa quando não é

Esta casa está a **1200 m**. A pressão *de estação* aqui é ~887 hPa, enquanto o
mundo inteiro fala em ~1019 hPa. Alimentar o mostrador com 887 o deixaria preso
em «tempestade» **para sempre, sem erro nenhum no log**. E a checagem de faixa
não salva: 870 hPa é o recorde mundial de baixa pressão, então 887 é um valor
plausível — **só a altitude denuncia**.

O card detecta e escreve na tela. Fora da escala 970–1040, o ponteiro para no
fim do curso **e diz que parou** — em vez de fingir leitura.

### 4. A unidade vem da entidade

`hPa`, `mbar`, `kPa`, `Pa`, `inHg`, `mmHg`, `psi` — convertidos pelo
`unit_of_measurement` da própria entidade. Unidade desconhecida vira aviso, não
palpite.

## Acabamentos

| `acabamento` | |
|---|---|
| `latao` (padrão) | aro dourado, mostrador creme — o instrumento clássico |
| `latao-noite` | mesmo instrumento com mostrador grafite, para o tema escuro |
| `aco` | aro escovado, mostrador branco, leitura clínica |
| `papel` | o papel encardido MW, para conviver com os outros cards da casa |

## Opções

| Opção | Padrão | O que faz |
|---|---|---|
| `entity` | — | **obrigatória.** Sensor de pressão |
| `temperatura_entity` · `umidade_entity` | — | a tira de leitura acima do mostrador |
| `vento_entity` | — | direção do vento para o Zambretti; sem ela, a previsão **diz** que degradou |
| `referencia_entity` | — | pressão de referência própria (senão usa o atributo `pressao_3h_atras`) |
| `ponteiro_referencia` | `3h` | `3h`, `24h` ou `off` |
| `acabamento` | `latao` | ver acima |
| `tamanho` | `medio` | `compacto` · `medio` · `grande` |
| `unidade_pressao` | `hPa` | `hPa` ou `mmHg` no número grande |
| `mostrar_tira` · `mostrar_mmhg` · `mostrar_pictogramas` · `mostrar_previsao` | `true` | ligam e desligam cada camada |
| `hemisferio` | `auto` | `auto` (pela latitude da casa), `sul`, `norte` |
| `altitude` | do HA | altitude do local, usada para denunciar pressão de estação |

## Combina com o MW Letícia Weather

A integração [`mw-ha-leticia-weather`](https://github.com/visaodeempresa/mw-ha-leticia-weather)
publica `sensor.*_pressao` **já ao nível do mar**, com `pressao_3h_atras` no
atributo — que é exatamente o que o ponteiro de memória procura. Assim o card
funciona sem configurar nada além de `entity`. Mas ele **não depende dela**:
qualquer sensor de pressão serve, inclusive um BME280 na varanda.

## Desenho e custo

SVG, não canvas: o mostrador é geometria estática e só os dois ponteiros se
movem — por `transform: rotate()`, com `prefers-reduced-motion` respeitado. Sem
laço de animação, sem `devicePixelRatio`, nítido em qualquer tela. O mostrador
inteiro fica em cache e só é redesenhado quando muda o acabamento.

## Instalação

HACS → Repositórios personalizados → `visaodeempresa/mw-ha-barometer-card`,
categoria **Dashboard**.

## Verificação

```bash
node --check dist/mw-barometer-card.js
node tools/probe.js
```

Saída esperada: 25 linhas `ok` e `tudo verde`. Bancada visual em
`bancada.html` (quatro acabamentos, dois temas, e os cenários de pressão de
estação e de fora de escala).

## Licença

MIT · © 2026 MAYCON WILLIAN OLIVEIRA
