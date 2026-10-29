// V4 (AUDITORIA.md): abrirPasta só abre pastas da instância — nunca arquivos (que o Windows executaria).
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const { shell } = require('electron');
const instancias = require('../launcher/instancias');
const { criarInstanciaTeste } = require('./util/instancia');

// registra as chamadas em vez de abrir o Explorer
const abertos = [];
async function comShellFalso(fn) {
  const original = shell.openPath;
  shell.openPath = async (p) => { abertos.push(p); return ''; };
  abertos.length = 0;
  try { return await fn(); } finally { shell.openPath = original; }
}

let id = null;
async function instancia() {
  if (!id) {
    id = await criarInstanciaTeste('Abrir Pasta');
    fs.mkdirSync(instancias.pasta(id, 'saves', 'Meu Mundo'), { recursive: true });
    fs.writeFileSync(instancias.pasta(id, 'mods', 'payload.bat'), '@echo pwned\r\n');
  }
  return id;
}

// ---------- Continua funcionando ----------
for (const [sub, esperado] of [[undefined, []], ['mods', ['mods']], ['saves', ['saves']], ['logs', ['logs']], ['saves/Meu Mundo', ['saves', 'Meu Mundo']]]) {
  teste(`abre a pasta ${sub ? `"${sub}"` : 'da instância'}`, async () => {
    const i = await instancia();
    const r = await comShellFalso(() => instancias.abrirPasta(i, sub));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(abertos, [instancias.pasta(i, ...esperado)]);
  });
}

// ---------- Recusado ----------
for (const sub of ['mods/payload.bat', 'mods\\payload.bat', 'saves/Meu Mundo/../../mods/payload.bat', 'mods/payload.bat\0', 'saves/\0', 'outra', '../..', 'saves/C:x']) {
  teste(`recusa ${JSON.stringify(sub)} sem chamar o shell`, async () => {
    const i = await instancia();
    const r = await comShellFalso(() => instancias.abrirPasta(i, sub));
    assert.equal(r.ok, false, `deveria recusar (${JSON.stringify(r)})`);
    assert.deepEqual(abertos, [], `shell.openPath foi chamado com: ${abertos.join(', ')}`);
  });
}

teste('subpasta que não existe: erro, sem chamar o shell', async () => {
  const i = await instancia();
  const r = await comShellFalso(() => instancias.abrirPasta(i, 'saves/Nao Existe'));
  assert.equal(r.ok, false);
  assert.deepEqual(abertos, []);
});

teste('limpeza', async () => {
  if (id) await instancias.remover(id);
  assert.ok(!fs.existsSync(path.join(instancias.PASTA, id)));
});
