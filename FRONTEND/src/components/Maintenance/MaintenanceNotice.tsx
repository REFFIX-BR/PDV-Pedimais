/**
 * Arquivo: src/components/Maintenance/MaintenanceNotice.tsx
 * Objetivo: mostra no caixa o aviso de manutenção publicado pelo painel.
 * Entradas esperadas: recebe se a manutenção está ligada, o texto e se a tela de vendas deve pausar.
 */
type MaintenanceNoticeProps = {
  active: boolean;
  message: string;
  blocking?: boolean;
  onBack?: () => void;
};

const DEFAULT_MESSAGE = "A loja está em manutenção. As vendas ficam pausadas até a liberação.";

export default function MaintenanceNotice({
  active,
  message,
  blocking = false,
  onBack,
}: MaintenanceNoticeProps) {
  if (!active) return null;
  const text = message.trim() || DEFAULT_MESSAGE;

  if (!blocking) {
    return (
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <strong className="font-semibold">Manutenção ligada.</strong>{" "}
        O caixa mostra este aviso: {text}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/70 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-title"
        className="w-full max-w-md rounded-2xl border border-amber-200 bg-white p-5 text-slate-900 shadow-xl"
      >
        <h2 id="maintenance-title" className="text-xl font-semibold">
          Caixa em manutenção
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{text}</p>
        {onBack ? (
          <button type="button" className="btn-cancel mt-5 min-h-11 w-full" onClick={onBack}>
            Voltar ao painel
          </button>
        ) : (
          <p className="mt-5 text-sm text-slate-500">
            Este aviso some sozinho quando a manutenção for encerrada no painel.
          </p>
        )}
      </section>
    </div>
  );
}
