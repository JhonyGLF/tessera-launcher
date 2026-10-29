// Jogar sem internet (com tudo já baixado) e sem consultar a internet a cada clique em Jogar.
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const java = require('../launcher/java');
const jogo = require('../launcher/jogo');
const { RAIZ } = jogo;

// troca o fetch global durante o teste: conta as chamadas e falha (sem internet) ou responde
async function comFetch(responder, fn) {
  const original = global.fetch;
  const chamadas = [];
  global.fetch = async (url, opcoes) => { chamadas.push(String(url)); return responder(String(url), opcoes); };
  try { await fn(chamadas); } finally { global.fetch = original; }
}
const semInternet = () => { throw new TypeError('fetch failed'); };
const json = (dados) => ({ ok: true, status: 200, json: async () => dados });

// "Java instalado": javaw.exe + a marca com a versão
function javaFalso(componente, versao) {
  const pasta = path.join(RAIZ, 'runtime', componente);
  fs.mkdirSync(path.join(pasta, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(pasta, 'bin', 'javaw.exe'), 'falso');
  fs.writeFileSync(path.join(pasta, '.tessera-ok'), versao);
  return path.join(pasta, 'bin', 'javaw.exe');
}
const catalogo = (componente, versao) => ({
  'windows-x64': { [componente]: [{ version: { name: versao }, manifest: { url: 'https://exemplo/manifesto.json' } }] },
});

teste('Java instalado + sem internet: abre com o Java instalado', async () => {
  const javaw = javaFalso('java-teste-offline', '25.0.1');
  await comFetch(semInternet, async () => {
    assert.equal(await java.prepararJava(RAIZ, 'java-teste-offline', () => {}), javaw);
  });
});

teste('Java instalado + catálogo consultado há pouco: não usa a internet', async () => {
  const javaw = javaFalso('java-teste-cache', '21.0.7');
  // primeira chamada: consulta o catálogo (e guarda em disco)
  await comFetch(() => json(catalogo('java-teste-cache', '21.0.7')), async () => {
    assert.equal(await java.prepararJava(RAIZ, 'java-teste-cache', () => {}), javaw);
  });
  // logo depois: nenhuma chamada de rede
  await comFetch(semInternet, async (chamadas) => {
    assert.equal(await java.prepararJava(RAIZ, 'java-teste-cache', () => {}), javaw);
    assert.deepEqual(chamadas, [], `consultou a internet: ${chamadas.join(', ')}`);
  });
});

teste('Java NÃO instalado + sem internet: mensagem clara (não "fetch failed")', async () => {
  fs.rmSync(path.join(RAIZ, 'cache', 'java-runtime-catalogo.json'), { force: true }); // nunca teve internet
  await comFetch(semInternet, async () => {
    await assert.rejects(java.prepararJava(RAIZ, 'java-teste-ausente', () => {}), (erro) => {
      assert.match(erro.message, /internet/i, `mensagem: ${erro.message}`);
      return true;
    });
  });
});

teste('lista de versões: com cópia recente em disco, Jogar não consulta a internet', async () => {
  jogo.limparCacheVersoes();
  const cache = path.join(RAIZ, 'versions', 'version_manifest_v2.json');
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.writeFileSync(cache, JSON.stringify({ latest: {}, versions: [{ id: '9.9.9', url: 'https://x/9.9.9.json', sha1: 'a' }] }));
  await comFetch(semInternet, async (chamadas) => {
    const m = await jogo.listarVersoes({ maxIdadeMs: 24 * 3600 * 1000 });
    assert.equal(m.versions[0].id, '9.9.9');
    assert.deepEqual(chamadas, []);
  });
});

teste('lista de versões: consulta tem limite de tempo (não trava com a internet lenta)', async () => {
  jogo.limparCacheVersoes();
  let sinal = null;
  await comFetch((url, opcoes) => { sinal = opcoes && opcoes.signal; return semInternet(); }, async () => {
    await jogo.listarVersoes().catch(() => {});
  });
  assert.ok(sinal, 'fetch sem AbortSignal (sem limite de tempo)');
});
