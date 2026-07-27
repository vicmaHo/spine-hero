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
    <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-4">
      <h2 className="text-lg font-bold text-white">Ranking diario de equipo</h2>

      {/* Campo de entrada para TeamCode */}
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            type="text"
            value={teamCode}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Código de equipo"
            maxLength={20}
            className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            aria-label="Código de equipo"
            aria-describedby={validationError ? 'team-code-error' : undefined}
            aria-invalid={validationError ? true : undefined}
          />
          <button
            onClick={handleSearch}
            disabled={!TEAM_CODE_REGEX.test(teamCode) || loading}
            className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
          >
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        {validationError && (
          <p id="team-code-error" className="text-xs text-red-400" role="alert">
            {validationError}
          </p>
        )}
      </div>

      {/* Error de consulta */}
      {queryError && (
        <p className="text-xs text-red-400 bg-red-900/30 rounded-lg px-3 py-2" role="alert">
          {queryError}
        </p>
      )}

      {/* Estado de carga */}
      {loading && (
        <p className="text-sm text-gray-400 animate-pulse text-center">Cargando ranking…</p>
      )}

      {/* Lista de resultados */}
      {!loading && searched && ranking.length === 0 && !queryError && (
        <p className="text-sm text-gray-400 text-center py-4">
          No se encontraron resultados para este código
        </p>
      )}

      {!loading && ranking.length > 0 && (
        <div className="flex flex-col gap-1">
          {/* Cabecera */}
          {/* La etiqueta de la segunda columna es larga y envuelve a propósito:
              «Tiempo» a secas se leía como tiempo de sesión, y lo que se muestra
              son solo los segundos clasificados como buena postura. Se le cede
              una columna del grid a costa de «Nombre», que ya trunca. */}
          <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 px-2 py-1 items-end leading-tight">
            <span className="col-span-1">#</span>
            <span className="col-span-3">Nombre</span>
            <span className="col-span-4 text-right">Tiempo de buena postura</span>
            <span className="col-span-2 text-right">Nivel</span>
            <span className="col-span-2 text-right">Racha</span>
          </div>

          {/* Filas */}
          {ranking.map((entry, index) => (
            <div
              key={`${entry.displayName}-${index}`}
              className="grid grid-cols-12 gap-2 text-sm text-white bg-gray-800 rounded-lg px-2 py-2 items-center"
            >
              <span className="col-span-1 text-gray-400 font-mono">{index + 1}</span>
              <span className="col-span-3 truncate">{entry.displayName}</span>
              <span className="col-span-4 text-right font-mono text-green-400">
                {formatSeconds(entry.goodPostureSeconds)}
              </span>
              <span className="col-span-2 text-right">{entry.level}</span>
              <span className="col-span-2 text-right">{entry.streakDays}d</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
