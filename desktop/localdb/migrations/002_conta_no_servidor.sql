-- Tira do caixa a conta, a senha e a sessão, se a primeira migration chegou a criá-las.
-- O identificador de quem operou o caixa continua, porque ele veio do servidor.

CREATE TABLE IF NOT EXISTS caixasessoes_nova (
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

INSERT INTO caixasessoes_nova (
    id, companyid, openedat, closedat, openingamount, closingamount,
    operatorid, operatorname, closedbyid, closedbyname, note
)
SELECT
    id, companyid, openedat, closedat, openingamount, closingamount,
    operatorid, operatorname, closedbyid, closedbyname, note
FROM caixasessoes;

DROP TABLE caixasessoes;
ALTER TABLE caixasessoes_nova RENAME TO caixasessoes;
CREATE INDEX IF NOT EXISTS ix_caixasessoes_closedat ON caixasessoes (closedat);

DROP TABLE IF EXISTS passwordresettokens;
DROP TABLE IF EXISTS sessoes;
DROP TABLE IF EXISTS usuarios;
