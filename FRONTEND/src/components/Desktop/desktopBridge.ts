/**
 * Arquivo: src/components/Desktop/desktopBridge.ts
 * Objetivo: lê a versão instalada e o aviso de atualização no programa de desktop.
 * Entradas esperadas: no navegador as funções não existem e a tela segue sem a versão.
 */
import { useEffect, useState } from "react";

export type DesktopUpdate = {
  status: "available" | "ready";
  version: string;
};

type DesktopBridge = {
  onUpdate?: (callback: (update: DesktopUpdate) => void) => () => void;
  installUpdate?: () => void;
  getVersion?: () => Promise<string>;
  updatedVersion?: () => Promise<string>;
  dismissUpdated?: () => Promise<void>;
};

export function desktopBridge() {
  return (window as Window & { horusDesktop?: DesktopBridge }).horusDesktop;
}

export function useDesktopVersion() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    const read = desktopBridge()?.getVersion;
    if (!read) return;
    let alive = true;
    read()
      .then((value) => {
        if (alive) setVersion(String(value || "").trim());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return version;
}
