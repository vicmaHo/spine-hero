import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';
import type { TeamEntry } from '../contracts/sync';
import { useAppStore } from '../store/useAppStore';
// Helper compartido con el synchronizer: ambos deben usar la MISMA definición de día.
import { todayLocalDate } from '../storage/dateKey';
// TODO(9.2): cuando el slice de identidad llegue a useAppStore, leer el nick
// activo desde ahí (p. ej. `useAppStore((s) => s.identity?.nick)`) y retirar
// este import directo: hoy es la única fuente disponible del Nick activo
// fuera del propio Sistema_Identidad.
import { loadLocalIdentity } from '../storage/identityLocal';

// `authMode` explícito: el ranking se lee con Credenciales_Invitado (Req 6.11).
const client = generateClient<Schema>({ authMode: 'identityPool' });

/** Regex: 4-20 caracteres alfanuméricos (letras ASCII y dígitos) */
const TEAM_CODE_REGEX = /^[A-Za-z0-9]{4,20}$/;

/** Solo se muestra el podio. Nada de tablas enormes. */
const PODIUM_SIZE = 3;

/** Estilo de cada puesto del podio: medalla y color del estandarte. */
const PODIUM_STYLES = [
  { medal: '#f2cf6b', medalDark: '#9c7420', banner: '#5e8c42', bannerDark: '#2c4a1c' },
  { medal: '#dfe4ea', medalDark: '#8d959e', banner: '#3d7ea6', bannerDark: '#1e455f' },
  { medal: '#cf9058', medalDark: '#8a5424', banner: '#8b5cf6', bannerDark: '#3f2277' },
] as const;

/** Emblemas del estandarte por puesto. Decorativo. */
const PODIUM_EMBLEMS = ['✦', '✧', '✩'] as const;

/** Convierte segundos totales a formato HH:MM:SS */
export function formatSeconds(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

/** Máximo de filas que muestra el Ranking_Equipo (Requisito 7 criterio 3). */
const MAX_RANKING_ROWS = 50;

/**
 * Ordena registros por goodPostureSeconds en orden descendente, recorta a
 * MAX_RANKING_ROWS y mapea a TeamEntry[].
 *
 * `ownDisplayName` y `ownStreakDays` identifican la fila del propio usuario:
 * el DailyRecord ya no lleva racha (Requisito 14 criterio 9), así que
 * `streakDays` solo se rellena, desde el `GameState` local, para la fila cuyo
 * `displayName` coincide con el Nick activo. El resto queda en 0.
 */
export function buildRanking(
  records: { displayName?: string | null; goodPostureSeconds: number; level?: number | null }[],
  ownDisplayName?: string | null,
  ownStreakDays?: number,
): TeamEntry[] {
  return [...records]
    .sort((a, b) => b.goodPostureSeconds - a.goodPostureSeconds)
    .slice(0, MAX_RANKING_ROWS)
    .map((record) => {
      const rawName = record.displayName ?? '';
      const isOwnRow = ownDisplayName != null && rawName === ownDisplayName;
      return {
        displayName: rawName.trim().length === 0 ? 'Anónimo' : rawName,
        goodPostureSeconds: record.goodPostureSeconds,
        level: record.level ?? 1,
        streakDays: isOwnRow ? ownStreakDays ?? 0 : 0,
      };
    });
}

export function RankingPanel() {
  const myTeamCode = useAppStore((s) => s.teamCode);
  const myStreakDays = useAppStore((s) => s.game.streakDays);
  const [teamCode, setTeamCode] = useState(myTeamCode ?? '');
  const [validationError, setValidationError] = useState('');
  // Nick activo del propio usuario, leído del Almacen_Local_Identidad (ver
  // TODO junto al import): identifica cuál fila del ranking es «la mía» para
  // rellenar streakDays desde el GameState local.
  const [ownNick, setOwnNick] = useState<string | null>(null);

  useEffect(() => {
    loadLocalIdentity().then((result) => {
      if (result.ok && result.value) setOwnNick(result.value.nick);
    });
  }, []);

  // Rellena el buscador con "mi código" cuando el usuario lo guarda en controles.
  useEffect(() => {
    if (myTeamCode) setTeamCode(myTeamCode);
  }, [myTeamCode]);
  const [ranking, setRanking] = useState<TeamEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [queryError, setQueryError] = useState('');

  const podium = ranking.slice(0, PODIUM_SIZE);
  const leaderSeconds = podium.length > 0 ? podium[0].goodPostureSeconds : 0;

  const handleInputChange = (value: string) => {
    setTeamCode(value);
    if (value.length > 0 && !TEAM_CODE_REGEX.test(value)) {
      setValidationError('El código debe tener entre 4 y 20 caracteres alfanuméricos');
    } else {
      setValidationError('');
    }
  };

  const handleSearch = async () => {
    // La partition key del índice es case-sensitive: normalizamos igual que el store.
    const normalized = teamCode.trim().toUpperCase();
    if (!TEAM_CODE_REGEX.test(normalized)) {
      setValidationError('El código debe tener entre 4 y 20 caracteres alfanuméricos');
      return;
    }

    setLoading(true);
    setQueryError('');
    setSearched(true);

    try {
      const today = todayLocalDate();
      const { data } = await client.models.DailyRecord.listByTeamAndDate({
        teamCode: normalized,
        date: { eq: today },
      });

      const entries = buildRanking(data, ownNick, myStreakDays);
      setRanking(entries);
    } catch {
      setQueryError('Error al consultar el ranking. Intenta de nuevo.');
      setRanking([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && TEAM_CODE_REGEX.test(teamCode)) {
      handleSearch();
    }
  };

  return (
    <section className="rpg-panel px-4 pb-4 pt-7">
      <div className="absolute -top-3 left-3">
        <span className="rpg-ribbon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 4h10v2h3v3a4 4 0 01-3.3 3.94A5 5 0 0113 16.9V19h3v2H8v-2h3v-2.1a5 5 0 01-3.7-3.96A4 4 0 014 9V6h3V4zm0 4H6v1a2 2 0 001 1.73V8zm10 0v2.73A2 2 0 0018 9V8h-1z" />
          </svg>
          RANKING DIARIO DE EQUIPO
        </span>
      </div>

      {/* Buscador de equipo */}
      <div className="flex flex-col gap-1.5">
        <div className="flex gap-2">
          <input
            type="text"
            value={teamCode}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Código de equipo"
            maxLength={20}
            className="rpg-field max-w-[240px] flex-1"
            aria-label="Código de equipo"
            aria-describedby={validationError ? 'team-code-error' : undefined}
            aria-invalid={validationError ? true : undefined}
          />
          <button
            onClick={handleSearch}
            disabled={!TEAM_CODE_REGEX.test(teamCode) || loading}
            className="rpg-btn rpg-btn-gold rpg-btn-sm"
          >
            {loading ? 'BUSCANDO…' : 'BUSCAR'}
          </button>
        </div>
        {validationError && (
          <p id="team-code-error" className="text-[11px] font-medium text-[#8e2820]" role="alert">
            {validationError}
          </p>
        )}
      </div>

      {queryError && (
        <p
          className="mt-3 rounded-md border-2 border-[#c4523c] bg-[rgba(196,82,60,0.18)] px-3 py-2 text-[11px] font-medium text-[#8e2820]"
          role="alert"
        >
          {queryError}
        </p>
      )}

      {loading && (
        <p className="mt-4 animate-pulse text-center text-[12px] font-semibold text-[#5c4128]">
          Cargando ranking…
        </p>
      )}

      {!loading && searched && podium.length === 0 && !queryError && (
        <p className="mt-4 text-center text-[12px] font-medium text-[#5c4128]">
          No se encontraron resultados para este código
        </p>
      )}

      {!loading && podium.length > 0 && (
        <>
          {/* El podio muestra un tiempo por héroe, y conviene decir cuál: son
              los segundos que hoy se han clasificado como buena postura, no el
              rato que la aplicación ha estado abierta. */}
          <p className="mt-3 text-[11px] font-medium text-[#5c4128]">
            Ordenado por <strong>tiempo de buena postura</strong> acumulado hoy.
          </p>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            {podium.map((entry, index) => {
              const style = PODIUM_STYLES[index] ?? PODIUM_STYLES[PODIUM_STYLES.length - 1];
              const ratio = leaderSeconds > 0 ? entry.goodPostureSeconds / leaderSeconds : 0;
              const filled = Math.max(1, Math.round(ratio * 7));

              return (
                <div
                  key={entry.displayName}
                  className="rpg-hover-lift flex items-center gap-3 rounded-lg border-2 border-[#c9ab74] bg-[rgba(255,255,255,0.36)] px-3 py-2.5"
                  style={{ boxShadow: 'inset 0 2px 0 1px rgba(255,255,255,0.5), 0 3px 0 0 rgba(92,65,40,0.22)' }}
                >
                  {/* Medalla */}
                  <div
                    className="font-pixel flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px]"
                    style={{
                      background: `linear-gradient(180deg, ${style.medal} 0%, ${style.medalDark} 100%)`,
                      border: '2px solid #241a10',
                      color: '#3b2a1c',
                      boxShadow: 'inset 0 2px 0 1px rgba(255,255,255,0.55), 0 2px 0 0 rgba(20,14,8,0.45)',
                    }}
                  >
                    {index + 1}
                  </div>

                  {/* Estandarte */}
                  <div
                    className="flex h-9 w-8 shrink-0 items-center justify-center text-[15px] text-white"
                    style={{
                      background: `linear-gradient(180deg, ${style.banner} 0%, ${style.bannerDark} 100%)`,
                      border: '2px solid #241a10',
                      clipPath: 'polygon(0 0, 100% 0, 100% 78%, 50% 100%, 0 78%)',
                      textShadow: '0 1px 0 rgba(0,0,0,0.5)',
                    }}
                    aria-hidden="true"
                  >
                    {PODIUM_EMBLEMS[index] ?? PODIUM_EMBLEMS[0]}
                  </div>

                  {/* Nombre + barra */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold text-[#3b2a1c]">
                      {entry.displayName}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="rpg-bar-track flex h-[9px] flex-1 gap-[2px] p-[2px]">
                        {Array.from({ length: 7 }, (_, i) => (
                          <span
                            key={i}
                            className="rpg-seg"
                            style={{
                              backgroundColor: i < filled ? style.banner : 'rgba(255,255,255,0.08)',
                              boxShadow: i < filled ? 'inset 0 1px 0 0 rgba(255,255,255,0.4)' : 'none',
                            }}
                          />
                        ))}
                      </div>
                      <span className="font-pixel shrink-0 text-[8px] tabular-nums text-[#9c7420]">
                        Lv.{entry.level}
                      </span>
                    </div>
                  </div>

                  {/* Tiempo de buena postura */}
                  <span
                    className="font-pixel shrink-0 text-[10px] tabular-nums"
                    style={{ color: '#9c7420' }}
                    title={`${entry.goodPostureSeconds} s de buena postura`}
                  >
                    {formatSeconds(entry.goodPostureSeconds)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
