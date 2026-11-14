/**
 * Arquivo: src/components/Desktop/DesktopUpdateNotice.tsx
 * Objetivo: avisa a versão nova já baixada e, na abertura seguinte, a versão que acabou de entrar.
 * Entradas esperadas: escuta o programa de desktop; no navegador não aparece.
 */
import { useEffect, useState } from "react";
import { desktopBridge, type DesktopUpdate } from "./desktopBridge";

export default function DesktopUpdateNotice() {
  const [update, setUpdate] = useState<DesktopUpdate | null>(null);
  const [updatedVersion, setUpdatedVersion] = useState("");

  useEffect(() => {
    const desktop = desktopBridge();
    if (!desktop?.onUpdate) return;
    return desktop.onUpdate(setUpdate);
  }, []);

  useEffect(() => {
    const read = desktopBridge()?.updatedVersion;
    if (!read) return;
    let alive = true;
    read()
      .then((value) => {
        if (alive) setUpdatedVersion(String(value || "").trim());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const dismissUpdated = () => {
    setUpdatedVersion("");
    void desktopBridge()?.dismissUpdated?.();
  };

  return (
    <>
      {updatedVersion ? (
        <div className="fixed top-3 left-1/2 z-layer-modal flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-lg">
          <p>Seu sistema foi atualizado para a versão {updatedVersion}.</p>
          <button
            type="button"
            onClick={dismissUpdated}
            className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-text-light"
          >
            Entendi
          </button>
        </div>
      ) : null}
      {update ? (
        <div className="fixed bottom-4 left-1/2 z-layer-modal flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-border-primary bg-bg-light px-4 py-3 text-sm text-text-primary shadow-lg">
          <p>
            {update.status === "ready"
              ? `Versão ${update.version} pronta. O caixa instala sozinho quando fechar.`
              : `Baixando a versão ${update.version} para este caixa.`}
          </p>
          {update.status === "ready" ? (
            <button
              type="button"
              onClick={() => desktopBridge()?.installUpdate?.()}
              className="shrink-0 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-text-light"
            >
              Reiniciar agora
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
