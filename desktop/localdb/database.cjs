/**
 * Abre o SQLite do caixa, aplica as migrations e guarda estoque, vendas e a fila.
 * O arquivo fica na pasta do usuário. As migrations vão dentro do instalador.
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

let db = null;

function open(app) {
  const folder = app.getPath("userData");
  fs.mkdirSync(folder, { recursive: true });
  openAt(path.join(folder, "pdv-pedimais.sqlite"));
  return dbPath();
}

function openAt(file) {
  if (db) db.close();
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL;");
  migrate();
  db.exec("PRAGMA foreign_keys = ON;");
}

function dbPath() {
  const row = db.prepare("PRAGMA database_list").get();
  return row?.file || "";
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdv_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      appliedat TEXT NOT NULL
    );
  `);
  const dir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const applied = new Set(db.prepare("SELECT name FROM pdv_migrations").all().map((row) => row.name));
  for (const name of files) {
    if (applied.has(name)) continue;
    const sql = fs.readFileSync(path.join(dir, name), "utf8");
    db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO pdv_migrations (name, appliedat) VALUES (?, ?)").run(name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

function requireDb() {
  if (!db) throw new Error("O banco local do caixa ainda não abriu.");
  return db;
}

function text(value, fallback = "") {
  return value === undefined || value === null ? fallback : String(value);
}

function parseQty(value) {
  const raw = text(value, "0").trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQty(value, unit) {
  const safe = Math.max(0, value);
  if (unit === "kg") {
    return safe.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  }
  return String(Math.round(safe));
}

function hasPending() {
  const row = requireDb().prepare("SELECT COUNT(*) AS total FROM pdv_fila").get();
  return Number(row?.total || 0) > 0;
}

function saveProducts(companyId, rows, replace) {
  const database = requireDb();
  const company = text(companyId);
  if (!company || !Array.isArray(rows)) return 0;
  const pending = hasPending();
  const upsert = database.prepare(`
    INSERT INTO produtos (
      id, companyid, productimageurl, productimagename, productname, productcode,
      productsupplier, productdescription, productunit, productqnt, productunitprice,
      productsaleprice, totalpriceonproduct
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      companyid = excluded.companyid,
      productimageurl = excluded.productimageurl,
      productimagename = excluded.productimagename,
      productname = excluded.productname,
      productcode = excluded.productcode,
      productsupplier = excluded.productsupplier,
      productdescription = excluded.productdescription,
      productunit = excluded.productunit,
      productqnt = CASE WHEN ? = 1 THEN produtos.productqnt ELSE excluded.productqnt END,
      productunitprice = excluded.productunitprice,
      productsaleprice = excluded.productsaleprice,
      totalpriceonproduct = excluded.totalpriceonproduct
  `);
  const ids = [];
  database.exec("BEGIN");
  try {
    for (const row of rows) {
      const id = text(row.id);
      const code = text(row.productCode);
      if (!id || !code) continue;
      ids.push(id);
      upsert.run(
        id,
        company,
        text(row.productImageUrl),
        text(row.productImageName),
        text(row.productName),
        code,
        text(row.productSupplier),
        text(row.productDescription),
        text(row.productUnit, "un"),
        text(row.productQnt, "0"),
        text(row.productUnitPrice, "0,00"),
        text(row.productSalePrice, "0,00"),
        text(row.totalPriceOnProduct, "0,00"),
        pending ? 1 : 0,
      );
    }
    if (replace && !pending && ids.length > 0) {
      const marks = ids.map(() => "?").join(", ");
      database.prepare(`DELETE FROM produtos WHERE companyid = ? AND id NOT IN (${marks})`).run(company, ...ids);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return ids.length;
}

function listProducts(companyId) {
  const rows = requireDb().prepare(
    "SELECT * FROM produtos WHERE companyid = ? ORDER BY productname",
  ).all(text(companyId));
  return rows.map((row) => ({
    id: row.id,
    productImageUrl: row.productimageurl,
    productImageName: row.productimagename,
    productName: row.productname,
    productCode: row.productcode,
    productSupplier: row.productsupplier,
    productDescription: row.productdescription,
    productUnit: row.productunit,
    productQnt: row.productqnt,
    productUnitPrice: row.productunitprice,
    productSalePrice: row.productsaleprice,
    totalPriceOnProduct: row.totalpriceonproduct,
  }));
}

function adjustStock(companyId, lines) {
  const database = requireDb();
  const company = text(companyId);
  const select = database.prepare(
    "SELECT productunit, productqnt FROM produtos WHERE companyid = ? AND productcode = ?",
  );
  const update = database.prepare(
    "UPDATE produtos SET productqnt = ? WHERE companyid = ? AND productcode = ?",
  );
  database.exec("BEGIN");
  try {
    for (const line of lines || []) {
      const code = text(line.code);
      const quantity = Number(line.quantity);
      if (!code || !Number.isFinite(quantity) || quantity <= 0) continue;
      const current = select.get(company, code);
      if (!current) continue;
      const next = parseQty(current.productqnt) - quantity;
      update.run(formatQty(next, current.productunit), company, code);
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function saveSale(sale) {
  const database = requireDb();
  const company = text(sale.companyId);
  const saleNumber = text(sale.saleNumber);
  if (!company || !saleNumber) return;
  const id = `local-${saleNumber}`;
  database.exec("BEGIN");
  try {
    database.prepare(`
      INSERT INTO vendas (
        id, companyid, salenumber, customername, customercpf, paymenttype,
        totalamount, operatorname, saledate, status, refundedamount, clientrequestid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Concluida', '0,00', ?)
      ON CONFLICT(id) DO UPDATE SET
        totalamount = excluded.totalamount,
        paymenttype = excluded.paymenttype,
        saledate = excluded.saledate
    `).run(
      id,
      company,
      saleNumber,
      text(sale.customerName, "Consumidor"),
      text(sale.customerCpf, "-"),
      text(sale.paymentType, "-"),
      text(sale.totalAmount, "0,00"),
      text(sale.operatorName, "Operador"),
      text(sale.saleDate, new Date().toISOString()),
      text(sale.clientRequestId) || null,
    );
    database.prepare("DELETE FROM vendaitens WHERE vendaid = ?").run(id);
    const insertItem = database.prepare(`
      INSERT INTO vendaitens (id, vendaid, productcode, productname, quantity, unitprice, itemtotal, returnedquantity)
      VALUES (?, ?, ?, ?, ?, '0,00', '0,00', 0)
    `);
    (sale.items || []).forEach((item, index) => {
      insertItem.run(
        `${id}-item-${index + 1}`,
        id,
        text(item.code),
        text(item.name),
        Number(item.quantity) || 0,
      );
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function enqueue(item) {
  const id = text(item.id) || `${Date.now()}`;
  requireDb().prepare(
    "INSERT OR IGNORE INTO pdv_fila (id, url, method, body, createdat) VALUES (?, ?, ?, ?, ?)",
  ).run(id, text(item.url), text(item.method, "POST"), item.body ? String(item.body) : null, text(item.createdAt, new Date().toISOString()));
  return id;
}

function pending() {
  return requireDb().prepare(
    "SELECT id, url, method, body, createdat AS createdAt FROM pdv_fila ORDER BY createdat",
  ).all();
}

function markSent(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  const marks = ids.map(() => "?").join(", ");
  requireDb().prepare(`DELETE FROM pdv_fila WHERE id IN (${marks})`).run(...ids.map((id) => text(id)));
}

function saveState(key, value) {
  requireDb().prepare(`
    INSERT INTO pdv_estado (chave, valor, updatedat) VALUES (?, ?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor, updatedat = excluded.updatedat
  `).run(text(key), JSON.stringify(value ?? null), new Date().toISOString());
}

function readState(key) {
  const row = requireDb().prepare("SELECT valor FROM pdv_estado WHERE chave = ?").get(text(key));
  if (!row) return null;
  return JSON.parse(row.valor);
}

function handle(payload) {
  const op = payload?.op;
  if (op === "ready") return { ok: Boolean(db), path: db ? dbPath() : "" };
  if (op === "saveProducts") return saveProducts(payload.companyId, payload.rows, Boolean(payload.replace));
  if (op === "listProducts") return listProducts(payload.companyId);
  if (op === "adjustStock") {
    adjustStock(payload.companyId, payload.lines);
    return true;
  }
  if (op === "saveSale") {
    saveSale(payload.sale || {});
    return true;
  }
  if (op === "enqueue") return enqueue(payload.item || {});
  if (op === "pending") return pending();
  if (op === "markSent") {
    markSent(payload.ids);
    return true;
  }
  if (op === "saveState") {
    saveState(payload.key, payload.value);
    return true;
  }
  if (op === "readState") return readState(payload.key);
  throw new Error("Operação local desconhecida.");
}

module.exports = { open, openAt, handle };
