/**
 * Grava desktop/dist/version.json depois do instalador.
 * O servidor da REFFIX publica esse arquivo junto com o .exe.
 * O caixa compara o campo version com a versão instalada.
 */
const fs = require("fs");
const path = require("path");
const pkg = require("./package.json");

const dist = path.join(__dirname, "dist");
const installer = fs
  .readdirSync(dist)
  .find((name) => name.toLowerCase().endsWith(".exe") && !name.toLowerCase().endsWith(".exe.blockmap"));

if (!installer) {
  console.error("Instalador não encontrado em desktop/dist.");
  process.exit(1);
}

const manifest = {
  version: pkg.version,
  file: installer,
};

fs.writeFileSync(path.join(dist, "version.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`version.json ${manifest.version} ${manifest.file}`);
