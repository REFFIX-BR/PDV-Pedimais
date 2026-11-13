/**
 * Arquivo: src/utils/formDraft.ts
 * Objetivo: guarda o preenchimento em andamento para voltar depois de trocar de aba ou fechar o programa.
 * Entradas esperadas: nome do rascunho e o valor atual do formulário.
 */
import { useEffect, useRef } from "react";
import { getStoredAuthUser } from "@/utils/authStorage";

function draftStorageKey(name: string) {
  const owner = getStoredAuthUser()?.id || "local";
  return `pdv.draft.${owner}.${name}`;
}

function withoutLargeDataUrls(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:") && value.length > 80000 ? "" : value;
  }
  if (Array.isArray(value)) return value.map(withoutLargeDataUrls);
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = withoutLargeDataUrls(item);
    }
    return next;
  }
  return value;
}

export function readFormDraft<T>(name: string): T | null {
  try {
    const raw = window.localStorage.getItem(draftStorageKey(name));
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeFormDraft(name: string, value: unknown) {
  const key = draftStorageKey(name);
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    try {
      window.localStorage.setItem(key, JSON.stringify(withoutLargeDataUrls(value)));
    } catch {
      // O navegador recusou o rascunho. O preenchimento continua só nesta tela.
    }
  }
}

export function hasFilledValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  if (Array.isArray(value)) return value.some(hasFilledValue);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, item]) => {
      if (key === "open" || key === "editingId" || key === "productUnit" || key === "role" || key === "status") {
        return false;
      }
      return hasFilledValue(item);
    });
  }
  return false;
}

export function clearFormDraft(name: string) {
  try {
    window.localStorage.removeItem(draftStorageKey(name));
  } catch {
    // Sem acesso ao armazenamento local, não há rascunho para apagar.
  }
}

export function usePersistFormDraft(name: string, value: unknown) {
  const valueRef = useRef(value);
  valueRef.current = value;
  const serialized = JSON.stringify(value);

  useEffect(() => {
    const timer = window.setTimeout(() => writeFormDraft(name, valueRef.current), 200);
    return () => window.clearTimeout(timer);
  }, [name, serialized]);

  useEffect(() => {
    const persist = () => writeFormDraft(name, valueRef.current);
    window.addEventListener("pagehide", persist);
    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
    };
  }, [name]);
}
