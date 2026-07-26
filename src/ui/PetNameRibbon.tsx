import { useEffect, useRef, useState } from 'react';

/**
 * Nombre del compañero. Se guarda en localStorage: es una preferencia de
 * presentación puramente local, no forma parte del GameState ni sale del
 * navegador, así que no toca los contratos ni la sincronización.
 */
const STORAGE_KEY = 'spinehero.petName';
const DEFAULT_PET_NAME = 'TU COMPAÑERO';
const MAX_LENGTH = 16;

function readStoredName(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null && stored.trim().length > 0 ? stored : DEFAULT_PET_NAME;
  } catch {
    // Modo privado o almacenamiento bloqueado: se usa el nombre por defecto.
    return DEFAULT_PET_NAME;
  }
}

function IconPencil() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
      <path d="M4 20h4L20 8l-4-4L4 16v4z" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Cinta de título del panel del compañero, editable en línea.
 * Un clic la convierte en input; Enter confirma, Escape cancela.
 */
export function PetNameRibbon() {
  const [name, setName] = useState<string>(readStoredName);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Al entrar en edición, seleccionar el texto para poder sobrescribirlo directo.
  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    setDraft(name);
    setEditing(true);
  };

  const commit = () => {
    const clean = draft.trim().slice(0, MAX_LENGTH);
    const next = clean.length > 0 ? clean : DEFAULT_PET_NAME;
    setName(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Si no se puede persistir, el nombre sigue vivo en memoria.
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="rpg-ribbon">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          maxLength={MAX_LENGTH}
          aria-label="Nombre del compañero"
          className="w-[13ch] bg-transparent text-center text-[13px] uppercase outline-none"
          style={{
            fontFamily: 'inherit',
            color: '#f2cf6b',
            borderBottom: '2px solid rgba(242, 207, 107, 0.6)',
          }}
        />
      </span>
    );
  }

  return (
    <button
      onClick={startEditing}
      className="rpg-ribbon text-[13px] transition-transform hover:-translate-y-[1px]"
      title="Clic para cambiar el nombre"
      aria-label={`Compañero: ${name}. Clic para cambiar el nombre`}
    >
      <span className="uppercase">{name}</span>
      <span className="opacity-60">
        <IconPencil />
      </span>
    </button>
  );
}
