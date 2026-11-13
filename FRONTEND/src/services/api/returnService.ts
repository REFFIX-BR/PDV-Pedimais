/**
 * Arquivo: src/services/api/returnService.ts
 * Objetivo: lista devoluções e envia o estorno de uma venda já paga.
 * Entradas esperadas: venda, motivo, quantidades que voltam e, na troca, os produtos novos.
 */
import { apiRequest, SavedOfflineError } from "./apiClient";

const DEVOLUCOES_API_URL =
  import.meta.env.VITE_DEVOLUCOES_API_URL ?? "http://localhost:5260/api/Devolucoes";

export type ReturnItemDto = {
  direction: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  itemTotal: string;
};

export type ReturnDto = {
  id: string;
  saleNumber: string;
  kind: string;
  reason: string;
  refundAmount: string;
  chargeAmount: string;
  paymentType: string;
  operatorName: string;
  createdAt: string;
  status: string;
  items: ReturnItemDto[];
};

export type ReturnPayload = {
  saleNumber: string;
  reason: string;
  differencePayment: string;
  returns: Array<{ productCode: string; quantity: number }>;
  replacements: Array<{ productCode: string; quantity: number }>;
};

export const returnService = {
  async list() {
    const response = await apiRequest<ReturnDto[]>(DEVOLUCOES_API_URL);
    return response.data ?? [];
  },
  async create(payload: ReturnPayload) {
    try {
      const response = await apiRequest<ReturnDto>(DEVOLUCOES_API_URL, {
        method: "POST",
        body: JSON.stringify(payload),
        offlineQueue: true,
      });
      return response.data;
    } catch (error) {
      if (!(error instanceof SavedOfflineError)) throw error;
      return {
        id: error.localId,
        saleNumber: payload.saleNumber,
        kind: payload.replacements.length > 0 ? "troca" : "devolucao",
        reason: payload.reason,
        refundAmount: "0,00",
        chargeAmount: "0,00",
        paymentType: payload.differencePayment,
        operatorName: "",
        createdAt: new Date().toISOString(),
        status: "pendente",
        items: [],
        savedOffline: true,
      } satisfies ReturnDto & { savedOffline: true };
    }
  },
};
