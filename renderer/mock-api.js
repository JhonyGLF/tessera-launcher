// Mock da API do launcher (window.jg) para desenvolver e testar a interface sem o Electron.
// Só é carregado quando window.jg não existe (ver api.js). Dados de exemplo realistas:
// ícones reais do CDN do Modrinth, notícias reais do feed da Mojang.
//
// Cenários (para capturas/testes): index.html?cenario=<nome>#/rota
//   semconta  — sem nenhuma conta          vazio    — sem contas e sem instâncias
//   erro      — rede fora (notícias, versões, busca falham)
//   jogando   — uma instância já aberta    tarefas  — tarefas rodando desde o início
// No console: jgMock.simularTarefa('Baixando algo'), jgMock.emitir('jogo', {...})
//
// Organização: cada agente/área edita só a sua seção.

// ==== geral ====
const cenario = new URLSearchParams(location.search).get('cenario') || '';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const latencia = (base = 140) => esperar(base + Math.random() * base);
const copia = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const agora = Date.now();
const H = 3600_000;
const D = 24 * H;

const ouvintes = { tarefas: new Set(), instancias: new Set(), jogo: new Set(), log: new Set(), atualizacao: new Set() };
const emitir = (canal, dados) => ouvintes[canal].forEach((f) => { try { f(copia(dados)); } catch (e) { console.error(e); } });
const ouvir = (canal) => (fn) => { ouvintes[canal].add(fn); return () => ouvintes[canal].delete(fn); };

const jg = {};

// ---------- Tarefas ----------
const tarefas = new Map();
let nTarefa = 0;
const avisarTarefas = () => emitir('tarefas', [...tarefas.values()]);

function criarTarefa(titulo) {
  const t = { id: `t${++nTarefa}`, titulo, etapa: '', feitos: 0, total: 0, estado: 'rodando', mensagem: '' };
  tarefas.set(t.id, t);
  avisarTarefas();
  const encerrar = (estado, mensagem) => {
    Object.assign(t, { estado, mensagem: mensagem || '' });
    avisarTarefas();
    setTimeout(() => { tarefas.delete(t.id); avisarTarefas(); }, estado === 'erro' ? 20000 : 6000);
  };
  return {
    id: t.id,
    atualizar({ etapa, feitos, total } = {}) {
      if (etapa !== undefined) t.etapa = etapa;
      t.feitos = feitos || 0;
      t.total = total || 0;
      avisarTarefas();
    },
    concluir: (m) => encerrar('ok', m),
    falhar: (m) => encerrar('erro', m),
  };
}

// etapas: [[nome, total, duracaoMs]] (total 0 = indeterminada)
async function simularTarefa(titulo, etapas = [['Baixando arquivos', 120, 4000]], { falhar = null, mensagem } = {}) {
  const t = criarTarefa(titulo);
  for (const [etapa, total, duracao = 2000] of etapas) {
    const passos = Math.max(1, Math.round(duracao / 150));
    for (let i = 0; i <= passos; i++) {
      t.atualizar({ etapa, feitos: Math.round((total * i) / passos), total });
      await esperar(150);
    }
  }
  if (falhar) { t.falhar(falhar); return { ok: false, mensagem: falhar }; }
  t.concluir(mensagem);
  return { ok: true };
}

// ---------- App e janela ----------
Object.assign(jg, {
  minimizar: () => console.log('[mock] minimizar'),
  fechar: () => console.log('[mock] fechar'),
  info: async () => ({ versao: '0.3.0', raiz: 'C:\\Users\\Jogador\\AppData\\Roaming\\.tessera' }),
  abrirLink: async (url) => { console.log('[mock] abrir link', url); },
  abrirPastaRaiz: async () => { console.log('[mock] abrir pasta raiz'); return ''; },
});

// ---------- Configurações ----------
const config = {
  ramMB: 4096, ramMaxMB: 16384, javaPersonalizado: null, minimizarAoJogar: true, mostrarSnapshots: false,
  tema: 'sculk', instanciaSelecionada: cenario === 'vazio' ? null : 'fabric-otimizado', ordemInstancias: 'recentes',
};
const TEMAS = ['sculk', 'grama', 'ametista', 'nether', 'gelo'];

Object.assign(jg, {
  lerConfig: async () => { await latencia(40); return copia(config); },
  async salvarConfig(m = {}) {
    await latencia(40);
    const tipos = { ramMB: 'number', javaPersonalizado: 'string', minimizarAoJogar: 'boolean', mostrarSnapshots: 'boolean', tema: 'string', instanciaSelecionada: 'string', ordemInstancias: 'string' };
    for (const [k, v] of Object.entries(m)) {
      if (!(k in tipos)) continue;
      if (v !== null && typeof v !== tipos[k]) continue;
      if (k === 'tema' && !TEMAS.includes(v)) continue;
      if (k === 'ramMB') config.ramMB = Math.max(1024, Math.min(config.ramMaxMB, Math.round(v / 512) * 512));
      else config[k] = v;
    }
    return copia(config);
  },
  escolherJava: async () => { await latencia(); return 'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.5.11-hotspot\\bin\\javaw.exe'; },
});

// ---------- Contas ----------
const SKINS = {
  'msa-1': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAA2UlEQVR42u3UsQ2CQBTG8Q/jAMYCiIUVExhLCxouDmFhi5XTOAEjWFlTGQewoLIghMKwgRY0mCho1ETh/yvfe8ndfbk7CQAAdJXVNOBNF5e6fnKIrG9ucDYztevH8e6t9fvPDA1sT0WeNNa+5dEhm8L5WADbtS3JvtOx5Zqo3U8g221qU3bNyvrnAHrPDDlBKL+YlIGkufxiIicIu/EJVm/AOTlJkobeuDU3oP/K8D4+SpLmlQD+XWMAWZrLHZUf4HxpbuoAAAAAAAAAAAAAAAAAAAAAAAC/6ArXejAaHbpnGgAAAABJRU5ErkJggg==',
  'off-1': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAzklEQVR42u3UIQ+CUBiF4QMzsZkkUPQ/mChkqAb5BybnyCaDycyMRpLJbCZospqdgUBzZg1sbo5NmUngfdr97pfuuTsSAABoK+PbwmXuPT7dD1apUecHMKssXa55pVkddaosDWfL8nAXN+IBzF/Sl6TeKGrELzCrpG+5oYK0SDzPMgVpLMsN21GC98P2VYK3vEi8a9uSpNN6IS85G43vAEk6bvZvZ3fiqz+eSknU7BLMs0y248id+KU5AAAAAAAAAAAAAAAAAAAAAADAP3oCE8Ev2umcXQkAAAAASUVORK5CYII=',
};
let contas = cenario === 'semconta' || cenario === 'vazio' ? [] : [
  { id: 'msa-1', tipo: 'msa', nome: 'PixelJG', uuid: '3f9c2a7be41d4c0a9a5b1e8d6c7f2a10' },
  { id: 'off-1', tipo: 'offline', nome: 'Construtor_99', uuid: 'b1d6a0e2c3f43a8e9d7c5b4a3f2e1d0c' },
  { id: 'off-2', tipo: 'offline', nome: 'Alex_Teste', uuid: '7a2c9e1f0b3d3e4fa5c6d7e8f9a0b1c2' },
];
let contaAtiva = contas.length ? 'msa-1' : null;
const listarContasMock = () => ({ contas: copia(contas), ativa: contaAtiva, podeOffline: contas.some((c) => c.tipo === 'msa') });
const uuidFalso = () => Array.from({ length: 32 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('');

Object.assign(jg, {
  listarContas: async () => { await latencia(60); return listarContasMock(); },
  async adicionarMicrosoft() {
    await esperar(1600);
    const id = `msa-${Date.now()}`;
    const conta = { id, tipo: 'msa', nome: 'Jogador_MS', uuid: uuidFalso() };
    contas.push(conta);
    if (!contaAtiva) contaAtiva = id;
    return { ok: true, conta: copia(conta) };
  },
  async adicionarOffline(nome) {
    await latencia();
    if (!contas.some((c) => c.tipo === 'msa')) return { ok: false, mensagem: 'Para criar contas offline, adicione antes uma conta Microsoft que tenha o Minecraft: Java Edition.' };
    if (!/^[A-Za-z0-9_]{3,16}$/.test(nome || '')) return { ok: false, mensagem: 'O nome deve ter de 3 a 16 caracteres: letras, números ou _.' };
    if (contas.some((c) => c.tipo === 'offline' && c.nome.toLowerCase() === nome.toLowerCase())) return { ok: false, mensagem: 'Já existe uma conta offline com esse nome.' };
    const conta = { id: `off-${Date.now()}`, tipo: 'offline', nome, uuid: uuidFalso() };
    contas.push(conta);
    return { ok: true, conta: copia(conta) };
  },
  async removerConta(id) {
    await latencia();
    contas = contas.filter((c) => c.id !== id);
    // sem conta Microsoft, as offline continuam salvas (igual ao Prism)
    if (contaAtiva === id) contaAtiva = contas[0] ? contas[0].id : null;
    return { ok: true, ...listarContasMock() };
  },
  async selecionarConta(id) {
    await latencia(60);
    if (!contas.some((c) => c.id === id)) return { ok: false, mensagem: 'Conta não encontrada.' };
    contaAtiva = id;
    return { ok: true };
  },
  skinConta: async (id) => { await latencia(200); return SKINS[id] || null; },
});

// ---------- Versões e loaders ----------
const RELEASES = [["26.3","2026-09-15"],["26.2","2026-06-16"],["26.1.2","2026-04-09"],["26.1.1","2026-04-01"],["26.1","2026-03-24"],["1.21.11","2025-12-09"],["1.21.10","2025-10-07"],["1.21.9","2025-09-30"],["1.21.8","2025-07-17"],["1.21.7","2025-06-30"],["1.21.6","2025-06-17"],["1.21.5","2025-03-25"],["1.21.4","2024-12-03"],["1.21.3","2024-10-23"],["1.21.2","2024-10-22"],["1.21.1","2024-08-08"],["1.21","2024-06-13"],["1.20.6","2024-04-29"],["1.20.5","2024-04-23"],["1.20.4","2023-12-07"],["1.20.3","2023-12-04"],["1.20.2","2023-09-20"],["1.20.1","2023-06-12"],["1.20","2023-06-02"],["1.19.4","2023-03-14"],["1.19.3","2022-12-07"],["1.19.2","2022-08-05"],["1.19.1","2022-07-27"],["1.19","2022-06-07"],["1.18.2","2022-02-28"],["1.18.1","2021-12-10"],["1.18","2021-11-30"],["1.17.1","2021-07-06"],["1.17","2021-06-08"],["1.16.5","2021-01-14"],["1.16.4","2020-10-29"],["1.16.3","2020-09-10"],["1.16.2","2020-08-11"],["1.16.1","2020-06-24"],["1.16","2020-06-23"],["1.15.2","2020-01-17"],["1.15.1","2019-12-16"],["1.15","2019-12-09"],["1.14.4","2019-07-19"],["1.14.3","2019-06-24"],["1.14.2","2019-05-27"],["1.14.1","2019-05-13"],["1.14","2019-04-23"],["1.13.2","2018-10-22"],["1.13.1","2018-08-22"],["1.13","2018-07-18"],["1.12.2","2017-09-18"],["1.12.1","2017-08-03"],["1.12","2017-06-02"],["1.11.2","2016-12-21"],["1.11.1","2016-12-20"],["1.11","2016-11-14"],["1.10.2","2016-06-23"],["1.10.1","2016-06-22"],["1.10","2016-06-08"],["1.9.4","2016-05-10"],["1.9.3","2016-05-10"],["1.9.2","2016-03-30"],["1.9.1","2016-03-30"],["1.9","2016-02-29"],["1.8.9","2015-12-03"]];
const SNAPSHOTS = [["26.4-snapshot-3","2026-10-06"],["26.4-snapshot-2","2026-09-29"],["26.4-snapshot-1","2026-09-22"],["26.3-rc-3","2026-09-14"],["26.3-rc-2","2026-09-11"],["26.3-rc-1","2026-09-10"],["26.3-pre-3","2026-09-08"],["26.3-pre-2","2026-09-04"]];
const LOADERS = {
  fabric: ['0.17.3', '0.17.2', '0.16.14', '0.16.10', '0.16.9', '0.15.11'],
  quilt: ['0.29.2', '0.29.1-beta.3', '0.28.0', '0.27.1'],
  forge: { '1.21.11': ['61.0.4', '61.0.2'], '1.21.1': ['52.1.0', '52.0.40'], '1.20.1': ['47.4.0', '47.3.0'], '1.12.2': ['14.23.5.2860'] },
  neoforge: { '1.21.11': ['21.11.12', '21.11.3-beta'], '1.21.1': ['21.1.209', '21.1.200'], '26.1': ['26.1.0.9-beta'] },
};

Object.assign(jg, {
  async listarVersoesMc() {
    await latencia();
    if (cenario === 'erro') return { ok: false, mensagem: 'Sem conexão com a internet. Não foi possível baixar a lista de versões.' };
    const versoes = [
      ...SNAPSHOTS.map(([id, data]) => ({ id, tipo: 'snapshot', data })),
      ...RELEASES.map(([id, data]) => ({ id, tipo: 'release', data })),
    ].sort((a, b) => b.data.localeCompare(a.data));
    return { ok: true, ultima: { release: RELEASES[0][0], snapshot: SNAPSHOTS[0][0] }, versoes };
  },
  async listarLoaders(tipo, mc) {
    await latencia();
    const nome = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' }[tipo] || tipo;
    let lista = LOADERS[tipo];
    if (lista && !Array.isArray(lista)) lista = lista[mc];
    if (!lista || !lista.length || (tipo !== 'forge' && tipo !== 'neoforge' && /^1\.(8|9|10|11|12|13)(\.|$)/.test(mc))) {
      return { ok: false, mensagem: `O ${nome} não tem versão para o ${mc}.` };
    }
    return { ok: true, versoes: lista.map((id) => ({ id, estavel: !/beta|alpha|rc/.test(id) })) };
  },
});

// ---------- Novidades ----------
const NOTICIAS = [
  {"id":"8df071b98ac92911ae6caae35feb68506bca66894d16f41797164b9a9c6d1824","titulo":"Minecraft 26.4 Snapshot 3","versao":"26.4-snapshot-3","tipo":"snapshot","data":"2026-10-06T12:54:26.000Z","imagemUrl":"https://launchercontent.mojang.com/v2/images/264snapshot3540x540.jpg","resumo":"Brr! Does it feel colder all of a sudden? Minecraft LIVE revealed the first look at our next game drop – and it's frosty. Explore ice caves filled with glittering icicles and ice crystals, plus meet a not-so-chill new hostile mob! This frozen zombie varian"},
  {"id":"26-4-snapshot-2","titulo":"Minecraft 26.4 Snapshot 2","versao":"26.4-snapshot-2","tipo":"snapshot","data":"2026-09-29T11:32:57.000Z","imagemUrl":"https://launchercontent.mojang.com/v2/images/26.4snapshot2540x540.jpg","resumo":"Hi there! It is time for the second snapshot for 26.4, featuring improved render distance fog, a new celestial occluder, and a fresh redesign of the F3 screen.Happy mining!ChangesWhen \"Improved Transparency\" is on, sky background and clouds that are behind"},
  {"id":"26-4-snapshot-1","titulo":"Minecraft 26.4 Snapshot 1","versao":"26.4-snapshot-1","tipo":"snapshot","data":"2026-09-22T13:38:53.000Z","imagemUrl":"https://launchercontent.mojang.com/v2/images/2026092216.02.58540x540.jpg","resumo":"Welcome to the first snapshot of 26.4! We're kicking things off with a range of technical updates and improvements, including Vulkan becoming the default graphics API.ChangesWorld GenerationUpgrading worlds from before Caves and Cliffs will now also genera"},
  {"id":"26-3","titulo":"Minecraft: Java Edition 26.3","versao":"26.3","tipo":"release","data":"2026-09-15T11:23:02.000Z","imagemUrl":"https://launchercontent.mojang.com/v2/images/dappledcamp540x540.jpg","resumo":"Wilderness Bound is out now in Minecraft Java Edition! Pack your supplies and set off on an expedition into the dappled forest where the trails end and adventure begins. Seek out abandoned camps, build outposts among the poplar trees, sleep under the stars"},
  {"id":"26-3-release-candidate-3","titulo":"Minecraft 26.3 Release Candidate 3","versao":"26.3-rc-3","tipo":"snapshot","data":"2026-09-14T12:58:38.000Z","imagemUrl":"https://launchercontent.mojang.com/v2/images/26.3rc3540x540.jpg","resumo":"They say that third time's the charm! Release Candidate 3 for 26.3 is here with yet another handful of fixes as we put the final touches on the Wilderness Bound game drop.Happy mining!Fixed bugs in 26.3 Release Candidate 3MC-311456 - VSync can be disabled "},
  {"id":"26-3-release-candidate-2","titulo":"Minecraft 26.3 Release Candidate 2","versao":"26.3-rc-2","tipo":"snapshot","data":"2026-09-11T10:34:40.000Z","imagemUrl":"https://launchercontent.mojang.com/v2/images/26.3rc2540x540.jpg","resumo":"Today we are shipping a second release candidate for 26.3, the Wilderness Bound game drop coming on September 15th! If no critical issues are found, this will be the version that we ship for the eventual full release. Happy mining!Fixed bugs in 26.3 Releas"},
  {"id":"b4b6b172445c758986c9814c768719a4ddaf4da3d4ba4a2ea0a13fc04296a462","titulo":"Minecraft 26.3 Release Candidate 1","versao":"26.3-rc-1","tipo":"snapshot","data":"2026-09-10T11:28:25.000Z","imagemUrl":"https://launchercontent.mojang.com/v2/images/26.3rc1540x540.jpg","resumo":"Today we are shipping the first release candidate for 26.3, the Wilderness Bound game drop! If no critical issues are found, this will be the version that we ship for the eventual full release.Happy mining!Fixed bugs in 26.3 Release Candidate 1MC-311607 - "},
  {"id":"ce09401e76e06d061699760968d6afa49e1fd852b51c23bc2c4784510092d901","titulo":"Minecraft 26.3 Pre-Release 3","versao":"26.3-pre-3","tipo":"snapshot","data":"2026-09-08T13:04:44.000Z","imagemUrl":"https://launchercontent.mojang.com/v2/images/26.3pre3540x540.jpg","resumo":"The road to release continues with pre-release 3! Today we're tackling another batch of bug fixes as we prepare for a full release of 26.3.Happy Mining!Technical ChangesThe Data Pack version is now 121.0Number ProvidersChanged minecraft:mod Float Provider "}
];

function corpoNoticia(n) {
  return `<p>${n.resumo.replace(/([a-z])([A-Z])/g, '$1. $2')}</p>
<h2>Novidades</h2>
<ul><li>Novas cavernas de gelo com estalactites e cristais</li><li>Melhorias de desempenho na renderização de pedaços</li><li>O menu de depuração (F3) foi redesenhado</li></ul>
<h2>Correções</h2>
<ul><li>Corrigido um problema em que as nuvens sumiam em distâncias longas</li><li>Corrigido um travamento ao abrir mundos antigos</li><li>A neblina agora respeita a distância de renderização</li></ul>
<p><img src="${n.imagemUrl}" alt=""></p>
<p>Encontrou um bug? Informe em <a href="https://bugs.mojang.com">bugs.mojang.com</a>.</p>`;
}

Object.assign(jg, {
  async listarNoticias() {
    await latencia(260);
    if (cenario === 'erro') return { ok: false, mensagem: 'Sem conexão com a internet.' };
    return { ok: true, noticias: NOTICIAS.map((n) => ({ ...n, corpoHtml: corpoNoticia(n) })) };
  },
});

// ---------- Tarefas e eventos ----------
Object.assign(jg, {
  listarTarefas: async () => [...tarefas.values()].map((t) => ({ ...t })),
  aoTarefas: ouvir('tarefas'),
  aoInstancias: ouvir('instancias'),
  aoJogo: ouvir('jogo'),
  aoLog: ouvir('log'),
});

// ---------- Otimizar instância ----------
const PLANO_MOCK = [
  ['AANobbMI', 'Sodium', 'Renderização muito mais rápida (mais FPS)', 'instalado'],
  ['gvQqBUqZ', 'Lithium', 'Lógica do mundo mais leve, menos travadas', 'instalar'],
  ['uXXizFIs', 'FerriteCore', 'Usa bem menos memória RAM', 'instalar'],
  ['NNAgCjsB', 'Entity Culling', 'Não desenha criaturas escondidas atrás de paredes', 'instalar'],
  ['5ZwdcRci', 'ImmediatelyFast', 'Interface, textos e HUD mais rápidos', 'instalar'],
  ['nmDcB62a', 'ModernFix', 'Abre o jogo mais rápido e corrige vazamentos de memória', 'indisponivel', 'Ainda sem versão para 26.3 com Fabric'],
  ['51shyZVL', 'More Culling', 'Não desenha faces de blocos que ninguém vê', 'instalar'],
  ['LQ3K71Q1', 'Dynamic FPS', 'Baixa o FPS com o jogo minimizado (economiza energia)', 'instalar'],
];
Object.assign(jg, {
  async planoOtimizacao(id) {
    await latencia(500);
    const inst = instancias.find((i) => i.id === id);
    if (!inst || inst.loader.tipo === 'vanilla') return { ok: true, loader: 'vanilla', mc: inst && inst.mc, itens: [] };
    return { ok: true, loader: inst.loader.tipo, mc: inst.mc, itens: PLANO_MOCK.map(([projetoId, nome, papel, estado, motivo]) => ({
      projetoId, nome, papel, estado, motivo: motivo || null, descricao: '', versaoId: estado === 'instalar' ? 'x' : null,
      iconeUrl: `https://cdn.modrinth.com/data/${projetoId}/icon.png`,
    })) };
  },
  async otimizarInstancia(id, ids) { await latencia(800); return { ok: true, instalados: ids, falhas: [], mensagem: `${ids.length} mods instalados.` }; },
});

// ---------- Atualização do launcher ----------
// cenários: atualizacao-pronta, atualizacao-baixando, atualizacao-portatil
let atualizacaoMock = {
  'atualizacao-pronta': { estado: 'pronta', versao: '1.1.0', notas: 'Abertura do jogo mais rápida. Botão "Otimizar instância".' },
  'atualizacao-baixando': { estado: 'baixando', versao: '1.1.0', progresso: 0.42 },
  'atualizacao-portatil': { estado: 'disponivel', versao: '1.1.0', portatil: true, url: 'https://github.com/JhonyGLF/tessera-launcher/releases/latest' },
}[cenario] || { estado: 'atualizado' };
atualizacaoMock = { versaoAtual: '1.0.0', portatil: false, ...atualizacaoMock };
Object.assign(jg, {
  estadoAtualizacaoLauncher: async () => copia(atualizacaoMock),
  async verificarAtualizacaoLauncher() {
    if (atualizacaoMock.estado !== 'atualizado') return copia(atualizacaoMock);
    emitir('atualizacao', { ...atualizacaoMock, estado: 'verificando' });
    await esperar(900);
    emitir('atualizacao', atualizacaoMock);
    return copia(atualizacaoMock);
  },
  instalarAtualizacaoLauncher: async () => ({ ok: true }),
  aoAtualizacaoLauncher: ouvir('atualizacao'),
});

if (cenario === 'tarefas') {
  setTimeout(() => {
    simularTarefa('Instalando Fabulously Optimized', [['Baixando mods', 86, 60000]]);
    simularTarefa('Preparando 26.3', [['Baixando assets', 5147, 50000]]);
    simularTarefa('Instalando Sodium', [['Baixando', 2, 300]], { falhar: 'Sem conexão com cdn.modrinth.com.' });
  }, 200);
}

// ==== instancias ====
const ICONE = (nome) => `app://jg/assets/icones/${nome}.png`;
const ICONE_FO = 'https://cdn.modrinth.com/data/1KVo5zza/d8152911f8fd5d7e9a8c499fe89045af81fe816e_96.webp';

let instancias = cenario === 'vazio' ? [] : [
  { id: 'fabric-otimizado', nome: 'Fabric Otimizado', mc: '1.21.11', loader: { tipo: 'fabric', versao: '0.17.2' }, icone: 'diamante',
    ultimoJogo: agora - 2 * H, tempoJogadoMs: 12 * H + 40 * 60_000, quantidades: { mods: 24, resourcepacks: 1, shaderpacks: 3, mundos: 2 } },
  { id: 'sobrevivencia', nome: 'Sobrevivência', mc: '26.3', loader: { tipo: 'vanilla', versao: null }, icone: 'grama',
    ultimoJogo: agora - 26 * H, tempoJogadoMs: 37 * H + 12 * 60_000, quantidades: { mods: 0, resourcepacks: 2, shaderpacks: 0, mundos: 3 } },
  { id: 'fabulously-optimized', nome: 'Fabulously Optimized', mc: '1.21.10', loader: { tipo: 'fabric', versao: '0.17.2' }, icone: 'personalizado', iconeUrl: ICONE_FO,
    origem: { tipo: 'modrinth', projetoId: '1KVo5zza', versaoId: 'xYz12AbC', nome: 'Fabulously Optimized', iconeUrl: ICONE_FO },
    ultimoJogo: agora - 3 * D, tempoJogadoMs: 5 * H + 5 * 60_000, quantidades: { mods: 78, resourcepacks: 4, shaderpacks: 0, mundos: 1 } },
  { id: 'tecnologia-neoforge', nome: 'Tecnologia NeoForge', mc: '1.21.1', loader: { tipo: 'neoforge', versao: '21.1.209' }, icone: 'ferro',
    ultimoJogo: agora - 5 * D, tempoJogadoMs: 64 * H, quantidades: { mods: 143, resourcepacks: 0, shaderpacks: 1, mundos: 1 } },
  { id: 'pvp-1-8-9', nome: 'PvP 1.8.9', mc: '1.8.9', loader: { tipo: 'vanilla', versao: null }, icone: 'espada',
    ultimoJogo: agora - 12 * D, tempoJogadoMs: 8 * H + 30 * 60_000, quantidades: { mods: 0, resourcepacks: 3, shaderpacks: 0, mundos: 0 } },
  { id: 'criativo-quilt', nome: 'Criativo Quilt', mc: '1.20.1', loader: { tipo: 'quilt', versao: '0.29.1' }, icone: 'ametista',
    ultimoJogo: null, tempoJogadoMs: 0, quantidades: { mods: 6, resourcepacks: 0, shaderpacks: 0, mundos: 0 } },
  { id: 'forge-classico', nome: 'Forge Clássico', mc: '1.12.2', loader: { tipo: 'forge', versao: '14.23.5.2860' }, icone: 'picareta',
    ultimoJogo: agora - 40 * D, tempoJogadoMs: 21 * H, quantidades: { mods: 57, resourcepacks: 1, shaderpacks: 0, mundos: 4 } },
].map((i, n) => ({
  iconeUrl: ICONE(i.icone), criadaEm: agora - (90 - n * 9) * D, ramMB: null, jvmArgs: '', resolucao: null, origem: null, rodando: false, ...i,
}));
if (cenario === 'jogando') instancias[0].rodando = true;

const acharInst = (id) => instancias.find((i) => i.id === id);
const avisarInstancias = () => emitir('instancias', instancias);
const slug = (nome) => (nome || 'instancia').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'instancia';
function idUnico(base) {
  let id = base;
  for (let n = 2; acharInst(id); n++) id = `${base}-${n}`;
  return id;
}

// conteúdo instalado (gerado a partir dos projetos do Modrinth abaixo)
const conteudo = {};
function conteudoDe(id, tipo) {
  const chave = `${id}/${tipo}`;
  if (conteudo[chave]) return conteudo[chave];
  const inst = acharInst(id);
  const qtd = inst ? inst.quantidades[tipo] || 0 : 0;
  const tipoHit = { mods: 'mod', resourcepacks: 'resourcepack', shaderpacks: 'shader' }[tipo];
  const base = HITS.filter((h) => h.tipo === tipoHit);
  const itens = [];
  for (let i = 0; i < Math.min(qtd, base.length); i++) {
    const h = base[i];
    const versao = `${1 + (i % 3)}.${(i * 7) % 10}.${i % 4}`;
    itens.push({
      arquivo: `${h.slug}-${versao}${tipo === 'mods' ? '.jar' : '.zip'}`, ativo: i !== 3, tamanho: 180_000 + i * 97_331,
      nome: h.titulo, versao, autor: h.autor, descricao: h.descricao, iconeUrl: h.iconeUrl, projetoId: h.id, versaoId: `v${i}${h.id.slice(0, 4)}`,
    });
  }
  if (tipo === 'mods' && qtd > base.length) {
    itens.push({ arquivo: 'meu-mod-local-1.0.jar', ativo: true, tamanho: 48_213, nome: 'meu-mod-local-1.0.jar', versao: null, autor: null, descricao: null, iconeUrl: null, projetoId: null, versaoId: null });
  }
  conteudo[chave] = itens;
  return itens;
}

const LOG_EXEMPLO = [
  '[12:04:51] [main/INFO]: Loading Minecraft 1.21.11 with Fabric Loader 0.17.2',
  '[12:04:52] [main/INFO]: Loading 24 mods:',
  '[12:04:52] [main/INFO]: 	- fabric-api 0.139.4+1.21.11',
  '[12:04:52] [main/INFO]: 	- sodium 0.7.2+mc1.21.11',
  '[12:04:52] [main/INFO]: 	- iris 1.9.6+mc1.21.11',
  '[12:04:55] [Render thread/INFO]: Backend library: LWJGL version 3.3.3-snapshot',
  '[12:04:56] [Render thread/WARN]: Missing sound for event: minecraft:item.goat_horn.play',
  '[12:04:58] [Render thread/INFO]: Reloading ResourceManager: vanilla, fabric, sodium, iris',
  '[12:05:01] [Render thread/INFO]: Sound engine started',
  '[12:05:02] [Render thread/ERROR]: Failed to load shader pack "BSL_v9.0.zip": unsupported option',
];

const logs = {};
const timersLog = {};

async function jogarMock(id) {
  const inst = acharInst(id);
  if (!inst) return { ok: false, mensagem: 'Instância não encontrada.' };
  if (!contaAtiva) return { ok: false, mensagem: 'Adicione uma conta para jogar.' };
  if (inst.rodando) return { ok: false, mensagem: 'Essa instância já está aberta.' };
  const r = await simularTarefa(`Preparando ${inst.nome}`, [['Verificando arquivos', 0, 800], ['Baixando bibliotecas', 64, 1500], ['Baixando assets', 3412, 2000]]);
  if (!r.ok) return r;
  emitir('jogo', { id, estado: 'abrindo' });
  logs[id] = [];
  setTimeout(() => {
    inst.rodando = true;
    inst.ultimoJogo = Date.now();
    avisarInstancias();
    emitir('jogo', { id, estado: 'rodando' });
  }, 1500);
  let n = 0;
  timersLog[id] = setInterval(() => {
    const linhas = [LOG_EXEMPLO[n % LOG_EXEMPLO.length]];
    n++;
    logs[id].push(...linhas);
    emitir('log', { id, linhas });
  }, 900);
  return { ok: true };
}

Object.assign(jg, {
  async listarInstancias() { await latencia(80); return copia(instancias); },
  async criarInstancia(dados = {}) {
    await latencia(300);
    const nome = (dados.nome || '').trim();
    if (!nome) return { ok: false, mensagem: 'Dê um nome para a instância.' };
    if (!dados.mc) return { ok: false, mensagem: 'Escolha a versão do Minecraft.' };
    const id = idUnico(slug(nome));
    const icone = dados.icone || 'grama';
    const inst = {
      id, nome, mc: dados.mc, loader: dados.loader || { tipo: 'vanilla', versao: null }, icone, iconeUrl: ICONE(icone),
      criadaEm: Date.now(), ultimoJogo: null, tempoJogadoMs: 0, ramMB: null, jvmArgs: '', resolucao: null, origem: null,
      rodando: false, quantidades: { mods: 0, resourcepacks: 0, shaderpacks: 0, mundos: 0 },
    };
    instancias.unshift(inst);
    avisarInstancias();
    return { ok: true, instancia: copia(inst) };
  },
  async editarInstancia(id, mudancas = {}) {
    await latencia();
    const inst = acharInst(id);
    if (!inst) return { ok: false, mensagem: 'Instância não encontrada.' };
    for (const k of ['nome', 'mc', 'loader', 'ramMB', 'jvmArgs', 'resolucao']) if (k in mudancas) inst[k] = mudancas[k];
    avisarInstancias();
    return { ok: true, instancia: copia(inst) };
  },
  async removerInstancia(id) {
    await latencia(300);
    if (acharInst(id)?.rodando) return { ok: false, mensagem: 'Feche o jogo antes de remover a instância.' };
    instancias = instancias.filter((i) => i.id !== id);
    if (config.instanciaSelecionada === id) config.instanciaSelecionada = null;
    avisarInstancias();
    return { ok: true };
  },
  async duplicarInstancia(id) {
    await latencia(500);
    const orig = acharInst(id);
    if (!orig) return { ok: false, mensagem: 'Instância não encontrada.' };
    const inst = { ...copia(orig), id: idUnico(`${orig.id}-copia`), nome: `${orig.nome} (cópia)`, criadaEm: Date.now(), ultimoJogo: null, tempoJogadoMs: 0, rodando: false };
    instancias.unshift(inst);
    avisarInstancias();
    return { ok: true, instancia: copia(inst) };
  },
  abrirPastaInstancia: async (id, sub) => { console.log('[mock] abrir pasta', id, sub || ''); return ''; },
  async definirIconeInstancia(id, preset) {
    await latencia();
    const inst = acharInst(id);
    if (!inst) return { ok: false, mensagem: 'Instância não encontrada.' };
    if (!preset) return null; // usuário cancelou a escolha do arquivo
    Object.assign(inst, { icone: preset, iconeUrl: ICONE(preset) });
    avisarInstancias();
    return { ok: true, instancia: copia(inst) };
  },
  async listarConteudo(id, tipo) { await latencia(250); return copia(conteudoDe(id, tipo)); },
  async alternarConteudo(id, tipo, arquivo, ativo) {
    await latencia(60);
    const item = conteudoDe(id, tipo).find((c) => c.arquivo === arquivo);
    if (!item) return { ok: false, mensagem: 'Arquivo não encontrado.' };
    item.ativo = !!ativo;
    return { ok: true };
  },
  async removerConteudo(id, tipo, arquivo) {
    await latencia();
    const chave = `${id}/${tipo}`;
    conteudo[chave] = conteudoDe(id, tipo).filter((c) => c.arquivo !== arquivo);
    const inst = acharInst(id);
    if (inst) { inst.quantidades[tipo] = Math.max(0, inst.quantidades[tipo] - 1); avisarInstancias(); }
    return { ok: true };
  },
  importarArquivos: async () => { await latencia(); return { ok: true, adicionados: 0 }; },
  async listarMundos(id) {
    await latencia(200);
    const inst = acharInst(id);
    const nomes = ['Meu Mundo', 'Base no Deserto', 'Ilha do Cogumelo', 'Teste de Redstone'];
    return Array.from({ length: inst ? inst.quantidades.mundos : 0 }, (_, i) => ({
      pasta: nomes[i].replace(/ /g, '_'), nome: nomes[i], ultimoAcesso: agora - (i + 1) * 30 * H, iconeUrl: null, tamanho: 18_400_000 * (i + 1),
    }));
  },
  jogar: jogarMock,
  async parar(id) {
    await latencia(80);
    const inst = acharInst(id);
    if (!inst || !inst.rodando) return { ok: false, mensagem: 'Essa instância não está aberta.' };
    inst.rodando = false;
    inst.tempoJogadoMs += 25 * 60_000;
    clearInterval(timersLog[id]);
    avisarInstancias();
    emitir('jogo', { id, estado: 'fechado', codigo: 0, cedo: false });
    return { ok: true };
  },
  emExecucao: async () => instancias.filter((i) => i.rodando).map((i) => i.id),
  async lerLog(id) { await latencia(); return logs[id] && logs[id].length ? [...logs[id]] : [...LOG_EXEMPLO]; },
  async verificarAtualizacoes(id) {
    await esperar(900);
    const mods = conteudoDe(id, 'mods');
    return {
      ok: true,
      atualizacoes: mods.slice(0, 2).map((m) => ({ tipo: 'mods', arquivo: m.arquivo, nome: m.nome, versaoAtual: m.versao, versaoNova: m.versao.replace(/\d+$/, (x) => String(Number(x) + 1)), versaoId: `nova-${m.projetoId}` })),
    };
  },
  async atualizarConteudo(id, itens = []) {
    return simularTarefa(`Atualizando ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`, [['Baixando', itens.length, 1500]]);
  },
  importarMrpack: async () => { await latencia(); return null; }, // como se o usuário cancelasse
});

if (cenario === 'jogando') logs['fabric-otimizado'] = [...LOG_EXEMPLO];

// ==== explorar ====
const HITS = [
  {"id":"P7dR8mSH","slug":"fabric-api","titulo":"Fabric API","descricao":"Lightweight and modular API providing common hooks and intercompatibility measures utilized by mods using the Fabric toolchain.","autor":"modmuss50","iconeUrl":"https://cdn.modrinth.com/data/P7dR8mSH/icon.png","downloads":274137827,"seguidores":36780,"categorias":["fabric","library"],"versoesMc":["26.3-rc-1","26.3-rc-2","26.3","26.4-snapshot-1","26.4-snapshot-2","26.4-snapshot-3"],"tipo":"mod","atualizado":"2026-10-06T15:49:54Z","imagemUrl":null},
  {"id":"AANobbMI","slug":"sodium","titulo":"Sodium","descricao":"A high-performance rendering engine replacement for Minecraft, which greatly improves frame rates and reduces micro-stutter.","autor":"jellysquid3","iconeUrl":"https://cdn.modrinth.com/data/AANobbMI/295862f4724dc3f78df3447ad6072b2dcd3ef0c9_96.webp","downloads":242342911,"seguidores":41662,"categorias":["fabric","neoforge","optimization","quilt"],"versoesMc":["26.2-rc-1","26.2-rc-2","26.2","26.3-rc-1","26.3-rc-2","26.3"],"tipo":"mod","atualizado":"2026-09-20T21:27:06Z","imagemUrl":null},
  {"id":"YL57xq9U","slug":"iris","titulo":"Iris Shaders","descricao":"A modern shader pack loader for Minecraft intended to be compatible with existing OptiFine shader packs","autor":"coderbot","iconeUrl":"https://cdn.modrinth.com/data/YL57xq9U/18d0e7f076d3d6ed5bedd472b853909aac5da202_96.webp","downloads":187813461,"seguidores":29885,"categorias":["decoration","fabric","neoforge","optimization","quilt"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"mod","atualizado":"2026-09-30T02:58:18Z","imagemUrl":"https://cdn.modrinth.com/data/YL57xq9U/images/f47cea26f135d74c2d69df0a1806751818d705d3_350.webp"},
  {"id":"NNAgCjsB","slug":"entityculling","titulo":"Entity Culling","descricao":"Using async path-tracing to hide Block-/Entities that are not visible","autor":"tr7zw","iconeUrl":"https://cdn.modrinth.com/data/NNAgCjsB/7873452d6cede4daed12da3d7d8c193ab88b4fd6_96.webp","downloads":179256764,"seguidores":17756,"categorias":["babric","fabric","forge","neoforge","optimization","quilt"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"mod","atualizado":"2026-10-08T16:52:20Z","imagemUrl":"https://cdn.modrinth.com/data/NNAgCjsB/images/65781fbd7cda31b8c8e4a8def40bf445c10a1562.gif"},
  {"id":"9s6osm5g","slug":"cloth-config","titulo":"Cloth Config API","descricao":"Configuration Library for Minecraft Mods","autor":"shedaniel","iconeUrl":"https://cdn.modrinth.com/data/9s6osm5g/ed8a2316cbb6f4fc5f510e8e13a59a85cbbbff4d_96.webp","downloads":177381648,"seguidores":16857,"categorias":["fabric","forge","library","neoforge"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"mod","atualizado":"2026-09-23T07:00:50Z","imagemUrl":"https://cdn.modrinth.com/data/9s6osm5g/images/baa0dc605540953f5262f24109ec7837c090a04c.png"},
  {"id":"uXXizFIs","slug":"ferrite-core","titulo":"FerriteCore","descricao":"Memory usage optimizations","autor":"malte0811","iconeUrl":"https://cdn.modrinth.com/data/uXXizFIs/222a126f26f8f9ae1eb339f3b767677f18bff31f_96.webp","downloads":159008772,"seguidores":16553,"categorias":["fabric","forge","neoforge","optimization","quilt","utility"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"mod","atualizado":"2026-03-24T18:31:48Z","imagemUrl":null},
  {"id":"mOgUt4GM","slug":"modmenu","titulo":"Mod Menu","descricao":"Adds a mod menu to view the list of mods you have installed.","autor":"Prospector","iconeUrl":"https://cdn.modrinth.com/data/mOgUt4GM/5a20ed1450a0e1e79a1fe04e61bb4e5878bf1d20.png","downloads":153308516,"seguidores":27543,"categorias":["fabric","quilt","utility"],"versoesMc":["26.2-rc-2","26.2","26.3-snapshot-5","26.3-rc-1","26.3","26.4-snapshot-1"],"tipo":"mod","atualizado":"2026-09-24T20:44:01Z","imagemUrl":"https://cdn.modrinth.com/data/mOgUt4GM/images/70fd54b0579f2de3ac45fa9650aca2ec8ff0882b_350.webp"},
  {"id":"gvQqBUqZ","slug":"lithium","titulo":"Lithium","descricao":"No-compromises game logic optimization mod, useful for both single-player games and multi-player servers.","autor":"jellysquid3","iconeUrl":"https://cdn.modrinth.com/data/gvQqBUqZ/bcc8686c13af0143adf4285d741256af824f70b7_96.webp","downloads":135223888,"seguidores":23842,"categorias":["fabric","neoforge","optimization","quilt"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"mod","atualizado":"2026-09-28T03:43:31Z","imagemUrl":null},
  {"id":"5ZwdcRci","slug":"immediatelyfast","titulo":"ImmediatelyFast","descricao":"Speed up immediate mode rendering in Minecraft","autor":"RaphiMC","iconeUrl":"https://cdn.modrinth.com/data/5ZwdcRci/e57b6b451425692ac17ad322d5e14bea686a383a_96.webp","downloads":130829292,"seguidores":11633,"categorias":["fabric","forge","neoforge","optimization","quilt"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"mod","atualizado":"2026-09-17T16:51:32Z","imagemUrl":null},
  {"id":"1eAoo2KR","slug":"yacl","titulo":"YetAnotherConfigLib (YACL)","descricao":"A builder-based configuration library for Minecraft!","autor":"isxander","iconeUrl":"https://cdn.modrinth.com/data/1eAoo2KR/08c0cd32515e260f4bb20bbc0696510041523f9a_96.webp","downloads":129515748,"seguidores":9726,"categorias":["fabric","forge","library","management","neoforge","quilt","utility"],"versoesMc":["26.2","26.3-snapshot-1","26.3","26.4-snapshot-1","26.4-snapshot-2","26.4-snapshot-3"],"tipo":"mod","atualizado":"2026-10-06T14:42:37Z","imagemUrl":"https://cdn.modrinth.com/data/1eAoo2KR/images/5862570281f5109119c11f21a1bba52b6a2ab17f_350.webp"},
  {"id":"Ha28R6CL","slug":"fabric-language-kotlin","titulo":"Fabric Language Kotlin","descricao":"This is a mod that enables usage of the Kotlin programming language for Fabric mods.","autor":"modmuss50","iconeUrl":"https://cdn.modrinth.com/data/Ha28R6CL/72c3d74aeb665e45aea93a945a01474cbce3b7da_96.webp","downloads":126010783,"seguidores":11227,"categorias":["fabric","library"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"mod","atualizado":"2026-10-09T08:17:11Z","imagemUrl":null},
  {"id":"1bokaNcj","slug":"xaeros-minimap","titulo":"Xaero's Minimap","descricao":"Displays a map of the nearby world terrain, players, mobs, entities in the corner of your screen. Lets you create waypoints which help you find the locations you've marked.","autor":"thexaero","iconeUrl":"https://cdn.modrinth.com/data/1bokaNcj/354080f65407e49f486fcf9c4580e82c45ae63b8_96.webp","downloads":116195205,"seguidores":18721,"categorias":["adventure","fabric","forge","neoforge","quilt","transportation","utility"],"versoesMc":["26.1.1","26.1.2","26.2","26.3-rc-2","26.3-rc-3","26.3"],"tipo":"mod","atualizado":"2026-10-05T07:49:04Z","imagemUrl":null},
  {"id":"1KVo5zza","slug":"fabulously-optimized","titulo":"Fabulously Optimized","descricao":"Beautiful graphics, speedy performance and familiar features in a simple package. Wilderness Bound beta!","autor":"robotkoer","iconeUrl":"https://cdn.modrinth.com/data/1KVo5zza/d8152911f8fd5d7e9a8c499fe89045af81fe816e_96.webp","downloads":18375483,"seguidores":4951,"categorias":["lightweight","multiplayer","optimization"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"modpack","atualizado":"2026-10-11T12:00:33Z","imagemUrl":"https://cdn.modrinth.com/data/1KVo5zza/images/38f70f307f1a0b17d8ed4526d1636317e8c12d1d_350.webp"},
  {"id":"l9m9tuPN","slug":"zombie-invade-100-days","titulo":"Zombie Invade 100 Days","descricao":"Sobreviva a 100 dias de invasão zumbi com armas, bases e muitos desafios.","autor":"FlameFire","iconeUrl":"https://cdn.modrinth.com/data/l9m9tuPN/fefe3f67c37744344d100638452c7bf059d586a1_96.webp","downloads":15008873,"seguidores":649,"categorias":["challenging","combat"],"versoesMc":["1.19.2","1.20.1"],"tipo":"modpack","atualizado":"2025-12-13T12:35:17Z","imagemUrl":null},
  {"id":"5FFgwNNP","slug":"cobblemon-fabric","titulo":"Cobblemon Official Modpack [Fabric]","descricao":"The official modpack of the Cobblemon mod, for Fabric!","autor":"CobbledStudios","iconeUrl":"https://cdn.modrinth.com/data/5FFgwNNP/e7f9ee2e9d361623847853fe2ddce42f519ee64f.png","downloads":11180054,"seguidores":2697,"categorias":["adventure","lightweight","multiplayer"],"versoesMc":["1.20.1","1.21.1"],"tipo":"modpack","atualizado":"2026-10-11T03:18:23Z","imagemUrl":"https://cdn.modrinth.com/data/5FFgwNNP/images/43765359395bb8216a238d18c02a045106d7bad4_350.webp"},
  {"id":"Jkb29YJU","slug":"cobbleverse","titulo":"COBBLEVERSE - Pokemon Adventure [Cobblemon]","descricao":"Start a true Pokémon adventure in Minecraft: Cobblemon 1.7.3 | ALL 1025 Pokémon! | Mega Evolutions | Gyms & Badges | Starter Kit | Unique Structures | Custom Music | Shaders | Optimized | So much more! [1.21.1]","autor":"LUMYVERSE","iconeUrl":"https://cdn.modrinth.com/data/Jkb29YJU/581ecf54530972afb18a04660afd820f2f24f6c7.png","downloads":7044197,"seguidores":2058,"categorias":["adventure","multiplayer","optimization"],"versoesMc":["1.21.1"],"tipo":"modpack","atualizado":"2026-07-21T20:33:21Z","imagemUrl":null},
  {"id":"rQiXwLhB","slug":"battlearmorytacz","titulo":"BattleArmory TACZ","descricao":"Sobreviva a 100 dias de invasão zumbi com armas, bases e muitos desafios.","autor":"JZ_zhenmeng","iconeUrl":"https://cdn.modrinth.com/data/rQiXwLhB/1f8cafea7dcd59dff7dc58cad7a17ae0424847a2_96.webp","downloads":3626555,"seguidores":93,"categorias":["combat","multiplayer"],"versoesMc":["1.20.1"],"tipo":"modpack","atualizado":"2026-08-21T08:52:23Z","imagemUrl":null},
  {"id":"shFhR8Vx","slug":"better-mc-fabric-bmc2","titulo":"Better MC [FABRIC] - BMC2","descricao":"Version 1.20 | A Proper Vanilla+ Modpack | Don't play Vanilla play this!","autor":"SHXRKIE","iconeUrl":"https://cdn.modrinth.com/data/shFhR8Vx/a19c2bcb51d38f32f138d3607e91cb2b7b8e387f_96.webp","downloads":3607423,"seguidores":1469,"categorias":["adventure","combat","optimization"],"versoesMc":["1.20.1"],"tipo":"modpack","atualizado":"2026-07-15T06:31:42Z","imagemUrl":"https://cdn.modrinth.com/data/shFhR8Vx/images/d3df28d6602d05c894c33fac6f6e0e42b5ea7739_350.webp"},
  {"id":"ch7UHY2J","slug":"sodiumplus","titulo":"Sodium Plus","descricao":"A client-side optimization modpack with a few extra tweaks.","autor":"NoSadBeHappy","iconeUrl":"https://cdn.modrinth.com/data/ch7UHY2J/cf0150ba8d6c01144974709a27b23bba93c0fc9e.png","downloads":2809466,"seguidores":633,"categorias":["lightweight","multiplayer","optimization"],"versoesMc":["1.21.5","1.21.8","1.21.10","1.21.11","26.1.2","26.2"],"tipo":"modpack","atualizado":"2026-09-19T00:39:28Z","imagemUrl":null},
  {"id":"1ocGzRHv","slug":"vanilla-perfected","titulo":"Vanilla Perfected","descricao":"A compilation of Vanilla Plus mods & packs to perfect the Minecraft experience without drifting too far from the feel of the base game!","autor":"demonjoeTV","iconeUrl":"https://cdn.modrinth.com/data/1ocGzRHv/ebec737126db7637001194ca5560ae58413d338f_96.webp","downloads":2596696,"seguidores":2532,"categorias":["adventure","lightweight","optimization"],"versoesMc":["1.21.8","1.21.10","1.21.11","26.1.2","26.2","26.3"],"tipo":"modpack","atualizado":"2026-10-08T18:37:49Z","imagemUrl":"https://cdn.modrinth.com/data/1ocGzRHv/images/60856cd3ea67a71b73b8ffa9b706c719836b861d_350.webp"},
  {"id":"50dA9Sha","slug":"fresh-animations","titulo":"Fresh Animations","descricao":"Make your game like the trailers! Dynamic animated entities to freshen your Minecraft experience.","autor":"FreshLX","iconeUrl":"https://cdn.modrinth.com/data/50dA9Sha/3132c10e9e3c73fde9799720fd3da5561071708c_96.webp","downloads":49403654,"seguidores":14468,"categorias":["entities","minecraft","tweaks","vanilla-like"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"resourcepack","atualizado":"2026-04-01T06:43:52Z","imagemUrl":"https://cdn.modrinth.com/data/50dA9Sha/images/c6a5bc8c69dea40a3d6f343390d04f2fc01fb0d6_350.webp"},
  {"id":"yfDziwn1","slug":"translations-for-sodium","titulo":"Translations for Sodium","descricao":"Unofficial translations for the Sodium Minecraft mod","autor":"robotkoer","iconeUrl":"https://cdn.modrinth.com/data/yfDziwn1/907581019df45903df237952ce8d10ac37134cb5_96.webp","downloads":22204771,"seguidores":1625,"categorias":["locale","minecraft","modded","utility"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"resourcepack","atualizado":"2026-10-10T05:19:37Z","imagemUrl":"https://cdn.modrinth.com/data/yfDziwn1/images/41175c3da02a8737e1a474e47ff172e96d550149.png"},
  {"id":"uvpymuxq","slug":"better-leaves","titulo":"Motschen's Better Leaves","descricao":"Improves the appearance of leaves with high mod compatibility and performance!","autor":"Motschen","iconeUrl":"https://cdn.modrinth.com/data/uvpymuxq/fe1a61998ae57dc6ad1a4bb028334c3c3925d22f_96.webp","downloads":20883939,"seguidores":5324,"categorias":["minecraft","models","realistic","vanilla-like"],"versoesMc":["1.21.10","1.21.11","26.1","26.1.1","26.1.2","26.2"],"tipo":"resourcepack","atualizado":"2026-09-14T22:38:36Z","imagemUrl":"https://cdn.modrinth.com/data/uvpymuxq/images/f77ee8c99782e2f5b1754fb8189acf70bb4ed2ca_350.webp"},
  {"id":"tN4E9NfV","slug":"chat-reporting-helper","titulo":"Chat Reporting Helper","descricao":"An educational tool that explains chat reporting in a simple and neutral way.","autor":"robotkoer","iconeUrl":"https://cdn.modrinth.com/data/tN4E9NfV/c2d93fd85469a512f67e53baa7648c1abe6645ef.png","downloads":17320288,"seguidores":282,"categorias":["locale","minecraft","simplistic","vanilla-like"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"resourcepack","atualizado":"2026-09-27T10:01:53Z","imagemUrl":"https://cdn.modrinth.com/data/tN4E9NfV/images/5eb8b8469192851bc4c2095f455f527cb413c12a.png"},
  {"id":"RRxvWKNC","slug":"low-on-fire","titulo":"Low On Fire","descricao":"Low fire on your screen! Vanilla Friendly","autor":"Haikis","iconeUrl":"https://cdn.modrinth.com/data/RRxvWKNC/06a7e7691a6da41798c255108a8563d7ffea171d.png","downloads":16460537,"seguidores":3758,"categorias":["16x","minecraft","tweaks","utility"],"versoesMc":["26.3-pre-2","26.3-pre-3","26.3-rc-1","26.3-rc-2","26.3-rc-3","26.3"],"tipo":"resourcepack","atualizado":"2026-06-19T12:38:40Z","imagemUrl":"https://cdn.modrinth.com/data/RRxvWKNC/images/67e073e6149cfb9dd46c7a53cf9b8a995f774595_350.webp"},
  {"id":"slufHzC2","slug":"tras-fresh-player","titulo":"Fresh Moves","descricao":"This is EMF Player Animation resource pack. Gives fancy animations to the player entity. Compatible with animations from other mods. Like Quark's emotes, Parcool techniques and Not Enough Animations.","autor":"IthanMendoza","iconeUrl":"https://cdn.modrinth.com/data/slufHzC2/02b78db6655ad8dd6cfd847f99c76f7552c053ec_96.webp","downloads":15072092,"seguidores":3949,"categorias":["16x","equipment","minecraft","modded"],"versoesMc":["1.20.6","1.21","1.21.1","1.21.2","1.21.3","1.21.4"],"tipo":"resourcepack","atualizado":"2025-01-20T05:34:53Z","imagemUrl":"https://cdn.modrinth.com/data/slufHzC2/images/7d72ccd7e75f18ab9bf1c804d9020c5ab89c5129_350.webp"},
  {"id":"HVnmMxH1","slug":"complementary-reimagined","titulo":"Complementary Shaders - Reimagined","descricao":"Preserving the elements of Minecraft with exceptional quality, detail, and performance.","autor":"EminGT","iconeUrl":"https://cdn.modrinth.com/data/HVnmMxH1/79cb7c8123bbc54945305b2ebad6b8881efdf5f8_96.webp","downloads":69649139,"seguidores":11133,"categorias":["colored-lighting","iris","optifine","vanilla-like"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"shader","atualizado":"2026-09-15T06:35:37Z","imagemUrl":"https://cdn.modrinth.com/data/HVnmMxH1/images/111e76bfa966c68b3581a93f7322588e642ce4db_350.webp"},
  {"id":"R6NEzAwj","slug":"complementary-unbound","titulo":"Complementary Shaders - Unbound","descricao":"Transforming the visuals of Minecraft with exceptional quality, detail, and performance.","autor":"EminGT","iconeUrl":"https://cdn.modrinth.com/data/R6NEzAwj/c85ce4049aac76360d2cd24fd9a7003de01ef312_96.webp","downloads":45286890,"seguidores":5949,"categorias":["colored-lighting","fantasy","iris","optifine"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"shader","atualizado":"2026-09-15T06:36:15Z","imagemUrl":"https://cdn.modrinth.com/data/R6NEzAwj/images/a5a420ab1668bcfe47a76a812eede7056c45fe31_350.webp"},
  {"id":"Q1vvjJYV","slug":"bsl-shaders","titulo":"BSL Shaders","descricao":"Shaderpack for Minecraft: Java Edition. It's bright, colorful, and distinct.","autor":"CaptTatsu","iconeUrl":"https://cdn.modrinth.com/data/Q1vvjJYV/2a611a3cb434fb52fb81fa5dace13c5d8b67e55d_96.webp","downloads":30591299,"seguidores":6211,"categorias":["bloom","cartoon","iris","low","optifine"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"shader","atualizado":"2026-09-21T12:25:19Z","imagemUrl":"https://cdn.modrinth.com/data/Q1vvjJYV/images/40b899ae09647c98722d67bb2288f790ae28b4fc_350.webp"},
  {"id":"lLqFfGNs","slug":"photon-shader","titulo":"Photon Shaders","descricao":"A gameplay-focused shader pack with a semi-realistic style","autor":"sixthsurge","iconeUrl":"https://cdn.modrinth.com/data/lLqFfGNs/39cb5f12e7dcc68d6cb666f225fcb2b801dd70fb_96.webp","downloads":28148132,"seguidores":4251,"categorias":["atmosphere","colored-lighting","iris","optifine","semi-realistic"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"shader","atualizado":"2026-04-14T20:47:00Z","imagemUrl":"https://cdn.modrinth.com/data/lLqFfGNs/images/a7205115d731077733ab5cdcc639e5531f2dee12_350.webp"},
  {"id":"EpQFjzrQ","slug":"solas-shader","titulo":"Solas Shader","descricao":"A modern fantasy stylized shaderpack with colored lighting and stunning visuals","autor":"Septonious","iconeUrl":"https://cdn.modrinth.com/data/EpQFjzrQ/e3efc6ba7a63f9e1cf473a794d0224a6daf243c7_96.webp","downloads":17845113,"seguidores":3415,"categorias":["colored-lighting","fantasy","iris","optifine","pbr"],"versoesMc":["1.21.10","1.21.11","26.1","26.1.1","26.1.2","26.2"],"tipo":"shader","atualizado":"2026-08-23T09:13:08Z","imagemUrl":"https://cdn.modrinth.com/data/EpQFjzrQ/images/b87a4f77d7858c6b8fb9ecc40301f9d189a52c44_350.webp"},
  {"id":"ZvMtQlho","slug":"bliss-shader","titulo":"Bliss Shaders","descricao":"A well performing fantasy styled shaderpack with emphasis on scene variation and customization.","autor":"Xonk","iconeUrl":"https://cdn.modrinth.com/data/ZvMtQlho/90145c971ea24387775108fc86c89bed9bd2c8f1_96.webp","downloads":15196329,"seguidores":2922,"categorias":["atmosphere","fantasy","iris","medium","optifine"],"versoesMc":["1.21.11","26.1","26.1.1","26.1.2","26.2","26.3"],"tipo":"shader","atualizado":"2025-11-23T03:14:45Z","imagemUrl":"https://cdn.modrinth.com/data/ZvMtQlho/images/7ceb3b0fcd9ccdbd5fc4bdc80ba7ee766509c69f_350.webp"}
];

const CATEGORIAS = {
  mod: [
    ...['adventure', 'cursed', 'decoration', 'economy', 'equipment', 'food', 'game-mechanics', 'library', 'magic', 'management', 'minigame', 'mobs', 'optimization', 'social', 'storage', 'technology', 'transportation', 'utility', 'worldgen'].map((nome) => ({ nome, cabecalho: 'categories' })),
  ],
  modpack: ['adventure', 'challenging', 'combat', 'kitchen-sink', 'lightweight', 'magic', 'multiplayer', 'optimization', 'quests', 'technology'].map((nome) => ({ nome, cabecalho: 'categories' })),
  resourcepack: [
    ...['combat', 'cursed', 'decoration', 'modded', 'realistic', 'simplistic', 'themed', 'tweaks', 'utility', 'vanilla-like'].map((nome) => ({ nome, cabecalho: 'categories' })),
    ...['audio', 'blocks', 'entities', 'environment', 'equipment', 'fonts', 'gui', 'items', 'locale', 'models'].map((nome) => ({ nome, cabecalho: 'features' })),
    ...['8x-', '16x', '32x', '48x', '64x', '128x', '256x', '512x+'].map((nome) => ({ nome, cabecalho: 'resolutions' })),
  ],
  shader: [
    ...['cartoon', 'cursed', 'fantasy', 'realistic', 'semi-realistic', 'vanilla-like'].map((nome) => ({ nome, cabecalho: 'categories' })),
    ...['atmosphere', 'bloom', 'colored-lighting', 'foliage', 'path-tracing', 'pbr', 'reflections', 'shadows'].map((nome) => ({ nome, cabecalho: 'features' })),
    ...['potato', 'low', 'medium', 'high', 'screenshot'].map((nome) => ({ nome, cabecalho: 'performance impact' })),
  ],
};
const LOADERS_CONHECIDOS = ['fabric', 'quilt', 'forge', 'neoforge'];

function corpoProjeto(h) {
  return `<p><strong>${h.titulo}</strong> — ${h.descricao}</p>
${h.imagemUrl ? `<p><img src="${h.imagemUrl}" alt="${h.titulo}"></p>` : ''}
<h2>Recursos</h2>
<ul><li>Compatível com a maioria dos mods populares</li><li>Configurável pelo menu de opções do jogo</li><li>Leve: não altera a jogabilidade do vanilla</li></ul>
<h2>Instalação</h2>
<p>Instale pelo Tessera com um clique. Se for instalar manualmente, coloque o arquivo na pasta <code>mods</code> da instância.</p>
<blockquote>Este projeto é mantido pela comunidade e não é afiliado à Mojang.</blockquote>
<p>Veja o código-fonte e informe problemas no <a href="https://github.com/">GitHub</a>.</p>`;
}

Object.assign(jg, {
  async buscarModrinth({ consulta = '', tipo = 'mod', versaoMc, loader, categorias = [], ordenar = 'relevance', pagina = 0, limite = 20 } = {}) {
    await latencia(250);
    if (cenario === 'erro') return { ok: false, mensagem: 'Não foi possível falar com o Modrinth. Verifique sua internet.' };
    const q = consulta.trim().toLowerCase();
    let hits = HITS.filter((h) => h.tipo === tipo)
      .filter((h) => !q || h.titulo.toLowerCase().includes(q) || h.descricao.toLowerCase().includes(q))
      .filter((h) => !loader || tipo === 'resourcepack' || tipo === 'shader' || h.categorias.includes(loader))
      .filter((h) => !categorias.length || categorias.every((c) => h.categorias.includes(c)));
    if (versaoMc) hits = hits.filter((h) => h.versoesMc.includes(versaoMc) || Math.random() > 0.2);
    const ordem = { downloads: (a, b) => b.downloads - a.downloads, follows: (a, b) => b.seguidores - a.seguidores, newest: (a, b) => b.atualizado.localeCompare(a.atualizado), updated: (a, b) => b.atualizado.localeCompare(a.atualizado) }[ordenar];
    if (ordem) hits = [...hits].sort(ordem);
    return { ok: true, total: hits.length, hits: copia(hits.slice(pagina * limite, (pagina + 1) * limite)) };
  },
  async projetoModrinth(idOuSlug) {
    await latencia(300);
    const h = HITS.find((x) => x.id === idOuSlug || x.slug === idOuSlug);
    if (!h) return { ok: false, mensagem: 'Projeto não encontrado no Modrinth.' };
    const loaders = h.categorias.filter((c) => LOADERS_CONHECIDOS.includes(c));
    return {
      ok: true,
      projeto: {
        ...copia(h), corpoHtml: corpoProjeto(h), categorias: h.categorias.filter((c) => !LOADERS_CONHECIDOS.includes(c)),
        loaders: loaders.length ? loaders : (h.tipo === 'shader' ? ['iris', 'optifine'] : ['minecraft']),
        licenca: 'MIT License',
        links: { fonte: `https://github.com/exemplo/${h.slug}`, wiki: null, discord: 'https://discord.gg/exemplo', issues: `https://github.com/exemplo/${h.slug}/issues`, site: null },
        galeria: h.imagemUrl ? [{ url: h.imagemUrl, titulo: `${h.titulo} em ação` }, { url: h.imagemUrl, titulo: 'Comparação' }] : [],
        publicado: '2021-01-03T00:53:34Z', clienteLado: 'required', servidorLado: h.tipo === 'mod' ? 'optional' : 'unsupported',
      },
    };
  },
  async versoesProjeto(id, { loader, versaoMc } = {}) {
    await latencia(250);
    const h = HITS.find((x) => x.id === id || x.slug === id);
    if (!h) return { ok: false, mensagem: 'Projeto não encontrado no Modrinth.' };
    const loaders = h.categorias.filter((c) => LOADERS_CONHECIDOS.includes(c));
    const mcs = ['26.3', '26.2', '1.21.11', '1.21.10', '1.21.1', '1.20.1'];
    const versoes = mcs.flatMap((mc, i) => [0, 1].map((j) => {
      const numero = `${3 - Math.floor(i / 2)}.${9 - i}.${1 - j}`;
      return {
        id: `${h.id.slice(0, 4)}v${i}${j}`, nome: `${h.titulo} ${numero}`, numero, tipo: j === 1 && i === 0 ? 'beta' : 'release',
        loaders: loaders.length ? loaders : ['minecraft'], versoesMc: [mc], data: new Date(agora - (i * 20 + j * 7) * D).toISOString(),
        downloads: Math.round(h.downloads / (10 + i * 7 + j * 3)), arquivo: { nome: `${h.slug}-${numero}+mc${mc}${h.tipo === 'mod' ? '.jar' : '.zip'}`, tamanho: 1_250_000 + i * 31_000 },
      };
    }));
    return { ok: true, versoes: versoes.filter((v) => (!loader || v.loaders.includes(loader) || v.loaders.includes('minecraft')) && (!versaoMc || v.versoesMc.includes(versaoMc))) };
  },
  async categoriasModrinth(tipo = 'mod') { await latencia(80); return { ok: true, categorias: copia(CATEGORIAS[tipo] || []) }; },
  async instalarModrinth({ projetoId, instanciaId } = {}) {
    const h = HITS.find((x) => x.id === projetoId);
    const inst = acharInst(instanciaId);
    if (!h || !inst) return { ok: false, mensagem: 'Projeto ou instância não encontrados.' };
    const r = await simularTarefa(`Instalando ${h.titulo}`, [['Procurando versão compatível', 0, 600], ['Baixando', h.tipo === 'mod' ? 2 : 1, 1600]]);
    if (r.ok) {
      const tipo = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' }[h.tipo];
      inst.quantidades[tipo] = (inst.quantidades[tipo] || 0) + 1;
      delete conteudo[`${instanciaId}/${tipo}`];
      avisarInstancias();
    }
    return r.ok ? { ok: true, instalados: [h.titulo] } : r;
  },
  async instalarModpack({ projetoId, nome } = {}) {
    const h = HITS.find((x) => x.id === projetoId);
    if (!h) return { ok: false, mensagem: 'Modpack não encontrado.' };
    const r = await simularTarefa(`Instalando ${h.titulo}`, [['Baixando o modpack', 1, 800], ['Baixando mods', 86, 4000], ['Copiando configurações', 0, 600]]);
    if (!r.ok) return r;
    const id = idUnico(slug(nome || h.titulo));
    const inst = {
      id, nome: nome || h.titulo, mc: h.versoesMc[h.versoesMc.length - 1] || '1.21.11', loader: { tipo: 'fabric', versao: '0.17.2' },
      icone: 'personalizado', iconeUrl: h.iconeUrl, criadaEm: Date.now(), ultimoJogo: null, tempoJogadoMs: 0, ramMB: 6144, jvmArgs: '', resolucao: null,
      origem: { tipo: 'modrinth', projetoId: h.id, versaoId: 'ultima', nome: h.titulo, iconeUrl: h.iconeUrl }, rodando: false,
      quantidades: { mods: 86, resourcepacks: 2, shaderpacks: 0, mundos: 0 },
    };
    instancias.unshift(inst);
    avisarInstancias();
    return { ok: true, instancia: copia(inst) };
  },
});
// apelido com o nome usado no preload
jg.versoesModrinth = jg.versoesProjeto;
delete jg.versoesProjeto;

// ==== fim ====
window.jg = jg;
window.jgMock = { cenario, simularTarefa, criarTarefa, emitir };
export default jg;
