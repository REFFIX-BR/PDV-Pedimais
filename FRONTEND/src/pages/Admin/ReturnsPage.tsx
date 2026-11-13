/**
 * Arquivo: src/pages/Admin/ReturnsPage.tsx
 * Objetivo: devolve itens de uma venda paga ao estoque e, na troca, lança o produto que o cliente leva.
 * Entradas esperadas: não recebe props; usa o histórico de vendas, o estoque e o caixa de quem está logado.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import { formatStockQuantity, notifyStockChanged, parseStockQuantity } from "@/domain/stock/lowStock";
import { Toast } from "@/hooks/Dialog";
import PageLayout from "@/layout/PageLayout";
import { productService, type ProductDto } from "@/services/api/productService";
import { returnService, type ReturnDto } from "@/services/api/returnService";
import { salesHistoryService, type SaleHistoryDto } from "@/services/api/salesHistoryService";
import { hasFilledValue, readFormDraft, usePersistFormDraft } from "@/utils/formDraft";

type SaleLine = {
  code: string;
  name: string;
  quantity: number;
  returned: number;
  unitPrice: number;
  unit: string;
};

type OpenSale = {
  saleNumber: string;
  customerName: string;
  paymentType: string;
  total: number;
  refunded: number;
  status: string;
  saleDate: string;
  lines: SaleLine[];
};

type ReplacementLine = {
  code: string;
  name: string;
  unit: string;
  salePrice: number;
  quantity: string;
};

const PAYMENT_OPTIONS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Cartão débito" },
  { value: "credito", label: "Cartão crédito" },
];

function money(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoney(value: string) {
  const parsed = Number(value.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function paymentLabel(value: string) {
  return PAYMENT_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function unitOf(products: ProductDto[], code: string) {
  const unit = products.find((item) => item.productCode === code)?.productUnit?.trim().toLowerCase();
  return unit === "kg" || unit === "l" ? unit : "un";
}

function formatQuantityInput(quantity: number, unit: string) {
  if (unit === "kg") {
    return quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  return String(Math.max(0, Math.round(quantity)));
}

function parseQuantity(value: string, unit: string) {
  if (unit === "kg") return parseStockQuantity(value);
  const parsed = Number(value.replace(/\D/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeQuantity(value: string, unit: string) {
  if (unit === "kg") {
    const cleaned = value.replace(/[^\d,]/g, "");
    const [whole, fraction] = cleaned.split(",");
    if (fraction === undefined) return whole.slice(0, 8);
    return `${whole.slice(0, 8)},${fraction.slice(0, 3)}`;
  }
  return value.replace(/\D/g, "").slice(0, 8);
}

function groupSales(rows: SaleHistoryDto[], products: ProductDto[]): OpenSale[] {
  const map = new Map<string, OpenSale>();
  for (const row of rows) {
    const current = map.get(row.saleNumber) ?? {
      saleNumber: row.saleNumber,
      customerName: row.customerName,
      paymentType: row.paymentType,
      total: parseMoney(row.totalAmount || "0"),
      refunded: parseMoney(row.refundedAmount || "0"),
      status: row.status || "Concluida",
      saleDate: row.saleDate,
      lines: [],
    };
    const unit = unitOf(products, row.productCode);
    current.lines.push({
      code: row.productCode,
      name: row.productName,
      quantity: row.quantity,
      returned: row.returnedQuantity ?? 0,
      unitPrice: parseMoney(row.unitPrice || "0"),
      unit,
    });
    map.set(row.saleNumber, current);
  }
  return [...map.values()].filter((sale) => sale.lines.some((line) => line.quantity - line.returned > 0.0005));
}

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnDto[]>([]);
  const [sales, setSales] = useState<SaleHistoryDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [savedReturn] = useState(() =>
    readFormDraft<{
      open: boolean;
      saleSearch: string;
      selectedNumber: string;
      quantities: Record<string, string>;
      reason: string;
      productSearch: string;
      replacements: ReplacementLine[];
      differencePayment: string;
    }>("devolucao"),
  );
  const [open, setOpen] = useState(
    () =>
      Boolean(savedReturn?.open) ||
      hasFilledValue({
        reason: savedReturn?.reason,
        selectedNumber: savedReturn?.selectedNumber,
        replacements: savedReturn?.replacements,
      }),
  );
  const [saving, setSaving] = useState(false);
  const [saleSearch, setSaleSearch] = useState(() => savedReturn?.saleSearch ?? "");
  const [selectedNumber, setSelectedNumber] = useState(() => savedReturn?.selectedNumber ?? "");
  const [quantities, setQuantities] = useState<Record<string, string>>(() => savedReturn?.quantities ?? {});
  const [reason, setReason] = useState(() => savedReturn?.reason ?? "");
  const [productSearch, setProductSearch] = useState(() => savedReturn?.productSearch ?? "");
  const [replacements, setReplacements] = useState<ReplacementLine[]>(
    () => savedReturn?.replacements ?? [],
  );
  const [differencePayment, setDifferencePayment] = useState(() => savedReturn?.differencePayment || "dinheiro");
  usePersistFormDraft("devolucao", {
    open,
    saleSearch,
    selectedNumber,
    quantities,
    reason,
    productSearch,
    replacements,
    differencePayment,
  });

  const load = () => {
    returnService.list().then(setReturns).catch(() => setReturns([]));
    salesHistoryService.list().then(setSales).catch(() => setSales([]));
    productService.list().then(setProducts).catch(() => setProducts([]));
  };

  useEffect(() => {
    load();
  }, []);

  const openSales = useMemo(() => groupSales(sales, products), [sales, products]);
  const visibleSales = useMemo(() => {
    const term = fold(saleSearch.trim());
    if (!term) return openSales.slice(0, 8);
    return openSales
      .filter((sale) => fold(`${sale.saleNumber} ${sale.customerName}`).includes(term))
      .slice(0, 8);
  }, [openSales, saleSearch]);
  const selected = openSales.find((sale) => sale.saleNumber === selectedNumber) ?? null;

  const preview = useMemo(() => {
    if (!selected) return { refund: 0, charge: 0, net: 0 };
    const gross = selected.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
    const returnedGross = selected.lines.reduce((sum, line) => {
      const qty = parseQuantity(quantities[line.code] || "0", line.unit);
      return sum + line.unitPrice * qty;
    }, 0);
    const room = Math.max(0, selected.total - selected.refunded);
    const merchandise = gross <= 0 ? 0 : Math.min(room, (selected.total * returnedGross) / gross);
    const replacement = replacements.reduce(
      (sum, line) => sum + line.salePrice * parseQuantity(line.quantity, line.unit),
      0,
    );
    const net = Math.round((replacement - merchandise) * 100) / 100;
    return {
      refund: net < 0 ? Math.abs(net) : 0,
      charge: net > 0 ? net : 0,
      net,
    };
  }, [quantities, replacements, selected]);

  const replacementOptions = useMemo(() => {
    const term = fold(productSearch.trim());
    if (term.length < 1) return [];
    return products
      .filter((item) => fold(`${item.productName} ${item.productCode}`).includes(term))
      .slice(0, 6);
  }, [productSearch, products]);

  const resetForm = () => {
    setSaleSearch("");
    setSelectedNumber("");
    setQuantities({});
    setReason("");
    setProductSearch("");
    setReplacements([]);
    setDifferencePayment("dinheiro");
  };

  const chooseSale = (sale: OpenSale) => {
    setSelectedNumber(sale.saleNumber);
    setSaleSearch(`${sale.saleNumber} · ${sale.customerName}`);
    setDifferencePayment(sale.paymentType === "pix" || sale.paymentType === "debito" || sale.paymentType === "credito" ? sale.paymentType : "dinheiro");
    const next: Record<string, string> = {};
    for (const line of sale.lines) {
      const remaining = Math.max(0, line.quantity - line.returned);
      next[line.code] = remaining > 0 ? formatQuantityInput(remaining, line.unit) : "0";
    }
    setQuantities(next);
  };

  const addReplacement = (product: ProductDto) => {
    const unit = unitOf([product], product.productCode);
    setReplacements((current) => {
      if (current.some((item) => item.code === product.productCode)) return current;
      return [
        ...current,
        {
          code: product.productCode,
          name: product.productName,
          unit,
          salePrice: parseMoney(product.productSalePrice || product.productUnitPrice || "0"),
          quantity: unit === "kg" ? "" : "1",
        },
      ];
    });
    setProductSearch("");
  };

  const submit = async () => {
    if (!selected) {
      Toast.error("Escolha a venda.");
      return;
    }
    const returnLines = selected.lines
      .map((line) => ({ productCode: line.code, quantity: parseQuantity(quantities[line.code] || "0", line.unit) }))
      .filter((line) => line.quantity > 0);
    if (returnLines.length === 0) {
      Toast.error("Informe a quantidade que volta para o estoque.");
      return;
    }
    if (reason.trim().length < 3) {
      Toast.error("Informe o motivo da devolução.");
      return;
    }
    setSaving(true);
    try {
      const result = await returnService.create({
        saleNumber: selected.saleNumber,
        reason: reason.trim(),
        differencePayment,
        returns: returnLines,
        replacements: replacements
          .map((line) => ({ productCode: line.code, quantity: parseQuantity(line.quantity, line.unit) }))
          .filter((line) => line.quantity > 0),
      });
      Toast.success(
        result && "savedOffline" in result && result.savedOffline
          ? "Devolução guardada neste caixa. Vai para o servidor quando a internet voltar."
          : result?.kind === "troca"
            ? "Troca registrada. O estoque foi atualizado."
            : "Produto devolvido ao estoque e venda estornada.",
      );
      notifyStockChanged();
      setOpen(false);
      resetForm();
      load();
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível registrar a devolução.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title="Trocas e Devoluções"
        description="A quantidade volta para o estoque e a venda fica estornada. Em dinheiro, o valor sai da gaveta de quem está logado."
        action={
          <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
            Nova devolução
          </button>
        }
      />

      <section data-tour="devolucoes-lista" className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="bg-bg-primary text-left text-text-secondary">
              <tr>
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Venda</th>
                <th className="px-3 py-3">Tipo</th>
                <th className="px-3 py-3">Itens</th>
                <th className="px-3 py-3 text-right">Valor</th>
                <th className="px-3 py-3">Operador</th>
              </tr>
            </thead>
            <tbody>
              {returns.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-text-secondary">
                    Nenhuma devolução ainda. Use Nova devolução em uma venda já paga.
                  </td>
                </tr>
              )}
              {returns.map((item) => {
                const charge = parseMoney(item.chargeAmount || "0");
                const refund = parseMoney(item.refundAmount || "0");
                const value = charge > 0 ? `Recebeu R$ ${money(charge)}` : refund > 0 ? `Devolveu R$ ${money(refund)}` : "Sem diferença";
                return (
                  <tr key={item.id} className="border-t border-border-primary">
                    <td className="px-3 py-3 text-text-secondary">{item.createdAt}</td>
                    <td className="px-3 py-3 font-semibold text-text-primary">{item.saleNumber}</td>
                    <td className="px-3 py-3">{item.kind === "troca" ? "Troca" : "Devolução"}</td>
                    <td className="px-3 py-3">
                      {item.items.map((line) => `${line.direction === "sai" ? "Levou" : "Voltou"} ${line.quantity} ${line.productName}`).join(" · ")}
                      <span className="mt-1 block text-xs text-text-secondary">{item.reason}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold">{value}</td>
                    <td className="px-3 py-3 text-text-secondary">{item.operatorName}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-layer-modal flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-bg-light p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-text-primary">Nova devolução</h2>
            <p className="mt-1 text-sm text-text-secondary">
              O caixa precisa estar aberto. O produto volta para a prateleira e a venda deixa de valer a quantidade devolvida.
            </p>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm text-text-secondary">Venda</span>
              <input
                value={saleSearch}
                onChange={(event) => {
                  setSaleSearch(event.target.value);
                  setSelectedNumber("");
                }}
                className="input-field w-full"
                placeholder="Número da venda ou cliente"
                autoComplete="off"
              />
            </label>
            {!selected && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-border-primary">
                {visibleSales.length === 0 && (
                  <p className="px-3 py-3 text-sm text-text-secondary">Nenhuma venda em aberto para devolver.</p>
                )}
                {visibleSales.map((sale) => (
                  <button
                    key={sale.saleNumber}
                    type="button"
                    onClick={() => chooseSale(sale)}
                    className="block w-full border-b border-border-primary px-3 py-2 text-left last:border-b-0 hover:bg-hover-light"
                  >
                    <span className="font-semibold text-text-primary">Venda {sale.saleNumber}</span>
                    <span className="mt-0.5 block text-xs text-text-secondary">
                      {sale.customerName} · {paymentLabel(sale.paymentType)} · R$ {money(sale.total)} · {sale.saleDate}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selected && (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-text-secondary">
                  Pagamento {paymentLabel(selected.paymentType)}.
                  {selected.paymentType === "dinheiro"
                    ? " O valor devolvido sai da sua gaveta."
                    : " O estoque volta e a venda é estornada. A gaveta não muda nesse pagamento."}
                </p>
                {selected.lines.map((line) => {
                  const remaining = Math.max(0, line.quantity - line.returned);
                  return (
                    <label key={line.code} className="grid gap-2 rounded-xl border border-border-primary p-3 md:grid-cols-[minmax(0,1fr)_140px] md:items-end">
                      <span>
                        <span className="block font-medium text-text-primary">{line.name}</span>
                        <span className="text-xs text-text-secondary">
                          Vendido {formatStockQuantity(line.quantity, line.unit)} · pode voltar {formatStockQuantity(remaining, line.unit)}
                        </span>
                      </span>
                      <input
                        value={quantities[line.code] ?? ""}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [line.code]: sanitizeQuantity(event.target.value, line.unit),
                          }))
                        }
                        className="input-field w-full"
                        inputMode="decimal"
                        aria-label={`Quantidade de ${line.name}`}
                      />
                    </label>
                  );
                })}

                <div>
                  <span className="mb-1.5 block text-sm text-text-secondary">Troca, se o cliente levar outro produto</span>
                  <input
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    className="input-field w-full"
                    placeholder="Nome ou código do produto"
                    autoComplete="off"
                  />
                  {replacementOptions.length > 0 && (
                    <div className="mt-2 max-h-36 overflow-y-auto rounded-xl border border-border-primary">
                      {replacementOptions.map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => addReplacement(product)}
                          className="block w-full border-b border-border-primary px-3 py-2 text-left text-sm last:border-b-0 hover:bg-hover-light"
                        >
                          {product.productName}
                          <span className="ml-2 text-xs text-text-secondary">{product.productCode}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {replacements.map((line) => (
                    <div key={line.code} className="mt-2 grid gap-2 rounded-xl border border-border-primary p-3 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-end">
                      <span className="text-sm font-medium text-text-primary">{line.name}</span>
                      <input
                        value={line.quantity}
                        onChange={(event) =>
                          setReplacements((current) =>
                            current.map((item) =>
                              item.code === line.code
                                ? { ...item, quantity: sanitizeQuantity(event.target.value, line.unit) }
                                : item,
                            ),
                          )
                        }
                        className="input-field w-full"
                        aria-label={`Quantidade da troca de ${line.name}`}
                      />
                      <button
                        type="button"
                        className="btn-outline-secondary"
                        onClick={() => setReplacements((current) => current.filter((item) => item.code !== line.code))}
                      >
                        Tirar
                      </button>
                    </div>
                  ))}
                </div>

                {preview.charge > 0 && (
                  <label className="block">
                    <span className="mb-1.5 block text-sm text-text-secondary">Pagamento da diferença</span>
                    <select
                      value={differencePayment}
                      onChange={(event) => setDifferencePayment(event.target.value)}
                      className="input-field w-full"
                    >
                      {PAYMENT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <p className="text-sm font-semibold text-text-primary">
                  {preview.charge > 0
                    ? `Cobrar diferença de R$ ${money(preview.charge)}.`
                    : preview.refund > 0
                      ? `Devolver R$ ${money(preview.refund)}.`
                      : "Sem diferença de valor."}
                </p>
              </div>
            )}

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm text-text-secondary">Motivo</span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="input-field w-full"
                placeholder="Produto errado, estragado, troca de sabor..."
                maxLength={180}
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-back px-4 py-2"
                onClick={() => setOpen(false)}
                disabled={saving}
              >
                Fechar
              </button>
              <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => void submit()} disabled={saving}>
                <Plus size={16} />
                {saving ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
