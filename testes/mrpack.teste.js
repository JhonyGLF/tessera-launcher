// V1 (AUDITORIA.md): um .mrpack não pode sobrescrever o instance.json nem escrever fora da instância.
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const { zipCru } = require('./util/zip');
const modrinth = require('../launcher/modrinth');
const instancias = require('../launcher/instancias');
const { RAIZ } = require('../launcher/jogo');

const PASTA_INST = path.join(RAIZ, 'instances');
const MALICIOSO = JSON.stringify({ nome: 'Atacado', mc: '1.21.1', loader: { tipo: 'vanilla', versao: null }, icone: 'grama', jvmArgs: '-Dpwned=1' });
const HASH = 'a'.repeat(40);
let n = 0;

// sem internet, a validação da versão aceita uma versão "já instalada"
fs.mkdirSync(path.join(RAIZ, 'versions', '1.21.1'), { recursive: true });
fs.writeFileSync(path.join(RAIZ, 'versions', '1.21.1', '1.21.1.json'), '{}');

function pack({ arquivos = [], extras = [] } = {}) {
  const indice = { formatVersion: 1, game: 'minecraft', versionId: '1', name: `Pack ${++n}`, files: arquivos, dependencies: { minecraft: '1.21.1' } };
  const destino = path.join(RAIZ, `teste-${n}.mrpack`);
  fs.writeFileSync(destino, zipCru([{ nome: 'modrinth.index.json', dados: JSON.stringify(indice) }, ...extras]));
  return destino;
}

const instanciasAtuais = () => (fs.existsSync(PASTA_INST) ? fs.readdirSync(PASTA_INST) : []);

// Nenhuma instância com o instance.json do atacante e nada escrito fora das instâncias
function conferirIntegridade() {
  for (const id of instanciasAtuais()) {
    const meta = path.join(PASTA_INST, id, 'instance.json');
    if (fs.existsSync(meta)) assert.ok(!fs.readFileSync(meta, 'utf8').includes('pwned'), `instance.json de "${id}" foi sobrescrito`);
  }
  for (const fora of [path.join(RAIZ, 'fora.txt'), path.join(PASTA_INST, 'fora.txt'), path.join(path.dirname(RAIZ), 'fora.txt')]) {
    assert.ok(!fs.existsSync(fora), `arquivo escrito fora da instância: ${fora}`);
  }
}

async function limpar() {
  for (const id of instanciasAtuais()) fs.rmSync(path.join(PASTA_INST, id), { recursive: true, force: true });
}

// ---------- Caminhos de ataque nas overrides ----------
const ATAQUES_OVERRIDES = [
  'overrides/./instance.json',
  'overrides/instance.json::$DATA',
  'overrides/INSTANCE.JSON::$DATA',
  'client-overrides/./instance.json',
  'overrides/sub/../instance.json',
  'overrides/config/../../fora.txt',
  'overrides/../fora.txt',
  'overrides/config/a.txt:fluxo',
  'overrides/config/a.txt.',
  'overrides/config/a.txt ',
  'overrides/config/CON',
  'overrides/config/nul.txt',
];

for (const nome of ATAQUES_OVERRIDES) {
  teste(`overrides: "${nome}" não altera a instância nem escreve fora dela`, async () => {
    const r = await modrinth.importarMrpack(pack({ extras: [{ nome, dados: MALICIOSO }, { nome: 'overrides/options.txt', dados: 'fov:0.5' }] }));
    try {
      conferirIntegridade();
    } finally {
      await limpar();
    }
    // nomes que o Windows reinterpreta (fluxos, ponto/espaço final, dispositivos) recusam o pack inteiro
    if (/:|[. ]$|\/(con|nul\.txt)$/i.test(nome)) assert.equal(r.ok, false, `deveria recusar o modpack (${JSON.stringify(r)})`);
  });
}

// ---------- Caminhos de ataque na lista "files" do índice ----------
const ATAQUES_FILES = ['instance.json', './instance.json', 'instance.json::$DATA', 'mods/../instance.json', 'mods/a.jar:fluxo', '../fora.txt', 'C:/fora.txt', '/fora.txt'];

for (const caminho of ATAQUES_FILES) {
  teste(`files: "${caminho}" é recusado antes de qualquer download`, async () => {
    const antes = instanciasAtuais().length;
    const r = await modrinth.importarMrpack(pack({ arquivos: [{ path: caminho, hashes: { sha1: HASH }, downloads: ['https://cdn.modrinth.com/data/x/y.jar'], fileSize: 1 }] }));
    assert.equal(r.ok, false, `deveria recusar (${JSON.stringify(r)})`);
    // a recusa tem de vir da validação do caminho (e não de uma falha de download depois)
    assert.match(r.mensagem, /caminho (proibido|inválido)/i, `recusado pelo motivo errado: ${r.mensagem}`);
    assert.equal(instanciasAtuais().length, antes, 'não deveria criar instância');
    conferirIntegridade();
  });
}

// ---------- Modpack legítimo continua funcionando ----------
teste('modpack legítimo: overrides, client-overrides, subpastas e acentos', async () => {
  const r = await modrinth.importarMrpack(pack({
    extras: [
      { nome: 'overrides/options.txt', dados: 'fov:0.5' },
      { nome: 'overrides/config/sodium-options.json', dados: '{"a":1}' },
      { nome: 'overrides/config/sub pasta/configuração.toml', dados: 'x = 1' },
      { nome: 'overrides/resourcepacks/Pack v1.2.zip', dados: 'zip' },
      { nome: 'overrides/.hidden/a.txt', dados: 'oculto' },
      { nome: 'client-overrides/options.txt', dados: 'fov:0.9' },
      // ATLauncher exporta um instance.json próprio: deve ser ignorado, sem quebrar a importação
      { nome: 'overrides/instance.json', dados: MALICIOSO },
    ],
  }));
  try {
    assert.equal(r.ok, true, JSON.stringify(r));
    const p = (...c) => path.join(PASTA_INST, r.id, ...c);
    assert.equal(fs.readFileSync(p('options.txt'), 'utf8'), 'fov:0.9', 'client-overrides deve vencer overrides');
    assert.ok(fs.existsSync(p('config', 'sodium-options.json')));
    assert.ok(fs.existsSync(p('config', 'sub pasta', 'configuração.toml')));
    assert.ok(fs.existsSync(p('resourcepacks', 'Pack v1.2.zip')));
    assert.ok(fs.existsSync(p('.hidden', 'a.txt')));
    const meta = JSON.parse(fs.readFileSync(p('instance.json'), 'utf8'));
    assert.equal(meta.jvmArgs, '', 'instance.json do launcher deve continuar intacto');
    conferirIntegridade();
  } finally {
    await limpar();
  }
});

// ---------- Índices de modpacks reais do Modrinth (só se houver internet) ----------
teste('caminhos de modpacks reais do Modrinth continuam aceitos', async () => {
  assert.equal(typeof modrinth.validarCaminhoPack, 'function', 'modrinth.validarCaminhoPack não exportado');
  const AdmZip = require('adm-zip');
  const slugs = ['fabulously-optimized', 'simply-optimized', 'cobblemon-fabric', 'better-mc-fabric-bmc1', 'adrenaline'];
  let lidos = 0;
  let maior = 0;
  for (const slug of slugs) {
    let versoes;
    try {
      const resp = await fetch(`https://api.modrinth.com/v2/project/${slug}/version`, { headers: { 'User-Agent': 'Tessera-Launcher/testes' } });
      if (!resp.ok) continue;
      versoes = await resp.json();
    } catch {
      return 'pular';
    }
    const arq = versoes[0] && versoes[0].files.find((f) => f.filename.endsWith('.mrpack'));
    if (!arq) continue;
    const zip = new AdmZip(Buffer.from(await (await fetch(arq.url)).arrayBuffer()));
    const indice = JSON.parse(zip.readAsText('modrinth.index.json'));
    const base = path.join(PASTA_INST, 'validacao');
    for (const f of indice.files) modrinth.validarCaminhoPack(base, f.path);
    for (const e of zip.getEntries()) {
      const nome = e.entryName;
      const prefixo = ['overrides/', 'client-overrides/'].find((p) => nome.startsWith(p));
      if (prefixo && !e.isDirectory && nome.length > prefixo.length) {
        modrinth.validarCaminhoPack(base, nome.slice(prefixo.length));
        maior = Math.max(maior, e.header.size);
      }
    }
    lidos++;
  }
  if (!lidos) return 'pular';
  // o limite por arquivo das overrides (V3) é 512 MB: tem de ficar muito acima do que se usa de verdade
  assert.ok(maior < 512 * 1048576, `override real de ${maior} bytes passaria do limite`);
  console.log(`      (${lidos} modpacks reais conferidos; maior arquivo nas overrides: ${(maior / 1048576).toFixed(1)} MB)`);
});
