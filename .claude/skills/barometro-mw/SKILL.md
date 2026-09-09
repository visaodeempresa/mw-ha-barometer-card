---
name: barometro-mw
description: Mexer no MW Barometer Card — o mostrador aneroide do Home Assistant. Use quando o Maycon disser "o barômetro", "o ponteiro está errado", "o ponteiro dourado sumiu", "mostra em mmHg", "muda o acabamento do aro", "a previsão do mostrador está estranha", "os números do mostrador estão de cabeça para baixo", ou quando aparecerem Zambretti, pressão de estação, MSL ou hPa no assunto deste repositório. A fábrica completa (integração + os dois cards) está na skill `mw-clima`.
---

# MW Barometer Card

Mostrador em **SVG**, dois ponteiros, previsão Zambretti. A fábrica geral está
em [`mw-clima`](../mw-clima/SKILL.md); aqui ficam só as coisas deste repositório.

## Pré-condições

| Preciso de | Como obter | Se faltar |
|---|---|---|
| Node 22+ | já instalado | `probe.js` não roda |
| Bancada | `preview_start` com `bancada-barometer` (porta 8794) | não dá para olhar |
| Blocos canônicos | `IA/lib/mw-pressure-scale`, `IA/lib/mw-zambretti` | o card não calcula nada |

## A geometria (não mexer sem motivo)

Fiel ao instrumento da foto do dono: **970 hPa às 6 horas**, 990 às 9, 1010 no
topo, 1030 às 3, 1040 embaixo à direita. São **4,5° por hPa**, varredura de
**315°**, boca de 45° embaixo. Anéis, de dentro para fora: cubo (r 8) ·
pictogramas (33) · mmHg (51 texto, 58–63 marcas) · hPa (71 texto, 78–88 marcas).

## Armadilhas (com sintoma)

| Sintoma | Causa | Correção |
|---|---|---|
| «970» aparece como «0Z6» | rótulo rotacionado passando pela metade de baixo | `legivel(angulo)` soma 180° entre 90° e 270° |
| Ponteiro preso no fim do curso, e o card parece quebrado | pressão de **estação** (887 hPa a 1200 m) | o card detecta pela altitude e escreve o aviso; não «ajustar» a escala |
| Ponteiro dourado em 970 no dia da instalação | referência ausente lida como zero | sem referência ele fica **oculto** — nunca em zero |
| Previsão sempre igual | sem `vento_entity`, o Zambretti perde a correção | o card **diz** que degradou; é para aparecer |
| Mostrador ilegível no tema escuro | acabamento claro num fundo escuro | usar `latao-noite`, ou `papel` para conviver com os outros cards MW |
| O probe reprova «sem varredura profunda» sem que haja varredura | a palavra proibida aparece num **comentário** | o probe olha o texto: não citar o nome da técnica proibida |

## Verificação

```bash
node --check dist/mw-barometer-card.js && node tools/probe.js
```
Esperado: 25 linhas `ok` e `tudo verde`. Na bancada, os botões
«pressão de estação (887)» e «fora de escala» têm de fazer o aviso aparecer —
se o mostrador desenhar sem avisar, é defeito.
