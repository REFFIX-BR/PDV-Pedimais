import type { PageKey } from "@/components/AppSidebar/AppSidebar";

const attendantPages = new Set<PageKey>([
  "home",
  "cadastro-cliente",
  "cadastro-produto",
  "historico-vendas",
  "vendas",
  "caixa",
  "sangria",
  "suprimento",
  "devolucoes",
  "editar-perfil",
  "configuracoes",
]);

export function normalizeRole(role: string) {
  const value = role.trim().toLowerCase();
  if (value === "administrador" || value === "admin") return "administrador";
  if (value === "gerente") return "gerente";
  if (value === "atendente") return "atendente";
  if (value === "financeiro") return "financeiro";
  return value;
}

export function canDeleteProducts(role: string) {
  return normalizeRole(role) !== "atendente";
}

export function canAccessPage(role: string, page: PageKey) {
  const normalized = normalizeRole(role);
  if (page === "caixas-abertos" || page === "cupons") return normalized === "administrador";
  if (normalized === "atendente") return attendantPages.has(page);
  if (normalized === "gerente" || normalized === "financeiro") return page !== "minha-empresa";
  return true;
}
