/**
 * Arquivo: src/pages/Admin/CouponsPage.tsx
 * Objetivo: deixa o administrador cadastrar cupons de porcentagem ou valor fixo.
 * Entradas esperadas: não recebe props; usa a empresa da sessão.
 */
import { useEffect, useState } from "react";
import PageHeader from "@/components/Admin/PageHeader";
import LoadingButton from "@/components/Loading/LoadingButton";
import { Toast, useStatusDialog } from "@/hooks/Dialog";
import useInputMasks from "@/hooks/InputMasks/useInputMasks";
import PageLayout from "@/layout/PageLayout";
import { couponService, type CouponDto, type CouponKind } from "@/services/api/couponService";

const emptyForm = {
  code: "",
  description: "",
  kind: "percentual" as CouponKind,
  amount: "",
  active: true,
};

export default function CouponsPage() {
  const { maskMoneyBr, parseMoneyBr, formatMoneyBr } = useInputMasks();
  const statusDialog = useStatusDialog();
  const [coupons, setCoupons] = useState<CouponDto[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const rows = await couponService.list();
    setCoupons(rows);
  };

  useEffect(() => {
    load()
      .catch((error) => {
        Toast.error(error instanceof Error ? error.message : "Não foi possível carregar os cupons.");
      })
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const save = async () => {
    const amountNumber = parseMoneyBr(form.amount || "0");
    if (form.code.trim().length < 2) {
      Toast.error("Informe um código com pelo menos 2 caracteres.");
      return;
    }
    if (form.kind === "percentual" && (amountNumber <= 0 || amountNumber > 100)) {
      Toast.error("A porcentagem fica entre 0,01 e 100.");
      return;
    }
    if (form.kind === "fixo" && amountNumber <= 0) {
      Toast.error("O valor fixo precisa ser maior que zero.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        code: form.code.trim(),
        description: form.description.trim(),
        amount: formatMoneyBr(amountNumber),
      };
      if (editingId) {
        await couponService.update(editingId, payload);
        Toast.success("Cupom atualizado.");
      } else {
        await couponService.create(payload);
        Toast.success("Cupom cadastrado.");
      }
      resetForm();
      await load();
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível salvar o cupom.");
    } finally {
      setSaving(false);
    }
  };

  const edit = (coupon: CouponDto) => {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      description: coupon.description,
      kind: coupon.kind,
      amount: coupon.kind === "fixo" ? maskMoneyBr(coupon.amount) : String(parseMoneyBr(coupon.amount)).replace(".", ","),
      active: coupon.active,
    });
  };

  const remove = async (coupon: CouponDto) => {
    const confirmed = await statusDialog.confirm(`Excluir o cupom ${coupon.code}?`);
    if (!confirmed) return;
    try {
      await couponService.remove(coupon.id);
      if (editingId === coupon.id) resetForm();
      await load();
      Toast.success("Cupom excluído.");
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : "Não foi possível excluir o cupom.");
    }
  };

  return (
    <PageLayout>
      <PageHeader
        title="Cupons"
        description="O administrador cadastra o código. No caixa, a pessoa digita esse código para abater a venda."
      />

      <form
        className="mt-6 grid gap-4 rounded-2xl border border-border-primary bg-bg-light p-4 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Código</span>
          <input
            className="input-field w-full uppercase"
            value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
            placeholder="PAO10"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Tipo</span>
          <select
            className="input-field w-full"
            value={form.kind}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                kind: event.target.value as CouponKind,
                amount: "",
              }))
            }
          >
            <option value="percentual">Porcentagem</option>
            <option value="fixo">Valor fixo</option>
          </select>
        </label>
        <label className="block md:col-span-2">
          <span className="mb-1 block text-sm font-semibold">Descrição</span>
          <input
            className="input-field w-full"
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Terça do pão francês"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">
            {form.kind === "percentual" ? "Porcentagem" : "Valor"}
          </span>
          <input
            className="input-field w-full"
            inputMode="decimal"
            value={form.amount}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                amount:
                  current.kind === "fixo"
                    ? maskMoneyBr(event.target.value)
                    : event.target.value.replace(/[^\d,]/g, "").slice(0, 6),
              }))
            }
            placeholder={form.kind === "percentual" ? "10" : "0,00"}
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
          />
          Cupom ativo
        </label>
        <div className="flex justify-end gap-2 md:col-span-2">
          {editingId ? (
            <button type="button" className="btn-cancel" onClick={resetForm}>
              Cancelar edição
            </button>
          ) : null}
          <LoadingButton type="submit" isLoading={saving} className="btn-success">
            {editingId ? "Salvar cupom" : "Cadastrar cupom"}
          </LoadingButton>
        </div>
      </form>

      <div className="mt-6 overflow-hidden rounded-2xl border border-border-primary bg-bg-light">
        {loading ? (
          <p className="p-4 text-sm text-text-secondary">Carregando cupons.</p>
        ) : coupons.length === 0 ? (
          <p className="p-4 text-sm text-text-secondary">Nenhum cupom cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-bg-gray-theme text-left">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Desconto</th>
                <th className="px-4 py-3">Descrição</th>
                <th className="px-4 py-3">Situação</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-t border-border-primary">
                  <td className="px-4 py-3 font-semibold">{coupon.code}</td>
                  <td className="px-4 py-3">
                    {coupon.kind === "percentual"
                      ? `${parseMoneyBr(coupon.amount).toLocaleString("pt-BR")}%`
                      : `R$ ${coupon.amount}`}
                  </td>
                  <td className="px-4 py-3">{coupon.description || "—"}</td>
                  <td className="px-4 py-3">{coupon.active ? "Ativo" : "Inativo"}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="mr-3 text-accent" onClick={() => edit(coupon)}>
                      Editar
                    </button>
                    <button type="button" className="font-semibold text-rose-700" onClick={() => void remove(coupon)}>
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageLayout>
  );
}
