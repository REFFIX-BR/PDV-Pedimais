-- Banco local do caixa. Estoque, vendas e caixa repetem o Postgres do servidor.
-- A conta do usuário não fica aqui: login, senha e sessão só existem no servidor.
-- pdv_migrations, pdv_fila e pdv_estado ficam só nesta máquina: a fila sobe quando a internet volta.

CREATE TABLE IF NOT EXISTS pdv_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    appliedat TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pdv_fila (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    method TEXT NOT NULL,
    body TEXT,
    createdat TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pdv_estado (
    chave TEXT PRIMARY KEY,
    valor TEXT NOT NULL,
    updatedat TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS empresas (
    id TEXT PRIMARY KEY,
    fantasyname TEXT NOT NULL DEFAULT '',
    corporatename TEXT NOT NULL DEFAULT '',
    cnpj TEXT NOT NULL DEFAULT '',
    stateregistration TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    sacphone TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    mobile TEXT NOT NULL DEFAULT '',
    cep TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    uf TEXT NOT NULL DEFAULT '',
    complement TEXT NOT NULL DEFAULT '',
    emailsmtpenabled INTEGER NOT NULL DEFAULT 0,
    emailsmtphost TEXT NOT NULL DEFAULT 'smtp-mail.outlook.com',
    emailsmtpport INTEGER NOT NULL DEFAULT 587,
    emailsmtpenablessl INTEGER NOT NULL DEFAULT 1,
    emailsmtpuser TEXT NOT NULL DEFAULT '',
    emailsmtppassword TEXT NOT NULL DEFAULT '',
    emailsmtpfromemail TEXT NOT NULL DEFAULT '',
    emailsmtpfromname TEXT NOT NULL DEFAULT '',
    emailsmtpreplyto TEXT NOT NULL DEFAULT '',
    planexpiresat TEXT NULL
);

CREATE TABLE IF NOT EXISTS fornecedores (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL DEFAULT 'empresa-principal',
    companyname TEXT NOT NULL DEFAULT '',
    fantasyname TEXT NOT NULL DEFAULT '',
    cnpj TEXT NOT NULL DEFAULT '',
    cep TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    streetcomplement TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL DEFAULT '',
    referencepoint TEXT NOT NULL DEFAULT '',
    telephone TEXT NOT NULL DEFAULT '',
    cellphone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    CONSTRAINT uq_fornecedores_company_cnpj UNIQUE (companyid, cnpj)
);

CREATE TABLE IF NOT EXISTS produtos (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL DEFAULT 'empresa-principal',
    productimageurl TEXT NOT NULL DEFAULT '',
    productimagename TEXT NOT NULL DEFAULT '',
    productname TEXT NOT NULL DEFAULT '',
    productcode TEXT NOT NULL,
    productsupplier TEXT NOT NULL DEFAULT '',
    supplierid TEXT NULL REFERENCES fornecedores (id) ON DELETE SET NULL,
    productdescription TEXT NOT NULL DEFAULT '',
    productunit TEXT NOT NULL DEFAULT 'un',
    productqnt TEXT NOT NULL DEFAULT '0',
    productunitprice TEXT NOT NULL DEFAULT '0,00',
    productsaleprice TEXT NOT NULL DEFAULT '0,00',
    totalpriceonproduct TEXT NOT NULL DEFAULT '0,00',
    CONSTRAINT uq_produtos_company_productcode UNIQUE (companyid, productcode)
);

CREATE INDEX IF NOT EXISTS ix_produtos_company ON produtos (companyid);

CREATE TABLE IF NOT EXISTS clientes (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL DEFAULT 'empresa-principal',
    customername TEXT NOT NULL DEFAULT '',
    document TEXT NOT NULL DEFAULT '',
    birthdate TEXT NOT NULL DEFAULT '',
    age TEXT NOT NULL DEFAULT '',
    cep TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    streetcomplement TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL DEFAULT '',
    referencepoint TEXT NOT NULL DEFAULT '',
    telephone TEXT NOT NULL DEFAULT '',
    cellphone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    CONSTRAINT uq_clientes_company_document UNIQUE (companyid, document)
);

CREATE TABLE IF NOT EXISTS caixasessoes (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL DEFAULT 'empresa-principal',
    openedat TEXT NOT NULL,
    closedat TEXT NULL,
    openingamount TEXT NOT NULL DEFAULT '0,00',
    closingamount TEXT NOT NULL DEFAULT '0,00',
    operatorid TEXT NOT NULL,
    operatorname TEXT NOT NULL DEFAULT '',
    closedbyid TEXT NOT NULL DEFAULT '',
    closedbyname TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_caixasessoes_closedat ON caixasessoes (closedat);

CREATE TABLE IF NOT EXISTS caixamovimentos (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL,
    sessionid TEXT NOT NULL REFERENCES caixasessoes (id) ON DELETE CASCADE,
    movementtype TEXT NOT NULL,
    amount TEXT NOT NULL,
    reason TEXT NOT NULL,
    operatorid TEXT NOT NULL,
    operatorname TEXT NOT NULL DEFAULT '',
    createdat TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_caixamovimentos_sessionid ON caixamovimentos (sessionid, createdat);

CREATE TABLE IF NOT EXISTS vendas (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL DEFAULT 'empresa-principal',
    salenumber TEXT NOT NULL,
    customername TEXT NOT NULL DEFAULT 'Consumidor',
    customercpf TEXT NOT NULL DEFAULT '-',
    paymenttype TEXT NOT NULL DEFAULT '-',
    totalamount TEXT NOT NULL DEFAULT '0,00',
    operatorname TEXT NOT NULL DEFAULT 'Operador',
    saledate TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Concluida',
    refundedamount TEXT NOT NULL DEFAULT '0,00',
    clientrequestid TEXT NULL,
    CONSTRAINT uq_vendas_company_salenumber UNIQUE (companyid, salenumber)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_clientrequestid ON vendas (clientrequestid);

CREATE TABLE IF NOT EXISTS vendaitens (
    id TEXT PRIMARY KEY,
    vendaid TEXT NOT NULL REFERENCES vendas (id) ON DELETE CASCADE,
    productcode TEXT NOT NULL,
    productname TEXT NOT NULL,
    quantity REAL NOT NULL,
    unitprice TEXT NOT NULL DEFAULT '0,00',
    itemtotal TEXT NOT NULL DEFAULT '0,00',
    returnedquantity REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_vendaitens_vendaid ON vendaitens (vendaid);

CREATE TABLE IF NOT EXISTS modulosmercado (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS modulomercadoregistros (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL DEFAULT 'empresa-principal',
    moduleid TEXT NOT NULL REFERENCES modulosmercado (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    amount TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_modulomercadoregistros_moduleid ON modulomercadoregistros (moduleid);

CREATE TABLE IF NOT EXISTS devolucoes (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL,
    salenumber TEXT NOT NULL,
    kind TEXT NOT NULL,
    reason TEXT NOT NULL,
    refundamount TEXT NOT NULL,
    chargeamount TEXT NOT NULL,
    paymenttype TEXT NOT NULL,
    operatorid TEXT NOT NULL,
    operatorname TEXT NOT NULL,
    createdat TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_devolucoes_companyid ON devolucoes (companyid, createdat);

CREATE TABLE IF NOT EXISTS devolucaoitens (
    id TEXT PRIMARY KEY,
    devolucaoid TEXT NOT NULL REFERENCES devolucoes (id) ON DELETE CASCADE,
    direction TEXT NOT NULL,
    productcode TEXT NOT NULL,
    productname TEXT NOT NULL,
    quantity REAL NOT NULL,
    unitprice TEXT NOT NULL,
    itemtotal TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_devolucaoitens_devolucaoid ON devolucaoitens (devolucaoid);

CREATE TABLE IF NOT EXISTS notasfiscais (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL,
    vendaid TEXT NULL REFERENCES vendas (id) ON DELETE SET NULL,
    salenumber TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    series TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL DEFAULT '',
    accesskey TEXT NOT NULL DEFAULT '',
    protocol TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendente',
    amount TEXT NOT NULL DEFAULT '0,00',
    customerdocument TEXT NOT NULL DEFAULT '',
    issuedat TEXT NULL,
    createdat TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_notasfiscais_company_issued ON notasfiscais (companyid, issuedat);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notasfiscais_accesskey ON notasfiscais (accesskey) WHERE accesskey <> '';

CREATE TABLE IF NOT EXISTS pagamentosintegrados (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL,
    vendaid TEXT NULL REFERENCES vendas (id) ON DELETE SET NULL,
    salenumber TEXT NOT NULL DEFAULT '',
    method TEXT NOT NULL,
    amount TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    brand TEXT NOT NULL DEFAULT '',
    acquirer TEXT NOT NULL DEFAULT '',
    nsu TEXT NOT NULL DEFAULT '',
    authorizationcode TEXT NOT NULL DEFAULT '',
    installments INTEGER NOT NULL DEFAULT 1,
    createdat TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_pagamentosintegrados_company ON pagamentosintegrados (companyid, createdat);
CREATE INDEX IF NOT EXISTS ix_pagamentosintegrados_venda ON pagamentosintegrados (vendaid);

CREATE TABLE IF NOT EXISTS cupons (
    id TEXT PRIMARY KEY,
    companyid TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    amount TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    createdat TEXT NOT NULL DEFAULT ''
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cupons_company_code ON cupons (companyid, code);
