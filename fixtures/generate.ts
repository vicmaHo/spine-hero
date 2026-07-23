/**
 * Genera los 4 ficheros de fixtures de landmarks simulados.
 * Ejecutar con: npx tsx fixtures/generate.ts
 *
 * Cada frame contiene 5 landmarks en orden:
 * [NOSE(0), LEFT_EAR(7), RIGHT_EAR(8), LEFT_SHOULDER(11), RIGHT_SHOULDER(12)]
 *
 * Coordenadas normalizadas [0,1]. Y crece hacia abajo (MediaPipe).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

// --- Tipos ---
interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

interface Frame {
  t: number;
  landmarks: Landmark[];
}

interface Session {
  frames: Frame[];
}

// --- Utilidades ---

// PRNG determinista (Mulberry32) para reproducibilidad
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(42);

/** Ruido pequeño ±amplitude */
function noise(amplitude = 0.003): number {
  return (rng() - 0.5) * 2 * amplitude;
}

/** Postura erguida base */
function goodPostureLandmarks(vis = 0.95): Landmark[] {
  return [
    // NOSE
    { x: 0.50 + noise(), y: 0.25 + noise(), z: 0.0, visibility: vis + noise(0.02) },
    // LEFT_EAR
    { x: 0.46 + noise(), y: 0.27 + noise(), z: 0.0, visibility: vis + noise(0.02) },
    // RIGHT_EAR
    { x: 0.54 + noise(), y: 0.27 + noise(), z: 0.0, visibility: vis + noise(0.02) },
    // LEFT_SHOULDER
    { x: 0.40 + noise(), y: 0.45 + noise(), z: 0.0, visibility: vis + noise(0.02) },
    // RIGHT_SHOULDER
    { x: 0.60 + noise(), y: 0.45 + noise(), z: 0.0, visibility: vis + noise(0.02) },
  ];
}

/** Clamp a [0, 1] */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampLandmarks(lms: Landmark[]): Landmark[] {
  return lms.map((lm) => ({
    x: clamp01(lm.x),
    y: clamp01(lm.y),
    z: lm.z,
    visibility: clamp01(lm.visibility),
  }));
}

// --- Generadores de sesiones ---

function generateSessionGood(): Session {
  // 60 s a 5 FPS = 300 frames
  const frames: Frame[] = [];
  for (let i = 0; i < 300; i++) {
    frames.push({
      t: i * 200,
      landmarks: clampLandmarks(goodPostureLandmarks()),
    });
  }
  return { frames };
}

function generateSessionSlouch(): Session {
  // 75 frames erguido (15 s), luego transición gradual a encorvado
  const frames: Frame[] = [];
  const totalFrames = 200; // 40 s total

  for (let i = 0; i < totalFrames; i++) {
    const t = i * 200;

    if (i < 75) {
      // Primeros 15 s: erguido
      frames.push({ t, landmarks: clampLandmarks(goodPostureLandmarks()) });
    } else {
      // Transición: las orejas bajan (y sube) gradualmente
      // Transición completa en ~15 frames (3 s), luego se mantiene encorvado
      const transitionProgress = Math.min(1, (i - 75) / 15);

      // Orejas bajan de y=0.27 a y=0.37 (encorvado)
      const earYShift = transitionProgress * 0.10;
      // Nariz también baja un poco
      const noseYShift = transitionProgress * 0.07;

      const lms: Landmark[] = [
        // NOSE - baja
        { x: 0.50 + noise(), y: 0.25 + noseYShift + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
        // LEFT_EAR - baja significativamente
        { x: 0.46 + noise(), y: 0.27 + earYShift + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
        // RIGHT_EAR - baja significativamente
        { x: 0.54 + noise(), y: 0.27 + earYShift + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
        // LEFT_SHOULDER - se mantiene
        { x: 0.40 + noise(), y: 0.45 + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
        // RIGHT_SHOULDER - se mantiene
        { x: 0.60 + noise(), y: 0.45 + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
      ];

      frames.push({ t, landmarks: clampLandmarks(lms) });
    }
  }
  return { frames };
}

function generateSessionLean(): Session {
  // Usuario se acerca sin encorvarse: shoulderWidth crece pero neckRatio se mantiene
  const frames: Frame[] = [];
  const totalFrames = 200; // 40 s

  for (let i = 0; i < totalFrames; i++) {
    const t = i * 200;

    // Escala progresiva: de 1.0 a 1.5 (se acerca gradualmente)
    const scale = 1.0 + (i / totalFrames) * 0.5;

    // Centro del cuerpo
    const cx = 0.50;
    const shoulderCy = 0.45;
    const earCy = 0.27;
    const noseCy = 0.25;

    // shoulderWidth base = 0.20, escalado
    const halfShoulder = 0.10 * scale;

    // La distancia vertical entre orejas y hombros también escala proporcionalmente
    // Esto mantiene neckRatio estable
    const earYFromCenter = (earCy - shoulderCy) * scale; // negativo (orejas arriba)
    const noseYFromCenter = (noseCy - shoulderCy) * scale;

    // Ajustamos las posiciones alrededor de un centro que también se ajusta
    // para que todo se mantenga en [0,1]
    const shoulderY = 0.45;
    const actualEarY = shoulderY + earYFromCenter;
    const actualNoseY = shoulderY + noseYFromCenter;

    const lms: Landmark[] = [
      // NOSE
      { x: cx + noise(), y: actualNoseY + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
      // LEFT_EAR
      { x: cx - 0.04 * scale + noise(), y: actualEarY + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
      // RIGHT_EAR
      { x: cx + 0.04 * scale + noise(), y: actualEarY + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
      // LEFT_SHOULDER
      { x: cx - halfShoulder + noise(), y: shoulderY + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
      // RIGHT_SHOULDER
      { x: cx + halfShoulder + noise(), y: shoulderY + noise(), z: 0.0, visibility: 0.95 + noise(0.02) },
    ];

    frames.push({ t, landmarks: clampLandmarks(lms) });
  }
  return { frames };
}

function generateSessionAway(): Session {
  // 20 s erguido (100 frames), luego se levanta (visibility ≈ 0)
  const frames: Frame[] = [];
  const totalFrames = 200; // 40 s

  for (let i = 0; i < totalFrames; i++) {
    const t = i * 200;

    if (i < 100) {
      // Primeros 20 s: erguido
      frames.push({ t, landmarks: clampLandmarks(goodPostureLandmarks()) });
    } else {
      // Usuario se ha ido: visibility cae a casi 0
      // Transición rápida (5 frames = 1 s)
      const transitionProgress = Math.min(1, (i - 100) / 5);
      const vis = 0.95 * (1 - transitionProgress) + 0.02 * transitionProgress;

      // Landmarks con posiciones erráticas y baja visibilidad
      const lms: Landmark[] = [
        { x: 0.50 + noise(0.05), y: 0.25 + noise(0.05), z: 0.0, visibility: vis + noise(0.01) },
        { x: 0.46 + noise(0.05), y: 0.27 + noise(0.05), z: 0.0, visibility: vis + noise(0.01) },
        { x: 0.54 + noise(0.05), y: 0.27 + noise(0.05), z: 0.0, visibility: vis + noise(0.01) },
        { x: 0.40 + noise(0.05), y: 0.45 + noise(0.05), z: 0.0, visibility: vis + noise(0.01) },
        { x: 0.60 + noise(0.05), y: 0.45 + noise(0.05), z: 0.0, visibility: vis + noise(0.01) },
      ];

      frames.push({ t, landmarks: clampLandmarks(lms) });
    }
  }
  return { frames };
}

// --- Main ---

import { fileURLToPath } from 'url';

const outDir = dirname(fileURLToPath(import.meta.url));

const sessions: [string, () => Session][] = [
  ['session-good.json', generateSessionGood],
  ['session-slouch.json', generateSessionSlouch],
  ['session-lean.json', generateSessionLean],
  ['session-away.json', generateSessionAway],
];

for (const [filename, generator] of sessions) {
  const session = generator();
  const outPath = join(outDir, filename);
  writeFileSync(outPath, JSON.stringify(session, null, 2));
  console.log(`✓ ${filename} — ${session.frames.length} frames`);
}

console.log('\nDone.');
