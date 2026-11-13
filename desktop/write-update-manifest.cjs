/**
 * Grava desktop/dist/version.json depois dos instaladores.
 * O servidor da REFFIX publica esse arquivo junto com os .exe.
 * O caixa compara o campo version com a versão instalada e baixa o arquivo da própria arquitetura.
 */
const fs = require("fs");
const path = require("path");
const pkg = require("./package.json");

const dist = path.join(__dirname, "dist");
const exes = fs
  .readdirSync(dist)
  .filter((name) => name.toLowerCase().endsWith(".exe") && !name.toLowerCase().endsWith(".exe.blockmap"));

function findArch(arch) {
  const expected = `PDV-Pedimais-${pkg.version}-${arch}.exe`.toLowerCase();
  return exes.find((name) => name.toLowerCase() === expected);
}

const combined = exes.find((name) => name === `PDV-Pedimais-${pkg.version}.exe`);
if (combined) {
  fs.rmSync(path.join(dist, combined), { force: true });
  fs.rmSync(path.join(dist, `${combined}.blockmap`), { force: true });
}

const x64 = findArch("x64");
const ia32 = findArch("ia32");
if (!x64 || !ia32) {
  console.error("Faltou o instalador de 64 bits ou o de 32 bits em desktop/dist.");
  process.exit(1);
}

const manifest = {
  version: pkg.version,
  file: x64,
  files: { x64, ia32 },
};

fs.writeFileSync(path.join(dist, "version.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`version.json ${manifest.version} ${x64} ${ia32}`);
