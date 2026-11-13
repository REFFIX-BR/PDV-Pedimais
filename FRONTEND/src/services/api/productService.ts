/**
 * Arquivo: src/services/api/productService.ts
 * Objetivo: encapsula chamadas HTTP de cadastro, estoque e manutenção de produtos.
 * Entradas esperadas: recebe payloads já validados pelas telas e retorna respostas tipadas da API.
 */
import { apiRequest } from "./apiClient";
import { readJsonCache, writeJsonCache } from "@/services/offline/outbox";

const PRODUTO_API_URL =
  import.meta.env.VITE_PRODUTO_API_URL ?? "http://localhost:5260/api/Produto";

export type ProductDto = {
  id: string;
  productImageUrl: string;
  productImageName: string;
  productName: string;
  productCode: string;
  productSupplier: string;
  productDescription: string;
  productUnit: string;
  productQnt: string;
  productUnitPrice: string;
  productSalePrice: string;
  totalPriceOnProduct: string;
};

export type ProductPayload = Omit<ProductDto, "id">;

export function reduceCachedProductStock(productCode: string, quantity: number) {
  const items = readJsonCache<ProductDto[]>("products");
  if (!items) return;
  writeJsonCache(
    "products",
    items.map((item) => {
      if (item.productCode !== productCode) return item;
      const text = (item.productQnt || "0").trim();
      const normalized =
        text.includes(",") && text.includes(".")
          ? text.replace(/\./g, "").replace(",", ".")
          : text.replace(",", ".");
      const current = Number(normalized);
      const next = Math.max(0, (Number.isFinite(current) ? current : 0) - quantity);
      return { ...item, productQnt: String(next) };
    }),
  );
}

export const productService = {
  async list() {
    const response = await apiRequest<ProductDto[]>(PRODUTO_API_URL, { cacheKey: "products" });
    return response.data ?? [];
  },
  async create(payload: ProductPayload) {
    const response = await apiRequest<ProductDto>(PRODUTO_API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.data;
  },
  async update(id: string, payload: ProductPayload) {
    const response = await apiRequest<ProductDto>(`${PRODUTO_API_URL}/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    return response.data;
  },
  async remove(id: string) {
    await apiRequest<object>(`${PRODUTO_API_URL}/${id}`, { method: "DELETE" });
  },
};
