/**
 * Arquivo: src/components/BrandLogo.tsx
 * Objetivo: mostra a marca do PDV-Pedimais nas telas do sistema.
 * Entradas esperadas: tamanho visual opcional via className.
 */
type BrandLogoProps = {
  className?: string;
};

export default function BrandLogo({ className = "h-10 w-10" }: BrandLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="PDV-Pedimais"
      className={`${className} shrink-0 object-contain`}
    />
  );
}
