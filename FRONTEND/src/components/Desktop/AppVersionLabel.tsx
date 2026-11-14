/**
 * Arquivo: src/components/Desktop/AppVersionLabel.tsx
 * Objetivo: mostra no cabeçalho a versão que está instalada neste caixa.
 * Entradas esperadas: className opcional para caber no header claro ou no header azul.
 */
import { useDesktopVersion } from "./desktopBridge";

type AppVersionLabelProps = {
  className?: string;
};

export default function AppVersionLabel({ className = "" }: AppVersionLabelProps) {
  const version = useDesktopVersion();
  if (!version) return null;
  return <span className={className}>Versão {version}</span>;
}
