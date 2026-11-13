/**
 * Arquivo: src/services/api/productService.ts
 * Objetivo: encapsula chamadas HTTP de cadastro, estoque e manutenção de produtos.
 * Entradas esperadas: recebe payloads já validados pelas telas e retorna respostas tipadas da API.
 */
import { getStoredAuthUser } from "@/utils/authStorage";
import { apiRequest, TransportError } from "./apiClient";
import { enqueueOutbox, readJsonCache, writeJsonCache } from "@/services/offline/outbox";
import {
  adjustLocalStock,
  hasLocalDatabase,
  listLocalProducts,
  saveLocalProducts,
  saveLocalSale,
} from "@/services/offline/localDb";

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

function companyId() {
  return getStoredAuthUser()?.companyId || "";
}

export async function recordOfflineSale(sale: {
  saleNumber: string;
  customerName: string;
  customerCpf: string;
  paymentType: string;
  totalAmount: string;
  operatorName: string;
  items: Array<{ code: string; name: string; quantity: number }>;
}) {
  const company = companyId();
  if (!company || !hasLocalDatabase()) return;
  await adjustLocalStock(
    company,
    sale.items.map((item) => ({ code: item.code, quantity: item.quantity })),
  );
  await saveLocalSale({
    companyId: company,
    saleDate: new Date().toISOString(),
    ...sale,
  });
}

export const productService = {
  async list() {
    try {
      const response = await apiRequest<ProductDto[]>(PRODUTO_API_URL);
      const rows = response.data ?? [];
      writeJsonCache("products", rows);
      if (hasLocalDatabase()) await saveLocalProducts(companyId(), rows, true);
      return rows;
    } catch (error) {
      if (error instanceof TransportError && hasLocalDatabase()) {
        const local = await listLocalProducts<ProductDto>(companyId());
        if (local.length > 0) return local;
      }
      if (error instanceof TransportError) {
        const cached = readJsonCache<ProductDto[]>("products");
        if (cached) return cached;
      }
      throw error;
    }
  },
  async create(payload: ProductPayload) {
    const response = await apiRequest<ProductDto>(PRODUTO_API_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return response.data;
  },
  async update(id: string, payload: ProductPayload) {
    try {
      const response = await apiRequest<ProductDto>(`${PRODUTO_API_URL}/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (hasLocalDatabase() && response.data) await saveLocalProducts(companyId(), [response.data], false);
      return response.data;
    } catch (error) {
      if (!(error instanceof TransportError) || !hasLocalDatabase()) throw error;
      const row: ProductDto = { id, ...payload };
      await saveLocalProducts(companyId(), [row], false);
      await enqueueOutbox({
        url: `${PRODUTO_API_URL}/${id}`,
        method: "PUT",
        body: JSON.stringify(payload),
      });
      return row;
    }
  },
  async remove(id: string) {
    await apiRequest<object>(`${PRODUTO_API_URL}/${id}`, { method: "DELETE" });
  },
};
