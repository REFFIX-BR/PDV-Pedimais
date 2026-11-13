/**
 * Arquivo: src/pages/Admin/CashOverviewPage.tsx
 * Objetivo: mostra ao administrador todos os caixas abertos, com venda, lucro e saída.
 * Entradas esperadas: não recebe props; consulta o painel da empresa logada.
 */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import { Toast } from "@/hooks/Dialog";
import PageLayout from "@/layout/PageLayout";
import { cashRegisterService, type CashOverviewDto } from "@/services/api/cashRegisterService";

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
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

function money(value?: string) {
  return `R$ ${value || "0,00"}`;
}

export default function CashOverviewPage() {
  const [overview, setOverview] = useState<CashOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const data = await cashRegisterService.overview();
    setOverview(
      data ?? {
        openCount: 0,
        salesTotal: "0,00",
        profitTotal: "0,00",
        withdrawalTotal: "0,00",
        supplyTotal: "0,00",
        drawers: [],
      },
    );
  };

  useEffect(() => {
    let active = true;
    load()
      .catch(() => {
        if (active) Toast.error("Não foi possível carregar os caixas abertos.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      await load();
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os caixas.");
    } finally {
      setLoading(false);
    }
  };

  const drawers = overview?.drawers ?? [];

  return (
    <PageLayout className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title="Caixas abertos"
        description="Venda, lucro e saída de cada operador. O lucro é a venda menos o custo cadastrado do produto."
        action={
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-xl border border-border-secondary px-4 py-2 text-sm font-semibold text-text-secondary"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Atualizar
          </button>
        }
      />

      <section data-tour="caixas-resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Caixas abertos</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{overview?.openCount ?? 0}</p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Vendas</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{money(overview?.salesTotal)}</p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Lucro</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-800">{money(overview?.profitTotal)}</p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Saídas</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{money(overview?.withdrawalTotal)}</p>
        </article>
      </section>

      {loading && !overview ? (
        <p className="text-sm text-text-secondary">Carregando caixas...</p>
      ) : drawers.length === 0 ? (
        <section data-tour="caixas-lista" className="card p-5 text-sm text-text-secondary">
          Nenhum caixa aberto agora. Cada operador abre o próprio em Abertura e Fechamento.
        </section>
      ) : (
        <div data-tour="caixas-lista" className="grid gap-4">
          {drawers.map((drawer) => (
            <article key={`${drawer.operatorName}-${drawer.openedAt}`} className="card p-4 md:p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">{drawer.operatorName}</h2>
                  <p className="text-sm text-text-secondary">
                    Aberto desde {formatDateTime(drawer.openedAt)} • {formatElapsed(drawer.elapsedMinutes)}
                  </p>
                </div>
                <p className="text-sm text-text-secondary">
                  {drawer.salesCount} {drawer.salesCount === 1 ? "venda" : "vendas"}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-xl border border-border-primary p-3">
                  <p className="text-xs text-text-secondary">Vendas</p>
                  <p className="mt-1 text-lg font-semibold">{money(drawer.salesTotal)}</p>
                </div>
                <div className="rounded-xl border border-border-primary p-3">
                  <p className="text-xs text-text-secondary">Lucro</p>
                  <p className="mt-1 text-lg font-semibold text-emerald-800">{money(drawer.profitTotal)}</p>
                </div>
                <div className="rounded-xl border border-border-primary p-3">
                  <p className="text-xs text-text-secondary">Saída</p>
                  <p className="mt-1 text-lg font-semibold text-primary">{money(drawer.withdrawalTotal)}</p>
                </div>
                <div className="rounded-xl border border-border-primary p-3">
                  <p className="text-xs text-text-secondary">Dinheiro na gaveta</p>
                  <p className="mt-1 text-lg font-semibold">{money(drawer.expectedCash)}</p>
                </div>
              </div>
              <p className="mt-3 text-sm text-text-secondary">
                Abertura {money(drawer.openingAmount)} • Suprimento {money(drawer.supplyTotal)} • Dinheiro{" "}
                {money(drawer.cashSalesTotal)} • PIX {money(drawer.pixTotal)} • Débito {money(drawer.debitTotal)} •
                Crédito {money(drawer.creditTotal)}
              </p>
            </article>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
