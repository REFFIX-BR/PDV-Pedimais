/**
 * Arquivo: src/services/api/cashRegisterService.ts
 * Objetivo: encapsula chamadas HTTP de abertura, fechamento e status de caixa.
 * Entradas esperadas: recebe payloads já validados pelas telas e retorna respostas tipadas da API.
 */
import { apiRequest, SavedOfflineError } from "./apiClient";
import { readJsonCache, writeJsonCache } from "@/services/offline/outbox";

const CAIXA_API_URL = import.meta.env.VITE_CAIXA_API_URL ?? "http://localhost:5260/api/Caixa";

export type CashRegisterSessionDto = {
  id: string;
  status: string;
  openedAt: string;
  closedAt?: string | null;
  openingAmount: string;
  closingAmount: string;
  operatorName: string;
  closedByName: string;
  note: string;
  elapsedMinutes: number;
  supplyTotal?: string;
  withdrawalTotal?: string;
  cashSalesTotal?: string;
  exchangeTotal?: string;
  expectedCash?: string;
  movements?: CashMovementDto[];
  sales?: CashSaleDto[];
};

export type CashSaleDto = {
  saleNumber: string;
  paymentType: string;
  totalAmount: string;
  operatorName: string;
  saleDate: string;
};

export type CashMovementDto = {
  id: string;
  type: "sangria" | "suprimento" | string;
  amount: string;
  reason: string;
  operatorName: string;
  createdAt: string;
};

export type OpenDrawerDto = {
  operatorName: string;
  openedAt: string;
  elapsedMinutes: number;
};

export type CashRegisterStatusDto = {
  state: "aberto" | "fechado" | "expirado" | string;
  canSell: boolean;
  blockReason: string;
  serverNow: string;
  historyScope?: "loja" | "meu" | string;
  currentSession?: CashRegisterSessionDto | null;
  lastSession?: CashRegisterSessionDto | null;
  history: CashRegisterSessionDto[];
  openDrawers?: OpenDrawerDto[];
};

export type CashDrawerOverviewDto = {
  operatorName: string;
  openedAt: string;
  elapsedMinutes: number;
  openingAmount: string;
  salesCount: number;
  salesTotal: string;
  cashSalesTotal: string;
  pixTotal: string;
  debitTotal: string;
  creditTotal: string;
  profitTotal: string;
  supplyTotal: string;
  withdrawalTotal: string;
  expectedCash: string;
};

export type CashOverviewDto = {
  openCount: number;
  salesTotal: string;
  profitTotal: string;
  withdrawalTotal: string;
  supplyTotal: string;
  drawers: CashDrawerOverviewDto[];
};

const CASH_CACHE = "cash-status";

function rememberCash(status: CashRegisterStatusDto | undefined) {
  if (status) writeJsonCache(CASH_CACHE, status);
  return status;
}

function offlineCash(patch: Partial<CashRegisterStatusDto>): CashRegisterStatusDto {
  const previous = readJsonCache<CashRegisterStatusDto>(CASH_CACHE);
  const next: CashRegisterStatusDto = {
    state: previous?.state ?? "fechado",
    canSell: previous?.canSell ?? false,
    blockReason: previous?.blockReason ?? "",
    serverNow: new Date().toISOString(),
    historyScope: previous?.historyScope,
    currentSession: previous?.currentSession,
    lastSession: previous?.lastSession,
    history: previous?.history ?? [],
    openDrawers: previous?.openDrawers,
    ...patch,
  };
  writeJsonCache(CASH_CACHE, next);
  return next;
}

export const cashRegisterService = {
  async overview() {
    const response = await apiRequest<CashOverviewDto>(`${CAIXA_API_URL}/painel`);
    return response.data;
  },
  async status() {
    const response = await apiRequest<CashRegisterStatusDto>(`${CAIXA_API_URL}/status`, {
      cacheKey: CASH_CACHE,
    });
    return response.data;
  },
  async open(openingAmount: string) {
    try {
      const response = await apiRequest<CashRegisterStatusDto>(`${CAIXA_API_URL}/abrir`, {
        method: "POST",
        body: JSON.stringify({ openingAmount }),
        offlineQueue: true,
        cacheKey: CASH_CACHE,
      });
      return rememberCash(response.data);
    } catch (error) {
      if (!(error instanceof SavedOfflineError)) throw error;
      return offlineCash({
        state: "aberto",
        canSell: true,
        blockReason: "",
        currentSession: {
          id: "local",
          status: "aberto",
          openedAt: new Date().toISOString(),
          openingAmount,
          closingAmount: "0,00",
          operatorName: "",
          closedByName: "",
          note: "",
          elapsedMinutes: 0,
          supplyTotal: "0,00",
          withdrawalTotal: "0,00",
          cashSalesTotal: "0,00",
          exchangeTotal: "0,00",
          expectedCash: openingAmount,
          movements: [],
          sales: [],
        },
      });
    }
  },
  async close(closingAmount: string, note = "") {
    try {
      const response = await apiRequest<CashRegisterStatusDto>(`${CAIXA_API_URL}/fechar`, {
        method: "POST",
        body: JSON.stringify({ closingAmount, note }),
        offlineQueue: true,
        cacheKey: CASH_CACHE,
      });
      return rememberCash(response.data);
    } catch (error) {
      if (!(error instanceof SavedOfflineError)) throw error;
      const previous = readJsonCache<CashRegisterStatusDto>(CASH_CACHE);
      return offlineCash({
        state: "fechado",
        canSell: false,
        blockReason: "Abra o seu caixa antes de iniciar vendas.",
        currentSession: null,
        lastSession: previous?.currentSession ?? previous?.lastSession ?? null,
      });
    }
  },
  async movement(type: "sangria" | "suprimento", amount: string, reason: string) {
    try {
      const response = await apiRequest<CashRegisterStatusDto>(`${CAIXA_API_URL}/${type}`, {
        method: "POST",
        body: JSON.stringify({ amount, reason }),
        offlineQueue: true,
        cacheKey: CASH_CACHE,
      });
      return rememberCash(response.data);
    } catch (error) {
      if (!(error instanceof SavedOfflineError)) throw error;
      return offlineCash({});
    }
  },
};
