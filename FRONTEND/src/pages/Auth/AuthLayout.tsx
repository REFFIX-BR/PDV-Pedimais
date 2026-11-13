/**
 * Arquivo: src/pages/Auth/AuthLayout.tsx
 * Objetivo: padroniza o layout visual das telas públicas de login, cadastro e recuperação de senha.
 * Entradas esperadas: recebe conteúdo filho e textos de apoio exibidos no painel institucional.
 */
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import BrandLogo from "@/components/BrandLogo";
import BrandWordmark from "@/components/BrandWordmark";

type AuthLayoutProps = {
  title: string;
  description: string;
  children: ReactNode;
  onBackToLogin?: () => void;
  backdrop?: string;
};

export default function AuthLayout({
  title,
  description,
  children,
  onBackToLogin,
}: AuthLayoutProps) {
  return (
    <main className="auth-stage">
      <div className="auth-stage-wash" aria-hidden="true" />
      <div className="auth-stage-frame">
        <section className="auth-story">
          <BrandLogo className="auth-story-logo h-16 w-16" />
          <BrandWordmark className="auth-story-wordmark h-12 w-auto max-w-full" />
          <h1>O caixa do seu balcão.</h1>
          <p>
            Vendas, estoque e nota no mesmo lugar. Cada empresa entra no próprio espaço.
          </p>
          <ul>
            <li>Frente de caixa</li>
            <li>Estoque do dia</li>
            <li>Caixa da loja</li>
          </ul>
        </section>

        <section className="auth-sheet auth-login-card">
          {onBackToLogin ? (
            <button
              type="button"
              onClick={onBackToLogin}
              className="auth-back"
            >
              <ArrowLeft size={16} />
              Voltar ao login
            </button>
          ) : null}

          <h2 className="auth-login-reveal-2">{title}</h2>
          <p className="auth-sheet-lead auth-login-reveal-3">{description}</p>
          <div className="auth-sheet-body auth-login-reveal-3">{children}</div>
        </section>
      </div>
    </main>
  );
}
