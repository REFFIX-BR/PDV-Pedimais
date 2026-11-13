/**
 * Arquivo: src/pages/Admin/FiscalPage.tsx
 * Objetivo: o caixa escolhe uma venda e emite a NFC-e do balcão ou a NF-e para outra empresa.
 * Entradas esperadas: histórico de vendas, produtos e clientes. A chave da Autoriza ainda não transmite nada.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ReceiptText, ScrollText, Search } from "lucide-react";
import PageHeader from "@/components/Admin/PageHeader";
import LoadingButton from "@/components/Loading/LoadingButton";
import { Toast } from "@/hooks/Dialog";
import PageLayout from "@/layout/PageLayout";
import { customerService, type CustomerDto } from "@/services/api/customerService";
import { productService, type ProductDto } from "@/services/api/productService";
import { salesHistoryService, type SaleHistoryDto } from "@/services/api/salesHistoryService";

type NoteKind = "nfce" | "nfe";

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
  customerCpf: string;
  paymentType: string;
  total: number;
  status: string;
  saleDate: string;
  operatorName: string;
  lines: SaleLine[];
};

type Recipient = {
  name: string;
  document: string;
  ie: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  uf: string;
  cep: string;
};

const EMPTY_RECIPIENT: Recipient = {
  name: "",
  document: "",
  ie: "",
  address: "",
  number: "",
  neighborhood: "",
  city: "",
  uf: "",
  cep: "",
};

const PAYMENT_LABEL: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão débito",
  credito: "Cartão crédito",
};

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseMoney(value: string) {
  const parsed = Number(value.trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function unitOf(products: ProductDto[], code: string) {
  const unit = products.find((item) => item.productCode === code)?.productUnit?.trim().toLowerCase();
  return unit === "kg" || unit === "l" ? unit : "un";
}

function remainingOf(line: SaleLine) {
  return Math.max(0, line.quantity - line.returned);
}

function quantityLabel(quantity: number, unit: string) {
  if (unit === "kg") {
    return `${quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} kg`;
  }
  const boxes = Math.round(quantity);
  if (unit === "l") {
    return `${boxes} un (${(boxes * 1000).toLocaleString("pt-BR")} ml)`;
  }
  return `${boxes} un`;
}

function groupSales(rows: SaleHistoryDto[], products: ProductDto[]): OpenSale[] {
  const map = new Map<string, OpenSale>();
  for (const row of rows) {
    const current = map.get(row.saleNumber) ?? {
      saleNumber: row.saleNumber,
      customerName: row.customerName || "Consumidor",
      customerCpf: row.customerCpf || "",
      paymentType: row.paymentType || "",
      total: parseMoney(row.totalAmount || "0"),
      status: row.status || "Concluida",
      saleDate: row.saleDate,
      operatorName: row.operatorName || "",
      lines: [],
    };
    current.lines.push({
      code: row.productCode,
      name: row.productName,
      quantity: row.quantity,
      returned: row.returnedQuantity ?? 0,
      unitPrice: parseMoney(row.unitPrice || "0"),
      unit: unitOf(products, row.productCode),
    });
    map.set(row.saleNumber, current);
  }
  return [...map.values()].sort((a, b) =>
    b.saleNumber.localeCompare(a.saleNumber, "pt-BR", { numeric: true }),
  );
}

export default function FiscalPage() {
  const [kind, setKind] = useState<NoteKind>("nfce");
  const [sales, setSales] = useState<SaleHistoryDto[]>([]);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [customers, setCustomers] = useState<CustomerDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedNumber, setSelectedNumber] = useState("");
  const [consumerCpf, setConsumerCpf] = useState("");
  const [recipient, setRecipient] = useState<Recipient>(EMPTY_RECIPIENT);
  const [customerId, setCustomerId] = useState("");

  useEffect(() => {
    Promise.all([
      salesHistoryService.list(),
      productService.list().catch(() => [] as ProductDto[]),
      customerService.list().catch(() => [] as CustomerDto[]),
    ]).then(([saleRows, productRows, customerRows]) => {
      setSales(saleRows);
      setProducts(productRows);
      setCustomers(customerRows);
    }).catch(() => {
      setLoadError("Não foi possível carregar as vendas agora.");
    }).finally(() => setLoading(false));
  }, []);

  const grouped = useMemo(() => groupSales(sales, products), [sales, products]);
  const visible = useMemo(() => {
    const term = fold(search.trim());
    if (!term) return grouped;
    return grouped.filter((sale) => fold(`${sale.saleNumber} ${sale.customerName}`).includes(term));
  }, [grouped, search]);
  const selected = grouped.find((sale) => sale.saleNumber === selectedNumber) ?? null;

  useEffect(() => {
    if (selectedNumber || grouped.length === 0) return;
    const first = grouped.find((sale) => sale.status.toLowerCase() !== "estornada") ?? grouped[0];
    setSelectedNumber(first.saleNumber);
    setConsumerCpf(first.customerCpf);
  }, [grouped, selectedNumber]);

  const chooseSale = (sale: OpenSale) => {
    setSelectedNumber(sale.saleNumber);
    setConsumerCpf(sale.customerCpf);
  };

  const applyCustomer = (id: string) => {
    setCustomerId(id);
    const customer = customers.find((item) => item.id === id);
    if (!customer) return;
    setRecipient({
      name: customer.customerName,
      document: customer.document,
      ie: "",
      address: customer.address,
      number: customer.number,
      neighborhood: customer.neighborhood,
      city: customer.city,
      uf: customer.state,
      cep: customer.cep,
    });
  };

  const emit = () => {
    if (!selected) {
      Toast.error("Escolha a venda que vai virar nota.");
      return;
    }
    if (selected.status.toLowerCase() === "estornada") {
      Toast.error("Venda estornada não emite nota.");
      return;
    }
    const lines = selected.lines.filter((line) => remainingOf(line) > 0.0005);
    if (lines.length === 0) {
      Toast.error("Essa venda não tem item para emitir.");
      return;
    }
    if (kind === "nfe" && (!recipient.name.trim() || !recipient.document.trim())) {
      Toast.error("A NF-e precisa do nome e do CPF ou CNPJ de quem recebe.");
      return;
    }
    Toast.error("A chave da Autoriza ainda não foi ligada. A nota não foi emitida.");
  };

  return (
    <PageLayout size="wide" className="min-w-0 space-y-4 py-4 md:py-6">
      <PageHeader
        title="Emitir nota"
        description="Escolha a venda e emita a NFC-e do balcão ou a NF-e para outra empresa."
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <section data-tour="fiscal-vendas" className="card min-w-0 space-y-3 rounded-2xl p-4">
          <h2 className="text-base font-bold text-text-primary">Venda</h2>
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="input-field w-full pl-9"
              placeholder="Número ou cliente"
            />
          </label>
          <div className="max-h-[640px] space-y-2 overflow-y-auto">
            {loading ? <p className="text-sm text-text-secondary">Carregando vendas…</p> : null}
            {!loading && loadError ? <p className="text-sm text-text-secondary">{loadError}</p> : null}
            {!loading && !loadError && visible.length === 0 ? (
              <p className="text-sm text-text-secondary">Nenhuma venda para emitir. Registre no caixa e volte aqui.</p>
            ) : null}
            {visible.map((sale) => {
              const blocked = sale.status.toLowerCase() === "estornada";
              const active = sale.saleNumber === selectedNumber;
              return (
                <button
                  key={sale.saleNumber}
                  type="button"
                  onClick={() => chooseSale(sale)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left ${
                    active ? "border-sky-700 bg-sky-50" : "border-border-primary bg-white"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-text-primary">Venda {sale.saleNumber}</span>
                    <span className="text-sm font-semibold text-text-primary">{money(sale.total)}</span>
                  </span>
                  <span className="mt-1 block truncate text-sm text-text-secondary">
                    {sale.customerName} · {sale.saleDate}
                  </span>
                  {blocked ? (
                    <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      Estornada
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section data-tour="fiscal-emitir" className="card min-w-0 space-y-5 rounded-2xl p-4 md:p-5">
          <div className="flex flex-wrap gap-2">
            <KindButton active={kind === "nfce"} icon={<ReceiptText size={16} />} label="NFC-e do balcão" onClick={() => setKind("nfce")} />
            <KindButton active={kind === "nfe"} icon={<ScrollText size={16} />} label="NF-e para empresa" onClick={() => setKind("nfe")} />
          </div>

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-text-primary">
                {kind === "nfce" ? "NFC-e" : "NF-e"}
                {selected ? ` da venda ${selected.saleNumber}` : ""}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {selected
                  ? `${selected.saleDate}${selected.operatorName ? ` · ${selected.operatorName}` : ""} · ${PAYMENT_LABEL[selected.paymentType] || selected.paymentType || "Pagamento"}`
                  : "Escolha a venda à esquerda. Os itens, o pagamento e o total entram na nota."}
              </p>
            </div>
            {selected ? <p className="text-xl font-bold text-text-primary">{money(selected.total)}</p> : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-text-secondary">
                <tr>
                  <th className="py-2 pr-3 font-medium">Item</th>
                  <th className="py-2 pr-3 font-medium">Quantidade</th>
                  <th className="py-2 pr-3 text-right font-medium">Unitário</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {selected ? selected.lines.map((line) => {
                  const quantity = remainingOf(line);
                  return (
                    <tr key={`${selected.saleNumber}-${line.code}`} className="border-t border-border-primary">
                      <td className="py-2.5 pr-3">
                        <span className="block font-medium text-text-primary">{line.name}</span>
                        <span className="text-xs text-text-tertiary">{line.code}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-text-secondary">{quantityLabel(quantity, line.unit)}</td>
                      <td className="py-2.5 pr-3 text-right text-text-secondary">{money(line.unitPrice)}</td>
                      <td className="py-2.5 text-right font-medium text-text-primary">{money(line.unitPrice * quantity)}</td>
                    </tr>
                  );
                }) : (
                  <tr className="border-t border-border-primary">
                    <td colSpan={4} className="py-6 text-text-secondary">Nenhum item ainda. A nota usa os produtos da venda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

              {kind === "nfce" ? (
                <label className="block max-w-sm">
                  <span className="mb-1.5 block text-sm text-text-secondary">CPF na nota (opcional)</span>
                  <input
                    className="input-field w-full"
                    value={consumerCpf}
                    onChange={(event) => setConsumerCpf(event.target.value)}
                    placeholder="Sem CPF, a nota sai para o consumidor"
                  />
                </label>
              ) : (
                <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
                  <label className="block min-w-0 lg:col-span-2">
                    <span className="mb-1.5 block text-sm text-text-secondary">Cliente cadastrado</span>
                    <select
                      className="select-field w-full"
                      value={customerId}
                      onChange={(event) => applyCustomer(event.target.value)}
                    >
                      <option value="">Digitar o destinatário</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>
                          {customer.customerName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <RecipientField label="Nome ou razão social" value={recipient.name} onChange={(name) => setRecipient({ ...recipient, name })} />
                  <RecipientField label="CPF ou CNPJ" value={recipient.document} onChange={(document) => setRecipient({ ...recipient, document })} />
                  <RecipientField label="Inscrição estadual" value={recipient.ie} onChange={(ie) => setRecipient({ ...recipient, ie })} />
                  <RecipientField label="CEP" value={recipient.cep} onChange={(cep) => setRecipient({ ...recipient, cep })} />
                  <RecipientField label="Logradouro" value={recipient.address} onChange={(address) => setRecipient({ ...recipient, address })} />
                  <RecipientField label="Número" value={recipient.number} onChange={(number) => setRecipient({ ...recipient, number })} />
                  <RecipientField label="Bairro" value={recipient.neighborhood} onChange={(neighborhood) => setRecipient({ ...recipient, neighborhood })} />
                  <RecipientField label="Cidade" value={recipient.city} onChange={(city) => setRecipient({ ...recipient, city })} />
                  <RecipientField label="UF" value={recipient.uf} onChange={(uf) => setRecipient({ ...recipient, uf })} />
                </div>
              )}

              <LoadingButton type="button" onClick={emit} className="btn-primary min-h-11 px-5">
                {kind === "nfce" ? "Emitir NFC-e" : "Emitir NF-e"}
              </LoadingButton>
          <p className="text-xs text-text-tertiary">
            A transmissão para a SEFAZ começa quando a chave da Autoriza estiver ligada. Até lá, este botão não emite.
          </p>
        </section>
      </div>
    </PageLayout>
  );
}

function KindButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
        active ? "bg-sky-700 text-white" : "border border-slate-200 bg-white text-slate-600"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function RecipientField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm text-text-secondary">{label}</span>
      <input className="input-field w-full" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
