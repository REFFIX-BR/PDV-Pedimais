/**
 * Arquivo: src/pages/Auth/LoginPage.tsx
 * Objetivo: renderiza autenticação do usuário e inicialização da sessão no frontend.
 * Entradas esperadas: recebe callbacks de sucesso e navegação para recuperação de senha.
 */
import { LogIn } from "lucide-react";
import { useState } from "react";
import useRecaptchaV3 from "@/hooks/Security/useRecaptchaV3";
import AuthLayout from "./AuthLayout";
import { EmailField, FeedbackMessage, PasswordField } from "./AuthFields";
import LoadingButton from "@/components/Loading/LoadingButton";
import type { AuthActionResult } from "./types";

type LoginPageProps = {
  onLogin: (
    email: string,
    password: string,
    remember: boolean,
    recaptchaToken?: string,
  ) => Promise<AuthActionResult>;
  onOpenForgotPassword: () => void;
};

export default function LoginPage({
  onLogin,
  onOpenForgotPassword,
}: LoginPageProps) {
  const { executeRecaptcha, isRecaptchaConfigured } = useRecaptchaV3();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<AuthActionResult | null>(null);

  const runRecaptcha = () =>
    isRecaptchaConfigured ? executeRecaptcha("login") : Promise.resolve("");

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setFeedback({
        success: false,
        message: "Informe e-mail e senha para entrar.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const recaptchaToken = await runRecaptcha();
      setFeedback(await onLogin(email, password, remember, recaptchaToken));
    } catch (error) {
      setFeedback(
        toErrorResult(
          error,
          "Não foi possível concluir a validação de segurança.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Entrar no caixa"
      description="E-mail e senha da sua empresa."
    >
      <EmailField value={email} onChange={setEmail} onEnter={handleLogin} />
      <PasswordField
        label="Senha"
        value={password}
        show={showPassword}
        onChange={setPassword}
        onToggle={() => setShowPassword((current) => !current)}
        onEnter={handleLogin}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          Manter sessão conectada
        </label>
        <button
          type="button"
          onClick={onOpenForgotPassword}
          disabled={isSubmitting}
          className="auth-text-link"
        >
          Esqueci minha senha
        </button>
      </div>

      <LoadingButton
        type="button"
        onClick={handleLogin}
        isLoading={isSubmitting}
        loadingLabel="Entrando..."
        className="btn-primary inline-flex min-h-11 w-full items-center justify-center gap-2"
      >
        <LogIn size={16} />
        Entrar
      </LoadingButton>

      <div className="auth-quiet-links">
        <a href="/site" target="_blank" rel="noopener noreferrer">
          Conheça o sistema
        </a>
        <span aria-hidden="true">·</span>
        <a href="/site/precos" target="_blank" rel="noopener noreferrer">
          Ver preços
        </a>
      </div>

      <FeedbackMessage result={feedback} />
    </AuthLayout>
  );
}

function toErrorResult(error: unknown, fallback: string): AuthActionResult {
  return {
    success: false,
    message: error instanceof Error ? error.message : fallback,
  };
}
