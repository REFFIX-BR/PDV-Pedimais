/**
 * Monta a configuração do instalador e aponta a atualização para a URL do update-feed.json.
 */
const feed = require("./update-feed.json");
const pkg = require("./package.json");

const url = String(feed.url || "").trim().replace(/\/+$/, "");
const owner = String(feed.owner || "").trim();
const repo = String(feed.repo || "").trim();

module.exports = {
  ...pkg.build,
  publish: url
    ? [{ provider: "generic", url }]
    : owner && repo
      ? [{ provider: "github", owner, repo }]
      : null,
};
