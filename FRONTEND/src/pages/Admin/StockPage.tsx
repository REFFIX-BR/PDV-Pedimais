/**
 * Arquivo: src/pages/Admin/StockPage.tsx
 * Objetivo: mostra o estoque real dos produtos e permite ajustar a quantidade usada no caixa.
 * Entradas esperadas: não recebe props; lista e atualiza os produtos da empresa logada.
 */
import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import {
  formatStockQuantity,
  isLowStock,
  LOW_STOCK_LIMIT,
  notifyStockChanged,
  parseStockQuantity,
  stockStatusLabel,
} from "@/domain/stock/lowStock";
import { Toast } from "@/hooks/Dialog";
import useInputMasks from "@/hooks/InputMasks/useInputMasks";
import PageLayout from "@/layout/PageLayout";
import { productService, type ProductDto } from "@/services/api/productService";
import { supplierService } from "@/services/api/supplierService";

type Movement = "definir" | "entrada" | "saida";
type StockFilter = "todos" | "baixo" | "zerado";

const EMPTY_PRODUCT = {
  productName: "",
  productCode: "",
  productSupplier: "",
  productDescription: "",
  productUnit: "un",
  productQnt: "",
  productUnitPrice: "",
  productSalePrice: "",
};

const MOVEMENTS: Array<{ id: Movement; label: string }> = [
  { id: "definir", label: "Definir quantidade" },
  { id: "entrada", label: "Entrada" },
  { id: "saida", label: "Saída" },
];

function unitLabel(unit: string) {
  if (unit === "kg") return "Quilo";
  if (unit === "l") return "Litro";
  return "Unidade";
}

function formatQuantityInput(quantity: number, unit: string) {
  if (unit === "kg" || unit === "l") {
    return quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  return String(Math.max(0, Math.round(quantity)));
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function nextQuantity(current: number, movement: Movement, amount: number) {
  if (movement === "entrada") return current + amount;
  if (movement === "saida") return current - amount;
  return amount;
}

export default function StockPage() {
  const { maskMoneyBr, parseMoneyBr } = useInputMasks();
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StockFilter>("todos");
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [movement, setMovement] = useState<Movement>("definir");
  const [quantityInput, setQuantityInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newProduct, setNewProduct] = useState(EMPTY_PRODUCT);

  const load = async () => {
    const items = await productService.list();
    setProducts(items);
  };

  useEffect(() => {
    let active = true;
    Promise.all([productService.list(), supplierService.list()])
      .then(([items, supplierItems]) => {
        if (!active) return;
        setProducts(items);
        setSuppliers(supplierItems.map((item) => item.fantasyName || item.companyName).filter(Boolean));
      })
      .catch(() => {
        if (active) Toast.error("Não foi possível carregar o estoque.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = useMemo(
    () =>
      products
        .map((product) => ({
          product,
          quantity: parseStockQuantity(product.productQnt || "0"),
          unit: product.productUnit || "un",
        }))
        .sort((left, right) => left.quantity - right.quantity || left.product.productName.localeCompare(right.product.productName, "pt-BR")),
    [products],
  );

  const lowCount = rows.filter((row) => row.quantity > 0 && isLowStock(row.quantity)).length;
  const emptyCount = rows.filter((row) => row.quantity <= 0).length;
  const visibleRows = rows.filter((row) => {
    const text = `${row.product.productName} ${row.product.productCode}`.toLowerCase();
    if (search.trim() && !text.includes(search.trim().toLowerCase())) return false;
    if (filter === "baixo") return row.quantity > 0 && isLowStock(row.quantity);
    if (filter === "zerado") return row.quantity <= 0;
    return true;
  });

  const selected = rows.find((row) => row.product.id === selectedId) ?? null;
  const typedAmount = parseStockQuantity(quantityInput || "0");
  const projected = selected ? nextQuantity(selected.quantity, movement, typedAmount) : 0;
  const pickerTerm = pickerSearch
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const pickerRows = rows
    .filter((row) => {
      if (!pickerTerm) return true;
      const text = `${row.product.productName} ${row.product.productCode}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return text.includes(pickerTerm);
    })
    .sort((left, right) => {
      const emptyRank = Number(right.quantity <= 0) - Number(left.quantity <= 0);
      if (emptyRank !== 0) return emptyRank;
      return left.product.productName.localeCompare(right.product.productName, "pt-BR");
    });

  const chooseProduct = (productId: string) => {
    const row = rows.find((item) => item.product.id === productId);
    setSelectedId(productId);
    setMovement("definir");
    setQuantityInput(row ? formatQuantityInput(row.quantity, row.unit) : "");
  };

  const updatePicker = (value: string) => {
    setPickerSearch(value);
    const term = value
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const matches = rows.filter((row) => {
      if (!term) return true;
      const text = `${row.product.productName} ${row.product.productCode}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return text.includes(term);
    });
    if (matches.length === 1) {
      if (matches[0].product.id !== selectedId) chooseProduct(matches[0].product.id);
      return;
    }
    const currentStillMatches =
      !!selected &&
      `${selected.product.productName} ${selected.product.productCode}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .includes(term);
    if (term && !currentStillMatches) {
      setSelectedId("");
      setMovement("definir");
      setQuantityInput("");
    }
  };

  const openAdjust = (productId = "") => {
    setAdjustOpen(true);
    if (productId) {
      const row = rows.find((item) => item.product.id === productId);
      setPickerSearch(row?.product.productName ?? "");
      chooseProduct(productId);
      return;
    }
    setPickerSearch("");
    setSelectedId("");
    setMovement("definir");
    setQuantityInput("");
  };

  const closeAdjust = () => {
    if (saving) return;
    setAdjustOpen(false);
    setSelectedId("");
    setQuantityInput("");
    setPickerSearch("");
  };

  const saveAdjust = async () => {
    if (!selected) return;
    if (typedAmount <= 0 && movement !== "saida") {
      Toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    if (projected <= 0) {
      Toast.error("A quantidade do produto precisa continuar maior que zero.");
      return;
    }
    if ((selected.unit === "un" || !selected.unit) && projected !== Math.floor(projected)) {
      Toast.error("Produto por unidade aceita só número inteiro.");
      return;
    }

    const productQnt = formatQuantityInput(projected, selected.unit);
    const cost = parseStockQuantity(selected.product.productUnitPrice || "0");
    setSaving(true);
    try {
      const updated = await productService.update(selected.product.id, {
        productImageUrl: selected.product.productImageUrl,
        productImageName: selected.product.productImageName,
        productName: selected.product.productName,
        productCode: selected.product.productCode,
        productSupplier: selected.product.productSupplier,
        productDescription: selected.product.productDescription,
        productUnit: selected.unit,
        productQnt,
        productUnitPrice: selected.product.productUnitPrice,
        productSalePrice: selected.product.productSalePrice,
        totalPriceOnProduct: formatMoney(projected * cost),
      });
      if (updated) {
        setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        await load();
      }
      notifyStockChanged();
      Toast.success(`${selected.product.productName} ficou com ${formatStockQuantity(projected, selected.unit)}.`);
      setSelectedId("");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível ajustar o estoque.");
    } finally {
      setSaving(false);
    }
  };

  const setNewField = (key: keyof typeof EMPTY_PRODUCT, value: string) => {
    setNewProduct((current) => {
      const next = { ...current, [key]: value };
      if (key === "productUnit" && value === "un") {
        next.productQnt = sanitizeQuantity(next.productQnt, "un");
      }
      return next;
    });
  };

  const saveNewProduct = async () => {
    const quantity = parseStockQuantity(newProduct.productQnt || "0");
    const cost = parseMoneyBr(newProduct.productUnitPrice || "0");
    const sale = parseMoneyBr(newProduct.productSalePrice || "0");
    if (newProduct.productName.trim().length < 3) {
      Toast.error("O nome do produto deve ter no mínimo 3 caracteres.");
      return;
    }
    if (!newProduct.productCode.trim()) {
      Toast.error("Informe o código do produto.");
      return;
    }
    if (!newProduct.productSupplier) {
      Toast.error("Selecione um fornecedor.");
      return;
    }
    if (quantity <= 0) {
      Toast.error("A quantidade do produto deve ser maior que zero.");
      return;
    }
    if (newProduct.productUnit === "un" && quantity !== Math.floor(quantity)) {
      Toast.error("Produto por unidade aceita só número inteiro.");
      return;
    }
    if (cost <= 0 || sale <= 0) {
      Toast.error("Informe o preço de custo e o preço de venda.");
      return;
    }

    setSaving(true);
    try {
      const created = await productService.create({
        productImageUrl: "",
        productImageName: "",
        productName: newProduct.productName.trim(),
        productCode: newProduct.productCode.trim(),
        productSupplier: newProduct.productSupplier,
        productDescription: newProduct.productDescription.trim() || unitLabel(newProduct.productUnit),
        productUnit: newProduct.productUnit,
        productQnt: formatQuantityInput(quantity, newProduct.productUnit),
        productUnitPrice: formatMoney(cost),
        productSalePrice: formatMoney(sale),
        totalPriceOnProduct: formatMoney(quantity * cost),
      });
      if (created) setProducts((current) => [created, ...current]);
      else await load();
      notifyStockChanged();
      Toast.success("Produto cadastrado no estoque.");
      setCreating(false);
      setNewProduct(EMPTY_PRODUCT);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar o produto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title="Estoque e Inventário"
        description="Quantidade real dos produtos. A venda no caixa desconta daqui."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setNewProduct(EMPTY_PRODUCT);
                setCreating(true);
              }}
              className="btn-primary inline-flex items-center gap-2"
            >
              <Plus size={16} />
              Novo produto
            </button>
            <button type="button" onClick={() => openAdjust()} className="btn-outline-secondary">
              Ajustar estoque
            </button>
          </div>
        }
      />

      <section data-tour="estoque-resumo" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Produtos</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">{rows.length}</p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Estoque baixo</p>
          <p className="mt-1 text-2xl font-semibold text-amber-800">{lowCount}</p>
          <p className="text-xs text-text-secondary">{LOW_STOCK_LIMIT} ou menos</p>
        </article>
        <article className="card p-4">
          <p className="text-sm text-text-secondary">Sem estoque</p>
          <p className="mt-1 text-2xl font-semibold text-primary">{emptyCount}</p>
        </article>
      </section>

      <section data-tour="estoque-filtros" className="card p-4 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative block w-full max-w-xl">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-field w-full pl-9"
              placeholder="Pesquise por nome ou código"
            />
          </label>
          <div className="flex gap-2">
            {(
              [
                ["todos", "Todos"],
                ["baixo", "Estoque baixo"],
                ["zerado", "Sem estoque"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                  filter === id
                    ? "border-accent bg-accent text-text-light"
                    : "border-border-primary bg-bg-light text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section data-tour="estoque-lista" className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-bg-primary text-left text-text-secondary">
              <tr>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Unidade</th>
                <th className="px-4 py-3">Estoque</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                    Carregando estoque...
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const low = isLowStock(row.quantity);
                  return (
                    <tr key={row.product.id} className="border-t border-border-primary">
                      <td className="px-4 py-3 font-medium text-text-primary">{row.product.productName}</td>
                      <td className="px-4 py-3">{row.product.productCode}</td>
                      <td className="px-4 py-3">{unitLabel(row.unit)}</td>
                      <td className={`px-4 py-3 ${low ? "font-semibold text-amber-800" : ""}`}>
                        {formatStockQuantity(row.quantity, row.unit)}
                      </td>
                      <td className="px-4 py-3">
                        {low ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                            {stockStatusLabel(row.quantity)}
                          </span>
                        ) : (
                          <span className="text-text-secondary">Normal</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => openAdjust(row.product.id)}
                          className="rounded-lg border border-border-primary px-3 py-1.5 text-xs font-semibold"
                        >
                          Ajustar
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {creating && (
        <div className="fixed inset-0 z-layer-modal flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-primary bg-bg-light p-5 text-text-primary">
            <h2 className="text-lg font-semibold">Novo produto</h2>
            <p className="mt-1 text-sm text-text-secondary">
              O produto entra no cadastro e já fica disponível no caixa.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm text-text-secondary">Nome *</span>
                <input
                  autoFocus
                  value={newProduct.productName}
                  onChange={(event) => setNewField("productName", event.target.value)}
                  className="input-field w-full"
                  placeholder="Leite integral"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Código *</span>
                <input
                  value={newProduct.productCode}
                  onChange={(event) => setNewField("productCode", event.target.value)}
                  className="input-field w-full"
                  placeholder="3003"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Fornecedor *</span>
                <select
                  value={newProduct.productSupplier}
                  onChange={(event) => setNewField("productSupplier", event.target.value)}
                  className="input-field w-full"
                >
                  <option value="">Selecione</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier} value={supplier}>
                      {supplier}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Unidade *</span>
                <select
                  value={newProduct.productUnit}
                  onChange={(event) => setNewField("productUnit", event.target.value)}
                  className="input-field w-full"
                >
                  <option value="un">Unidade</option>
                  <option value="kg">Quilo (kg)</option>
                  <option value="l">Litro (L)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">
                  {newProduct.productUnit === "l"
                    ? "Estoque em litros *"
                    : newProduct.productUnit === "kg"
                      ? "Estoque em quilos *"
                      : "Quantidade *"}
                </span>
                <input
                  value={newProduct.productQnt}
                  inputMode={newProduct.productUnit === "un" ? "numeric" : "decimal"}
                  onChange={(event) =>
                    setNewField("productQnt", sanitizeQuantity(event.target.value, newProduct.productUnit))
                  }
                  className="input-field w-full"
                  placeholder={newProduct.productUnit === "l" ? "50" : newProduct.productUnit === "kg" ? "12" : "10"}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Preço de custo *</span>
                <input
                  value={newProduct.productUnitPrice}
                  inputMode="numeric"
                  onChange={(event) => setNewField("productUnitPrice", maskMoneyBr(event.target.value))}
                  className="input-field w-full"
                  placeholder="0,00"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Preço de venda *</span>
                <input
                  value={newProduct.productSalePrice}
                  inputMode="numeric"
                  onChange={(event) => setNewField("productSalePrice", maskMoneyBr(event.target.value))}
                  className="input-field w-full"
                  placeholder="0,00"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm text-text-secondary">Descrição</span>
                <input
                  value={newProduct.productDescription}
                  onChange={(event) => setNewField("productDescription", event.target.value)}
                  className="input-field w-full"
                  placeholder="Opcional"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (saving) return;
                  setCreating(false);
                  setNewProduct(EMPTY_PRODUCT);
                }}
                className="btn-cancel"
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="button" onClick={() => void saveNewProduct()} className="btn-success" disabled={saving}>
                {saving ? "Salvando..." : "Salvar produto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {adjustOpen && (
        <div className="fixed inset-0 z-layer-modal flex items-center justify-center bg-black/45 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border-primary bg-bg-light p-5 text-text-primary">
            <h2 className="text-lg font-semibold">Ajustar estoque</h2>
            <p className="mt-1 text-sm text-text-secondary">Digite o nome e clique no produto.</p>

            <label className="mt-4 block">
              <span className="mb-1.5 block text-sm text-text-secondary">Produto *</span>
              <input
                autoFocus
                value={pickerSearch}
                spellCheck={false}
                autoComplete="off"
                onChange={(event) => updatePicker(event.target.value)}
                className="input-field w-full"
                placeholder="Picanha, leite, 2001..."
              />
            </label>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border-primary">
              {pickerRows.length === 0 ? (
                <p className="px-3 py-3 text-sm text-text-secondary">Nenhum produto com esse nome.</p>
              ) : (
                pickerRows.map((row) => {
                  const active = row.product.id === selectedId;
                  const empty = row.quantity <= 0;
                  return (
                    <button
                      key={row.product.id}
                      type="button"
                      onClick={() => {
                        setPickerSearch(row.product.productName);
                        chooseProduct(row.product.id);
                      }}
                      className={`flex w-full items-center justify-between gap-3 border-b border-border-primary px-3 py-2 text-left text-sm last:border-b-0 ${
                        active ? "bg-accent text-text-light" : "bg-bg-light text-text-primary"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{row.product.productName}</span>
                        <span className={`block text-xs ${active ? "text-text-light" : "text-text-secondary"}`}>
                          {row.product.productCode}
                        </span>
                      </span>
                      <span className={`shrink-0 text-right ${active ? "text-text-light" : empty ? "font-semibold text-primary" : "text-text-primary"}`}>
                        <span className="block text-[11px] uppercase tracking-wide">{empty ? "Sem estoque" : "Estoque"}</span>
                        <span className="block font-semibold">{formatStockQuantity(row.quantity, row.unit)}</span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {selected ? (
              <>
                <p className="mt-3 text-sm text-text-secondary">
                  {selected.product.productName} está com {formatStockQuantity(selected.quantity, selected.unit)}.
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {MOVEMENTS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setMovement(item.id);
                        setQuantityInput(item.id === "definir" ? formatQuantityInput(selected.quantity, selected.unit) : "");
                      }}
                      className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                        movement === item.id
                          ? "border-accent bg-accent text-text-light"
                          : "border-border-primary bg-bg-light"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <label className="mt-4 block">
                  <span className="mb-1.5 block text-sm text-text-secondary">
                    {movement === "definir" ? "Nova quantidade" : "Quantidade da movimentação"}
                  </span>
                  <input
                    value={quantityInput}
                    inputMode={selected.unit === "kg" || selected.unit === "l" ? "decimal" : "numeric"}
                    onChange={(event) => setQuantityInput(sanitizeQuantity(event.target.value, selected.unit))}
                    className="input-field w-full"
                    placeholder={selected.unit === "l" ? "20" : selected.unit === "kg" ? "1,500" : "10"}
                  />
                </label>
                <p className="mt-2 text-sm text-text-secondary">
                  Ficará com {formatStockQuantity(Math.max(projected, 0), selected.unit)}.
                </p>
              </>
            ) : (
              <p className="mt-4 text-sm text-text-secondary">
                {emptyCount === 0
                  ? "Nenhum produto está sem estoque. Escolha um item da lista para mudar a quantidade."
                  : `${emptyCount} ${emptyCount === 1 ? "produto está" : "produtos estão"} sem estoque, no topo da lista.`}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={closeAdjust} className="btn-cancel" disabled={saving}>
                Cancelar
              </button>
              <button type="button" onClick={() => void saveAdjust()} className="btn-success" disabled={saving || !selected}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
