/**
 * Arquivo: src/domain/tour/tourSteps.ts
 * Objetivo: explica, em cada aba, o que aquela tela faz de verdade.
 * Entradas esperadas: a página ativa escolhe só os passos dela.
 */
import type { PageKey } from "@/components/AppSidebar/AppSidebar";

export type TourPageKey = PageKey;

export type TourStep = {
  id: string;
  title: string;
  description: string;
  selectors: string[];
};

function pageSelector(page: TourPageKey, selector: string) {
  return `main[data-active-page="${page}"] ${selector}`;
}

function steps(page: TourPageKey, items: Array<[string, string, string, string]>): TourStep[] {
  return items.map(([id, title, description, selector]) => ({
    id,
    title,
    description,
    selectors: [pageSelector(page, selector)],
  }));
}

export const TOUR_STEPS_BY_PAGE: Partial<Record<TourPageKey, TourStep[]>> = {
  home: steps("home", [
    [
      "home-indicadores",
      "Resumo do dia",
      "Aqui está o faturamento, as vendas e o estoque crítico da padaria. Estoque crítico é produto com 5 ou menos.",
      `[data-tour="home-indicadores"]`,
    ],
    [
      "home-atalhos",
      "Atalhos",
      "Cada cartão abre uma tela. Iniciar Vendas só entra se o seu caixa estiver aberto.",
      `[data-tour="home-atalhos"]`,
    ],
  ]),

  "cadastro-cliente": steps("cadastro-cliente", [
    [
      "cliente-novo",
      "Cliente",
      "Cadastre nome e documento de quem compra fiado ou pede o nome no cupom. O botão do topo abre o formulário.",
      `[data-tour="page-header-action"]`,
    ],
    [
      "cliente-lista",
      "Lista",
      "Pesquise pelo nome e use as ações da linha para editar ou apagar. Isso ainda não escolhe o cliente dentro da venda.",
      "table",
    ],
  ]),

  "cadastro-fornecedor": steps("cadastro-fornecedor", [
    [
      "fornecedor-novo",
      "Fornecedor",
      "O fornecedor daqui é o mesmo que aparece no produto e no pedido de compra. Use o nome fantasia que a loja reconhece.",
      `[data-tour="page-header-action"]`,
    ],
    [
      "fornecedor-lista",
      "Lista",
      "Pesquise e edite o cadastro. Sem fornecedor, o produto novo e a compra não salvam.",
      "table",
    ],
  ]),

  "cadastro-produto": steps("cadastro-produto", [
    [
      "produto-novo",
      "Produto",
      "Unidade vende por número inteiro. Quilo fica em quilos: no caixa, 500 é 500 g e 1000 é 1 kg. Litro fica em litros e cada caixa vendida desconta 1 L.",
      `[data-tour="page-header-action"]`,
    ],
    [
      "produto-lista",
      "Estoque do cadastro",
      "A lista mostra a quantidade atual. O selo de estoque baixo aparece quando o produto está com 5 ou menos.",
      "table",
    ],
  ]),

  "historico-vendas": steps("historico-vendas", [
    [
      "historico-busca",
      "Vendas já pagas",
      "Aqui ficam as vendas concluídas, com operador, pagamento e valor. Cancelar o cupom antes de pagar não entra nesta lista.",
      `[data-tour="page-header"]`,
    ],
    [
      "historico-lista",
      "Cupom",
      "Abra a venda para ver os itens e reimprimir o cupom. Esta tela não devolve o produto para o estoque.",
      "table",
    ],
  ]),

  relatorios: steps("relatorios", [
    [
      "relatorios-catalogo",
      "Relatórios",
      "Escolha o relatório, o período e gere. Os números saem das vendas e do estoque que já estão no sistema.",
      `[data-tour="page-header"]`,
    ],
    [
      "relatorios-catalogo-lista",
      "Qual relatório",
      "Abra um cartão, escolha o período e gere. O número só entra depois que a venda ou o estoque já aconteceu.",
      "h2",
    ],
  ]),

  vendas: steps("vendas", [
    [
      "venda-produtos",
      "Produto e quantidade",
      "Pesquise o nome ou o código e informe a quantidade. Em quilo, 500 é 500 g e 1000 é 1 kg. Em litro, cada unidade desconta 1 L do estoque.",
      `[data-tour="venda-produtos"]`,
    ],
    [
      "venda-funcoes",
      "Funções do cupom",
      "F2 dá desconto no último item, F3 dá acréscimo, F5 cancela o item, F8 cancela o cupom e F12 abre o pagamento. Desconto e acréscimo aceitam valor, como 2,00, ou percentual, como 10%.",
      `[data-tour="venda-funcoes"]`,
    ],
    [
      "venda-pagamento",
      "Pagamento",
      "O pagamento só libera com o seu caixa aberto. Dinheiro, PIX e cartão fecham a venda e descontam o estoque. O dinheiro entra só na sua gaveta.",
      `[data-tour="venda-pagamento"]`,
    ],
  ]),

  estoque: steps("estoque", [
    [
      "estoque-resumo",
      "Estoque real",
      "Estes números são a quantidade que o caixa desconta. Estoque baixo é 5 ou menos. Sem estoque ainda não é permitido: a quantidade precisa continuar maior que zero.",
      `[data-tour="estoque-resumo"]`,
    ],
    [
      "estoque-filtros",
      "Achar o produto",
      "Filtre por nome, código, estoque baixo ou sem estoque. O botão Ajustar da linha abre direto aquele produto.",
      `[data-tour="estoque-filtros"]`,
    ],
    [
      "estoque-lista",
      "Ajustar e cadastrar",
      "Novo produto entra no cadastro e já pode ser vendido. Em Ajustar estoque, digite o nome: Definir quantidade troca o número, Entrada soma e Saída tira. No inventário, conte na loja e use Definir quantidade.",
      `[data-tour="estoque-lista"]`,
    ],
  ]),

  compras: steps("compras", [
    [
      "compras-resumo",
      "Compra e reposição",
      "Para repor mostra produtos com 5 ou menos. Pedido em aberto ainda não entrou no estoque. Recebido já somou a quantidade.",
      `[data-tour="compras-resumo"]`,
    ],
    [
      "compras-repor",
      "Pedir o que está acabando",
      "Pedir abre o fornecedor daquele produto. Preencha só a quantidade que vai comprar.",
      `[data-tour="compras-repor"]`,
    ],
    [
      "compras-pedidos",
      "Receber a mercadoria",
      "Salvar pedido guarda a compra sem mexer no estoque. Receber, ou Receber agora, soma a quantidade no produto. Cancelar um pedido em aberto não mexe no estoque.",
      `[data-tour="compras-pedidos"]`,
    ],
  ]),

  caixa: steps("caixa", [
    [
      "caixa-status",
      "O seu caixa",
      "Este caixa é só de quem está logado. Outro operador pode ter o dele aberto ao mesmo tempo, e o dinheiro não mistura.",
      `[data-tour="caixa-status"]`,
    ],
    [
      "caixa-operacao",
      "Abrir ou fechar",
      "Abra com o dinheiro que entrou na gaveta. No fechamento, o valor esperado é abertura mais suprimento mais vendas em dinheiro, menos sangria. PIX e cartão aparecem nas vendas e não entram nesse dinheiro.",
      `[data-tour="caixa-operacao"]`,
    ],
    [
      "caixa-sangria",
      "Sangria e suprimento",
      "Suprimento coloca troco na gaveta. Sangria tira dinheiro, por exemplo um recolhimento. Os dois valem só para o seu caixa.",
      `[data-tour="caixa-sangria"]`,
    ],
    [
      "caixa-historico",
      "Histórico",
      "O administrador vê a abertura de todos. O atendente vê só a sua. O dinheiro esperado do alto continua sendo o da gaveta de quem está logado.",
      `[data-tour="caixa-historico"]`,
    ],
  ]),

  sangria: steps("sangria", [
    [
      "sangria-status",
      "Sua gaveta",
      "A sangria só sai se o seu caixa estiver aberto. Ela não cancela venda e não é troco de cliente.",
      `[data-tour="caixa-status"]`,
    ],
    [
      "sangria-lancamento",
      "Retirar dinheiro",
      "Informe o valor e o motivo. O limite é o dinheiro esperado na sua gaveta. A retirada não aparece no caixa de outro operador.",
      `[data-tour="caixa-sangria"]`,
    ],
  ]),

  suprimento: steps("suprimento", [
    [
      "suprimento-status",
      "Sua gaveta",
      "O suprimento entra no seu caixa aberto. Ele aumenta o troco e não conta como venda.",
      `[data-tour="caixa-status"]`,
    ],
    [
      "suprimento-lancamento",
      "Colocar troco",
      "Informe quanto entrou e o motivo, por exemplo reforço de moeda. O valor soma no dinheiro esperado da sua gaveta.",
      `[data-tour="caixa-suprimento"]`,
    ],
  ]),

  "caixas-abertos": steps("caixas-abertos", [
    [
      "caixas-resumo",
      "Todos os caixas",
      "Só o administrador vê esta aba. O total junta a venda, o lucro e a saída de quem está com caixa aberto. O administrador também abre o próprio caixa quando for vender.",
      `[data-tour="caixas-resumo"]`,
    ],
    [
      "caixas-gaveta",
      "Cada gaveta",
      "Em cada operador: vendas por dinheiro, PIX, débito e crédito; lucro, que é a venda menos o custo cadastrado; saída, que é a sangria; e o dinheiro que deve estar na gaveta.",
      `[data-tour="caixas-lista"]`,
    ],
  ]),

  devolucoes: steps("devolucoes", [
    [
      "devolucoes-nova",
      "Devolver uma venda",
      "Escolha a venda paga e a quantidade que volta ao estoque. A venda fica estornada ou parcial. Se o pagamento foi em dinheiro, o valor sai da gaveta de quem está logado.",
      `[data-tour="page-header-action"]`,
    ],
    [
      "devolucoes-lista",
      "Troca",
      "Na mesma tela dá para o cliente levar outro produto. Se o novo for mais caro, cobra a diferença. Se for mais barato, devolve a diferença.",
      `[data-tour="devolucoes-lista"]`,
    ],
  ]),

  "crm-fidelidade": steps("crm-fidelidade", [
    [
      "crm-aviso",
      "CRM e fidelidade",
      "Esta aba ainda não dá ponto nem cashback. O que salvar aqui é só um registro, separado da venda.",
      `[data-tour="page-header"]`,
    ],
  ]),

  omnichannel: steps("omnichannel", [
    [
      "omni-aviso",
      "Omnichannel",
      "Esta aba ainda não liga delivery, site ou marketplace. O caixa da loja continua sendo o Iniciar Vendas.",
      `[data-tour="page-header"]`,
    ],
  ]),

  fiscal: steps("fiscal", [
    [
      "fiscal-aviso",
      "Nota fiscal",
      "A NFC-e fica para depois. Esta tela não envia nada para a SEFAZ e o cupom da venda continua sendo o comprovante do caixa.",
      `[data-tour="page-header"]`,
    ],
  ]),

  pagamentos: steps("pagamentos", [
    [
      "pagamentos-aviso",
      "Maquininha",
      "A maquininha ainda não está ligada. No caixa, o pagamento é escolhido na hora de fechar a venda: dinheiro, PIX, débito ou crédito.",
      `[data-tour="page-header"]`,
    ],
  ]),

  "conta-de-usuario": steps("conta-de-usuario", [
    [
      "usuarios-novo",
      "Quem opera",
      "Crie o atendente ou outro administrador. O atendente vende e mexe no próprio caixa. Ele não vê estoque, compras nem os caixas dos outros.",
      `[data-tour="page-header-action"]`,
    ],
    [
      "usuarios-lista",
      "Acessos",
      "Na lista dá para editar, inativar e redefinir a senha. Cada pessoa abre o próprio caixa com o login dela.",
      "table",
    ],
  ]),

  "minha-empresa": steps("minha-empresa", [
    [
      "empresa-dados",
      "Padaria",
      "Nome, CNPJ e endereço saem no cupom. Confira o nome fantasia antes de imprimir.",
      `[data-tour="page-header"]`,
    ],
    [
      "empresa-email",
      "E-mail",
      "O SMTP daqui é o que envia a recuperação de senha. Sem ele, o esqueci minha senha não sai.",
      `[data-tour="empresa-email"]`,
    ],
  ]),

  configuracoes: steps("configuracoes", [
    [
      "config-tela",
      "Preferências",
      "Aqui ficam o tema e a prévia de impressão do cupom. A prévia mostra o recibo antes de imprimir.",
      "h2",
    ],
  ]),

  "editar-perfil": steps("editar-perfil", [
    [
      "perfil-dados",
      "Seu usuário",
      "Nome, e-mail e senha são da pessoa logada. O nome informado aqui é o que sai como operador no cupom e no caixa.",
      "section",
    ],
  ]),

  "sobre-pdv": steps("sobre-pdv", [
    [
      "sobre-projeto",
      "Sobre o PDV",
      "O PDV-Pedimais foi criado em 2026 pela REFFIX. Todos os direitos desta versão são da empresa.",
      `[data-tour="page-header"]`,
    ],
  ]),
};
