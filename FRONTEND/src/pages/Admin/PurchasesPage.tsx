/**
 * Arquivo: src/pages/Admin/PurchasesPage.tsx
 * Objetivo: registra pedidos de compra e, ao receber a mercadoria, soma a quantidade no estoque.
 * Entradas esperadas: não recebe props; usa os produtos e fornecedores da empresa logada.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import type { MarketModuleRecord } from "@/components/Admin/MarketModulePage";
import {
  formatStockQuantity,
  isLowStock,
  LOW_STOCK_LIMIT,
  notifyStockChanged,
  parseStockQuantity,
} from "@/domain/stock/lowStock";
import { Toast } from "@/hooks/Dialog";
import useInputMasks from "@/hooks/InputMasks/useInputMasks";
import PageLayout from "@/layout/PageLayout";
import { marketModuleService } from "@/services/api/marketModuleService";
import { productService, type ProductDto } from "@/services/api/productService";
import { supplierService } from "@/services/api/supplierService";
import { readFormDraft, usePersistFormDraft } from "@/utils/formDraft";

type PurchaseLine = {
  productId: string;
  name: string;
  code: string;
  unit: string;
  quantity: number;
  unitCost: number;
};

type PurchaseOrder = {
  id: string;
  supplier: string;
  lines: PurchaseLine[];
  status: string;
  amount: string;
  legacy?: boolean;
  title?: string;
  description?: string;
};

const MODULE_ID = "compras";

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatQuantityInput(quantity: number, unit: string) {
  if (unit === "kg" || unit === "l") {
    return quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  return String(Math.max(0, Math.round(quantity)));
}

function sanitizeQuantity(value: string, unit: string) {
  if (unit === "kg" || unit === "l") {
    const cleaned = value.replace(/[^\d,]/g, "");
    const [whole, fraction] = cleaned.split(",");
    if (fraction === undefined) return whole.slice(0, 8);
    return `${whole.slice(0, 8)},${fraction.slice(0, 3)}`;
  }
  return value.replace(/\D/g, "").slice(0, 8);
}

function fold(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseOrder(record: MarketModuleRecord): PurchaseOrder {
  try {
    const data = JSON.parse(record.meta) as { v?: number; supplier?: string; lines?: PurchaseLine[] };
    if (data.v === 1 && data.supplier && Array.isArray(data.lines) && data.lines.length > 0) {
      return {
        id: record.id,
        supplier: data.supplier,
        lines: data.lines,
        status: record.status,
        amount: record.amount || "",
      };
    }
  } catch {
    // Registro antigo do formulário genérico.
  }
  return {
    id: record.id,
    supplier: record.title,
    lines: [],
    status: record.status,
    amount: record.amount || "",
    legacy: true,
    title: record.title,
    description: record.description,
  };
}

function isWaiting(order: PurchaseOrder) {
  return !order.legacy && fold(order.status).includes("aguard");
}

function lineLabel(line: PurchaseLine) {
  return `${line.name} ${formatStockQuantity(line.quantity, line.unit)}`;
}

export default function PurchasesPage() {
  const { maskMoneyBr, parseMoneyBr } = useInputMasks();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedPurchase] = useState(() =>
    readFormDraft<{
      creating: boolean;
      supplier: string;
      productSearch: string;
      drafts: Record<string, { quantity: string; cost: string }>;
    }>("compra"),
  );
  const [creating, setCreating] = useState(() => Boolean(savedPurchase?.creating));
  const [supplier, setSupplier] = useState(() => savedPurchase?.supplier ?? "");
  const [productSearch, setProductSearch] = useState(() => savedPurchase?.productSearch ?? "");
  const [drafts, setDrafts] = useState<Record<string, { quantity: string; cost: string }>>(
    () => savedPurchase?.drafts ?? {},
  );
  usePersistFormDraft("compra", { creating, supplier, productSearch, drafts });
  const [confirm, setConfirm] = useState<{ kind: "receber" | "cancelar"; orderId: string } | null>(null);

  const load = async () => {
    const [productItems, supplierItems, config] = await Promise.all([
      productService.list(),
      supplierService.list(),
      marketModuleService.get(MODULE_ID),
    ]);
    setProducts(productItems);
    setSuppliers(supplierItems.map((item) => item.fantasyName || item.companyName).filter(Boolean));
    setOrders((config?.records ?? []).map(parseOrder));
  };

  useEffect(() => {
    let active = true;
    load()
      .catch(() => {
        if (active) Toast.error("Não foi possível carregar as compras.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const lowStock = useMemo(
    () =>
      products
        .map((product) => ({
          product,
          quantity: parseStockQuantity(product.productQnt || "0"),
          unit: product.productUnit || "un",
        }))
        .filter((row) => isLowStock(row.quantity))
        .sort((left, right) => left.quantity - right.quantity || left.product.productName.localeCompare(right.product.productName, "pt-BR")),
    [products],
  );

  const waitingCount = orders.filter(isWaiting).length;
  const receivedCount = orders.filter((order) => !order.legacy && !isWaiting(order)).length;
  const supplierProducts = products
    .filter((product) => product.productSupplier === supplier)
    .filter((product) => {
      if (!productSearch.trim()) return true;
      return fold(`${product.productName} ${product.productCode}`).includes(fold(productSearch.trim()));
    })
    .sort((left, right) => left.productName.localeCompare(right.productName, "pt-BR"));

  const draftLines = supplierProducts.flatMap((product) => {
    const draft = drafts[product.id];
    const quantity = parseStockQuantity(draft?.quantity || "0");
    if (quantity <= 0) return [];
    return [
      {
        productId: product.id,
        name: product.productName,
        code: product.productCode,
        unit: product.productUnit || "un",
        quantity,
        unitCost: parseMoneyBr(draft?.cost || "0"),
      } satisfies PurchaseLine,
    ];
  });
  const draftTotal = draftLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);

  const openOrder = (product?: ProductDto) => {
    const nextSupplier = product?.productSupplier && suppliers.includes(product.productSupplier) ? product.productSupplier : "";
    setSupplier(nextSupplier);
    setProductSearch(product?.productName ?? "");
    setDrafts(
      product
        ? {
            [product.id]: {
              quantity: "",
              cost: product.productUnitPrice || "",
            },
          }
        : {},
    );
    setCreating(true);
  };

  const closeOrder = (force = false) => {
    if (saving && !force) return;
    setCreating(false);
    setSupplier("");
    setProductSearch("");
    setDrafts({});
  };

  const setDraft = (product: ProductDto, field: "quantity" | "cost", value: string) => {
    setDrafts((current) => ({
      ...current,
      [product.id]: {
        quantity: current[product.id]?.quantity ?? "",
        cost: current[product.id]?.cost ?? product.productUnitPrice ?? "",
        [field]: value,
      },
    }));
  };

  const buildPayload = (status: string, lines: PurchaseLine[], supplierName: string) => {
    const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
    return {
      title: supplierName,
      description: lines.map(lineLabel).join(", ").slice(0, 500),
      status,
      amount: formatMoney(total).slice(0, 40),
      meta: JSON.stringify({ v: 1, supplier: supplierName, lines }),
    };
  };

  const validateLines = (lines: PurchaseLine[]) => {
    if (!supplier) {
      Toast.error("Selecione o fornecedor.");
      return false;
    }
    if (lines.length === 0) {
      Toast.error("Informe a quantidade de pelo menos um produto.");
      return false;
    }
    for (const line of lines) {
      if ((line.unit === "un" || !line.unit) && line.quantity !== Math.floor(line.quantity)) {
        Toast.error(`${line.name} aceita só número inteiro.`);
        return false;
      }
      if (line.unitCost <= 0) {
        Toast.error(`Informe o custo de ${line.name}.`);
        return false;
      }
    }
    return true;
  };

  const applyStock = async (lines: PurchaseLine[]) => {
    let catalog = products;
    for (const line of lines) {
      const product = catalog.find((item) => item.id === line.productId);
      if (!product) throw new Error(`${line.name} não está mais no cadastro.`);
      const unit = product.productUnit || "un";
      const next = parseStockQuantity(product.productQnt || "0") + line.quantity;
      const cost = line.unitCost > 0 ? line.unitCost : parseMoneyBr(product.productUnitPrice || "0");
      const updated = await productService.update(product.id, {
        productImageUrl: product.productImageUrl,
        productImageName: product.productImageName,
        productName: product.productName,
        productCode: product.productCode,
        productSupplier: product.productSupplier,
        productDescription: product.productDescription,
        productUnit: unit,
        productQnt: formatQuantityInput(next, unit),
        productUnitPrice: formatMoney(cost),
        productSalePrice: product.productSalePrice,
        totalPriceOnProduct: formatMoney(next * cost),
      });
      if (updated) catalog = catalog.map((item) => (item.id === updated.id ? updated : item));
    }
    setProducts(catalog);
    notifyStockChanged();
  };

  const saveOrder = async (receiveNow: boolean) => {
    if (!validateLines(draftLines)) return;
    setSaving(true);
    try {
      if (receiveNow) await applyStock(draftLines);
      const config = await marketModuleService.createRecord(
        MODULE_ID,
        buildPayload(receiveNow ? "Recebido" : "Aguardando", draftLines, supplier),
      );
      if (config) setOrders(config.records.map(parseOrder));
      Toast.success(receiveNow ? "Mercadoria recebida e estoque atualizado." : "Pedido salvo. O estoque muda quando a mercadoria chegar.");
      setSaving(false);
      closeOrder(true);
    } catch (error) {
      Toast.error(
        receiveNow
          ? "Não foi possível concluir. Confira o estoque antes de receber de novo."
          : error instanceof Error
            ? error.message
            : "Não foi possível salvar o pedido.",
      );
      if (receiveNow) await load().catch(() => undefined);
      setSaving(false);
    }
  };

  const receiveExisting = async (order: PurchaseOrder) => {
    setSaving(true);
    try {
      await applyStock(order.lines);
      const config = await marketModuleService.updateRecord(MODULE_ID, order.id, buildPayload("Recebido", order.lines, order.supplier));
      if (config) setOrders(config.records.map(parseOrder));
      Toast.success("Mercadoria recebida. O estoque foi atualizado.");
      setConfirm(null);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível receber o pedido.");
      await load().catch(() => undefined);
    } finally {
      setSaving(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    setSaving(true);
    try {
      const config = await marketModuleService.removeRecord(MODULE_ID, orderId);
      if (config) setOrders(config.records.map(parseOrder));
      Toast.success("Pedido cancelado. O estoque não mudou.");
      setConfirm(null);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível cancelar o pedido.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title="Compras e Reposição"
        description="Peça mercadoria ao fornecedor. O estoque só aumenta quando a compra é recebida."
        action={
          <button type="button" onClick={() => openOrder()} className="btn-primary inline-flex items-center gap-2">
            <Plus size={16} />
            Novo pedido
          </button>
        }
      />

      <section data-tour="compras-resumo" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Para repor</p>
          <p className="mt-1 text-2xl font-semibold text-amber-800">{lowStock.length}</p>
          <p className="text-xs text-text-secondary">{LOW_STOCK_LIMIT} ou menos</p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Pedidos em aberto</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{waitingCount}</p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Recebidos</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{receivedCount}</p>
        </article>
      </section>

      <section data-tour="compras-repor" className="card overflow-hidden">
        <div className="border-b border-border-primary px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Precisa repor</h2>
          <p className="text-sm text-text-secondary">Produtos com estoque de {LOW_STOCK_LIMIT} ou menos.</p>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-text-secondary">Carregando...</p>
        ) : lowStock.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-secondary">Nenhum produto precisa de reposição agora.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-bg-primary text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Estoque</th>
                  <th className="px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((row) => (
                  <tr key={row.product.id} className="border-t border-border-primary">
                    <td className="px-4 py-3 font-medium">{row.product.productName}</td>
                    <td className="px-4 py-3">{row.product.productSupplier}</td>
                    <td className="px-4 py-3 font-semibold text-amber-800">{formatStockQuantity(row.quantity, row.unit)}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openOrder(row.product)}
                        className="rounded-lg border border-border-primary px-3 py-1.5 text-xs font-semibold"
                      >
                        Pedir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section data-tour="compras-pedidos" className="card overflow-hidden">
        <div className="border-b border-border-primary px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Pedidos</h2>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-text-secondary">Carregando pedidos...</p>
        ) : orders.length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-secondary">Nenhum pedido. Use Novo pedido para comprar de um fornecedor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-bg-primary text-left text-text-secondary">
                <tr>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Itens</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-t border-border-primary">
                    <td className="px-4 py-3 font-medium">{order.legacy ? order.title : order.supplier}</td>
                    <td className="px-4 py-3">{order.legacy ? order.description || "Registro antigo" : order.lines.map(lineLabel).join(", ")}</td>
                    <td className="px-4 py-3">{order.amount ? `R$ ${order.amount}` : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isWaiting(order) ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {order.status || "Sem status"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {isWaiting(order) ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirm({ kind: "receber", orderId: order.id })}
                            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-text-light"
                          >
                            Receber
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirm({ kind: "cancelar", orderId: order.id })}
                            className="rounded-lg border border-border-primary px-3 py-1.5 text-xs font-semibold"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirm({ kind: "cancelar", orderId: order.id })}
                          className="rounded-lg border border-border-primary px-3 py-1.5 text-xs font-semibold"
                        >
                          Remover
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {creating && (
        <div className="fixed inset-0 z-layer-modal flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border-primary bg-bg-light p-5 text-text-primary">
            <h2 className="text-lg font-semibold">Novo pedido</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Escolha o fornecedor e preencha só o que vai comprar. Salvar pedido não mexe no estoque.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm text-text-secondary">Fornecedor *</span>
              <select
                value={supplier}
                onChange={(event) => {
                  setSupplier(event.target.value);
                  setDrafts({});
                  setProductSearch("");
                }}
                className="input-field w-full"
              >
                <option value="">Selecione</option>
                {suppliers.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            {supplier && (
              <>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-sm text-text-secondary">Produto</span>
                  <input
                    value={productSearch}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(event) => setProductSearch(event.target.value)}
                    className="input-field w-full"
                    placeholder="Filtre por nome ou código"
                  />
                </label>
                <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
                  {supplierProducts.length === 0 ? (
                    <p className="text-sm text-text-secondary">Esse fornecedor não tem produto com esse nome.</p>
                  ) : (
                    supplierProducts.map((product) => {
                      const unit = product.productUnit || "un";
                      const quantity = parseStockQuantity(product.productQnt || "0");
                      const draft = drafts[product.id];
                      return (
                        <div key={product.id} className="rounded-lg border border-border-primary p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium">{product.productName}</p>
                            <p className="text-sm text-text-secondary">
                              {product.productCode} · estoque {formatStockQuantity(quantity, unit)}
                            </p>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="mb-1 block text-xs text-text-secondary">Quantidade</span>
                              <input
                                value={draft?.quantity ?? ""}
                                inputMode={unit === "un" ? "numeric" : "decimal"}
                                onChange={(event) => setDraft(product, "quantity", sanitizeQuantity(event.target.value, unit))}
                                className="input-field w-full"
                                placeholder="0"
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs text-text-secondary">Custo unitário</span>
                              <input
                                value={draft?.cost ?? product.productUnitPrice}
                                inputMode="numeric"
                                onChange={(event) => setDraft(product, "cost", maskMoneyBr(event.target.value))}
                                className="input-field w-full"
                                placeholder="0,00"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <p className="mt-3 text-sm text-text-secondary">
                  {draftLines.length === 0
                    ? "Nenhum item no pedido."
                    : `${draftLines.length} ${draftLines.length === 1 ? "item" : "itens"} · R$ ${formatMoney(draftTotal)}`}
                </p>
              </>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => closeOrder()} className="btn-cancel" disabled={saving}>
                Cancelar
              </button>
              <button type="button" onClick={() => void saveOrder(false)} className="btn-outline-secondary" disabled={saving}>
                {saving ? "Salvando..." : "Salvar pedido"}
              </button>
              <button type="button" onClick={() => void saveOrder(true)} className="btn-success" disabled={saving}>
                {saving ? "Salvando..." : "Receber agora"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-layer-modal flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border-primary bg-bg-light p-5 text-text-primary">
            <h2 className="text-lg font-semibold">{confirm.kind === "receber" ? "Receber mercadoria" : "Remover pedido"}</h2>
            <p className="mt-2 text-sm text-text-secondary">
              {confirm.kind === "receber"
                ? "A quantidade deste pedido entra no estoque."
                : "O pedido sai da lista. O estoque não muda."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirm(null)} className="btn-cancel" disabled={saving}>
                Voltar
              </button>
              <button
                type="button"
                className="btn-success"
                disabled={saving}
                onClick={() => {
                  const order = orders.find((item) => item.id === confirm.orderId);
                  if (!order) return;
                  if (confirm.kind === "receber") void receiveExisting(order);
                  else void cancelOrder(order.id);
                }}
              >
                {saving ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
