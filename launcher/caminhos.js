// Pasta dos dados do jogo: %APPDATA%\.tessera (versions, libraries, assets, runtime, instances...).
// JG_RAIZ troca a pasta (testes). Sem dependências, para qualquer módulo poder usar.
//
// Migração do nome antigo (JG Client): se só existir %APPDATA%\.jgclient, ela é renomeada para
// .tessera (move instantâneo, sem copiar). Se não der (algum arquivo em uso), continua usando a
// pasta antiga para nada se perder — a migração tenta de novo na próxima abertura.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function resolverRaiz() {
  if (process.env.JG_RAIZ) return process.env.JG_RAIZ;
  const nova = path.join(app.getPath('appData'), '.tessera');
  const antiga = path.join(app.getPath('appData'), '.jgclient');
  if (fs.existsSync(nova) || !fs.existsSync(antiga)) return nova;
  try {
    fs.renameSync(antiga, nova);
    return nova;
  } catch {
    return antiga;
  }
}

const RAIZ = resolverRaiz();

module.exports = { RAIZ };
