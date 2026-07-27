/**
 * Doble de prueba de `IdentityDataClient` (Sistema_Identidad).
 *
 * Simula, en memoria y sin red:
 * - `NickClaim`/`EmailClaim` con condición de clave: un segundo `create` con
 *   la misma clave falla con `TAKEN`, igual que la escritura condicionada de
 *   DynamoDB sobre un modelo con `.identifier([...])`. No es "last write wins".
 * - `UserIdentity` con "índices" en memoria (`findByNickLower`/`findByEmail`
 *   recorren el mapa de identidades, como harían `listByNickLower`/`listByEmail`).
 * - Inyección de fallos (`failOn`) e inyección de retardo infinito (`hangOn`),
 *   para poder testear `withTimeout` sin temporizadores reales.
 * - Traza de toda operación con sus argumentos, base de las Propiedades 12 y 14
 *   (p. ej.: el correo solo debe aparecer en la traza de las operaciones del alta).
 *
 * `createFakeIdentityClient()` es una fábrica, no un singleton: cada test
 * pide su propia instancia con `Map`s y traza limpias.
 *
 * Nota de reconciliación: en el momento de escribir este fichero,
 * `src/storage/identityService.ts` (tarea 6.1) todavía no existe, así que
 * `IdentityDataClient`, `ClaimResult` y `UserIdentityInput` se declaran aquí
 * como alias locales que reflejan exactamente la forma fijada en el diseño.
 * Cuando `identityService.ts` exista, sustituir estos alias por un
 * `import type { IdentityDataClient, ClaimResult, UserIdentityInput } from '../identityService'`
 * y borrar las declaraciones locales de abajo.
 */
import type { ActiveIdentity } from '../identityErrors';

// ─── Tipos locales (reconciliar con identityService.ts, ver nota arriba) ──

export type ClaimResult = { ok: true } | { ok: false; reason: 'TAKEN' | 'FAILED' };

export interface UserIdentityInput {
  id: string;
  nick: string;
  nickLower: string;
  email: string;
}

export interface IdentityDataClient {
  createEmailClaim(email: string, identityId: string): Promise<ClaimResult>;
  getEmailClaim(email: string): Promise<{ identityId: string } | null>;
  createNickClaim(nickLower: string, identityId: string): Promise<ClaimResult>;
  getNickClaim(nickLower: string): Promise<{ identityId: string } | null>;
  findByNickLower(nickLower: string): Promise<ActiveIdentity | null>;
  findByEmail(email: string): Promise<ActiveIdentity | null>;
  createIdentity(record: UserIdentityInput): Promise<ActiveIdentity | null>;
  updateNick(id: string, nick: string, nickLower: string): Promise<ActiveIdentity | null>;
}

// ─── Inyección de fallos y de retardo infinito ─────────────────────────────

/** Decide si una operación concreta debe fallar, según su nombre y argumentos. */
export type FailPredicate = (op: string, args: unknown[]) => boolean;

/** Conjunto de nombres de operación que siempre fallan, o un predicado a medida. */
export type FailSpec = Set<string> | FailPredicate;

export interface FakeIdentityClientOptions {
  /** Operaciones que deben devolver su fallo (TAKEN/FAILED/null según el caso). */
  failOn?: FailSpec;
  /** Operaciones que deben quedarse colgadas para siempre (retardo infinito). */
  hangOn?: Set<string>;
}

// ─── Traza de operaciones ──────────────────────────────────────────────────

export interface TraceEntry {
  op: string;
  args: unknown[];
}

export interface FakeIdentityClient extends IdentityDataClient {
  /** Traza mutable de toda llamada, en orden. Preferir `getTrace()` en los tests. */
  readonly trace: readonly TraceEntry[];
  /** Copia de la traza acumulada hasta el momento. */
  getTrace(): TraceEntry[];
}

/** Crea una instancia nueva e independiente del doble. Nunca un singleton. */
export function createFakeIdentityClient(
  options: FakeIdentityClientOptions = {},
): FakeIdentityClient {
  const nickClaims = new Map<string, string>();
  const emailClaims = new Map<string, string>();
  const identities = new Map<string, UserIdentityInput>();
  const trace: TraceEntry[] = [];

  const { failOn, hangOn } = options;

  function shouldFail(op: string, args: unknown[]): boolean {
    if (!failOn) return false;
    return failOn instanceof Set ? failOn.has(op) : failOn(op, args);
  }

  function pushTrace(op: string, args: unknown[]): void {
    trace.push({ op, args });
  }

  function toActiveIdentity(input: UserIdentityInput): ActiveIdentity {
    return { nick: input.nick, userIdentityId: input.id };
  }

  /** Promesa que nunca se resuelve ni se rechaza: simula un retardo infinito. */
  function hang<T>(): Promise<T> {
    return new Promise<T>(() => {});
  }

  const client: FakeIdentityClient = {
    trace,

    getTrace(): TraceEntry[] {
      return trace.slice();
    },

    async createEmailClaim(email: string, identityId: string): Promise<ClaimResult> {
      const op = 'createEmailClaim';
      const args: unknown[] = [email, identityId];
      pushTrace(op, args);
      if (hangOn?.has(op)) return hang<ClaimResult>();
      if (shouldFail(op, args)) return { ok: false, reason: 'FAILED' };
      if (emailClaims.has(email)) return { ok: false, reason: 'TAKEN' };
      emailClaims.set(email, identityId);
      return { ok: true };
    },

    async getEmailClaim(email: string): Promise<{ identityId: string } | null> {
      const op = 'getEmailClaim';
      const args: unknown[] = [email];
      pushTrace(op, args);
      if (hangOn?.has(op)) return hang<{ identityId: string } | null>();
      if (shouldFail(op, args)) return null;
      const identityId = emailClaims.get(email);
      return identityId ? { identityId } : null;
    },

    async createNickClaim(nickLower: string, identityId: string): Promise<ClaimResult> {
      const op = 'createNickClaim';
      const args: unknown[] = [nickLower, identityId];
      pushTrace(op, args);
      if (hangOn?.has(op)) return hang<ClaimResult>();
      if (shouldFail(op, args)) return { ok: false, reason: 'FAILED' };
      if (nickClaims.has(nickLower)) return { ok: false, reason: 'TAKEN' };
      nickClaims.set(nickLower, identityId);
      return { ok: true };
    },

    async getNickClaim(nickLower: string): Promise<{ identityId: string } | null> {
      const op = 'getNickClaim';
      const args: unknown[] = [nickLower];
      pushTrace(op, args);
      if (hangOn?.has(op)) return hang<{ identityId: string } | null>();
      if (shouldFail(op, args)) return null;
      const identityId = nickClaims.get(nickLower);
      return identityId ? { identityId } : null;
    },

    async findByNickLower(nickLower: string): Promise<ActiveIdentity | null> {
      const op = 'findByNickLower';
      const args: unknown[] = [nickLower];
      pushTrace(op, args);
      if (hangOn?.has(op)) return hang<ActiveIdentity | null>();
      if (shouldFail(op, args)) return null;
      for (const entry of identities.values()) {
        if (entry.nickLower === nickLower) return toActiveIdentity(entry);
      }
      return null;
    },

    async findByEmail(email: string): Promise<ActiveIdentity | null> {
      const op = 'findByEmail';
      const args: unknown[] = [email];
      pushTrace(op, args);
      if (hangOn?.has(op)) return hang<ActiveIdentity | null>();
      if (shouldFail(op, args)) return null;
      for (const entry of identities.values()) {
        if (entry.email === email) return toActiveIdentity(entry);
      }
      return null;
    },

    async createIdentity(input: UserIdentityInput): Promise<ActiveIdentity | null> {
      const op = 'createIdentity';
      const args: unknown[] = [input];
      pushTrace(op, args);
      if (hangOn?.has(op)) return hang<ActiveIdentity | null>();
      if (shouldFail(op, args)) return null;
      identities.set(input.id, { ...input });
      return toActiveIdentity(input);
    },

    async updateNick(id: string, nick: string, nickLower: string): Promise<ActiveIdentity | null> {
      const op = 'updateNick';
      const args: unknown[] = [id, nick, nickLower];
      pushTrace(op, args);
      if (hangOn?.has(op)) return hang<ActiveIdentity | null>();
      if (shouldFail(op, args)) return null;
      const existing = identities.get(id);
      if (!existing) return null;
      const updated: UserIdentityInput = { ...existing, nick, nickLower };
      identities.set(id, updated);
      return toActiveIdentity(updated);
    },
  };

  return client;
}
