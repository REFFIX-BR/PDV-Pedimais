/**
 * Arquivo: src/components/Plan/PlanExpiredModal.tsx
 * Objetivo: bloqueia o caixa quando o plano da empresa venceu e oferece o WhatsApp da REFFIX.
 * Entradas esperadas: recebe a validade, o nome de quem está no caixa e a ação de sair.
 */
const WHATSAPP_NUMBER = "5524992995744";

type PlanExpiredModalProps = {
  expiresAt?: string | null;
  contactName: string;
  onLogout: () => void;
};

function formatPlanDay(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function PlanExpiredModal({ expiresAt, contactName, onLogout }: PlanExpiredModalProps) {
  const day = formatPlanDay(expiresAt);
  const text = [
    "Olá! O plano do PDV-Pedimais venceu e quero renovar.",
    contactName.trim() ? `Contato: ${contactName.trim()}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-expired-title"
        className="w-full max-w-md rounded-2xl border border-border-primary bg-bg-light p-5 text-text-primary shadow-xl"
      >
        <h2 id="plan-expired-title" className="text-xl font-semibold">
          Plano vencido
        </h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          {day
            ? `O plano desta empresa venceu em ${day}. O caixa fica bloqueado até a renovação com a REFFIX.`
            : "O plano desta empresa venceu. O caixa fica bloqueado até a renovação com a REFFIX."}
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onLogout} className="btn-cancel">
            Sair
          </button>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex min-h-11 items-center justify-center px-4"
          >
            Falar no WhatsApp
          </a>
        </div>
      </section>
    </div>
  );
}
