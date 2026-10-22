import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Cuit = { id: string; cuit: string; nombre?: string; jwtc?: string };
export type Account = { jwt: string; cuits: Cuit[]; cuit?: string };
export type Store = { default?: string; accounts: Record<string, Account> };

// Tokens only, never passwords. ponytail: plaintext JSON at 0600 like gh/npm, move to OS keychain if needed.
export function storeDir(): string {
  const env = process.env;
  if (env.SOSC_AXI_HOME) return env.SOSC_AXI_HOME;
  return join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "sosc-axi");
}

const storeFile = () => join(storeDir(), "accounts.json");

export function loadStore(): Store {
  try {
    return JSON.parse(readFileSync(storeFile(), "utf8"));
  } catch {
    return { accounts: {} };
  }
}

export function saveStore(store: Store): void {
  mkdirSync(storeDir(), { recursive: true, mode: 0o700 });
  writeFileSync(storeFile(), `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  chmodSync(storeFile(), 0o600);
}

/** Seconds-since-epoch `exp` claim of a JWT, if present. */
export function jwtExpiry(token: string): number | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

export function tokenStatus(token: string, now = Date.now() / 1000): string {
  const exp = jwtExpiry(token);
  if (exp === undefined) return "unknown expiry";
  return exp <= now ? "expired" : `valid until ${new Date(exp * 1000).toISOString().slice(0, 16)}Z`;
}
