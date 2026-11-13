/**
 * Arquivo: src/services/offline/localDb.ts
 * Objetivo: fala com o SQLite do caixa, aberto pelo Electron.
 * Entradas esperadas: no navegador puro não existe banco local e as chamadas não fazem nada.
 */

type LocalBridge = {
  invoke: (payload: Record<string, unknown>) => Promise<unknown>;
};

function bridge() {
  if (typeof window === "undefined") return null;
  const local = (window as Window & { pdvLocal?: LocalBridge }).pdvLocal;
  return local ?? null;
}

export function hasLocalDatabase() {
  return bridge() !== null;
}

async function call<T>(payload: Record<string, unknown>, fallback: T): Promise<T> {
  const local = bridge();
  if (!local) return fallback;
  return (await local.invoke(payload)) as T;
}

export function saveLocalProducts(companyId: string, rows: unknown[], replace: boolean) {
  return call({ op: "saveProducts", companyId, rows, replace }, 0);
}

export function listLocalProducts<T>(companyId: string) {
  return call<T[]>({ op: "listProducts", companyId }, []);
}

export function adjustLocalStock(companyId: string, lines: Array<{ code: string; quantity: number }>) {
  return call({ op: "adjustStock", companyId, lines }, false);
}

export function saveLocalSale(sale: {
  companyId: string;
  saleNumber: string;
  customerName: string;
  customerCpf: string;
  paymentType: string;
  totalAmount: string;
  operatorName: string;
  saleDate: string;
  items: Array<{ code: string; name: string; quantity: number }>;
}) {
  return call({ op: "saveSale", sale }, false);
}

export function enqueueLocal(item: { id: string; url: string; method: string; body?: string; createdAt: string }) {
  return call<string>({ op: "enqueue", item }, item.id);
}

export function pendingLocal<T>() {
  return call<T[]>({ op: "pending" }, []);
}

export function markLocalSent(ids: string[]) {
  return call({ op: "markSent", ids }, false);
}

export function saveLocalState(key: string, value: unknown) {
  return call({ op: "saveState", key, value }, false);
}

export function readLocalState<T>(key: string) {
  return call<T | null>({ op: "readState", key }, null);
}
