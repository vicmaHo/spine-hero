import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

// Índices de los 5 landmarks: [NOSE, LEFT_EAR, RIGHT_EAR, LEFT_SHOULDER, RIGHT_SHOULDER]
const CONNECTIONS: [number, number][] = [
  [1, 0], // oreja izq → nariz
  [0, 2], // nariz → oreja der
  [3, 4], // hombro izq → hombro der
];

/**
 * Miniatura de la cámara con overlay de landmarks.
 * Muestra el stream real y dibuja encima los 5 puntos que usa el pipeline
 * (nariz, orejas, hombros). Vídeo y overlay van en espejo para que se sienta
 * como un reflejo y los puntos queden alineados.
 */
export function VideoThumbnail() {
  const videoStream = useAppStore((s) => s.videoStream);
  const landmarks = useAppStore((s) => s.latestLandmarks);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Conecta el stream al <video>
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (videoStream) {
      video.srcObject = videoStream;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [videoStream]);

  // Dibuja los landmarks sobre el canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    ctx.clearRect(0, 0, w, h);
    if (!videoStream || landmarks.length < 5) return;

    const pt = (i: number) => ({ x: landmarks[i].x * w, y: landmarks[i].y * h });

    // Líneas del esqueleto
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)'; // verde
    ctx.lineWidth = 2;
    for (const [a, b] of CONNECTIONS) {
      const pa = pt(a);
      const pb = pt(b);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }

    // Cuello: nariz → punto medio de los hombros
    const nose = pt(0);
    const midShoulders = { x: (pt(3).x + pt(4).x) / 2, y: (pt(3).y + pt(4).y) / 2 };
    ctx.beginPath();
    ctx.moveTo(nose.x, nose.y);
    ctx.lineTo(midShoulders.x, midShoulders.y);
    ctx.stroke();

    // Puntos
    ctx.fillStyle = 'rgba(250, 204, 21, 0.95)'; // amarillo
    for (let i = 0; i < 5; i++) {
      const p = pt(i);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [landmarks, videoStream]);

  return (
    <div className="relative w-full aspect-[4/3] bg-gray-800 rounded-lg overflow-hidden flex items-center justify-center">
      <video
        ref={videoRef}
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${videoStream ? '' : 'hidden'}`}
        style={{ transform: 'scaleX(-1)' }}
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${videoStream ? '' : 'hidden'}`}
        style={{ transform: 'scaleX(-1)' }}
      />
      {!videoStream && (
        <svg
          className="w-12 h-12 text-gray-600"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      )}
    </div>
  );
}
