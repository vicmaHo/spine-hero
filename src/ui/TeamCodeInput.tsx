import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

/** Regex: 4-20 caracteres alfanuméricos (mismo criterio que el RankingPanel). */
const TEAM_CODE_REGEX = /^[A-Za-z0-9]{4,20}$/;

/**
 * Input del código de equipo del usuario. Se guarda en el store y se persiste
 * en IndexedDB (profile). El synchronizer lo escribe en cada DailyRecord, así
 * que el usuario aparece en el ranking de su sala.
 *
 * Ojo: esto es "mi código" (el que se escribe en mis registros). El input de
 * búsqueda del RankingPanel es solo un filtro de lectura.
 */
export function TeamCodeInput() {
  const teamCode = useAppStore((s) => s.teamCode);
  const setTeamCode = useAppStore((s) => s.setTeamCode);
  const [value, setValue] = useState(teamCode ?? '');
  const [msg, setMsg] = useState('');

  const valid = TEAM_CODE_REGEX.test(value);

  const handleSave = () => {
    if (!valid) return;
    setTeamCode(value);
    setMsg('Guardado ✓');
    setTimeout(() => setMsg(''), 2000);
  };

  const handleClear = () => {
    setValue('');
    setTeamCode(null);
    setMsg('');
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="my-team-code" className="text-xs text-gray-400">Mi código de equipo</label>
      <div className="flex gap-2">
        <input
          id="my-team-code"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="Ej. DEMO1"
          maxLength={20}
          className="flex-1 bg-gray-800 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-700 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={handleSave}
          disabled={!valid || value === teamCode}
          className="px-3 py-1.5 rounded-lg bg-blue-600 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors"
        >
          Guardar
        </button>
      </div>
      {value.length > 0 && !valid && (
        <p className="text-xs text-red-400">4-20 caracteres alfanuméricos</p>
      )}
      {msg && <p className="text-xs text-green-400">{msg}</p>}
      {teamCode && (
        <button onClick={handleClear} className="text-xs text-gray-500 hover:text-gray-300 text-left">
          Salir del equipo «{teamCode}»
        </button>
      )}
    </div>
  );
}
