/**
 * Arquivo: src/components/Desktop/DesktopUpdateNotice.tsx
 * Objetivo: avisa que uma versão nova do caixa já foi baixada e pode entrar sem reinstalar.
 * Entradas esperadas: escuta o programa de desktop; no navegador não aparece.
 */
import { useEffect, useState } from "react";

type DesktopUpdate = {
  status: "available" | "ready";
  version: string;
};

type DesktopBridge = {
  onUpdate?: (callback: (update: DesktopUpdate) => void) => () => void;
  installUpdate?: () => void;
};

function desktopBridge() {
  return (window as Window & { horusDesktop?: DesktopBridge }).horusDesktop;
}

export default function DesktopUpdateNotice() {
  const [update, setUpdate] = useState<DesktopUpdate | null>(null);

  useEffect(() => {
    const desktop = desktopBridge();
    if (!desktop?.onUpdate) return;
    return desktop.onUpdate(setUpdate);
  }, []);

  if (!update) return null;

  const ready = update.status === "ready";

  return (
    <div className="fixed bottom-4 left-1/2 z-layer-modal flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-border-primary bg-bg-light px-4 py-3 text-sm text-text-primary shadow-lg">
      <p>
        {ready
          ? `Versão ${update.version} pronta. O caixa instala sozinho quando fechar.`
          : `Baixando a versão ${update.version} para este caixa.`}
      </p>
      {ready ? (
        <button
          type="button"
          onClick={() => desktopBridge()?.installUpdate?.()}
          className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-text-light"
        >
          Reiniciar agora
        </button>
      ) : null}
    </div>
  );
}
