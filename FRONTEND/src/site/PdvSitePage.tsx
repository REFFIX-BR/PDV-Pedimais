/**
 * Arquivo: src/site/PdvSitePage.tsx
 * Objetivo: apresenta o PDV-Pedimais para quem chega pelo site da REFFIX.
 * Entradas esperadas: não recebe props; a página pública fica em /site.
 */
import { useEffect, useState } from "react";
import { ArrowLeftRight, FileText, ReceiptText, Truck, Users, Warehouse } from "lucide-react";

const slides = [
  {
    src: "/site/home.png?v=4",
    label: "Home do painel",
    alt: "Tela inicial do PDV-Pedimais, com as vendas do dia, o faturamento e os atalhos do caixa.",
  },
  {
    src: "/site/frente.png?v=6",
    label: "Frente de caixa",
    alt: "Frente de caixa do PDV-Pedimais, com os itens do cupom e o pagamento.",
  },
  {
    src: "/site/produtos.png?v=4",
    label: "Cadastro de produto",
    alt: "Tela de cadastro de produto do PDV-Pedimais.",
  },
  {
    src: "/site/vendas.png?v=4",
    label: "Histórico de vendas",
    alt: "Tela de histórico de vendas do PDV-Pedimais.",
  },
  {
    src: "/site/caixa.png?v=5",
    label: "Abertura e fechamento",
    alt: "Tela de abertura e fechamento de caixa do PDV-Pedimais.",
  },
];

const PLAN_CENTS = 17000;
const NOTE_CENTS = 10;
const NOTES_MAX = 50000;
const NOTE_STEPS = [0, 100, 200, 500, 1000];
const WHATSAPP_VENDAS = "";
const PLAN_ITEMS = [
  "Frente de caixa, cupom e pagamento",
  "NFC-e e NF-e, a R$ 0,10 por nota emitida",
  "Estoque, com aviso quando está acabando",
  "Compras e entrada no estoque",
  "Troca e devolução, com estorno na gaveta",
  "Gaveta separada por operador",
  "Quantos usuários quiser, cada um no seu login",
  "Histórico de vendas",
  "Cadastro de cliente, produto e fornecedor",
];

function reais(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function whatsappLink(notes: number, totalCents: number) {
  const digits = WHATSAPP_VENDAS.replace(/\D/g, "");
  if (digits.length < 12) return "";

  const notesLine =
    notes === 0
      ? "Neste mês, nenhuma nota."
      : `Neste mês, ${notes.toLocaleString("pt-BR")} ${notes === 1 ? "nota" : "notas"}.`;
  const text = [
    "Olá! Quero o PDV-Pedimais.",
    "Plano: R$ 170,00 por mês.",
    notesLine,
    `Total estimado: ${reais(totalCents)}.`,
    "Podemos conversar para contratar?",
  ].join("\n");

  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

function PricePage() {
  const [draft, setDraft] = useState("200");
  const parsed = Number(draft);
  const notes = draft === "" || !Number.isFinite(parsed) ? 0 : Math.min(NOTES_MAX, Math.max(0, Math.round(parsed)));
  const noteCents = notes * NOTE_CENTS;
  const totalCents = PLAN_CENTS + noteCents;
  const fill = `${Math.min(100, (notes / NOTES_MAX) * 100)}%`;
  const talkHref = whatsappLink(notes, totalCents);

  function setNoteCount(value: number) {
    if (!Number.isFinite(value)) return;
    setDraft(String(Math.min(NOTES_MAX, Math.max(0, Math.round(value)))));
  }

  const cta = talkHref ? (
    <a className="site-plan-cta" href={talkHref} target="_blank" rel="noopener noreferrer">
      Comprar no WhatsApp
    </a>
  ) : (
    <span className="site-plan-cta">Comprar no WhatsApp</span>
  );

  return (
    <section className="site-price-page">
      <div className="site-wrap site-price-layout">
        <div className="site-price-story">
          <p className="site-kicker">Preços</p>
          <h1>Um plano. O caixa inteiro.</h1>
          <p>
            Não existe pacote menor nem pacote maior. O mês da loja cabe nesse cartão:
            o painel é fixo, a nota só entra quando sai e o usuário não tem limite.
          </p>
          <div className="site-price-points">
            <article>
              <strong>R$ 170</strong>
              <span>todo mês, pelo painel do caixa.</span>
            </article>
            <article>
              <strong>R$ 0,10</strong>
              <span>por NFC-e ou NF-e, só quando a nota é emitida.</span>
            </article>
            <article>
              <strong>Sem limite</strong>
              <span>de usuários. Cada pessoa entra no próprio login.</span>
            </article>
          </div>
        </div>

        <form className="site-plan-card" onSubmit={(event) => event.preventDefault()}>
        <p className="site-plan-badge">Plano único</p>
        <h2>Plano do caixa</h2>
        <p className="site-plan-lead">Para vender no balcão, controlar o estoque e fechar a gaveta.</p>
        <p className="site-plan-price">
          <strong>R$ 170</strong>
          <small>/mês</small>
        </p>
        <p className="site-plan-extra">+ R$ 0,10 por NFC-e ou NF-e emitida</p>

        <div className="site-plan-meter">
          <label className="site-plan-ask" htmlFor="notas-mes">
            Quantas notas você emite no mês?
          </label>
          <div className="site-plan-ask-row">
            <input
              id="notas-mes"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              aria-label="Quantidade de notas emitidas no mês"
              value={draft}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, "").slice(0, 5);
                if (digits === "") {
                  setDraft("");
                  return;
                }
                setDraft(String(Math.min(NOTES_MAX, Number(digits))));
              }}
            />
            <span>{notes === 1 ? "nota" : "notas"}</span>
          </div>
          <input
            className="site-plan-range"
            type="range"
            min={0}
            max={NOTES_MAX}
            step={10}
            value={notes}
            style={{ ["--fill" as string]: fill }}
            aria-valuetext={`${notes.toLocaleString("pt-BR")} notas, total ${reais(totalCents)}`}
            onChange={(event) => setNoteCount(Number(event.target.value))}
          />
          <div className="site-plan-picks">
            {NOTE_STEPS.map((step) => (
              <button key={step} type="button" aria-pressed={notes === step} onClick={() => setNoteCount(step)}>
                {step === 0 ? "Sem nota" : step.toLocaleString("pt-BR")}
              </button>
            ))}
          </div>
          <p>
            <span>{notes.toLocaleString("pt-BR")} {notes === 1 ? "nota" : "notas"} × R$ 0,10 + o plano</span>
            <strong>{reais(totalCents)}</strong>
          </p>
        </div>

        {cta}

        <ul className="site-plan-list">
          {PLAN_ITEMS.map((item) => (
            <li key={item}>
              <i aria-hidden="true" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </form>
      </div>
    </section>
  );
}

const shots = [
  {
    src: slides[1].src,
    title: "Frente de caixa",
    text: "O cupom sai no balcão, com os itens, o peso e o pagamento.",
  },
  {
    src: slides[2].src,
    title: "Produtos",
    text: "Código, nome e o que está à venda no balcão.",
  },
  {
    src: slides[3].src,
    title: "Histórico de vendas",
    text: "Cada venda fica registrada, com cliente, valor e data.",
  },
  {
    src: slides[4].src,
    title: "Abertura e fechamento",
    text: "O operador abre a gaveta do dia e fecha no fim do turno.",
  },
];

export default function PdvSitePage() {
  const [slideIndex, setSlideIndex] = useState(0);
  const isPrice = window.location.pathname.replace(/\/$/, "") === "/site/precos";

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;

    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = isPrice ? "Preços · PDV-Pedimais" : "PDV-Pedimais";
  }, [isPrice]);

  return (
    <>
      <header className="site-nav">
        <div className="site-wrap site-nav-inner">
          <a className="site-brand" href="/site" aria-label="PDV-Pedimais">
            <img src="/logo.png" alt="" />
            <img src="/wordmark.png" alt="PDV-Pedimais, painel operacional" />
          </a>
          <nav className="site-nav-links" aria-label="Seções">
            <a href="/site#telas">Telas</a>
            <a href="/site#nota">Nota fiscal</a>
            <a href="/site/precos" aria-current={isPrice ? "page" : undefined}>
              Preços
            </a>
            <a href="/site#recursos">Recursos</a>
          </nav>
          <a className="site-button site-button-primary" href="/">
            Entrar no painel
          </a>
        </div>
      </header>

      <main>
        {isPrice ? (
          <PricePage />
        ) : (
          <>
        <section className="site-hero-band">
          <div className="site-wrap site-hero">
            <div className="site-copy">
              <p className="site-kicker">REFFIX · 2026</p>
              <h1>
                <span>Venda, estoque </span>
                <span>e gaveta no </span>
                <span>mesmo lugar.</span>
              </h1>
              <p>
                O PDV-Pedimais é o sistema de frente de caixa da REFFIX. A venda gera a nota
                fiscal, o estoque acompanha o que saiu e o dinheiro fica na gaveta de quem
                está logado.
              </p>
              <div className="site-actions">
                <a className="site-button site-button-primary" href="#telas">
                  Ver o sistema
                </a>
                <a className="site-button site-button-ghost" href="#nota">
                  Nota fiscal
                </a>
              </div>
            </div>
          </div>
          <img
            className="site-hero-art"
            src="/site/hero-painel.jpg"
            alt="Painel do PDV-Pedimais aberto no notebook, com vendas, estoque e nota fiscal."
          />
        </section>

        <section className="site-wrap">
          <figure className="site-frame">
            <div className="site-chrome" aria-hidden="true">
              <i />
              <i />
              <i />
              <strong>{slides[slideIndex].label}</strong>
            </div>
            <div className="site-reel">
              <div
                className="site-track"
                style={{
                  width: `${slides.length * 100}%`,
                  transform: `translateX(-${(slideIndex * 100) / slides.length}%)`,
                }}
              >
                {slides.map((slide) => (
                  <img
                    key={slide.src}
                    src={slide.src}
                    alt={slide.alt}
                    style={{ width: `${100 / slides.length}%` }}
                  />
                ))}
              </div>
            </div>
          </figure>
        </section>

        <section className="site-wrap site-facts" aria-label="O que o caixa faz">
          <article>
            <strong>Nota fiscal</strong>
            <span>A venda gera a NFC-e e também segue para a NF-e.</span>
          </article>
          <article>
            <strong>Cupom na hora</strong>
            <span>O balcão fecha com os itens, o pagamento e o troco.</span>
          </article>
          <article>
            <strong>Estoque vivo</strong>
            <span>O produto sai na venda e volta quando há troca.</span>
          </article>
          <article>
            <strong>Gaveta de cada um</strong>
            <span>O dinheiro entra só no caixa de quem está logado.</span>
          </article>
        </section>

        <section className="site-wrap site-section" id="telas">
          <p className="site-kicker">Telas</p>
          <h2>O painel, como ele é no balcão.</h2>
          <p>
            A Home, a frente de caixa, o produto, o histórico e a abertura do caixa. São as mesmas telas de quem
            abre a loja e atende.
          </p>
          <div className="site-shots">
            {shots.map((shot) => (
              <figure className="site-shot" key={shot.src}>
                <img src={shot.src} alt={`Tela de ${shot.title} do PDV-Pedimais.`} />
                <figcaption>
                  {shot.title}
                  <small>{shot.text}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="site-wrap site-section" id="nota">
          <div className="site-note">
            <div>
              <p className="site-kicker">Nota fiscal</p>
              <h2>A venda gera a nota.</h2>
              <p>
                No balcão, o PDV emite a NFC-e, a nota fiscal de consumidor, com os itens,
                a quantidade e o pagamento. Quando a operação pede a nota da empresa, o
                mesmo caixa segue para a NF-e. O cliente pode informar o CPF, e a venda
                fica guardada no histórico.
              </p>
              <div className="site-points">
                <article>
                  <strong>Itens</strong>
                  <span>Unidade, quilo ou litro, do jeito que saiu.</span>
                </article>
                <article>
                  <strong>CPF</strong>
                  <span>O documento do cliente entra na hora da venda.</span>
                </article>
                <article>
                  <strong>Pagamento</strong>
                  <span>Dinheiro, PIX ou cartão, com o total da nota.</span>
                </article>
              </div>
            </div>

            <div className="site-document" aria-hidden="true">
              <div className="site-paper">
                <header>
                  <div>
                    <strong>Padaria Demo</strong>
                    <small>CNPJ 11.222.333/0001-81</small>
                  </div>
                  <span className="site-badge">NFC-e</span>
                </header>
                <div className="site-doc-line">
                  <span>Pão francês · 2 un</span>
                  <span>R$ 3,00</span>
                </div>
                <div className="site-doc-line">
                  <span>Água · 1 un</span>
                  <span>R$ 3,50</span>
                </div>
                <div className="site-doc-total">
                  <span>Total</span>
                  <span>R$ 6,50</span>
                </div>
                <div className="site-doc-line">
                  <span>Pagamento</span>
                  <span>Dinheiro</span>
                </div>
                <div className="site-doc-line">
                  <span>CPF na nota</span>
                  <span>Informado no caixa</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="site-wrap site-section" id="sistema">
          <div className="site-split">
            <div>
              <p className="site-kicker">O balcão</p>
              <h2>Feito para quem atende de pé.</h2>
              <p>
                Padaria, açougue e loja de balcão. O operador abre a gaveta, passa a venda,
                gera a nota e fecha o dia sem misturar o dinheiro de outra pessoa.
              </p>
            </div>
            <div className="site-steps" id="balcao">
              <article className="site-step">
                <b>01</b>
                <div>
                  <h3>Abre o caixa</h3>
                  <p>O valor de abertura fica na gaveta daquele operador, não no caixa da loja inteira.</p>
                </div>
              </article>
              <article className="site-step">
                <b>02</b>
                <div>
                  <h3>Passa a venda</h3>
                  <p>Unidade, quilo ou litro. O estoque baixa e o cupom mostra o que saiu.</p>
                </div>
              </article>
              <article className="site-step">
                <b>03</b>
                <div>
                  <h3>Gera a nota</h3>
                  <p>A NFC-e sai com os itens e o pagamento. A NF-e cobre a nota da empresa.</p>
                </div>
              </article>
              <article className="site-step">
                <b>04</b>
                <div>
                  <h3>Resolve a troca</h3>
                  <p>Depois do pagamento, a devolução devolve o produto e estorna o valor da gaveta certa.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="site-wrap site-section" id="recursos">
          <p className="site-kicker">Recursos</p>
          <h2>O dia da loja, sem planilha ao lado.</h2>
          <div className="site-grid">
            <article className="site-feature site-feature-accent">
              <div className="site-mark" aria-hidden="true">
                <FileText size={22} strokeWidth={1.75} />
              </div>
              <h3>Nota fiscal</h3>
              <p>NFC-e para o consumidor no balcão e NF-e quando a venda pede a nota da empresa.</p>
            </article>
            <article className="site-feature">
              <div className="site-mark" aria-hidden="true">
                <ReceiptText size={22} strokeWidth={1.75} />
              </div>
              <h3>Frente de caixa</h3>
              <p>
                Busca o produto, lança a quantidade e recebe em dinheiro, PIX ou cartão.
                O dinheiro entra na gaveta.
              </p>
            </article>
            <article className="site-feature">
              <div className="site-mark" aria-hidden="true">
                <Warehouse size={22} strokeWidth={1.75} />
              </div>
              <h3>Estoque</h3>
              <p>A quantidade real do produto, com aviso quando está acabando.</p>
            </article>
            <article className="site-feature">
              <div className="site-mark" aria-hidden="true">
                <Truck size={22} strokeWidth={1.75} />
              </div>
              <h3>Compras</h3>
              <p>O pedido de reposição entra e, ao receber, soma no estoque.</p>
            </article>
            <article className="site-feature site-feature-warm">
              <div className="site-mark" aria-hidden="true">
                <ArrowLeftRight size={22} strokeWidth={1.75} />
              </div>
              <h3>Trocas</h3>
              <p>A devolução estorna a venda. A troca cobre a diferença do produto novo.</p>
            </article>
            <article className="site-feature">
              <div className="site-mark" aria-hidden="true">
                <Users size={22} strokeWidth={1.75} />
              </div>
              <h3>Cadastros</h3>
              <p>Cliente, fornecedor, produto e os usuários do balcão, cada um no seu login.</p>
            </article>
          </div>
        </section>

        <section className="site-wrap">
          <div className="site-panel">
            <div>
              <p className="site-kicker">REFFIX</p>
              <h2>Criado em 2026 para a operação da loja.</h2>
              <p>
                Todos os direitos reservados à REFFIX. O PDV-Pedimais é o painel de quem
                abre a loja, atende, emite a nota e fecha a gaveta no fim do turno.
              </p>
            </div>
            <a className="site-button site-button-primary" href="/">
              Entrar no painel
            </a>
          </div>
        </section>
          </>
        )}
      </main>

      <footer className="site-wrap site-foot">
        <div className="site-brand">
          <img src="/logo.png" alt="" width="42" height="42" />
          <img src="/wordmark.png" alt="PDV-Pedimais" />
        </div>
        <p>
          PDV-Pedimais · REFFIX · 2026
          <small>
            Todos os direitos reservados à REFFIX. É proibida a cópia, a distribuição ou o uso
            comercial sem autorização da empresa.
          </small>
        </p>
      </footer>
    </>
  );
}
