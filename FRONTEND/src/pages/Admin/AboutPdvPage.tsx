/**
 * Arquivo: src/pages/Admin/AboutPdvPage.tsx
 * Objetivo: apresenta a empresa REFFIX e o que o PDV-Pedimais faz na loja.
 * Entradas esperadas: não recebe props; exibe o texto institucional da versão atual.
 */
import BrandLogo from "@/components/BrandLogo";
import BrandWordmark from "@/components/BrandWordmark";
import PageHeader from "@/components/Admin/PageHeader";
import PageLayout from "@/layout/PageLayout";

export default function AboutPdvPage() {
  return (
    <PageLayout className="space-y-4 py-4 md:space-y-6 md:py-6 lg:py-8">
      <PageHeader
        title="Sobre PDV"
        description="PDV-Pedimais, criado em 2026 pela REFFIX."
      />

      <section className="card overflow-hidden">
        <div className="border-b border-border-primary bg-gradient-to-r from-secondary/8 via-bg-light to-accent/8 px-4 py-5 md:px-5">
          <div className="flex items-center gap-4">
            <BrandLogo className="h-16 w-16 shrink-0" />
            <div className="min-w-0">
              <BrandWordmark className="h-14 w-auto max-w-full" />
              <p className="mt-1 text-sm text-text-secondary">
                Sistema de frente de caixa para a operação da loja.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 md:p-5">
          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <h3 className="text-sm font-semibold text-text-primary">O que é</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              O PDV-Pedimais registra a venda no balcão, controla o estoque, o caixa de cada
              operador, as compras e as trocas. O cupom sai na hora e o dinheiro de cada gaveta
              fica separado por quem está logado.
            </p>
          </article>

          <article className="rounded-xl border border-border-primary bg-bg-primary p-4">
            <h3 className="text-sm font-semibold text-text-primary">REFFIX</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              Criado em 2026 pela empresa REFFIX. Todos os direitos reservados à REFFIX.
              É proibida a cópia, a distribuição ou o uso comercial sem autorização da empresa.
            </p>
          </article>
        </div>
      </section>
    </PageLayout>
  );
}
