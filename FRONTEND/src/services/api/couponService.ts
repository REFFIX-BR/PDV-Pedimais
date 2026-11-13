/**
 * Arquivo: src/services/api/couponService.ts
 * Objetivo: cadastra e confere cupons de desconto da empresa logada.
 * Entradas esperadas: código, tipo e valor já preenchidos na tela.
 */
import { apiRequest } from "./apiClient";

const CUPOM_API_URL = import.meta.env.VITE_CUPOM_API_URL ?? "/api/Cupom";

export type CouponKind = "percentual" | "fixo";

export type CouponDto = {
  id: string;
  code: string;
  description: string;
  kind: CouponKind;
  amount: string;
  active: boolean;
};

export type CouponPayload = {
  code: string;
  description: string;
  kind: CouponKind;
  amount: string;
  active: boolean;
};

export type AppliedCouponDto = {
  code: string;
  description: string;
  kind: CouponKind;
  amount: string;
  discount: string;
  payable: string;
};

export const couponService = {
  async list() {
    const response = await apiRequest<CouponDto[]>(CUPOM_API_URL);
    return response.data ?? [];
  },
  async create(payload: CouponPayload) {
    const response = await apiRequest<CouponDto>(CUPOM_API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.data;
  },
  async update(id: string, payload: CouponPayload) {
    const response = await apiRequest<CouponDto>(`${CUPOM_API_URL}/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    return response.data;
  },
  async remove(id: string) {
    await apiRequest(`${CUPOM_API_URL}/${id}`, { method: "DELETE" });
  },
  async validate(code: string, subtotal: string) {
    const response = await apiRequest<AppliedCouponDto>(`${CUPOM_API_URL}/validar`, {
      method: "POST",
      body: JSON.stringify({ code, subtotal }),
    });
    if (!response.data) {
      throw new Error(response.message || "Cupom não encontrado.");
    }
    return response.data;
  },
};
