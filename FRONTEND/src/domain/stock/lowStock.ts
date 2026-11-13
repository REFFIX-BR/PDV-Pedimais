export const LOW_STOCK_LIMIT = 5;

export type LowStockItem = {
  id: string;
  name: string;
  code: string;
  unit: string;
  quantity: number;
};

export function parseStockQuantity(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isLowStock(quantity: number) {
  return quantity <= LOW_STOCK_LIMIT;
}

export function formatStockQuantity(quantity: number, unit: string) {
  if (unit === "kg" || unit === "l") {
    const formatted = quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    return unit === "kg" ? `${formatted} kg` : `${formatted} L`;
  }
  return `${Math.round(quantity)} un`;
}

export function stockStatusLabel(quantity: number) {
  return quantity <= 0 ? "Sem estoque" : "Estoque baixo";
}

export function collectLowStock(
  products: Array<{
    id: string;
    productName: string;
    productCode: string;
    productUnit?: string;
    productQnt?: string;
  }>,
) {
  return products
    .map((product) => ({
      id: product.id,
      name: product.productName,
      code: product.productCode,
      unit: product.productUnit || "un",
      quantity: parseStockQuantity(product.productQnt || "0"),
    }))
    .filter((product) => isLowStock(product.quantity))
    .sort((left, right) => left.quantity - right.quantity || left.name.localeCompare(right.name, "pt-BR"));
}

export function notifyStockChanged() {
  window.dispatchEvent(new Event("horuspdv-stock-change"));
  try {
    window.localStorage.setItem("horuspdv.stockTick", String(Date.now()));
  } catch {
    // A notificação local continua valendo mesmo sem armazenamento.
  }
}
