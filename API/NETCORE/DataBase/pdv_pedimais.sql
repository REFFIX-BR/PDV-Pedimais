-- Schema do PDV-Pedimais para PostgreSQL.
-- Banco: pdv_pedimais. Sem dados de exemplo.

CREATE TABLE IF NOT EXISTS empresas (
    id varchar(40) PRIMARY KEY,
    fantasyname varchar(180) NOT NULL DEFAULT '',
    corporatename varchar(180) NOT NULL DEFAULT '',
    cnpj varchar(30) NOT NULL DEFAULT '',
    stateregistration varchar(60) NOT NULL DEFAULT '',
    website varchar(250) NOT NULL DEFAULT '',
    email varchar(180) NOT NULL DEFAULT '',
    sacphone varchar(30) NOT NULL DEFAULT '',
    phone varchar(30) NOT NULL DEFAULT '',
    mobile varchar(30) NOT NULL DEFAULT '',
    cep varchar(20) NOT NULL DEFAULT '',
    address varchar(180) NOT NULL DEFAULT '',
    number varchar(30) NOT NULL DEFAULT '',
    neighborhood varchar(120) NOT NULL DEFAULT '',
    city varchar(120) NOT NULL DEFAULT '',
    uf varchar(2) NOT NULL DEFAULT '',
    complement varchar(180) NOT NULL DEFAULT '',
    emailsmtpenabled boolean NOT NULL DEFAULT false,
    emailsmtphost varchar(180) NOT NULL DEFAULT 'smtp-mail.outlook.com',
    emailsmtpport integer NOT NULL DEFAULT 587,
    emailsmtpenablessl boolean NOT NULL DEFAULT true,
    emailsmtpuser varchar(180) NOT NULL DEFAULT '',
    emailsmtppassword varchar(500) NOT NULL DEFAULT '',
    emailsmtpfromemail varchar(180) NOT NULL DEFAULT '',
    emailsmtpfromname varchar(180) NOT NULL DEFAULT '',
    emailsmtpreplyto varchar(180) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS usuarios (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL DEFAULT 'empresa-principal',
    cpf varchar(30) NOT NULL,
    name varchar(180) NOT NULL,
    email varchar(180) NOT NULL,
    phone varchar(30) NOT NULL DEFAULT '',
    role varchar(60) NOT NULL DEFAULT 'atendente',
    status varchar(20) NOT NULL DEFAULT 'ativo',
    createdat varchar(30) NOT NULL DEFAULT to_char(timezone('utc', now()), 'YYYY-MM-DD'),
    lastloginat varchar(60) NOT NULL DEFAULT '-',
    passwordhash varchar(300) NOT NULL,
    mustchangepassword boolean NOT NULL DEFAULT true,
    CONSTRAINT uq_usuarios_cpf UNIQUE (cpf),
    CONSTRAINT uq_usuarios_email UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS fornecedores (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL DEFAULT 'empresa-principal',
    companyname varchar(180) NOT NULL DEFAULT '',
    fantasyname varchar(180) NOT NULL DEFAULT '',
    cnpj varchar(30) NOT NULL DEFAULT '',
    cep varchar(20) NOT NULL DEFAULT '',
    city varchar(120) NOT NULL DEFAULT '',
    state varchar(2) NOT NULL DEFAULT '',
    address varchar(180) NOT NULL DEFAULT '',
    neighborhood varchar(120) NOT NULL DEFAULT '',
    streetcomplement varchar(180) NOT NULL DEFAULT '',
    number varchar(30) NOT NULL DEFAULT '',
    referencepoint varchar(180) NOT NULL DEFAULT '',
    telephone varchar(30) NOT NULL DEFAULT '',
    cellphone varchar(30) NOT NULL DEFAULT '',
    email varchar(180) NOT NULL DEFAULT '',
    CONSTRAINT uq_fornecedores_company_cnpj UNIQUE (companyid, cnpj)
);

CREATE TABLE IF NOT EXISTS produtos (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL DEFAULT 'empresa-principal',
    productimageurl varchar(500) NOT NULL DEFAULT '',
    productimagename varchar(180) NOT NULL DEFAULT '',
    productname varchar(180) NOT NULL DEFAULT '',
    productcode varchar(80) NOT NULL,
    productsupplier varchar(180) NOT NULL DEFAULT '',
    supplierid varchar(40) NULL REFERENCES fornecedores (id) ON DELETE SET NULL,
    productdescription varchar(500) NOT NULL DEFAULT '',
    productunit varchar(10) NOT NULL DEFAULT 'un',
    productqnt varchar(30) NOT NULL DEFAULT '0',
    productunitprice varchar(30) NOT NULL DEFAULT '0,00',
    productsaleprice varchar(30) NOT NULL DEFAULT '0,00',
    totalpriceonproduct varchar(30) NOT NULL DEFAULT '0,00',
    CONSTRAINT uq_produtos_company_productcode UNIQUE (companyid, productcode)
);

CREATE TABLE IF NOT EXISTS clientes (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL DEFAULT 'empresa-principal',
    customername varchar(180) NOT NULL DEFAULT '',
    document varchar(30) NOT NULL DEFAULT '',
    birthdate varchar(20) NOT NULL DEFAULT '',
    age varchar(10) NOT NULL DEFAULT '',
    cep varchar(20) NOT NULL DEFAULT '',
    city varchar(120) NOT NULL DEFAULT '',
    state varchar(2) NOT NULL DEFAULT '',
    address varchar(180) NOT NULL DEFAULT '',
    neighborhood varchar(120) NOT NULL DEFAULT '',
    streetcomplement varchar(180) NOT NULL DEFAULT '',
    number varchar(30) NOT NULL DEFAULT '',
    referencepoint varchar(180) NOT NULL DEFAULT '',
    telephone varchar(30) NOT NULL DEFAULT '',
    cellphone varchar(30) NOT NULL DEFAULT '',
    email varchar(180) NOT NULL DEFAULT '',
    CONSTRAINT uq_clientes_company_document UNIQUE (companyid, document)
);

CREATE TABLE IF NOT EXISTS sessoes (
    id varchar(80) PRIMARY KEY,
    userid varchar(40) NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    device varchar(120) NOT NULL DEFAULT '',
    location varchar(150) NOT NULL DEFAULT '',
    ip varchar(64) NOT NULL DEFAULT '',
    lastactive varchar(80) NOT NULL DEFAULT 'Agora mesmo',
    platform varchar(20) NOT NULL DEFAULT 'desktop',
    createdat timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sessoes_userid ON sessoes (userid);

CREATE TABLE IF NOT EXISTS passwordresettokens (
    id varchar(40) PRIMARY KEY,
    userid varchar(40) NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    email varchar(180) NOT NULL,
    cnpj varchar(30) NULL,
    tokenhash varchar(128) NOT NULL,
    createdat timestamptz NOT NULL,
    requestedat timestamptz NOT NULL,
    expiresat timestamptz NOT NULL,
    consumedat timestamptz NULL,
    requestedip varchar(64) NULL,
    requesteduseragent varchar(500) NULL,
    requesteddevice varchar(120) NULL,
    resetip varchar(64) NULL,
    resetuseragent varchar(500) NULL,
    resetdevice varchar(120) NULL,
    updatedat timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_passwordresettokens_userid ON passwordresettokens (userid);
CREATE UNIQUE INDEX IF NOT EXISTS ix_passwordresettokens_tokenhash ON passwordresettokens (tokenhash);
CREATE INDEX IF NOT EXISTS ix_passwordresettokens_expiresat ON passwordresettokens (expiresat);
CREATE INDEX IF NOT EXISTS ix_passwordresettokens_consumedat ON passwordresettokens (consumedat);

CREATE TABLE IF NOT EXISTS caixasessoes (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL DEFAULT 'empresa-principal',
    openedat timestamptz NOT NULL,
    closedat timestamptz NULL,
    openingamount varchar(30) NOT NULL DEFAULT '0,00',
    closingamount varchar(30) NOT NULL DEFAULT '0,00',
    operatorid varchar(40) NOT NULL REFERENCES usuarios (id),
    operatorname varchar(180) NOT NULL DEFAULT '',
    closedbyid varchar(40) NOT NULL DEFAULT '',
    closedbyname varchar(180) NOT NULL DEFAULT '',
    note varchar(500) NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_caixasessoes_closedat ON caixasessoes (closedat);

CREATE TABLE IF NOT EXISTS caixamovimentos (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL,
    sessionid varchar(40) NOT NULL REFERENCES caixasessoes (id) ON DELETE CASCADE,
    movementtype varchar(20) NOT NULL,
    amount varchar(30) NOT NULL,
    reason varchar(180) NOT NULL,
    operatorid varchar(40) NOT NULL,
    operatorname varchar(180) NOT NULL DEFAULT '',
    createdat timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_caixamovimentos_sessionid ON caixamovimentos (sessionid, createdat);

CREATE TABLE IF NOT EXISTS vendas (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL DEFAULT 'empresa-principal',
    salenumber varchar(30) NOT NULL,
    customername varchar(180) NOT NULL DEFAULT 'Consumidor',
    customercpf varchar(30) NOT NULL DEFAULT '-',
    paymenttype varchar(30) NOT NULL DEFAULT '-',
    totalamount varchar(30) NOT NULL DEFAULT '0,00',
    operatorname varchar(180) NOT NULL DEFAULT 'Operador',
    saledate timestamptz NOT NULL DEFAULT now(),
    status varchar(20) NOT NULL DEFAULT 'Concluida',
    refundedamount varchar(30) NOT NULL DEFAULT '0,00',
    clientrequestid varchar(80) NULL,
    CONSTRAINT uq_vendas_company_salenumber UNIQUE (companyid, salenumber)
);

CREATE TABLE IF NOT EXISTS vendaitens (
    id varchar(40) PRIMARY KEY,
    vendaid varchar(40) NOT NULL REFERENCES vendas (id) ON DELETE CASCADE,
    productcode varchar(80) NOT NULL,
    productname varchar(180) NOT NULL,
    quantity numeric(18, 3) NOT NULL,
    unitprice varchar(30) NOT NULL DEFAULT '0,00',
    itemtotal varchar(30) NOT NULL DEFAULT '0,00',
    returnedquantity numeric(18, 3) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ix_vendaitens_vendaid ON vendaitens (vendaid);

CREATE TABLE IF NOT EXISTS modulosmercado (
    id varchar(80) PRIMARY KEY,
    title varchar(180) NOT NULL
);

CREATE TABLE IF NOT EXISTS modulomercadoregistros (
    id varchar(100) PRIMARY KEY,
    companyid varchar(40) NOT NULL DEFAULT 'empresa-principal',
    moduleid varchar(80) NOT NULL REFERENCES modulosmercado (id) ON DELETE CASCADE,
    title varchar(180) NOT NULL,
    description varchar(500) NOT NULL DEFAULT '',
    status varchar(80) NOT NULL DEFAULT '',
    amount varchar(40) NOT NULL DEFAULT '',
    meta text NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_modulomercadoregistros_moduleid ON modulomercadoregistros (moduleid);

CREATE TABLE IF NOT EXISTS devolucoes (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL,
    salenumber varchar(30) NOT NULL,
    kind varchar(20) NOT NULL,
    reason varchar(180) NOT NULL,
    refundamount varchar(30) NOT NULL,
    chargeamount varchar(30) NOT NULL,
    paymenttype varchar(30) NOT NULL,
    operatorid varchar(40) NOT NULL,
    operatorname varchar(180) NOT NULL,
    createdat timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_devolucoes_companyid ON devolucoes (companyid, createdat);

CREATE TABLE IF NOT EXISTS devolucaoitens (
    id varchar(40) PRIMARY KEY,
    devolucaoid varchar(40) NOT NULL REFERENCES devolucoes (id) ON DELETE CASCADE,
    direction varchar(10) NOT NULL,
    productcode varchar(80) NOT NULL,
    productname varchar(180) NOT NULL,
    quantity numeric(18, 3) NOT NULL,
    unitprice varchar(30) NOT NULL,
    itemtotal varchar(30) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_devolucaoitens_devolucaoid ON devolucaoitens (devolucaoid);

ALTER TABLE vendas ADD COLUMN IF NOT EXISTS clientrequestid varchar(80);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_clientrequestid ON vendas (clientrequestid);
ALTER TABLE vendas DROP CONSTRAINT IF EXISTS uq_vendas_salenumber;
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_company_salenumber ON vendas (companyid, salenumber);

CREATE TABLE IF NOT EXISTS notasfiscais (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL,
    vendaid varchar(40) NULL REFERENCES vendas (id) ON DELETE SET NULL,
    salenumber varchar(30) NOT NULL DEFAULT '',
    kind varchar(10) NOT NULL,
    series varchar(10) NOT NULL DEFAULT '',
    number varchar(20) NOT NULL DEFAULT '',
    accesskey varchar(44) NOT NULL DEFAULT '',
    protocol varchar(40) NOT NULL DEFAULT '',
    status varchar(20) NOT NULL DEFAULT 'pendente',
    amount varchar(30) NOT NULL DEFAULT '0,00',
    customerdocument varchar(30) NOT NULL DEFAULT '',
    issuedat timestamptz NULL,
    createdat timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_notasfiscais_company_issued ON notasfiscais (companyid, issuedat);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notasfiscais_accesskey ON notasfiscais (accesskey) WHERE accesskey <> '';

CREATE TABLE IF NOT EXISTS pagamentosintegrados (
    id varchar(40) PRIMARY KEY,
    companyid varchar(40) NOT NULL,
    vendaid varchar(40) NULL REFERENCES vendas (id) ON DELETE SET NULL,
    salenumber varchar(30) NOT NULL DEFAULT '',
    method varchar(20) NOT NULL,
    amount varchar(30) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'pendente',
    brand varchar(40) NOT NULL DEFAULT '',
    acquirer varchar(60) NOT NULL DEFAULT '',
    nsu varchar(40) NOT NULL DEFAULT '',
    authorizationcode varchar(40) NOT NULL DEFAULT '',
    installments integer NOT NULL DEFAULT 1,
    createdat timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pagamentosintegrados_company ON pagamentosintegrados (companyid, createdat);
CREATE INDEX IF NOT EXISTS ix_pagamentosintegrados_venda ON pagamentosintegrados (vendaid);
