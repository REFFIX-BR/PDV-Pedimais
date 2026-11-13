/**
 * Arquivo: src/pages/Admin/CashRegisterPage.tsx
 * Objetivo: gerencia abertura, fechamento, histórico e bloqueios operacionais do caixa.
 * Entradas esperadas: não recebe props; carrega status via API e executa ações do operador autenticado.
 */
import { Banknote, Clock3, LockKeyhole, RefreshCw, ShieldCheck, UnlockKeyhole } from "lucide-react";
import { type ClipboardEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import LoadingBar from "@/components/Loading/LoadingBar";
import LoadingButton from "@/components/Loading/LoadingButton";
import TablePagination from "@/components/Pagination/TablePagination";
import { Toast, useStatusDialog } from "@/hooks/Dialog";
import useInputMasks from "@/hooks/InputMasks/useInputMasks";
import PageLayout from "@/layout/PageLayout";
import {
  cashRegisterService,
  type CashMovementDto,
  type CashRegisterSessionDto,
  type CashRegisterStatusDto,
  type CashSaleDto,
} from "@/services/api/cashRegisterService";
import { OUTBOX_SENT_EVENT } from "@/services/offline/outbox";

type CashRegisterMode = "caixa" | "sangria" | "suprimento";

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatElapsed(minutes: number) {
  if (minutes < 1) return "menos de 1 min";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}min`;
}

function preventInvalidMoneyBeforeInput(event: FormEvent<HTMLInputElement>) {
  const data = (event.nativeEvent as InputEvent).data ?? "";
  if (data && /[^0-9,.]/.test(data)) {
    event.preventDefault();
  }
}

function MovementCard({
  title,
  description,
  amount,
  reason,
  reasonPlaceholder,
  submitLabel,
  onAmountChange,
  onReasonChange,
  onPasteAmount,
  onSubmit,
  saving,
}: {
  title: string;
  description: string;
  amount: string;
  reason: string;
  reasonPlaceholder: string;
  submitLabel: string;
  onAmountChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onPasteAmount: (event: ClipboardEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  saving: boolean;
}) {
  return (
    <section data-tour={title === "Sangria" ? "caixa-sangria" : "caixa-suprimento"} className="card rounded-2xl p-4">
      <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
      <p className="mt-1 text-sm text-text-secondary">{description}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Valor</span>
          <input
            value={amount}
            inputMode="numeric"
            pattern="[0-9,.]*"
            onBeforeInput={preventInvalidMoneyBeforeInput}
            onPaste={onPasteAmount}
            onChange={(event) => onAmountChange(event.target.value)}
            className="input-field w-full"
            placeholder="0,00"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm text-text-secondary">Motivo</span>
          <input
            value={reason}
            maxLength={180}
            onChange={(event) => onReasonChange(event.target.value)}
            className="input-field w-full"
            placeholder={reasonPlaceholder}
          />
        </label>
        <LoadingButton
          type="button"
          onClick={onSubmit}
          isLoading={saving}
          loadingLabel="Lançando..."
          className="btn-primary inline-flex w-full items-center justify-center gap-2 md:w-auto"
        >
          {submitLabel}
        </LoadingButton>
      </div>
    </section>
  );
}

function paymentLabel(paymentType: string) {
  if (paymentType === "dinheiro") return "Dinheiro";
  if (paymentType === "pix") return "PIX";
  if (paymentType === "debito") return "Cartão débito";
  if (paymentType === "credito") return "Cartão crédito";
  return paymentType || "-";
}

function SaleRow({ sale }: { sale: CashSaleDto }) {
  const countsInDrawer = sale.paymentType === "dinheiro";
  return (
    <tr className="border-b border-border-primary">
      <td className="px-3 py-3 text-text-secondary">{formatDateTime(sale.saleDate)}</td>
      <td className="px-3 py-3 font-semibold text-text-primary">{sale.saleNumber}</td>
      <td className="px-3 py-3 text-text-secondary">{paymentLabel(sale.paymentType)}</td>
      <td className="px-3 py-3 text-text-secondary">{sale.operatorName || "-"}</td>
      <td className={`px-3 py-3 text-right font-semibold ${countsInDrawer ? "text-success" : "text-text-primary"}`}>
        R$ {sale.totalAmount || "0,00"}
      </td>
    </tr>
  );
}

function movementLabel(type: string) {
  if (type === "sangria") return "Sangria";
  if (type === "devolucao") return "Devolução";
  if (type === "troca") return "Troca";
  return "Suprimento";
}

function MovementRow({ movement }: { movement: CashMovementDto }) {
  const isWithdrawal = movement.type === "sangria" || movement.type === "devolucao";
  return (
    <tr className="border-b border-border-primary">
      <td className="px-3 py-3 text-text-secondary">{formatDateTime(movement.createdAt)}</td>
      <td className="px-3 py-3 font-semibold text-text-primary">
        {movementLabel(movement.type)}
      </td>
      <td className="px-3 py-3 text-text-secondary">{movement.reason || "-"}</td>
      <td className="px-3 py-3 text-text-secondary">{movement.operatorName || "-"}</td>
      <td className={`px-3 py-3 text-right font-semibold ${isWithdrawal ? "text-primary" : "text-success"}`}>
        {isWithdrawal ? "−" : "+"} R$ {movement.amount || "0,00"}
      </td>
    </tr>
  );
}

function SessionRow({ session }: { session: CashRegisterSessionDto }) {
  const isOpen = session.status.toLowerCase() === "aberto";
  return (
    <tr className="border-b border-border-primary">
      <td className="px-3 py-3">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
            isOpen
              ? "border-success/30 bg-success/15 text-success"
              : "border-secondary/30 bg-secondary/10 text-secondary"
          }`}
        >
          {session.status}
        </span>
      </td>
      <td className="px-3 py-3 text-text-primary">{formatDateTime(session.openedAt)}</td>
      <td className="px-3 py-3 text-text-secondary">{formatDateTime(session.closedAt)}</td>
      <td className="px-3 py-3 text-text-secondary">{session.operatorName || "-"}</td>
      <td className="px-3 py-3 text-right font-semibold text-text-primary">
        R$ {session.openingAmount || "0,00"}
      </td>
      <td className="px-3 py-3 text-right text-text-secondary">
        R$ {session.closingAmount || "0,00"}
      </td>
    </tr>
  );
}

export default function CashRegisterPage({ mode = "caixa" }: { mode?: CashRegisterMode }) {
  const { maskMoneyBr } = useInputMasks();
  const statusDialog = useStatusDialog();
  const [cashStatus, setCashStatus] = useState<CashRegisterStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("0,00");
  const [closingAmount, setClosingAmount] = useState("0,00");
  const [closingNote, setClosingNote] = useState("");
  const [supplyAmount, setSupplyAmount] = useState("0,00");
  const [supplyReason, setSupplyReason] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("0,00");
  const [withdrawReason, setWithdrawReason] = useState("");
  const closeSectionRef = useRef<HTMLDivElement | null>(null);
  const closingAmountRef = useRef<HTMLInputElement | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const currentSession = cashStatus?.currentSession ?? null;
  const canSell = cashStatus?.canSell === true;
  const hasOpenSession = currentSession !== null;

  const stateTone = useMemo(() => {
    if (canSell) return "border-success/30 bg-success/10 text-success";
    if (cashStatus?.state === "expirado") return "border-primary/30 bg-primary/10 text-primary";
    return "border-accent/30 bg-accent/10 text-accent";
  }, [canSell, cashStatus?.state]);
  const historyRows = useMemo(() => cashStatus?.history ?? [], [cashStatus?.history]);
  const totalPages = Math.max(1, Math.ceil(historyRows.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedHistoryRows = useMemo(() => {
    const start = (safeCurrentPage - 1) * itemsPerPage;
    return historyRows.slice(start, start + itemsPerPage);
  }, [historyRows, itemsPerPage, safeCurrentPage]);

  const loadStatus = useCallback(async () => {
    const status = await cashRegisterService.status();
    setCashStatus(status ?? null);
    setClosingAmount(status?.currentSession?.closingAmount || "0,00");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStatus()
      .catch(() => {
        Toast.error("Não foi possível carregar o status do caixa.");
      })
      .finally(() => setLoading(false));
  }, [loadStatus]);

  useEffect(() => {
    const refresh = () => {
      void loadStatus().catch(() => undefined);
    };
    window.addEventListener(OUTBOX_SENT_EVENT, refresh);
    return () => window.removeEventListener(OUTBOX_SENT_EVENT, refresh);
  }, [loadStatus]);

  const updateOpeningAmount = (value: string) => setOpeningAmount(maskMoneyBr(value));
  const updateClosingAmount = (value: string) => setClosingAmount(maskMoneyBr(value));

  const pasteOpeningAmount = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    updateOpeningAmount(event.clipboardData.getData("text"));
  };

  const pasteClosingAmount = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    updateClosingAmount(event.clipboardData.getData("text"));
  };

  const pasteMovementAmount = (
    event: ClipboardEvent<HTMLInputElement>,
    apply: (value: string) => void,
  ) => {
    event.preventDefault();
    apply(maskMoneyBr(event.clipboardData.getData("text")));
  };

  const launchMovement = async (type: "sangria" | "suprimento") => {
    const amount = type === "sangria" ? withdrawAmount : supplyAmount;
    const reason = type === "sangria" ? withdrawReason : supplyReason;
    if (!reason.trim()) {
      Toast.error("Informe o motivo.");
      return;
    }

    const confirmed = await statusDialog.confirm(
      type === "sangria"
        ? `Confirmar sangria de R$ ${amount || "0,00"}?`
        : `Confirmar suprimento de R$ ${amount || "0,00"}?`,
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const status = await cashRegisterService.movement(type, amount, reason.trim());
      setCashStatus(status ?? null);
      if (type === "sangria") {
        setWithdrawAmount("0,00");
        setWithdrawReason("");
        Toast.success("Sangria lançada. O dinheiro saiu da gaveta.");
      } else {
        setSupplyAmount("0,00");
        setSupplyReason("");
        Toast.success("Suprimento lançado. O troco entrou na gaveta.");
      }
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível lançar a movimentação.");
    } finally {
      setSaving(false);
    }
  };

  const openCashRegister = async () => {
    setSaving(true);
    try {
      const status = await cashRegisterService.open(openingAmount);
      setCashStatus(status ?? null);
      Toast.success("Caixa aberto. Frente de caixa liberada para venda.");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível abrir o caixa.");
    } finally {
      setSaving(false);
    }
  };

  const closeCashRegister = async () => {
    const confirmed = await statusDialog.confirm("Fechar o caixa atual?");
    if (!confirmed) return;

    setSaving(true);
    try {
      const status = await cashRegisterService.close(closingAmount, closingNote);
      setCashStatus(status ?? null);
      setClosingNote("");
      Toast.success("Caixa fechado. Vendas bloqueadas até nova abertura.");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível fechar o caixa.");
    } finally {
      setSaving(false);
    }
  };

  const focusCloseSection = () => {
    closeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => closingAmountRef.current?.focus(), 280);
  };

  const refreshStatus = async () => {
    setLoading(true);
    try {
      await loadStatus();
      Toast.success("Status do caixa atualizado.");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o caixa.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !cashStatus) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-text-secondary">
        <LoadingBar />
      </div>
    );
  }

  return (
    <PageLayout size="wide" className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title={
          mode === "sangria"
            ? "Sangria"
            : mode === "suprimento"
              ? "Suprimento"
              : "Abertura e Fechamento de Caixa"
        }
        description={
          mode === "sangria"
            ? "Retira dinheiro da gaveta no meio do expediente. Não é troco de cliente."
            : mode === "suprimento"
              ? "Coloca dinheiro na gaveta para troco. Não entra como venda."
              : "Cada operador abre o próprio caixa. Venda, sangria e suprimento entram só na gaveta de quem está logado."
        }
        action={
          <button
            type="button"
            onClick={refreshStatus}
            className="inline-flex items-center gap-2 rounded-xl border border-border-secondary px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-hover-light hover:text-text-primary"
            disabled={loading || saving}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        }
      />

      <section data-tour="caixa-status" className={`rounded-2xl border p-4 ${stateTone}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-bg-light/80">
              {canSell ? <UnlockKeyhole size={20} /> : <LockKeyhole size={20} />}
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide">
                {canSell ? "Seu caixa está aberto" : "Venda bloqueada"}
              </p>
              <h2 className="text-xl font-bold text-text-primary">
                {canSell
                  ? `Aberto por ${formatElapsed(currentSession?.elapsedMinutes ?? 0)}`
                  : cashStatus?.blockReason || "Abra o caixa para liberar o PDV."}
              </h2>
              {currentSession ? (
                <p className="mt-1 text-sm text-text-secondary">
                  Operador: {currentSession.operatorName || "-"} • Abertura:{" "}
                  {formatDateTime(currentSession.openedAt)}. O caixa de outro operador não entra aqui.
                </p>
              ) : null}
            </div>
          </div>
          {mode === "caixa" && hasOpenSession ? (
            <button
              type="button"
              onClick={focusCloseSection}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-md transition hover:bg-hover-primary"
            >
              <LockKeyhole size={18} />
              Fechar caixa
            </button>
          ) : null}
        </div>
      </section>

      {(cashStatus?.openDrawers ?? []).length > 0 && (
        <section className="card rounded-2xl p-4">
          <h2 className="text-lg font-semibold text-text-primary">Outros caixas abertos</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Cada um fecha o próprio caixa. O dinheiro deles não mistura com o seu.
          </p>
          <ul className="mt-3 space-y-2">
            {(cashStatus?.openDrawers ?? []).map((drawer) => (
              <li
                key={`${drawer.operatorName}-${drawer.openedAt}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-primary px-3 py-2 text-sm"
              >
                <span className="font-semibold text-text-primary">{drawer.operatorName}</span>
                <span className="text-text-secondary">
                  Aberto desde {formatDateTime(drawer.openedAt)} • {formatElapsed(drawer.elapsedMinutes)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mode === "caixa" ? (
      <section data-tour="caixa-operacao" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div ref={closeSectionRef} className="card scroll-mt-4 rounded-2xl p-4">
          <div className="mb-4 flex items-center gap-2 text-text-primary">
            <Banknote size={18} />
            <h2 className="text-lg font-semibold">
              {hasOpenSession ? "Fechar caixa atual" : "Abrir caixa do dia"}
            </h2>
          </div>

          {hasOpenSession ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border-primary bg-bg-primary p-3">
                  <p className="text-xs text-text-secondary">Valor inicial</p>
                  <p className="mt-1 text-lg font-bold text-text-primary">
                    R$ {currentSession.openingAmount}
                  </p>
                </div>
                <div className="rounded-xl border border-border-primary bg-bg-primary p-3">
                  <p className="text-xs text-text-secondary">Tempo aberto</p>
                  <p className="mt-1 text-lg font-bold text-text-primary">
                    {formatElapsed(currentSession.elapsedMinutes)}
                  </p>
                </div>
                <div className="rounded-xl border border-border-primary bg-bg-primary p-3">
                  <p className="text-xs text-text-secondary">Status</p>
                  <p className="mt-1 text-lg font-bold text-text-primary">
                    {canSell ? "Regular" : "Exige fechamento"}
                  </p>
                </div>
              </div>

              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Valor de fechamento</span>
                <input
                  ref={closingAmountRef}
                  value={closingAmount}
                  inputMode="numeric"
                  pattern="[0-9,.]*"
                  onBeforeInput={preventInvalidMoneyBeforeInput}
                  onPaste={pasteClosingAmount}
                  onChange={(event) => updateClosingAmount(event.target.value)}
                  className="input-field w-full"
                  placeholder="0,00"
                />
              </label>
              <p className="text-sm text-text-secondary">
                Dinheiro esperado na gaveta:{" "}
                <span className="font-semibold text-text-primary">
                  R$ {currentSession.expectedCash || currentSession.openingAmount}
                </span>
                . Abertura R$ {currentSession.openingAmount} + suprimentos R$ {currentSession.supplyTotal || "0,00"} + vendas em dinheiro R$ {currentSession.cashSalesTotal || "0,00"} + trocas R$ {currentSession.exchangeTotal || "0,00"} − saídas R$ {currentSession.withdrawalTotal || "0,00"}.
              </p>

              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Observação</span>
                <textarea
                  value={closingNote}
                  onChange={(event) => setClosingNote(event.target.value)}
                  className="input-field min-h-24 w-full resize-y"
                  placeholder="Diferença de caixa, conferência ou observação do fechamento"
                />
              </label>

              <LoadingButton
                type="button"
                onClick={closeCashRegister}
                isLoading={saving}
                loadingLabel="Fechando..."
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-white shadow-md transition hover:bg-hover-primary sm:w-auto"
              >
                <LockKeyhole size={18} />
                Fechar caixa
              </LoadingButton>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Valor inicial</span>
                <input
                  value={openingAmount}
                  inputMode="numeric"
                  pattern="[0-9,.]*"
                  onBeforeInput={preventInvalidMoneyBeforeInput}
                  onPaste={pasteOpeningAmount}
                  onChange={(event) => updateOpeningAmount(event.target.value)}
                  className="input-field w-full"
                  placeholder="0,00"
                />
              </label>

              <LoadingButton
                type="button"
                onClick={openCashRegister}
                isLoading={saving}
                loadingLabel="Abrindo..."
                className="btn-success inline-flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                <UnlockKeyhole size={16} />
                Abrir caixa
              </LoadingButton>
            </div>
          )}
        </div>

        <aside className="card rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2 text-text-primary">
            <ShieldCheck size={18} />
            <h2 className="text-lg font-semibold">Regras aplicadas</h2>
          </div>
          <div className="space-y-3 text-sm text-text-secondary">
            <p>A venda entra no caixa de quem confirmou.</p>
            <p>Outro operador pode manter o caixa aberto ao mesmo tempo.</p>
            <p>Caixa aberto por mais de 24 horas bloqueia só as vendas desse operador.</p>
          </div>
          <div className="mt-4 rounded-xl border border-border-primary bg-bg-primary p-3 text-sm">
            <div className="flex items-center gap-2 text-text-primary">
              <Clock3 size={16} />
              <span className="font-semibold">Última movimentação</span>
            </div>
            <p className="mt-2 text-text-secondary">
              {cashStatus?.lastSession
                ? `${cashStatus.lastSession.status} em ${formatDateTime(
                    cashStatus.lastSession.closedAt || cashStatus.lastSession.openedAt,
                  )}`
                : "Nenhuma movimentação registrada."}
            </p>
          </div>
        </aside>
      </section>
      ) : !hasOpenSession || !canSell ? (
        <section className="card rounded-2xl p-4 text-sm text-text-secondary">
          {cashStatus?.blockReason || "Abra o caixa do dia em Abertura e Fechamento para lançar esta movimentação."}
        </section>
      ) : null}

      {hasOpenSession && canSell && (mode === "caixa" || mode === "suprimento") && (
        <MovementCard
          title="Suprimento"
          description="Dinheiro colocado na gaveta para troco."
          amount={supplyAmount}
          reason={supplyReason}
          reasonPlaceholder="Troco inicial, reforço de moeda..."
          submitLabel="Lançar suprimento"
          onAmountChange={(value) => setSupplyAmount(maskMoneyBr(value))}
          onReasonChange={setSupplyReason}
          onPasteAmount={(event) => pasteMovementAmount(event, setSupplyAmount)}
          onSubmit={() => launchMovement("suprimento")}
          saving={saving}
        />
      )}

      {hasOpenSession && canSell && (mode === "caixa" || mode === "sangria") && (
        <MovementCard
          title="Sangria"
          description={`Dinheiro retirado da gaveta. Disponível agora: R$ ${currentSession?.expectedCash || "0,00"}.`}
          amount={withdrawAmount}
          reason={withdrawReason}
          reasonPlaceholder="Recolhimento do dono, pagamento de despesa..."
          submitLabel="Lançar sangria"
          onAmountChange={(value) => setWithdrawAmount(maskMoneyBr(value))}
          onReasonChange={setWithdrawReason}
          onPasteAmount={(event) => pasteMovementAmount(event, setWithdrawAmount)}
          onSubmit={() => launchMovement("sangria")}
          saving={saving}
        />
      )}

      {mode === "caixa" && hasOpenSession && (
        <section className="card overflow-hidden rounded-2xl">
          <div className="border-b border-border-primary px-4 py-3">
            <h2 className="text-lg font-semibold text-text-primary">Vendas deste caixa</h2>
            <p className="text-sm text-text-secondary">
              {(currentSession?.sales ?? []).length} venda(s) desde a abertura. Dinheiro soma na gaveta. PIX, débito e crédito ficam no histórico e não entram no dinheiro esperado.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-bg-gray-theme text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-2 text-left">Quando</th>
                  <th className="px-3 py-2 text-left">Venda</th>
                  <th className="px-3 py-2 text-left">Pagamento</th>
                  <th className="px-3 py-2 text-left">Operador</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(currentSession?.sales ?? []).map((sale) => (
                  <SaleRow key={sale.saleNumber} sale={sale} />
                ))}
                {(currentSession?.sales ?? []).length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-text-secondary" colSpan={5}>
                      Nenhuma venda neste caixa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {hasOpenSession && (
        <section className="card overflow-hidden rounded-2xl">
          <div className="border-b border-border-primary px-4 py-3">
            <h2 className="text-lg font-semibold text-text-primary">Movimentações deste caixa</h2>
            <p className="text-sm text-text-secondary">
              Suprimentos R$ {currentSession?.supplyTotal || "0,00"} • Sangrias R$ {currentSession?.withdrawalTotal || "0,00"} • Vendas em dinheiro R$ {currentSession?.cashSalesTotal || "0,00"}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-sm">
              <thead className="bg-bg-gray-theme text-xs uppercase text-text-secondary">
                <tr>
                  <th className="px-3 py-2 text-left">Quando</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Motivo</th>
                  <th className="px-3 py-2 text-left">Operador</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {(currentSession?.movements ?? [])
                  .filter((movement) => mode === "caixa" || movement.type === mode)
                  .map((movement) => (
                    <MovementRow key={movement.id} movement={movement} />
                  ))}
                {(currentSession?.movements ?? []).filter((movement) => mode === "caixa" || movement.type === mode).length === 0 && (
                  <tr>
                    <td className="px-3 py-4 text-text-secondary" colSpan={5}>
                      Nenhuma movimentação neste caixa.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {mode === "caixa" && (
      <section data-tour="caixa-historico" className="card overflow-hidden rounded-2xl">
        <div className="border-b border-border-primary px-4 py-3">
          <h2 className="text-lg font-semibold text-text-primary">Histórico de caixa</h2>
          <p className="text-sm text-text-secondary">
            {cashStatus?.historyScope === "loja"
              ? "O dinheiro esperado acima é só do seu caixa. Esta lista mostra todos os operadores."
              : "Esta lista mostra só os seus caixas."}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-bg-gray-theme text-xs uppercase text-text-secondary">
              <tr>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Abertura</th>
                <th className="px-3 py-2 text-left">Fechamento</th>
                <th className="px-3 py-2 text-left">Operador</th>
                <th className="px-3 py-2 text-right">Inicial</th>
                <th className="px-3 py-2 text-right">Final</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistoryRows.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-4">
          <TablePagination
            totalItems={historyRows.length}
            currentPage={safeCurrentPage}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={(value) => {
              setItemsPerPage(value);
              setCurrentPage(1);
            }}
          />
        </div>
      </section>
      )}

      {statusDialog.Dialog}
    </PageLayout>
  );
}
