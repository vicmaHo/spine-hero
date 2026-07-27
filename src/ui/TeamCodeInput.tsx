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
    <div className="flex flex-col gap-1.5">
      <label htmlFor="my-team-code" className="rpg-label">MI CÓDIGO DE EQUIPO</label>
      <div className="flex gap-2">
        <input
          id="my-team-code"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          placeholder="Ej. DEMO1"
          maxLength={20}
          className="rpg-field min-w-0 flex-1"
        />
        <button
          onClick={handleSave}
          disabled={!valid || value === teamCode}
          className="rpg-btn rpg-btn-green rpg-btn-sm shrink-0"
        >
          GUARDAR
        </button>
      </div>
      {value.length > 0 && !valid && (
        <p className="text-[11px] font-medium text-[#8e2820]">4-20 caracteres alfanuméricos</p>
      )}
      {msg && <p className="text-[11px] font-bold text-[#4a7a30]">{msg}</p>}
      {teamCode && (
        <button
          onClick={handleClear}
          className="text-left text-[11px] font-medium text-[#8a6239] underline decoration-dotted transition-colors hover:text-[#5c4128]"
        >
          Salir del equipo «{teamCode}»
        </button>
      )}
    </div>
  );
}
