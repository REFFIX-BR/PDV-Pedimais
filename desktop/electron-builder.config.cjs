/**
 * Monta a configuração do instalador e aponta a atualização para a URL do update-feed.json.
 */
const feed = require("./update-feed.json");
const pkg = require("./package.json");

const url = String(feed.url || "").trim().replace(/\/+$/, "");

module.exports = {
  ...pkg.build,
  compression: "maximum",
  electronLanguages: ["pt-BR", "en-US"],
  npmRebuild: false,
  extraResources: [{ from: "../FRONTEND/dist", to: "frontend" }],
  win: {
    ...pkg.build.win,
    target: [
      { target: "nsis", arch: ["x64"] },
      { target: "nsis", arch: ["ia32"] },
    ],
  },
  nsis: {
    ...pkg.build.nsis,
    artifactName: "PDV-Pedimais-${version}-${arch}.${ext}",
  },
  publish: url ? [{ provider: "generic", url }] : null,
};
