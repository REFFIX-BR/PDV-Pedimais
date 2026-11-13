/**
 * Monta a configuração do instalador e aponta a atualização para a URL do update-feed.json.
 */
const feed = require("./update-feed.json");
const pkg = require("./package.json");

const url = String(feed.url || "").trim().replace(/\/+$/, "");

module.exports = {
  ...pkg.build,
  publish: url ? [{ provider: "generic", url }] : null,
};
