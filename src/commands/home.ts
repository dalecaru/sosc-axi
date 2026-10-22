import { LOGIN_HINT } from "../auth.ts";
import { loadStore, tokenStatus } from "../store.ts";

/** Offline summary for the home view and session hooks. */
export function home() {
  const store = loadStore();
  const names = Object.keys(store.accounts);
  if (!store.default || !store.accounts[store.default]) {
    return { accounts: "0 accounts logged in", help: [LOGIN_HINT] };
  }
  const a = store.accounts[store.default]!;
  const active = a.cuits.find((c) => c.id === a.cuit);
  return {
    usuario: store.default,
    session: tokenStatus(a.jwt),
    cuit: active ? `${active.cuit}${active.nombre ? ` (${active.nombre})` : ""}` : "none selected",
    accounts: `${names.length} logged in`,
    help: [
      ...(active
        ? [
            "Run `sosc-axi ventas` or `sosc-axi compras` to list invoices",
            "Run `sosc-axi cuits` to list or switch CUITs",
          ]
        : ["Run `sosc-axi cuits use <id|cuit>` to select a CUIT"]),
      ...(names.length > 1 ? ["Run `sosc-axi accounts` to see all logged-in accounts"] : []),
    ],
  };
}
