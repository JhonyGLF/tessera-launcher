// "Otimizar instância": plano de mods de desempenho por loader/versão e instalação (API real do Modrinth).
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const modrinth = require('../launcher/modrinth');
const instancias = require('../launcher/instancias');

const SODIUM = 'AANobbMI';
const EMBEDDIUM = 'sk9rgfiA';
const MORE_CULLING = '51shyZVL';

// instância escrita direto no disco (não depende da lista de versões online)
function instancia(id, mc, loader) {
  fs.mkdirSync(path.join(instancias.PASTA, id, 'mods'), { recursive: true });
  fs.writeFileSync(path.join(instancias.PASTA, id, 'instance.json'), JSON.stringify({ nome: id, mc, loader, icone: 'grama' }));
  return id;
}
const apagar = (id) => fs.rmSync(path.join(instancias.PASTA, id), { recursive: true, force: true });
const semRede = (r) => r.ok === false && /conex|internet|Modrinth/i.test(r.mensagem || '');
const porId = (r) => Object.fromEntries(r.itens.map((i) => [i.projetoId, i]));

teste('instância vanilla: sem plano (precisa de loader)', async () => {
  const id = instancia('otm-vanilla', '1.21.1', { tipo: 'vanilla', versao: null });
  try {
    const r = await modrinth.planoOtimizacao(id);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.loader, 'vanilla');
    assert.deepEqual(r.itens, []);
  } finally { apagar(id); }
});

teste('só aceita mods da lista de otimização', async () => {
  const id = instancia('otm-lista', '1.21.1', { tipo: 'fabric', versao: '0.16.9' });
  try {
    const r = await modrinth.otimizarInstancia(id, ['P7dR8mSH']); // Fabric API: não está na lista
    assert.equal(r.ok, false);
    assert.match(r.mensagem, /fora da lista/);
  } finally { apagar(id); }
});

teste('Fabric 1.21.1: Sodium entra, Embeddium (só Forge) fica de fora', async () => {
  const id = instancia('otm-fabric', '1.21.1', { tipo: 'fabric', versao: '0.16.9' });
  try {
    const r = await modrinth.planoOtimizacao(id);
    if (semRede(r)) return 'pular';
    assert.equal(r.ok, true, JSON.stringify(r));
    const p = porId(r);
    assert.equal(p[SODIUM].estado, 'instalar');
    assert.ok(p[SODIUM].versaoId);
    assert.equal(p[EMBEDDIUM], undefined);
    assert.ok(r.itens.length >= 7, `poucos itens: ${r.itens.length}`);
  } finally { apagar(id); }
});

teste('Forge 1.20.1: Embeddium no lugar do Sodium', async () => {
  const id = instancia('otm-forge', '1.20.1', { tipo: 'forge', versao: '47.4.10' });
  try {
    const r = await modrinth.planoOtimizacao(id);
    if (semRede(r)) return 'pular';
    const p = porId(r);
    assert.equal(p[EMBEDDIUM].estado, 'instalar');
    assert.notEqual(p[SODIUM] && p[SODIUM].estado, 'instalar', 'Sodium não existe para Forge');
  } finally { apagar(id); }
});

teste('com OptiFine instalado, os mods de renderização ficam como conflito', async () => {
  const id = instancia('otm-optifine', '1.21.1', { tipo: 'fabric', versao: '0.16.9' });
  fs.writeFileSync(path.join(instancias.PASTA, id, 'mods', 'OptiFine_1.21.1_HD_U_J1.jar'), 'falso');
  try {
    const r = await modrinth.planoOtimizacao(id);
    if (semRede(r)) return 'pular';
    const p = porId(r);
    assert.equal(p[SODIUM].estado, 'conflito');
    assert.equal(p[MORE_CULLING].estado, 'conflito');
  } finally { apagar(id); }
});

teste('instala o plano inteiro e depois mostra tudo como instalado', async () => {
  const id = instancia('otm-instalar', '1.21.1', { tipo: 'fabric', versao: '0.16.9' });
  try {
    const plano = await modrinth.planoOtimizacao(id);
    if (semRede(plano)) return 'pular';
    const escolhidos = plano.itens.filter((i) => i.estado === 'instalar').map((i) => i.projetoId);
    const r = await modrinth.otimizarInstancia(id, escolhidos);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(r.instalados.length >= escolhidos.length, `instalou ${r.instalados.length} de ${escolhidos.length}`);
    const depois = porId(await modrinth.planoOtimizacao(id));
    for (const pid of escolhidos) assert.equal(depois[pid].estado, 'instalado', `${depois[pid].nome} não aparece como instalado`);
    const jars = fs.readdirSync(path.join(instancias.PASTA, id, 'mods')).filter((a) => a.endsWith('.jar'));
    console.log(`      (${escolhidos.length} mods do plano + dependências → ${jars.length} arquivos .jar)`);
  } finally { apagar(id); }
});
