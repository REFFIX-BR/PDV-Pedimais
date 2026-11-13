/**
 * Arquivo: src/components/Loading/SplashScreen.tsx
 * Objetivo: cobre a abertura do PDV até a sessão estar conferida.
 * Entradas esperadas: mensagem opcional exibida abaixo da marca.
 */
type SplashScreenProps = {
  message?: string;
};

export default function SplashScreen({ message = "Carregando o sistema" }: SplashScreenProps) {
  return (
    <div className="boot-splash" role="status" aria-live="polite">
      <div className="boot-brand">
        <img className="boot-logo" src="/logo.png" alt="" />
        <img className="boot-word" src="/wordmark.png" alt="PDV-Pedimais, painel operacional" />
      </div>
      <p className="boot-status">{message}</p>
      <div className="boot-track" aria-hidden="true">
        <span className="boot-bar"></span>
      </div>
    </div>
  );
}
