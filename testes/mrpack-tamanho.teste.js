// V3 (AUDITORIA.md): um .mrpack não pode forçar alocações enormes declarando tamanhos falsos.
// (o adm-zip 0.5.x reserva a memória que o próprio zip declara para cada arquivo)
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const { zipCru } = require('./util/zip');
const modrinth = require('../launcher/modrinth');
const instancias = require('../launcher/instancias');
const { RAIZ } = require('../launcher/jogo');
const { prepararVersao } = require('./util/instancia');

prepararVersao();
const QUATRO_GB = 0xFFFFFFF0;
const indice = (extra = {}) => JSON.stringify({ formatVersion: 1, game: 'minecraft', versionId: '1', name: 'Pack Tamanho', files: [], dependencies: { minecraft: '1.21.1' }, ...extra });
let n = 0;
const salvar = (entradas) => {
  const arq = path.join(RAIZ, `tamanho-${++n}.mrpack`);
  fs.writeFileSync(arq, zipCru(entradas));
  return arq;
};
const instanciasAtuais = () => (fs.existsSync(instancias.PASTA) ? fs.readdirSync(instancias.PASTA) : []);

teste('override declarando ~4 GB é recusado com mensagem clara, antes de criar a instância', async () => {
  const antes = instanciasAtuais().length;
  const r = await modrinth.importarMrpack(salvar([
    { nome: 'modrinth.index.json', dados: indice() },
    { nome: 'overrides/options.txt', dados: 'a', declarado: QUATRO_GB },
  ]));
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(r.mensagem, /grande demais/i, `mensagem inesperada: ${r.mensagem}`);
  assert.equal(instanciasAtuais().length, antes, 'não deveria criar instância');
});

teste('índice (modrinth.index.json) declarando ~4 GB é recusado com mensagem clara', async () => {
  const r = await modrinth.importarMrpack(salvar([{ nome: 'modrinth.index.json', dados: indice(), declarado: QUATRO_GB }]));
  assert.equal(r.ok, false, JSON.stringify(r));
  assert.match(r.mensagem, /grande demais/i, `mensagem inesperada: ${r.mensagem}`);
});

teste('overrides de tamanho normal continuam funcionando', async () => {
  const r = await modrinth.importarMrpack(salvar([
    { nome: 'modrinth.index.json', dados: indice() },
    { nome: 'overrides/config/grande.json', dados: Buffer.alloc(8 * 1048576, 0x20) },
  ]));
  try {
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(fs.statSync(path.join(instancias.PASTA, r.id, 'config', 'grande.json')).size, 8 * 1048576);
  } finally {
    if (r.ok) fs.rmSync(path.join(instancias.PASTA, r.id), { recursive: true, force: true });
  }
});
