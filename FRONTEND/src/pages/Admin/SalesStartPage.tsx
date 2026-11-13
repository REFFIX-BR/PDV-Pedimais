/**
 * Arquivo: src/pages/Admin/SalesStartPage.tsx
 * Objetivo: implementa a frente de caixa com busca de produto, carrinho, fechamento e pagamento.
 * Entradas esperadas: recebe flag opcional de modo standalone para ajustar comportamento da aba PDV.
 */

import { Image as ImageIcon, Printer, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LowStockBanner from "@/components/Stock/LowStockBanner";
import LowStockBell from "@/components/Stock/LowStockBell";
import { isLowStock, notifyStockChanged } from "@/domain/stock/lowStock";
import { Toast, useStatusDialog } from "@/hooks/Dialog";
import useInputMasks from "@/hooks/InputMasks/useInputMasks";
import {
  cashRegisterService,
  type CashRegisterStatusDto,
} from "@/services/api/cashRegisterService";
import ReceiptPreviewModal, {
  type PaymentType,
  type SaleReceipt,
} from "@/components/Admin/ReceiptPreviewModal";
import { companyService, type CompanyDto } from "@/services/api/companyService";
import { productService, reduceCachedProductStock } from "@/services/api/productService";
import { OUTBOX_SENT_EVENT } from "@/services/offline/outbox";
import { couponService, type CouponKind } from "@/services/api/couponService";
import { salesHistoryService } from "@/services/api/salesHistoryService";
import { readFormDraft, usePersistFormDraft } from "@/utils/formDraft";
import { getPrintPreviewEnabled } from "@/utils/pdvPreferences";

type SalesStartPageProps = {
  onExit?: () => void;
  standalone?: boolean;
  operatorName?: string;
};

type MeasureUnit = "un" | "kg" | "l";

type Product = {
  id: string;
  name: string;
  code: string;
  unit: MeasureUnit;
  stock: number;
  salePrice: number;
  imageUrl?: string;
};

const ML_PER_LIQUID_UNIT = 1000;

type CartItem = {
  id: string;
  code: string;
  name: string;
  unit: MeasureUnit;
  quantity: number;
  stockQuantity: number;
  deductMl?: number;
  unitPrice: number;
  discount: number;
  surcharge: number;
};

const PAYMENT_OPTIONS: Array<{ value: PaymentType; label: string }> = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "PIX" },
  { value: "debito", label: "Cartão Débito" },
  { value: "credito", label: "Cartão Crédito" },
];

const LAST_RECEIPT_STORAGE_KEY = "horus-pdv-last-receipt";

function formatDateTime(date: Date) {
  return {
    dateLabel: date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    timeLabel: date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function normalizeUnit(value?: string): MeasureUnit {
  const unit = (value || "").trim().toLowerCase();
  if (unit === "kg" || unit === "quilo") return "kg";
  if (unit === "l" || unit === "litro" || unit === "lt") return "l";
  return "un";
}

function parseQuantity(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMeasure(value: number, unit: MeasureUnit) {
  if (unit === "un") return String(Math.round(value));
  const small = Math.round(value * 1000);
  if (small > 0 && small < 1000) {
    return unit === "kg"
      ? `${small.toLocaleString("pt-BR")} g`
      : `${small.toLocaleString("pt-BR")} ml`;
  }
  const rounded = Math.round(value * 1000) / 1000;
  const formatted = Number.isInteger(rounded)
    ? rounded.toLocaleString("pt-BR")
    : rounded.toLocaleString("pt-BR", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      });
  return unit === "kg" ? `${formatted} kg` : `${formatted} L`;
}

function equivalenceLabel(value: number, unit: MeasureUnit) {
  if (value <= 0 || unit === "un") return "";
  const small = Math.round(value * 1000);
  const base = Math.round(value * 1000) / 1000;
  const baseText = Number.isInteger(base)
    ? base.toLocaleString("pt-BR")
    : base.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return unit === "kg"
    ? `${small.toLocaleString("pt-BR")} g = ${baseText} kg`
    : `${small.toLocaleString("pt-BR")} ml = ${baseText} L`;
}

function stockMovement(unit: MeasureUnit, amount: number) {
  if (unit === "l") return (amount * ML_PER_LIQUID_UNIT) / 1000;
  return amount;
}

function lineGross(item: CartItem) {
  return item.quantity * item.unitPrice;
}

function lineAmount(item: CartItem) {
  return Math.max(0, lineGross(item) - item.discount + item.surcharge);
}

function parseCouponAdjustment(raw: string, base: number) {
  const text = raw.trim().replace(/\s/g, "");
  if (!text) return null;
  if (text.endsWith("%")) {
    const percent = Number(text.slice(0, -1).replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0) return null;
    return Math.round(base * percent) / 100;
  }
  const money = Number(text.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(money) || money <= 0) return null;
  return money;
}

function lineMeasureLabel(item: CartItem) {
  if (item.deductMl) {
    const ml = Math.round(item.quantity * item.deductMl);
    return `${item.quantity} un (${ml.toLocaleString("pt-BR")} ml)`;
  }
  return formatMeasure(item.quantity, item.unit);
}

function reservedStock(cart: CartItem[], productId: string) {
  return cart.filter((item) => item.id === productId).reduce((sum, item) => sum + item.stockQuantity, 0);
}

function quantityFieldLabel(unit: MeasureUnit) {
  if (unit === "kg") return "Peso (g)";
  return "Quantidade";
}

function measureHint(unit: MeasureUnit, value: number) {
  if (value > 0) return equivalenceLabel(value, unit);
  if (unit === "kg") return "500 = 500 g · 1000 = 1 kg";
  if (unit === "l") return "500 = 500 ml · 1000 = 1 L";
  return "";
}

function missingMeasureMessage(unit: MeasureUnit) {
  if (unit === "kg") return "Informe o peso em gramas. 500 é meio quilo e 1000 é 1 kg.";
  return "Informe a quantidade.";
}

function priceFieldLabel(unit: MeasureUnit) {
  if (unit === "kg") return "Preço por kg";
  return "Preço unitário";
}

function sanitizeMeasureInput(value: string, unit: MeasureUnit) {
  return value.replace(/\D/g, "").slice(0, unit === "kg" ? 7 : 4);
}

function getPaymentLabel(paymentType: PaymentType) {
  return PAYMENT_OPTIONS.find((option) => option.value === paymentType)?.label ?? paymentType;
}

function formatCashElapsed(minutes?: number) {
  if (!minutes || minutes < 1) return "menos de 1 min";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  return `${hours}h ${String(remainingMinutes).padStart(2, "0")}min`;
}

export default function SalesStartPage({
  operatorName = "Operador",
}: SalesStartPageProps) {
  const { formatMoneyBr, maskMoneyBr, parseMoneyBr } = useInputMasks();
  const statusDialog = useStatusDialog();
  const productInputRef = useRef<HTMLInputElement | null>(null);
  const qtyInputRef = useRef<HTMLInputElement | null>(null);
  const openProductListRef = useRef(false);

  const [savedSale] = useState(() =>
    readFormDraft<{
      productSearch: string;
      selectedProductId: string;
      quantityInput: string;
      cart: CartItem[];
      lineAdjustment: null | "discount" | "surcharge";
      adjustmentInput: string;
      checkoutOpen: boolean;
      paymentType: PaymentType;
      cpfNota: string;
      cashGiven: string;
    }>("venda"),
  );
  const [now, setNow] = useState(new Date());
  const [productSearch, setProductSearch] = useState(() => savedSale?.productSearch ?? "");
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [cashStatus, setCashStatus] = useState<CashRegisterStatusDto | null>(null);
  const [selectedProductId, setSelectedProductId] = useState(() => savedSale?.selectedProductId ?? "");
  const [showProductOptions, setShowProductOptions] = useState(false);
  const [highlightedProductIndex, setHighlightedProductIndex] = useState(0);
  const [quantityInput, setQuantityInput] = useState(() => savedSale?.quantityInput || "1");
  const [cart, setCart] = useState<CartItem[]>(() => (Array.isArray(savedSale?.cart) ? savedSale.cart : []));
  const [lineAdjustment, setLineAdjustment] = useState<null | "discount" | "surcharge">(
    () => savedSale?.lineAdjustment ?? null,
  );
  const [adjustmentInput, setAdjustmentInput] = useState(() => savedSale?.adjustmentInput ?? "");

  const [checkoutOpen, setCheckoutOpen] = useState(() => Boolean(savedSale?.checkoutOpen));
  const [paymentType, setPaymentType] = useState<PaymentType>(() => {
    const value = savedSale?.paymentType;
    return value === "pix" || value === "debito" || value === "credito" || value === "dinheiro"
      ? value
      : "dinheiro";
  });
  const [cpfNota, setCpfNota] = useState(() => savedSale?.cpfNota ?? "");
  const [cashGiven, setCashGiven] = useState(() => savedSale?.cashGiven ?? "");
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponChecking, setCouponChecking] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    kind: CouponKind;
    amount: number;
    description: string;
  } | null>(null);
  usePersistFormDraft("venda", {
    productSearch,
    selectedProductId,
    quantityInput,
    cart,
    lineAdjustment,
    adjustmentInput,
    checkoutOpen,
    paymentType,
    cpfNota,
    cashGiven,
  });
  const [lastReceipt, setLastReceipt] = useState<SaleReceipt | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<SaleReceipt | null>(null);
  const [printPreviewEnabled, setPrintPreviewEnabled] = useState(() =>
    getPrintPreviewEnabled(),
  );

  const selectedProduct = useMemo(
    () => products.find((item) => item.id === selectedProductId) ?? null,
    [products, selectedProductId],
  );

  const quantity = useMemo(() => {
    const parsed = parseQuantity(quantityInput);
    const byUnit = !selectedProduct || selectedProduct.unit !== "kg";
    if (byUnit) {
      if (!Number.isFinite(parsed) || parsed < 1) return quantityInput.trim() ? 0 : 1;
      return Math.floor(parsed);
    }
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed) / 1000;
  }, [quantityInput, selectedProduct]);

  const filteredProducts = useMemo(() => {
    const normalized = productSearch.trim().toLowerCase();
    if (!normalized) return products;
    return products.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) ||
        item.code.toLowerCase().includes(normalized),
    );
  }, [products, productSearch]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + lineAmount(item), 0),
    [cart],
  );
  const totalVolumes = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon || subtotal <= 0) return 0;
    const raw =
      appliedCoupon.kind === "percentual"
        ? (subtotal * appliedCoupon.amount) / 100
        : appliedCoupon.amount;
    return Math.min(subtotal, Math.max(0, Math.round(raw * 100) / 100));
  }, [appliedCoupon, subtotal]);
  const payable = Math.max(0, Math.round((subtotal - couponDiscount) * 100) / 100);
  const cashGivenValue = parseMoneyBr(cashGiven || "0");
  const changeValue = paymentType === "dinheiro" ? Math.max(0, cashGivenValue - payable) : 0;

  const activeProductName =
    cart.length > 0 ? cart[cart.length - 1].name : selectedProduct?.name ?? "";

  const previewProduct = useMemo(() => {
    if (selectedProduct) return selectedProduct;
    const lastItem = cart[cart.length - 1];
    if (!lastItem) return null;
    return products.find((item) => item.id === lastItem.id) ?? null;
  }, [selectedProduct, products, cart]);

  const loadProducts = useCallback(async () => {
    const items = await productService.list();
    setProducts(
      items.map((item) => ({
        id: item.id,
        name: item.productName,
        code: item.productCode,
        unit: normalizeUnit(item.productUnit || item.productDescription),
        stock: parseQuantity(item.productQnt || "0"),
        salePrice: parseMoneyBr(item.productSalePrice || "0"),
        imageUrl: item.productImageUrl,
      })),
    );
  }, [parseMoneyBr]);

  const loadCashStatus = useCallback(async () => {
    const status = await cashRegisterService.status();
    setCashStatus(status ?? null);
    return status ?? null;
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts().catch(() => {
      Toast.error("Não foi possível carregar produtos da API no PDV.");
    });
  }, [loadProducts]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCashStatus().catch(() => {
      setCashStatus(null);
      Toast.error("Não foi possível validar a abertura de caixa.");
    });
  }, [loadCashStatus]);

  useEffect(() => {
    const refresh = () => {
      void loadProducts().catch(() => undefined);
      void loadCashStatus().catch(() => undefined);
    };
    window.addEventListener(OUTBOX_SENT_EVENT, refresh);
    return () => window.removeEventListener(OUTBOX_SENT_EVENT, refresh);
  }, [loadCashStatus, loadProducts]);

  useEffect(() => {
    companyService
      .get()
      .then((data) => {
        if (data) setCompany(data);
      })
      .catch(() => {
        Toast.error("Não foi possível carregar dados da empresa no PDV.");
      });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const storedReceipt = window.localStorage.getItem(LAST_RECEIPT_STORAGE_KEY);
      if (!storedReceipt) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLastReceipt(JSON.parse(storedReceipt) as SaleReceipt);
    } catch {
      window.localStorage.removeItem(LAST_RECEIPT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const syncPrintPreviewPreference = () => setPrintPreviewEnabled(getPrintPreviewEnabled());
    const onCustomPreferenceChange = (event: Event) => {
      const enabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled;
      setPrintPreviewEnabled(typeof enabled === "boolean" ? enabled : getPrintPreviewEnabled());
    };

    window.addEventListener("focus", syncPrintPreviewPreference);
    window.addEventListener("storage", syncPrintPreviewPreference);
    window.addEventListener("horus-pdv-print-preview-change", onCustomPreferenceChange);

    return () => {
      window.removeEventListener("focus", syncPrintPreviewPreference);
      window.removeEventListener("storage", syncPrintPreviewPreference);
      window.removeEventListener("horus-pdv-print-preview-change", onCustomPreferenceChange);
    };
  }, []);

  useEffect(() => {
    if (filteredProducts.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHighlightedProductIndex(-1);
      return;
    }
    setHighlightedProductIndex((current) => {
      if (current < 0) return 0;
      if (current >= filteredProducts.length) return filteredProducts.length - 1;
      return current;
    });
  }, [filteredProducts]);

  const selectProductOption = (product: Product) => {
    setSelectedProductId(product.id);
    setProductSearch(product.name);
    setShowProductOptions(false);
    setHighlightedProductIndex(0);
    setQuantityInput(product.unit === "kg" ? "" : "1");
    qtyInputRef.current?.focus();
  };

  const addItem = useCallback(() => {
    const matchedFromSearch =
      selectedProduct ??
      filteredProducts.find(
        (item) =>
          item.name.toLowerCase() === productSearch.trim().toLowerCase() ||
          item.code.toLowerCase() === productSearch.trim().toLowerCase(),
      ) ??
      filteredProducts[0];

    if (!matchedFromSearch) {
      Toast.error("Selecione um produto.");
      return;
    }
    const lineUnit: MeasureUnit = matchedFromSearch.unit === "l" ? "un" : matchedFromSearch.unit;
    const movement = stockMovement(matchedFromSearch.unit, quantity);
    if (quantity <= 0 || movement <= 0) {
      Toast.error(missingMeasureMessage(lineUnit === "un" ? "un" : matchedFromSearch.unit));
      return;
    }
    const alreadyReserved = reservedStock(cart, matchedFromSearch.id);
    if (alreadyReserved + movement > matchedFromSearch.stock) {
      Toast.error(`Estoque insuficiente. Disponível: ${formatMeasure(matchedFromSearch.stock - alreadyReserved, matchedFromSearch.unit)}.`);
      return;
    }
    const remaining = matchedFromSearch.stock - alreadyReserved - movement;
    if (isLowStock(remaining)) {
      Toast.warning(
        remaining <= 0
          ? `${matchedFromSearch.name} vai zerar o estoque.`
          : `${matchedFromSearch.name} ficará com estoque baixo: ${formatMeasure(remaining, matchedFromSearch.unit)}.`,
      );
    }

    setCart((current) => {
      const existing = current.find((item) => item.id === matchedFromSearch.id && item.unit === lineUnit);
      if (!existing) {
        return [
          ...current,
          {
            id: matchedFromSearch.id,
            code: matchedFromSearch.code,
            name: matchedFromSearch.name,
            unit: lineUnit,
            quantity,
            stockQuantity: movement,
            deductMl: matchedFromSearch.unit === "l" ? ML_PER_LIQUID_UNIT : undefined,
            unitPrice: matchedFromSearch.salePrice,
            discount: 0,
            surcharge: 0,
          },
        ];
      }
      return current.map((item) =>
        item.id === matchedFromSearch.id && item.unit === lineUnit
          ? {
              ...item,
              quantity: item.quantity + quantity,
              stockQuantity: item.stockQuantity + movement,
            }
          : item,
      );
    });

    setSelectedProductId("");
    setProductSearch("");
    setShowProductOptions(false);
    setQuantityInput("1");
    productInputRef.current?.focus();
  }, [cart, filteredProducts, productSearch, quantity, selectedProduct]);

  const removeItem = (id: string) => {
    setCart((current) => current.filter((item) => item.id !== id));
  };

  const saveLastReceipt = (receipt: SaleReceipt) => {
    setLastReceipt(receipt);
    try {
      window.localStorage.setItem(LAST_RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
    } catch {
      // Mantem apenas em memoria caso o navegador bloqueie o armazenamento local.
    }
  };

  const printLastSale = () => {
    if (!lastReceipt) {
      Toast.info("Nenhuma venda finalizada nesta estação.");
      return;
    }
    setReceiptPreview(lastReceipt);
  };

  const cancelSale = useCallback(async () => {
    if (cart.length === 0) return;
    const confirmed = await statusDialog.confirm("Cancelar venda atual?");
    if (!confirmed) return;
    setCart([]);
    setCpfNota("");
    setCashGiven("");
    setCheckoutOpen(false);
    setAppliedCoupon(null);
    setCouponInput("");
    Toast.info("Venda cancelada.");
  }, [cart.length, statusDialog]);

  const openPayment = useCallback(async () => {
    if (cart.length === 0) {
      Toast.error("Adicione ao menos um item.");
      return;
    }

    try {
      const latestCashStatus = await loadCashStatus();
      if (!latestCashStatus?.canSell) {
        Toast.error(
          latestCashStatus?.blockReason || "Abra o seu caixa antes de iniciar uma venda.",
        );
        return;
      }
    } catch {
      Toast.error("Não foi possível validar a abertura de caixa.");
      return;
    }

    setPaymentType("dinheiro");
    setCashGiven(formatMoneyBr(subtotal));
    setCheckoutOpen(true);
  }, [cart.length, formatMoneyBr, loadCashStatus, subtotal]);

  const focusProductSearch = useCallback(() => {
    openProductListRef.current = true;
    setShowProductOptions(true);
    setHighlightedProductIndex(0);
    productInputRef.current?.focus();
    productInputRef.current?.select();
  }, []);

  const focusQuantity = useCallback(() => {
    qtyInputRef.current?.focus();
    qtyInputRef.current?.select();
  }, []);

  const openLineAdjustment = useCallback((kind: "discount" | "surcharge") => {
    if (checkoutOpen || cart.length === 0) {
      Toast.info(cart.length === 0 ? "Adicione um item no cupom." : "Feche o pagamento para alterar o item.");
      return;
    }
    setAdjustmentInput("");
    setLineAdjustment(kind);
  }, [cart.length, checkoutOpen]);

  const applyLineAdjustment = useCallback(() => {
    if (!lineAdjustment) return;
    const last = cart[cart.length - 1];
    if (!last) return;
    const gross = lineGross(last);
    const amount = parseCouponAdjustment(adjustmentInput, gross);
    if (amount === null) {
      Toast.error("Informe um valor. Ex.: 2,00 ou 10%.");
      return;
    }
    if (lineAdjustment === "discount" && amount > gross) {
      Toast.error("O desconto não pode passar do valor do item.");
      return;
    }
    setCart((current) =>
      current.map((item, index) =>
        index === current.length - 1
          ? {
              ...item,
              discount: lineAdjustment === "discount" ? amount : item.discount,
              surcharge: lineAdjustment === "surcharge" ? amount : item.surcharge,
            }
          : item,
      ),
    );
    Toast.success(
      lineAdjustment === "discount"
        ? `Desconto de R$ ${formatMoneyBr(amount)} no item ${last.name}.`
        : `Acréscimo de R$ ${formatMoneyBr(amount)} no item ${last.name}.`,
    );
    setLineAdjustment(null);
    setAdjustmentInput("");
  }, [adjustmentInput, cart, formatMoneyBr, lineAdjustment]);

  const cancelLastItem = useCallback(() => {
    if (cart.length === 0) {
      Toast.info("Nenhum item para cancelar.");
      return;
    }
    const last = cart[cart.length - 1];
    setCart((current) => current.slice(0, -1));
    Toast.info(`Item cancelado: ${last.name}.`);
  }, [cart]);

  const applyCoupon = async () => {
    if (cart.length === 0) {
      Toast.error("Adicione um item antes de usar o cupom.");
      return;
    }
    setCouponChecking(true);
    try {
      const applied = await couponService.validate(couponInput, formatMoneyBr(subtotal));
      setAppliedCoupon({
        code: applied.code,
        kind: applied.kind,
        amount: parseMoneyBr(applied.amount),
        description: applied.description,
      });
      setCouponOpen(false);
      setCouponInput("");
      Toast.success(`Cupom ${applied.code} aplicado. Desconto de R$ ${applied.discount}.`);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Cupom não encontrado.");
    } finally {
      setCouponChecking(false);
    }
  };

  const confirmPayment = async () => {
    if (paymentType === "dinheiro" && cashGivenValue < payable) {
      Toast.error("Valor recebido menor que total.");
      return;
    }

    try {
      const latestCashStatus = await loadCashStatus();
      if (!latestCashStatus?.canSell) {
        Toast.error(
          latestCashStatus?.blockReason || "Abra o seu caixa antes de confirmar a venda.",
        );
        return;
      }

      const result = await salesHistoryService.register({
        customerName: "Consumidor",
        customerCpf: cpfNota || "-",
        paymentType,
        totalAmount: formatMoneyBr(payable),
        subtotalAmount: formatMoneyBr(subtotal),
        couponCode: appliedCoupon?.code ?? "",
        operatorName,
        items: cart.map((item) => ({
          productCode: item.code,
          productName: item.name,
          quantity: item.stockQuantity,
        })),
      });
      if (result.savedOffline) {
        cart.forEach((item) => reduceCachedProductStock(item.code, item.stockQuantity));
      }
      const receipt: SaleReceipt = {
        saleNumber: result?.saleNumber || `PDV-${Date.now()}`,
        issuedAt: new Date().toISOString(),
        company: company
          ? {
              fantasyName: company.fantasyName,
              corporateName: company.corporateName,
              cnpj: company.cnpj,
              address: company.address,
              number: company.number,
              neighborhood: company.neighborhood,
              city: company.city,
              uf: company.uf,
              phone: company.phone,
              sacPhone: company.sacPhone,
            }
          : null,
        customerCpf: cpfNota || "-",
        paymentType,
        paymentLabel: getPaymentLabel(paymentType),
        operatorName,
        subtotal: payable,
        couponCode: appliedCoupon?.code,
        couponDiscount: couponDiscount > 0 ? couponDiscount : undefined,
        cashGiven: paymentType === "dinheiro" ? cashGivenValue : payable,
        change: paymentType === "dinheiro" ? changeValue : 0,
        items: cart.map((item) => ({
          ...item,
          quantityLabel: lineMeasureLabel(item),
          total: lineAmount(item),
        })),
      };

      setCheckoutOpen(false);
      await loadProducts().catch(() => undefined);
      notifyStockChanged();
      saveLastReceipt(receipt);
      if (printPreviewEnabled) {
        setReceiptPreview(receipt);
      }
      Toast.success(
        result.savedOffline
          ? `Venda ${receipt.saleNumber} guardada neste caixa. Vai para o servidor quando a internet voltar.`
          : `Pagamento confirmado. Venda ${receipt.saleNumber} registrada.`,
      );
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Erro ao registrar venda.");
      return;
    }

    setCart([]);
    setAppliedCoupon(null);
    setCouponInput("");
    setSelectedProductId("");
    setProductSearch("");
    setShowProductOptions(false);
    setQuantityInput("1");
    setPaymentType("dinheiro");
    setCpfNota("");
    setCashGiven("");
    window.setTimeout(() => productInputRef.current?.focus(), 0);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (couponOpen) {
        if (event.key === "Escape") {
          event.preventDefault();
          setCouponOpen(false);
        }
        return;
      }
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const isInput = target?.tagName === "INPUT";

      if (lineAdjustment) {
        if (event.key === "Escape") {
          event.preventDefault();
          setLineAdjustment(null);
        }
        if (event.key === "Enter") {
          event.preventDefault();
          applyLineAdjustment();
        }
        return;
      }
      if (event.key === "F1") {
        event.preventDefault();
        if (!checkoutOpen) focusProductSearch();
      }
      if (event.key === "F2") {
        event.preventDefault();
        openLineAdjustment("discount");
      }
      if (event.key === "F3") {
        event.preventDefault();
        openLineAdjustment("surcharge");
      }
      if (event.key === "F4") {
        event.preventDefault();
        if (!checkoutOpen) focusQuantity();
      }
      if (event.key === "F6") {
        event.preventDefault();
        if (!checkoutOpen && !lineAdjustment) setCouponOpen(true);
      }
      if (event.key === "F5") {
        event.preventDefault();
        if (!checkoutOpen) cancelLastItem();
      }
      if (event.key === "F8") {
        event.preventDefault();
        void cancelSale();
      }
      if (event.key === "F12") {
        event.preventDefault();
        if (!checkoutOpen) openPayment();
      }
      if (event.key === "Enter" && isInput && !checkoutOpen) {
        if (target === productInputRef.current && showProductOptions) {
          return;
        }
        if (target === productInputRef.current || target === qtyInputRef.current) {
          event.preventDefault();
          addItem();
        }
      }
      if (event.key === "Escape") {
        if (checkoutOpen) {
          event.preventDefault();
          setCheckoutOpen(false);
          return;
        }
        if (showProductOptions || isInput) return;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    addItem,
    applyLineAdjustment,
    cancelLastItem,
    cancelSale,
    checkoutOpen,
    couponOpen,
    focusProductSearch,
    focusQuantity,
    lineAdjustment,
    openLineAdjustment,
    openPayment,
    quantity,
    selectedProductId,
    cart.length,
    showProductOptions,
  ]);

  const { dateLabel, timeLabel } = formatDateTime(now);
  const cashCanSell = cashStatus?.canSell === true;
  const cashLabel = cashStatus
    ? cashCanSell
      ? `Seu caixa aberto por ${formatCashElapsed(cashStatus.currentSession?.elapsedMinutes)}`
      : cashStatus.blockReason || "Caixa fechado"
    : "Validando caixa...";

  return (
    <div className="h-[100dvh] overflow-y-auto bg-bg-primary p-1.5 md:overflow-hidden md:p-2">
      <div className="mx-auto flex min-h-full w-full max-w-[1600px] flex-col overflow-visible rounded-2xl border border-border-primary bg-bg-light shadow-md md:h-full md:overflow-hidden">
        <header className="relative border-b border-border-secondary bg-accent px-4 py-3 text-text-light">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="PDV-Pedimais" className="h-12 w-12 object-contain md:h-14 md:w-14" />
              <div>
              <h1 className="font-display text-2xl font-bold italic leading-none md:text-4xl">PDV-Pedimais</h1>
              <p className="text-sm italic leading-none md:text-lg">Frente de Caixa</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <LowStockBell tone="accent" />
              <div className="text-right text-xs md:text-sm">
                <p className="capitalize">{dateLabel}</p>
                <p className="text-base font-semibold md:text-lg">{timeLabel}</p>
              </div>
            </div>
          </div>
        </header>
        {products.some((item) => isLowStock(item.stock)) && (
          <div className="px-3 pt-3">
            <LowStockBanner
              items={products
                .filter((item) => isLowStock(item.stock))
                .map((item) => ({
                  id: item.id,
                  name: item.name,
                  code: item.code,
                  unit: item.unit,
                  quantity: item.stock,
                }))}
            />
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[260px_minmax(0,1fr)_210px]">
          <aside data-tour="venda-produtos" className="shrink-0 border-b border-border-primary bg-bg-gray-theme p-3.5 text-text-primary lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase">Produto:</span>
              <div className="relative">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                />
                <input
                  ref={productInputRef}
                  value={productSearch}
                  onChange={(event) => {
                    setProductSearch(event.target.value);
                    setSelectedProductId("");
                    setShowProductOptions(true);
                    setHighlightedProductIndex(0);
                  }}
                  onFocus={() => {
                    if (openProductListRef.current) {
                      openProductListRef.current = false;
                      setShowProductOptions(true);
                      setHighlightedProductIndex(0);
                      return;
                    }
                    // Evita reabrir o autocomplete automaticamente após adicionar item no mobile.
                    const hasSearch = productSearch.trim().length > 0;
                    setShowProductOptions(hasSearch);
                    if (hasSearch && filteredProducts.length > 0) setHighlightedProductIndex(0);
                  }}
                  onBlur={() => window.setTimeout(() => setShowProductOptions(false), 120)}
                  onKeyDown={(event) => {
                    if (!showProductOptions) return;

                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      if (filteredProducts.length === 0) return;
                      setHighlightedProductIndex((current) =>
                        current >= filteredProducts.length - 1 ? 0 : current + 1,
                      );
                    }

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (filteredProducts.length === 0) return;
                      setHighlightedProductIndex((current) =>
                        current <= 0 ? filteredProducts.length - 1 : current - 1,
                      );
                    }

                    if (event.key === "Enter") {
                      event.preventDefault();
                      const product = filteredProducts[highlightedProductIndex];
                      if (product) {
                        selectProductOption(product);
                      }
                    }

                    if (event.key === "Escape") {
                      event.preventDefault();
                      setShowProductOptions(false);
                    }
                  }}
                  className="input-field h-10 w-full pl-9 text-sm"
                  autoComplete="off"
                />
                {showProductOptions && (
                  <ul className="absolute left-0 right-0 top-full z-layer-popover mt-1 max-h-44 overflow-y-auto rounded-xl border border-border-secondary bg-bg-light text-text-primary shadow-lg">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((item, index) => (
                        <li
                          key={item.id}
                          className={`cursor-pointer border-b border-border-primary px-3 py-2 text-xs ${
                            highlightedProductIndex === index ? "bg-hover-light" : "hover:bg-hover-light"
                          }`}
                          onMouseEnter={() => setHighlightedProductIndex(index)}
                          onMouseDown={() => {
                            selectProductOption(item);
                          }}
                        >
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-[11px] text-text-secondary">
                            {item.code} · {item.unit === "kg" ? "quilo" : "unidade"}
                          </p>
                        </li>
                      ))
                    ) : (
                      <li className="px-2 py-2 text-xs text-text-secondary">Nenhum produto encontrado.</li>
                    )}
                  </ul>
                )}
              </div>
            </label>

            <div className="mb-2">
              <span className="mb-1 block text-xs font-semibold uppercase">
                {quantityFieldLabel(selectedProduct?.unit || "un")}:
              </span>
              <input
                ref={qtyInputRef}
                value={quantityInput}
                inputMode="numeric"
                onFocus={(event) => event.target.select()}
                onChange={(event) =>
                  setQuantityInput(sanitizeMeasureInput(event.target.value, selectedProduct?.unit || "un"))
                }
                onBlur={() => {
                  if (selectedProduct?.unit !== "kg" && (!quantityInput || Number(quantityInput) < 1)) {
                    setQuantityInput("1");
                  }
                }}
                placeholder={selectedProduct?.unit === "kg" ? "500" : "1"}
                className="input-field h-10 w-full text-lg font-semibold"
              />
              {selectedProduct && isLowStock(selectedProduct.stock - reservedStock(cart, selectedProduct.id)) && (
                <p className="mt-1 text-[11px] font-semibold text-amber-800">
                  Estoque baixo: {formatMeasure(Math.max(0, selectedProduct.stock - reservedStock(cart, selectedProduct.id)), selectedProduct.unit)} restantes.
                </p>
              )}
              {selectedProduct?.unit === "l" && (
                <p className="mt-1 text-[11px] text-text-secondary">
                  {quantity} unidade{quantity > 1 ? "s" : ""} = {Math.round(quantity * ML_PER_LIQUID_UNIT).toLocaleString("pt-BR")} ml descontados do estoque.
                </p>
              )}
              {selectedProduct?.unit === "kg" && (
                <p className="mt-1 text-[11px] text-text-secondary">
                  {measureHint(selectedProduct.unit, quantity)}
                </p>
              )}
            </div>

            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase">
                {priceFieldLabel(selectedProduct?.unit || "un")}:
              </span>
              <input
                value={selectedProduct ? formatMoneyBr(selectedProduct.salePrice) : "0,00"}
                className="input-field h-10 w-full text-lg font-semibold"
                disabled
              />
            </label>

            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-semibold uppercase">Preço total:</span>
              <input
                value={selectedProduct ? formatMoneyBr(selectedProduct.salePrice * quantity) : "0,00"}
                className="input-field h-10 w-full text-lg font-semibold"
                disabled
              />
            </label>

            <button
              type="button"
              onClick={addItem}
              className="btn-success h-10 w-full rounded-xl"
            >
              ADICIONAR ITEM (ENTER)
            </button>

            <div className="mt-2 border-t border-border-primary pt-2 text-sm">
              <p className="font-semibold">
                Total volumes:{" "}
                {Number.isInteger(totalVolumes)
                  ? String(totalVolumes).padStart(4, "0")
                  : totalVolumes.toLocaleString("pt-BR", {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    })}
              </p>
            </div>

            <div className="mt-3 hidden rounded-xl border border-border-primary bg-bg-light p-3 sm:block">
              <div className="mx-auto flex h-28 w-full max-w-[220px] items-center justify-center overflow-hidden rounded-xl border-2 border-border-secondary bg-bg-primary text-text-tertiary">
                {previewProduct?.imageUrl ? (
                  <img
                    src={previewProduct.imageUrl}
                    alt={previewProduct.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-center">
                    <ImageIcon size={28} />
                    <span className="text-xs font-medium">Sem imagem</span>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="flex min-h-[55vh] flex-col bg-bg-light lg:min-h-0">
            <div className="grid grid-cols-1 gap-1 border-b border-border-primary bg-bg-gray-theme px-3 py-2 text-xs text-text-primary sm:grid-cols-[1fr_200px] sm:gap-0">
              <p>
                <span className="font-semibold">Empresa:</span>{" "}
                {company?.fantasyName || "PDV-Pedimais"}
              </p>
              <p className="sm:text-right">
                <span className="font-semibold">CNPJ:</span> {company?.cnpj || "-"}
              </p>
            </div>

            <div
              className={`border-b px-3 py-2 text-xs font-semibold ${
                cashCanSell
                  ? "border-success/20 bg-success/10 text-success"
                  : "border-primary/20 bg-primary/10 text-primary"
              }`}
            >
              {cashLabel}
            </div>

            <div className="border-b border-border-primary px-3 py-3">
              <p className="text-xs font-semibold">Nome produto:</p>
              <h2 className="text-center font-display text-xl font-semibold leading-none tracking-tight text-text-primary md:text-3xl">
                {activeProductName || "AGUARDANDO PRODUTO"}
              </h2>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
              <p className="mb-1 text-sm font-semibold">Lista de itens:</p>
              <div className="min-h-[180px] flex-1 overflow-auto rounded-xl border border-dashed border-border-secondary bg-bg-primary md:min-h-0">
                {cart.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-text-secondary">
                    Nenhum item no cupom.
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 p-2 md:hidden">
                      {cart.map((item, index) => {
                        const total = lineAmount(item);
                        return (
                          <article
                            key={item.id}
                            className="rounded-xl border border-border-primary bg-bg-light p-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-text-secondary">
                                  Item #{index + 1} • {item.code}
                                </p>
                                <p className="truncate text-sm font-semibold text-text-primary">
                                  {item.name}
                                </p>
                                {(item.discount > 0 || item.surcharge > 0) && (
                                  <p className="text-[11px] text-text-secondary">
                                    {item.discount > 0 ? `Desconto ${formatMoneyBr(item.discount)}` : ""}
                                    {item.discount > 0 && item.surcharge > 0 ? " · " : ""}
                                    {item.surcharge > 0 ? `Acréscimo ${formatMoneyBr(item.surcharge)}` : ""}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeItem(item.id)}
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-white"
                                aria-label={`Remover ${item.name}`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-text-secondary">Qtd</p>
                                <p className="font-semibold text-text-primary">{lineMeasureLabel(item)}</p>
                              </div>
                              <div>
                                <p className="text-text-secondary">Vl. Unit</p>
                                <p className="font-semibold text-text-primary">
                                  {formatMoneyBr(item.unitPrice)}
                                </p>
                              </div>
                              <div>
                                <p className="text-text-secondary">Vl. Total</p>
                                <p className="font-semibold text-text-primary">
                                  {formatMoneyBr(total)}
                                </p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <table className="hidden min-w-[720px] w-full text-sm leading-[1.25] md:table md:text-base">
                      <thead>
                        <tr className="border-b border-border-primary bg-bg-gray-theme text-[11px] uppercase text-text-secondary md:text-xs">
                          <th className="w-12 px-2 py-1 text-center">#</th>
                          <th className="w-28 px-2 py-1 text-left">Código</th>
                          <th className="px-2 py-1 text-left">Produto</th>
                          <th className="w-16 px-2 py-1 text-center">Qtd</th>
                          <th className="w-32 px-2 py-1 text-right">Vl. Unit</th>
                          <th className="w-32 px-2 py-1 text-right">Vl. Total</th>
                          <th className="w-12 px-1 py-1 text-center"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cart.map((item, index) => {
                          const total = lineAmount(item);
                          return (
                            <tr key={item.id} className="border-b border-border-primary">
                              <td className="w-12 px-2 py-1 text-center">{index + 1}</td>
                              <td className="w-28 px-2 py-1">{item.code}</td>
                              <td className="px-2 py-1">
                                {item.name}
                                {(item.discount > 0 || item.surcharge > 0) && (
                                  <span className="mt-0.5 block text-[11px] text-text-secondary">
                                    {item.discount > 0 ? `Desconto ${formatMoneyBr(item.discount)}` : ""}
                                    {item.discount > 0 && item.surcharge > 0 ? " · " : ""}
                                    {item.surcharge > 0 ? `Acréscimo ${formatMoneyBr(item.surcharge)}` : ""}
                                  </span>
                                )}
                              </td>
                              <td className="w-16 px-2 py-1 text-center">{lineMeasureLabel(item)}</td>
                              <td className="w-32 px-2 py-1 text-right">{formatMoneyBr(item.unitPrice)}</td>
                              <td className="w-32 px-2 py-1 text-right">{formatMoneyBr(total)}</td>
                              <td className="w-12 px-1 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeItem(item.id)}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm bg-primary text-white"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
            </div>

            <div data-tour="venda-pagamento" className="md:sticky md:bottom-0 md:z-10 md:shadow-[0_-8px_18px_rgba(15,23,42,0.08)]">
              <div className="border-t border-border-primary bg-bg-gray-theme px-3 py-1.5 text-sm text-text-primary">00 - Ajuda</div>

              <div className="grid grid-cols-[1fr_160px] border-t border-border-primary md:grid-cols-[1fr_220px]">
                <div className="bg-bg-gray-theme px-3 py-2 text-right text-sm font-semibold uppercase text-text-primary">
                  SUB TOTAL:
                </div>
                <div className="bg-bg-gray-theme px-3 py-2 text-right font-display text-2xl font-bold text-text-primary">
                  R$ {formatMoneyBr(subtotal)}
                </div>
                {appliedCoupon && couponDiscount > 0 ? (
                  <>
                    <div className="bg-bg-gray-theme px-3 py-1 text-right text-sm font-semibold uppercase text-text-primary">
                      CUPOM {appliedCoupon.code}:
                    </div>
                    <div className="bg-bg-gray-theme px-3 py-1 text-right text-lg font-bold text-success">
                      - R$ {formatMoneyBr(couponDiscount)}
                    </div>
                  </>
                ) : null}
                <div className="bg-bg-gray-theme px-3 py-2 text-right text-sm font-semibold uppercase text-text-primary">
                  A PAGAR:
                </div>
                <div className="bg-accent px-3 py-2 text-right font-display text-3xl font-bold text-text-light md:text-4xl">
                  R$ {formatMoneyBr(payable)}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 border-t border-border-primary px-3 py-3 sm:grid-cols-2 lg:grid-cols-4">
                <button
                  type="button"
                  onClick={cancelSale}
                  className="btn-cancel h-11 w-full rounded-xl"
                >
                  ✖ CANCELAR (F8)
                </button>
                <button
                  type="button"
                  onClick={() => setCouponOpen(true)}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border-secondary px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-hover-light hover:text-text-primary"
                >
                  CUPOM (F6)
                </button>
                <button
                  type="button"
                  onClick={printLastSale}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-secondary px-4 py-2 text-sm font-semibold text-text-secondary transition hover:bg-hover-light hover:text-text-primary"
                >
                  <Printer size={16} />
                  Imprimir última venda
                </button>
                <button
                  type="button"
                  onClick={openPayment}
                  className="btn-success h-11 w-full rounded-xl disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!cashCanSell}
                >
                  PAGAMENTO (F12)
                </button>
              </div>

              <footer className="space-y-0.5 border-t border-border-primary bg-bg-primary px-3 py-2 text-[11px] text-text-secondary sm:grid sm:grid-cols-3 sm:items-center sm:space-y-0 sm:text-xs">
                <p>Usuário: {operatorName}</p>
                <p className="sm:text-center">
                  Estabelecimento: {company?.fantasyName || "PDV-Pedimais"}
                </p>
                <p className="sm:text-right">
                  Prévia impressão: {printPreviewEnabled ? "Sim" : "Não"} • Caixa:{" "}
                  {cashCanSell ? "PDV01 aberto" : "bloqueado"}
                </p>
              </footer>
            </div>
          </section>

          <aside data-tour="venda-funcoes" className="hidden border-border-primary bg-bg-gray-theme p-3 text-text-primary lg:block lg:overflow-y-auto lg:border-l">
            <h2 className="mb-2 text-sm font-semibold text-accent">Funções</h2>
            <ul className="space-y-1">
              {[
                { key: "F2", label: "Desconto no item", run: () => openLineAdjustment("discount") },
                { key: "F3", label: "Acréscimo no item", run: () => openLineAdjustment("surcharge") },
                { key: "F5", label: "Cancelar item", run: cancelLastItem },
                { key: "F6", label: "Cupom", run: () => setCouponOpen(true) },
                { key: "F8", label: "Cancelar cupom", run: () => void cancelSale() },
                { key: "F12", label: "Totalizar cupom", run: () => void openPayment() },
              ].map((shortcut) => (
                <li key={shortcut.key}>
                  <button
                    type="button"
                    onClick={shortcut.run}
                    className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs transition hover:bg-accent/10"
                  >
                    <span className="inline-flex min-w-10 justify-center rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-text-light">
                      {shortcut.key}
                    </span>
                    <span className="font-medium">{shortcut.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </main>
      </div>

      {couponOpen && (
        <div className="fixed inset-0 z-layer-modal flex items-center justify-center bg-black/45 p-4">
          <form
            className="w-full max-w-sm rounded-2xl border border-border-primary bg-bg-light p-4 text-text-primary"
            onSubmit={(event) => {
              event.preventDefault();
              void applyCoupon();
            }}
          >
            <h2 className="text-lg font-semibold">Cupom</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Digite o código cadastrado pelo administrador.
            </p>
            <input
              autoFocus
              value={couponInput}
              onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
              placeholder="PAO10"
              className="input-field mt-3 w-full uppercase"
            />
            {appliedCoupon ? (
              <button
                type="button"
                className="mt-3 text-sm font-semibold text-rose-700"
                onClick={() => {
                  setAppliedCoupon(null);
                  setCouponOpen(false);
                  Toast.info("Cupom removido.");
                }}
              >
                Remover {appliedCoupon.code}
              </button>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setCouponOpen(false)} className="btn-cancel">
                Cancelar
              </button>
              <button type="submit" className="btn-success" disabled={couponChecking}>
                {couponChecking ? "Conferindo" : "OK"}
              </button>
            </div>
          </form>
        </div>
      )}

      {lineAdjustment && (
        <div className="fixed inset-0 z-layer-modal flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border-primary bg-bg-light p-4 text-text-primary">
            <h2 className="text-lg font-semibold">
              {lineAdjustment === "discount" ? "Desconto no item" : "Acréscimo no item"}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Vale para {cart[cart.length - 1]?.name || "o último item"}. Use reais ou porcentagem.
            </p>
            <input
              autoFocus
              value={adjustmentInput}
              onChange={(event) => setAdjustmentInput(event.target.value)}
              placeholder="2,00 ou 10%"
              className="input-field mt-3 w-full"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLineAdjustment(null)} className="btn-cancel">
                Cancelar
              </button>
              <button type="button" onClick={applyLineAdjustment} className="btn-success">
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 z-layer-modal flex items-end bg-black/45 md:items-center md:justify-center">
          <div className="w-full rounded-t-2xl border border-border-primary bg-bg-light p-4 md:max-w-xl md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">Pagamento</h2>
              <button
                type="button"
                onClick={() => setCheckoutOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-primary text-text-secondary"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">CPF na nota (opcional)</span>
                <input
                  value={cpfNota}
                  onChange={(event) => setCpfNota(event.target.value)}
                  className="input-field w-full"
                  placeholder="Somente se cliente pedir"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm text-text-secondary">Forma de pagamento</span>
                <select
                  value={paymentType}
                  onChange={(event) => setPaymentType(event.target.value as PaymentType)}
                  className="input-field w-full"
                >
                  {PAYMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {paymentType === "dinheiro" && (
                <label className="block">
                  <span className="mb-1.5 block text-sm text-text-secondary">Valor recebido</span>
                  <input
                    value={cashGiven}
                    inputMode="decimal"
                    onChange={(event) => setCashGiven(maskMoneyBr(event.target.value))}
                    className="input-field w-full"
                    placeholder="0,00"
                  />
                </label>
              )}

              <div className="rounded-xl border border-border-primary bg-bg-primary p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Subtotal</span>
                  <span className="font-semibold text-text-primary">R$ {formatMoneyBr(subtotal)}</span>
                </div>
                {appliedCoupon && couponDiscount > 0 ? (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-text-secondary">Cupom {appliedCoupon.code}</span>
                    <span className="font-semibold text-success">- R$ {formatMoneyBr(couponDiscount)}</span>
                  </div>
                ) : null}
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-text-secondary">Total</span>
                  <span className="font-semibold text-text-primary">R$ {formatMoneyBr(payable)}</span>
                </div>
                {paymentType === "dinheiro" && (
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-text-secondary">Troco</span>
                    <span className="font-semibold text-success">R$ {formatMoneyBr(changeValue)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setCheckoutOpen(false)} className="btn-cancel">
                Voltar
              </button>
              <button type="button" onClick={confirmPayment} className="btn-success">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {receiptPreview ? (
        <ReceiptPreviewModal
          receipt={receiptPreview}
          formatMoney={formatMoneyBr}
          onClose={() => setReceiptPreview(null)}
        />
      ) : null}

      {statusDialog.Dialog}
    </div>
  );
}
