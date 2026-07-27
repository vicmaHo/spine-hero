/**
 * Doble de prueba del Almacen_Local_Identidad (`src/storage/db.ts`, funciones
 * `getLocalIdentityRecord`/`saveLocalIdentityRecord`/`clearLocalIdentityRecord`).
 *
 * `identityLocal.ts` no recibe un cliente inyectado: llama directamente a esas
 * tres funciones de `db.ts`. Este doble implementa el mismo contrato en
 * memoria, con fallos y retardos inyectables, para poder testear la lógica
 * real de `identityLocal.ts` (validación del nick leído, mapeo a
 * `IdentityResult`) sin IndexedDB real, sustituyendo `./db` con `vi.mock`.
 *
 * `createFakeLocalIdentity()` es una fábrica, no un singleton: cada test pide
 * su propia instancia con estado y traza limpios.
 */
import type { LocalIdentityRecord } from '../db';

export type LocalIdentityOp = 'get' | 'save' | 'clear';

export interface FakeLocalIdentityOptions {
  /** Operaciones que deben rechazar su promesa (simula un fallo de IndexedDB). */
  failOn?: Set<LocalIdentityOp>;
  /** Retardo en ms antes de resolver cada operación indicada. */
  delayMs?: Partial<Record<LocalIdentityOp, number>>;
}

export interface FakeLocalIdentity {
  getLocalIdentityRecord(): Promise<LocalIdentityRecord | null>;
  saveLocalIdentityRecord(record: LocalIdentityRecord): Promise<void>;
  clearLocalIdentityRecord(): Promise<void>;
  /** Lee el registro crudo guardado, sin pasar por `identityLocal.ts`. */
  peek(): LocalIdentityRecord | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Crea una instancia nueva e independiente del doble. Nunca un singleton. */
export function createFakeLocalIdentity(
  options: FakeLocalIdentityOptions = {},
): FakeLocalIdentity {
  let stored: LocalIdentityRecord | null = null;
  const { failOn, delayMs } = options;

  async function maybeDelayAndFail(op: LocalIdentityOp): Promise<void> {
    const ms = delayMs?.[op];
    if (ms !== undefined) {
      await delay(ms);
    }
    if (failOn?.has(op)) {
      throw new Error(`fakeLocalIdentity: fallo inyectado en '${op}'`);
    }
  }

  return {
    async getLocalIdentityRecord(): Promise<LocalIdentityRecord | null> {
      await maybeDelayAndFail('get');
      return stored === null ? null : { ...stored };
    },

    async saveLocalIdentityRecord(record: LocalIdentityRecord): Promise<void> {
      await maybeDelayAndFail('save');
      stored = { ...record };
    },

    async clearLocalIdentityRecord(): Promise<void> {
      await maybeDelayAndFail('clear');
      stored = null;
    },

    peek(): LocalIdentityRecord | null {
      return stored === null ? null : { ...stored };
    },
  };
}
