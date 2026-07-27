# Postura Lateral — Requisitos

## Contexto

`deteccion-postura` mide postura asumiendo vista **frontal**: usa ambas orejas,
ambos hombros y `shoulderWidth` como normalizador. Con cámara lateral esas
métricas se rompen y el guard de orientación (en `pipeline.ts`) congela el score
en `LOW_CONF`, dejando la app inservible para quien tiene la cámara de lado de
forma permanente.

Esta spec añade un **modo lateral**: detectar que el usuario se ve de perfil y
medir la postura con un set de métricas de un solo lado (oreja–hombro visible),
que es como se evalúa clínicamente el encorvamiento. **No toca cámara ni worker.**
La coordenada `z` sigue sin usarse.

Los landmarks de entrada son los 5 de #[[file:src/contracts/worker.ts]]. La
salida sigue siendo el `PostureFrame` de #[[file:src/contracts/posture.ts]].

---

## Requisitos funcionales (notación EARS)

### RF-1 · Detección de orientación

**Cuando** se reciban landmarks con una baseline válida,
**el sistema** clasificará la orientación en `FRONTAL` o `LATERAL` usando
`noseOffset` (desplazamiento horizontal de la nariz respecto al punto medio de
las orejas, normalizado por la distancia entre orejas), con histéresis: entra en
`LATERAL` si `noseOffset > 0.55` sostenido 1 s, y vuelve a `FRONTAL` si
`noseOffset < 0.35` sostenido 1 s.

### RF-2 · Selección del lado visible

**Cuando** la orientación sea `LATERAL`,
**el sistema** elegirá el lado (izquierdo o derecho) hacia el que apunta la
nariz y usará únicamente esa oreja y ese hombro para las métricas.

### RF-3 · Métrica de perfil (forward-head)

**Cuando** se midan métricas en modo `LATERAL`,
**el sistema** calculará el ángulo de la línea oreja→hombro respecto a la
vertical: `atan2(|earX − shoulderX|, |shoulderY − earY|)`. Es invariante a la
distancia y a la escala (no requiere `shoulderWidth`). Mayor ángulo = más cabeza
adelantada = peor postura.

### RF-4 · Calibración lateral independiente

**Cuando** el usuario calibre estando de perfil,
**el sistema** guardará una baseline de orientación `LATERAL` (ángulo neutro del
cuello), separada de la baseline frontal.

**Si** no existe baseline lateral y la orientación es `LATERAL`,
**entonces** el sistema emite `CALIBRATING` y solicita calibrar de perfil, nunca
un score inventado.

### RF-5 · Score y estados reutilizan el pipeline existente

**Cuando** se obtenga la desviación del ángulo respecto a la baseline lateral,
**el sistema** la convertirá a un score 0–100 y la pasará a la **misma** máquina
de estados (histéresis GOOD/BAD/LOW_CONF/AWAY) sin cambios.

---

## Requisitos no funcionales

- **RNF-1 · Pureza:** la detección de orientación y las métricas laterales son
  funciones puras (el tiempo entra como parámetro), testeables contra fixtures.
- **RNF-2 · Sin z:** solo se usan `x`, `y` y `visibility`.
- **RNF-3 · Fronteras:** `src/posture/` importa únicamente de `src/contracts/`.
- **RNF-4 · Sin parpadeo de modo:** el cambio `FRONTAL`↔`LATERAL` usa histéresis.

---

## Criterios de aceptación (verificables contra fixtures)

### CA-1 · Frontal intacto
**Dado** `fixtures/session-good.json` (frontal),
**cuando** se procese,
**entonces** la orientación se clasifica `FRONTAL` el 100% del tiempo y el
comportamiento es idéntico al actual (no hay regresión).

### CA-2 · Lateral erguido = GOOD
**Dado** `fixtures/session-lateral-good.json` (perfil, erguido),
**cuando** se procese tras calibrar en lateral,
**entonces** el status es `GOOD` ≥ 95% del tiempo y el score medio ≥ 80.

### CA-3 · Lateral encorvado = BAD
**Dado** `fixtures/session-lateral-slouch.json` (perfil, se encorva a los 15 s),
**cuando** se procese,
**entonces** transita a `BAD` alrededor de los 23 s (15 s + histéresis) y
permanece `BAD` hasta el final.

### CA-4 · Sin baseline lateral
**Dado** el usuario de perfil y sin baseline lateral,
**cuando** se procese,
**entonces** emite `CALIBRATING` y nunca un score inventado.

---

## Fuera de alcance

- Ángulos intermedios (~45°): se tratan como `LATERAL` o `LOW_CONF`.
- Cambio del contrato `PostureMetrics` (ver pregunta abierta en el diseño).
- Captura de vídeo e inferencia (spec `pipeline-vision`).
- Motor de juego, persistencia y UI.
