/**
 * Arquivo: src/components/BrandWordmark.tsx
 * Objetivo: mostra o nome PDV-Pedimais ao lado do ícone da marca.
 * Entradas esperadas: tamanho visual opcional via className.
 */
type BrandWordmarkProps = {
  className?: string;
};

export default function BrandWordmark({ className = "h-10 w-auto" }: BrandWordmarkProps) {
  return (
    <img
      src="/wordmark.png"
      alt="PDV-Pedimais, painel operacional"
      className={`${className} object-contain object-left`}
    />
  );
}
