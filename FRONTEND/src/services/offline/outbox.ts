/**
 * Arquivo: src/services/offline/outbox.ts
 * Objetivo: guarda envios que não chegaram ao servidor e reenvia quando a rede volta.
 * Entradas esperadas: URL, método e corpo já montados pela chamada que falhou.
 */
import { getStoredAuthToken } from "@/utils/authStorage";

const OUTBOX_KEY = "horuspdv.outbox";
const CACHE_KEY = "horuspdv.cache";

export type OutboxItem = {
  id: string;
  url: string;
  method: string;
  body?: string;
  createdAt: string;
};

type CacheBag = Record<string, unknown>;

function readOutbox(): OutboxItem[] {
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]) {
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export function enqueueOutbox(entry: Omit<OutboxItem, "id" | "createdAt">) {
  const item: OutboxItem = {
    ...entry,
    id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    createdAt: new Date().toISOString(),
  };
  writeOutbox([...readOutbox(), item]);
  return item.id;
}

function readBag(): CacheBag {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheBag;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function readJsonCache<T>(key: string): T | undefined {
  const value = readBag()[key];
  return value as T | undefined;
}

export function writeJsonCache(key: string, value: unknown) {
  const bag = readBag();
  bag[key] = value;
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(bag));
}

let flushing = false;

export async function flushOutbox() {
  if (flushing || typeof window === "undefined") return 0;
  const items = readOutbox();
  if (items.length === 0) return 0;

  flushing = true;
  let sent = 0;
  const remaining: OutboxItem[] = [];
  try {
    for (const item of items) {
      let response: Response;
      try {
        const token = getStoredAuthToken();
        response = await fetch(item.url, {
          method: item.method,
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: item.body,
        });
      } catch {
        remaining.push(item, ...items.slice(items.indexOf(item) + 1));
        break;
      }

      if (response.status === 401 || response.status === 502 || response.status === 503 || response.status === 504) {
        remaining.push(item, ...items.slice(items.indexOf(item) + 1));
        break;
      }

      if (response.ok) {
        sent += 1;
        continue;
      }

      remaining.push(item);
    }
  } finally {
    writeOutbox(remaining);
    flushing = false;
  }

  return sent;
}

export const OUTBOX_SENT_EVENT = "pdv-outbox-sent";

export function startOutboxSync(
  onSent: (count: number) => void,
  onOnline?: () => Promise<void>,
) {
  let timer = 0;

  const run = () => {
    void flushOutbox().then((count) => {
      if (count > 0) {
        onSent(count);
        window.dispatchEvent(new CustomEvent(OUTBOX_SENT_EVENT));
      }
    });
  };

  const handleOnline = () => {
    void (async () => {
      if (onOnline) {
        try {
          await onOnline();
        } catch {
          // A rede voltou no navegador, mas o servidor ainda não respondeu.
        }
      }
      run();
    })();
  };

  window.addEventListener("online", handleOnline);
  timer = window.setInterval(run, 20000);
  run();

  return () => {
    window.removeEventListener("online", handleOnline);
    window.clearInterval(timer);
  };
}
