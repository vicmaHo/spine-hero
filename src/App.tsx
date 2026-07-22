import { useState, useRef, useCallback, useEffect } from 'react';
import { CameraSource, type LandmarksEvent } from './vision/cameraSource';

function App() {
  const cameraRef = useRef<CameraSource | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEvent, setLastEvent] = useState<LandmarksEvent | null>(null);
  const [stats, setStats] = useState({ p50: 0, p95: 0, fps: 0, dropped: 0 });
  const [showPreview, setShowPreview] = useState(false);

  const handleStart = useCallback(async () => {
    setError(null);
    const cam = new CameraSource();
    cameraRef.current = cam;

    cam.subscribe((event) => {
      setLastEvent(event);
      setStats({
        p50: Math.round(cam.stats.getP50()),
        p95: Math.round(cam.stats.getP95()),
        fps: Math.round(cam.stats.getFps() * 10) / 10,
        dropped: cam.stats.getDropped(),
      });
    });

    const result = await cam.start();
    if (!result.ok) {
      setError(`Error: ${result.error.kind}${'detail' in result.error ? ` — ${result.error.detail}` : ''}`);
      return;
    }
    setRunning(true);
  }, []);

  const handleStop = useCallback(() => {
    cameraRef.current?.stop();
    cameraRef.current = null;
    setRunning(false);
    setShowPreview(false);
  }, []);

  // Conectar/desconectar el stream al elemento <video> según showPreview
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (showPreview && cameraRef.current) {
      const stream = cameraRef.current.getStream();
      if (stream) {
        video.srcObject = stream;
        video.play();
      }
    } else {
      video.srcObject = null;
    }
  }, [showPreview, running]);

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6 font-mono">
      <h1 className="text-2xl font-bold mb-4">SpineHero — Pipeline de Visión</h1>

      <div className="flex gap-3 mb-6">
        {!running ? (
          <button
            type="button"
            onClick={handleStart}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-bold"
          >
            Iniciar cámara
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleStop}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-bold"
            >
              Detener
            </button>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-bold"
            >
              {showPreview ? 'Ocultar cámara' : 'Ver cámara'}
            </button>
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Preview de la cámara */}
      {showPreview && running && (
        <div className="mb-6 max-w-md">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full rounded border border-gray-700"
            style={{ transform: 'scaleX(-1)' }}
          />
        </div>
      )}

      {running && (
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div className="bg-gray-800 p-3 rounded">
            <div className="text-xs text-gray-400">Inferencia p50</div>
            <div className="text-xl font-bold text-green-400">{stats.p50} ms</div>
          </div>
          <div className="bg-gray-800 p-3 rounded">
            <div className="text-xs text-gray-400">Inferencia p95</div>
            <div className="text-xl font-bold text-yellow-400">{stats.p95} ms</div>
          </div>
          <div className="bg-gray-800 p-3 rounded">
            <div className="text-xs text-gray-400">FPS reales</div>
            <div className="text-xl font-bold text-blue-400">{stats.fps}</div>
          </div>
          <div className="bg-gray-800 p-3 rounded">
            <div className="text-xs text-gray-400">Frames descartados</div>
            <div className="text-xl font-bold text-orange-400">{stats.dropped}</div>
          </div>
        </div>
      )}

      {lastEvent && (
        <div className="mt-6 bg-gray-800 p-4 rounded max-w-md">
          <div className="text-xs text-gray-400 mb-2">Último frame — {lastEvent.landmarks.length} landmarks</div>
          <pre className="text-xs text-gray-300 overflow-auto max-h-40">
            {JSON.stringify(lastEvent.landmarks, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default App;
