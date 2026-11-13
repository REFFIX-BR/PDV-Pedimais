import { TriangleAlert } from "lucide-react";
import { formatStockQuantity, LOW_STOCK_LIMIT, type LowStockItem } from "@/domain/stock/lowStock";

type LowStockBannerProps = {
  items: LowStockItem[];
  onOpen?: () => void;
};

export default function LowStockBanner({ items, onOpen }: LowStockBannerProps) {
  if (items.length === 0) return null;
  const preview = items
    .slice(0, 3)
    .map((item) => `${item.name} (${formatStockQuantity(item.quantity, item.unit)})`)
    .join(", ");
  const extra = items.length > 3 ? ` e mais ${items.length - 3}` : "";

  return (
    <div
      role="status"
      className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <TriangleAlert size={18} className="mt-0.5 shrink-0" />
        <p className="text-sm">
          <span className="font-semibold">Estoque baixo. </span>
          {items.length === 1 ? "1 produto" : `${items.length} produtos`} com {LOW_STOCK_LIMIT} ou menos: {preview}
          {extra}.
        </p>
      </div>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950"
        >
          Ver produtos
        </button>
      )}
    </div>
  );
}
