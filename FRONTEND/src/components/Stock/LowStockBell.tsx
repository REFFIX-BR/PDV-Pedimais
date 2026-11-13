import { useEffect, useRef, useState } from "react";
import { Bell, TriangleAlert } from "lucide-react";
import { formatStockQuantity, LOW_STOCK_LIMIT, stockStatusLabel } from "@/domain/stock/lowStock";
import { useLowStock } from "./useLowStock";

type LowStockBellProps = {
  tone?: "light" | "accent";
  placement?: "below" | "beside";
};

export default function LowStockBell({ tone = "light", placement = "below" }: LowStockBellProps) {
  const items = useLowStock();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const count = items.length;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={
          count === 0
            ? "Notificações de estoque"
            : `${count} ${count === 1 ? "notificação" : "notificações"} de estoque baixo`
        }
        title="Estoque baixo"
        className={`relative inline-flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm transition ${
          tone === "accent"
            ? "border-white/30 bg-white/15 text-text-light hover:bg-white/25"
            : "border-border-primary bg-bg-light text-text-primary hover:bg-accent/10"
        }`}
      >
        <Bell size={16} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-white">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-layer-popover w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-border-primary bg-bg-light text-text-primary shadow-lg ${
            placement === "beside" ? "left-full top-0 ml-2" : "right-0 mt-2"
          }`}
        >
          <div className="border-b border-border-primary px-3 py-2">
            <p className="text-sm font-semibold">Notificações</p>
            <p className="text-[11px] text-text-secondary">Estoque de {LOW_STOCK_LIMIT} ou menos</p>
          </div>
          {count === 0 ? (
            <p className="px-3 py-4 text-sm text-text-secondary">Nenhum produto com estoque baixo.</p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 border-b border-border-primary px-3 py-2 last:border-b-0">
                  <TriangleAlert size={15} className="mt-0.5 shrink-0 text-amber-700" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.name}</p>
                    <p className="text-[11px] text-text-secondary">
                      {item.code} · {stockStatusLabel(item.quantity)} · {formatStockQuantity(item.quantity, item.unit)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
