import { useEffect, useState } from "react";
import { collectLowStock, type LowStockItem } from "@/domain/stock/lowStock";
import { Toast } from "@/hooks/Dialog";
import { productService } from "@/services/api/productService";

const NOTICE_KEY = "horuspdv.lowStockNotice";
let announcedSignature = "";

function announceLowStock(items: LowStockItem[]) {
  const signature = items
    .map((item) => `${item.id}:${item.quantity}`)
    .sort()
    .join("|");

  if (!signature) {
    announcedSignature = "";
    try {
      window.sessionStorage.removeItem(NOTICE_KEY);
    } catch {
      // Sem armazenamento, o aviso da sessão simplesmente não persiste.
    }
    return;
  }

  if (announcedSignature === signature) return;
  try {
    if (window.sessionStorage.getItem(NOTICE_KEY) === signature) {
      announcedSignature = signature;
      return;
    }
    window.sessionStorage.setItem(NOTICE_KEY, signature);
  } catch {
    // Segue com a memória da aba.
  }
  announcedSignature = signature;

  const preview = items
    .slice(0, 3)
    .map((item) => item.name)
    .join(", ");
  const extra = items.length > 3 ? ` e mais ${items.length - 3}` : "";
  Toast.warning(
    items.length === 1
      ? `Estoque baixo: ${items[0].name} precisa de reposição.`
      : `Estoque baixo: ${items.length} produtos precisam de reposição (${preview}${extra}).`,
    7000,
  );
}

export function useLowStock() {
  const [items, setItems] = useState<LowStockItem[]>([]);

  useEffect(() => {
    let active = true;

    const load = () => {
      productService
        .list()
        .then((products) => {
          if (!active) return;
          const next = collectLowStock(products);
          setItems(next);
          announceLowStock(next);
        })
        .catch(() => {
          if (active) setItems([]);
        });
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "horuspdv.stockTick") load();
    };

    load();
    window.addEventListener("horuspdv-stock-change", load);
    window.addEventListener("storage", onStorage);
    return () => {
      active = false;
      window.removeEventListener("horuspdv-stock-change", load);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return items;
}
