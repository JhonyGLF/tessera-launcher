// Instâncias (perfis): cada uma é uma pasta em .tessera\instances\<id> que serve de
// diretório do jogo. Aqui ficam o CRUD, o conteúdo (mods/packs), os mundos, jogar e os logs.
const { app, shell, nativeImage } = require('electron');
const { EventEmitter } = require('events');
const { execFile } = require('child_process');
const { StringDecoder } = require('string_decoder');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const config = require('./config');
const tarefas = require('./tarefas');

// Carregados só quando usados (evita dependência circular com modrinth.js)
const contas = () => require('./contas');
const versoes = () => require('./versoes');
const jogo = () => require('./jogo');

const { RAIZ } = require('./caminhos');
const PASTA = path.join(RAIZ, 'instances');

const eventos = new EventEmitter();

const ICONES = ['grama', 'pedra', 'terra', 'madeira', 'folhas', 'areia', 'neve', 'obsidiana', 'diamante',
  'esmeralda', 'ouro', 'ferro', 'redstone', 'ametista', 'lava', 'agua', 'livro', 'espada', 'picareta', 'maca'];
const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];
const NOME_LOADER = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
const TIPOS = { mods: ['.jar'], resourcepacks: ['.zip'], shaderpacks: ['.zip'] };
const SUBPASTAS = ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'config', 'logs', 'screenshots', 'crash-reports'];
const RESERVADOS = /^(con|prn|aux|nul|com\d|lpt\d)$/;

const ARQUIVO_LOG = 'tessera-launch.log';
const MAX_LINHAS_LOG = 2000;

const pasta = (id, ...p) => path.join(PASTA, id, ...p);
const idValido = (id) => typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id) && fs.existsSync(pasta(id, 'instance.json'));
const erro = (mensagem) => ({ ok: false, mensagem });

function gravarJson(destino, dados) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = `${destino}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, destino);
}

// ---------- Ids e validação ----------
function slug(nome) {
  let s = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  if (!s) s = 'instancia';
  if (RESERVADOS.test(s)) s += '-mc';
  return s;
}

function idUnico(nome) {
  const base = slug(nome);
  let id = base;
  for (let n = 2; fs.existsSync(pasta(id)); n++) id = `${base}-${n}`;
  return id;
}

function validarNome(nome) {
  nome = typeof nome === 'string' ? nome.trim().replace(/\s+/g, ' ') : '';
  if (!nome) throw new Error('Dê um nome para a instância.');
  if (nome.length > 48) throw new Error('O nome pode ter no máximo 48 caracteres.');
  if (/[\x00-\x1f]/.test(nome)) throw new Error('O nome tem caracteres inválidos.');
  return nome;
}

function validarRam(v) {
  if (v === null || v === undefined || v === '') return null;
  if (!Number.isFinite(v)) throw new Error('Quantidade de RAM inválida.');
  return Math.min(config.RAM_MAX, Math.max(config.RAM_MIN, Math.round(v)));
}

function validarJvm(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string' || v.length > 2000) throw new Error('Argumentos da JVM inválidos.');
  return v.replace(/[\r\n]+/g, ' ').trim();
}

function validarResolucao(v) {
  if (!v) return null;
  const largura = Math.round(Number(v.largura));
  const altura = Math.round(Number(v.altura));
  if (!(largura >= 320 && largura <= 7680 && altura >= 240 && altura <= 4320)) {
    throw new Error('Resolução inválida (mínimo 320x240).');
  }
  return { largura, altura };
}

// Confere a versão do Minecraft (aceita uma já instalada se estiver sem internet)
async function validarMc(mc) {
  if (typeof mc !== 'string' || !/^[\w.+-]{1,64}$/.test(mc)) throw new Error('Escolha uma versão do Minecraft.');
  const r = await versoes().listarMc();
  if (r && r.ok) {
    if (!r.versoes.some((v) => v.id === mc)) throw new Error(`A versão ${mc} não existe.`);
  } else if (!fs.existsSync(path.join(RAIZ, 'versions', mc, `${mc}.json`))) {
    throw new Error((r && r.mensagem) || 'Não foi possível consultar as versões do Minecraft.');
  }
  return mc;
}

// Confere o loader; sem versão escolhida usa a estável mais nova
async function validarLoader(loader, mc) {
  const tipo = loader && loader.tipo ? loader.tipo : 'vanilla';
  if (!LOADERS.includes(tipo)) throw new Error('Loader inválido.');
  if (tipo === 'vanilla') return { tipo, versao: null };
  const pedida = loader.versao || null;
  const r = await versoes().listarLoaders(tipo, mc);
  if (!r || !r.ok) throw new Error((r && r.mensagem) || `Não foi possível consultar as versões do ${NOME_LOADER[tipo]}.`);
  if (!r.versoes.length) throw new Error(`O ${NOME_LOADER[tipo]} não tem versão para o ${mc}.`);
  if (pedida) {
    // Forge antigo lista "10.13.4.1614-1.7.10"; modpacks pedem só "10.13.4.1614"
    const achada = r.versoes.find((v) => v.id === pedida) || r.versoes.find((v) => v.id.split('-')[0] === pedida);
    if (!achada) throw new Error(`O ${NOME_LOADER[tipo]} ${pedida} não existe para o ${mc}.`);
    return { tipo, versao: achada.id };
  }
  return { tipo, versao: (r.versoes.find((v) => v.estavel) || r.versoes[0]).id };
}

// ---------- Leitura ----------
const icones = new Map(); // caminho → { mtime, url }
function dataUrlArquivo(arquivo) {
  try {
    const st = fs.statSync(arquivo);
    const c = icones.get(arquivo);
    if (c && c.mtime === st.mtimeMs) return c.url;
    const url = 'data:image/png;base64,' + fs.readFileSync(arquivo).toString('base64');
    icones.set(arquivo, { mtime: st.mtimeMs, url });
    return url;
  } catch {
    return null;
  }
}

function contar(dir, filtro) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(filtro).length;
  } catch {
    return 0;
  }
}

const ehConteudo = (tipo) => (d) => {
  const nome = d.name.replace(/\.disabled$/i, '');
  if (d.isDirectory()) return tipo !== 'mods' && !nome.startsWith('.');
  return TIPOS[tipo].includes(path.extname(nome).toLowerCase());
};

function lerMeta(id) {
  try {
    return JSON.parse(fs.readFileSync(pasta(id, 'instance.json'), 'utf8'));
  } catch {
    return null;
  }
}

function montar(id, m) {
  const icone = m.icone === 'personalizado' || ICONES.includes(m.icone) ? m.icone : 'grama';
  const iconeUrl = icone === 'personalizado'
    ? dataUrlArquivo(pasta(id, 'icon.png')) || 'app://jg/assets/icones/grama.png'
    : `app://jg/assets/icones/${icone}.png`;
  return {
    id,
    nome: m.nome || id,
    mc: m.mc,
    loader: { tipo: (m.loader && m.loader.tipo) || 'vanilla', versao: (m.loader && m.loader.versao) || null },
    icone,
    iconeUrl,
    criadaEm: m.criadaEm || 0,
    ultimoJogo: m.ultimoJogo || null,
    tempoJogadoMs: m.tempoJogadoMs || 0,
    ramMB: m.ramMB || null,
    jvmArgs: m.jvmArgs || '',
    resolucao: m.resolucao || null,
    origem: m.origem || null,
    rodando: execucoes.has(id),
    quantidades: {
      mods: contar(pasta(id, 'mods'), ehConteudo('mods')),
      resourcepacks: contar(pasta(id, 'resourcepacks'), ehConteudo('resourcepacks')),
      shaderpacks: contar(pasta(id, 'shaderpacks'), ehConteudo('shaderpacks')),
      mundos: contar(pasta(id, 'saves'), (d) => d.isDirectory() && fs.existsSync(pasta(id, 'saves', d.name, 'level.dat'))),
    },
  };
}

// Uma instância (null se não existir)
function obter(id) {
  if (!idValido(id)) return null;
  const m = lerMeta(id);
  return m && m.mc ? montar(id, m) : null;
}

function lista() {
  let ids = [];
  try {
    ids = fs.readdirSync(PASTA, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {}
  const todas = ids.map(obter).filter(Boolean);
  if (config.ler().ordemInstancias === 'nome') {
    todas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  } else {
    todas.sort((a, b) => (b.ultimoJogo || 0) - (a.ultimoJogo || 0) || b.criadaEm - a.criadaEm);
  }
  return todas;
}

function avisar() {
  try {
    eventos.emit('instancias', lista());
  } catch {}
}

function atualizarMeta(id, mudancas) {
  const m = lerMeta(id);
  if (!m) return null;
  Object.assign(m, mudancas);
  gravarJson(pasta(id, 'instance.json'), m);
  return m;
}

// ---------- Primeiro uso ----------
// Sem nenhuma instância (e nunca tendo criado): cria "Minecraft <última release>"
let primeiro = null;
function primeiroUso() {
  if (primeiro) return primeiro;
  primeiro = (async () => {
    if (config.interno('instanciaInicialCriada')) return;
    if (lista().length) return config.definirInterno({ instanciaInicialCriada: true });
    const r = await versoes().listarMc();
    if (!r || !r.ok) return; // sem internet: tenta de novo depois
    const res = await criar({ nome: `Minecraft ${r.ultima.release}`, mc: r.ultima.release, loader: { tipo: 'vanilla' }, icone: 'grama' });
    if (!res.ok) return;
    config.definirInterno({ instanciaInicialCriada: true });
    config.salvar({ instanciaSelecionada: res.instancia.id });
    // A primeira versão do launcher (JG Client) jogava direto na raiz: traz mundos e opções para cá
    for (const nome of ['saves', 'resourcepacks', 'shaderpacks', 'screenshots', 'options.txt']) {
      const de = path.join(RAIZ, nome);
      const para = pasta(res.instancia.id, nome);
      try {
        if (!fs.existsSync(de)) continue;
        if (fs.existsSync(para) && fs.readdirSync(para).length) continue;
        fs.rmSync(para, { recursive: true, force: true });
        fs.renameSync(de, para);
      } catch {}
    }
    avisar();
  })().catch(() => {}).finally(() => {
    if (!config.interno('instanciaInicialCriada')) primeiro = null;
  });
  return primeiro;
}

async function listar() {
  await Promise.race([primeiroUso(), new Promise((r) => setTimeout(r, 15000))]);
  return lista();
}

// ---------- CRUD ----------
async function criar(dados = {}) {
  try {
    const nome = validarNome(dados.nome);
    const mc = await validarMc(dados.mc);
    const loader = await validarLoader(dados.loader, mc);
    const icone = ICONES.includes(dados.icone) ? dados.icone : 'grama';
    const id = idUnico(nome);
    const meta = {
      nome, mc, loader, icone,
      criadaEm: Date.now(),
      ultimoJogo: null,
      tempoJogadoMs: 0,
      ramMB: validarRam(dados.ramMB),
      jvmArgs: validarJvm(dados.jvmArgs),
      resolucao: validarResolucao(dados.resolucao),
      origem: dados.origem && typeof dados.origem === 'object' ? dados.origem : null,
    };
    for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'saves']) fs.mkdirSync(pasta(id, sub), { recursive: true });
    gravarJson(pasta(id, 'instance.json'), meta);
    avisar();
    return { ok: true, instancia: obter(id) };
  } catch (e) {
    return erro(e.message || 'Não foi possível criar a instância.');
  }
}

async function editar(id, mudancas = {}) {
  try {
    const m = lerMeta(id);
    if (!idValido(id) || !m) return erro('Instância não encontrada.');
    const novo = {};
    if ('nome' in mudancas) novo.nome = validarNome(mudancas.nome);
    if ('mc' in mudancas || 'loader' in mudancas) {
      novo.mc = 'mc' in mudancas && mudancas.mc !== m.mc ? await validarMc(mudancas.mc) : m.mc;
      const loader = 'loader' in mudancas ? mudancas.loader : m.loader;
      const mesmo = novo.mc === m.mc && loader && m.loader && loader.tipo === m.loader.tipo && loader.versao === m.loader.versao;
      novo.loader = mesmo ? m.loader : await validarLoader(loader, novo.mc);
    }
    if ('ramMB' in mudancas) novo.ramMB = validarRam(mudancas.ramMB);
    if ('jvmArgs' in mudancas) novo.jvmArgs = validarJvm(mudancas.jvmArgs);
    if ('resolucao' in mudancas) novo.resolucao = validarResolucao(mudancas.resolucao);
    if ('icone' in mudancas && ICONES.includes(mudancas.icone)) novo.icone = mudancas.icone;
    atualizarMeta(id, novo);
    avisar();
    return { ok: true, instancia: obter(id) };
  } catch (e) {
    return erro(e.message || 'Não foi possível salvar.');
  }
}

async function remover(id) {
  if (!idValido(id)) return erro('Instância não encontrada.');
  if (execucoes.has(id)) return erro('Feche o jogo antes de excluir esta instância.');
  try {
    fs.rmSync(pasta(id), { recursive: true, force: true, maxRetries: 3 });
  } catch {
    return erro('Não foi possível excluir: algum arquivo está em uso.');
  }
  if (config.ler().instanciaSelecionada === id) config.salvar({ instanciaSelecionada: null });
  avisar();
  return { ok: true };
}

async function duplicar(id) {
  const m = lerMeta(id);
  if (!idValido(id) || !m) return erro('Instância não encontrada.');
  try {
    const nome = validarNome(`${m.nome} (cópia)`.slice(0, 48));
    const novoId = idUnico(nome);
    const origem = pasta(id);
    fs.cpSync(origem, pasta(novoId), {
      recursive: true,
      filter: (de) => {
        const rel = path.relative(origem, de).toLowerCase();
        return !['logs', 'crash-reports'].includes(rel.split(path.sep)[0]) && !rel.endsWith('session.lock');
      },
    });
    // o cpSync do Node 20 ainda cria as pastas filtradas (vazias)
    for (const sub of ['logs', 'crash-reports']) fs.rmSync(pasta(novoId, sub), { recursive: true, force: true });
    atualizarMeta(novoId, { nome, criadaEm: Date.now(), ultimoJogo: null, tempoJogadoMs: 0 });
    avisar();
    return { ok: true, instancia: obter(novoId) };
  } catch {
    return erro('Não foi possível duplicar a instância.');
  }
}

async function abrirPasta(id, sub) {
  if (!idValido(id)) return erro('Instância não encontrada.');
  let alvo = pasta(id);
  if (sub) {
    const partes = String(sub).split(/[\\/]+/).filter(Boolean);
    if (!SUBPASTAS.includes(partes[0]) || partes.some((p) => p === '..' || p === '.' || /[:*?"<>|\x00-\x1f]/.test(p))) {
      return erro('Pasta inválida.');
    }
    alvo = pasta(id, ...partes);
    if (!alvo.startsWith(pasta(id) + path.sep)) return erro('Pasta inválida.');
    if (partes.length === 1) fs.mkdirSync(alvo, { recursive: true });
  }
  // shell.openPath também abre (e o Windows executa) arquivos: aqui só pastas
  let st;
  try { st = fs.statSync(alvo); } catch { return erro('Não foi possível abrir a pasta.'); }
  if (!st.isDirectory()) return erro('Pasta inválida.');
  const falha = await shell.openPath(alvo);
  return falha ? erro('Não foi possível abrir a pasta.') : { ok: true };
}

// ---------- Ícone ----------
// Redimensiona para 128x128 (corta no centro; imagens pequenas são ampliadas sem borrar)
function normalizarIcone(img) {
  const { width: w, height: h } = img.getSize();
  const lado = Math.min(w, h);
  let quadrada = w === h ? img : img.crop({ x: Math.floor((w - lado) / 2), y: Math.floor((h - lado) / 2), width: lado, height: lado });
  if (lado >= 128) return quadrada.resize({ width: 128, height: 128, quality: 'best' });
  // ampliação "pixel a pixel" (vizinho mais próximo), boa para pixel art
  const origem = quadrada.toBitmap();
  const destino = Buffer.alloc(128 * 128 * 4);
  for (let y = 0; y < 128; y++) {
    const oy = Math.floor((y * lado) / 128);
    for (let x = 0; x < 128; x++) {
      const ox = Math.floor((x * lado) / 128);
      origem.copy(destino, (y * 128 + x) * 4, (oy * lado + ox) * 4, (oy * lado + ox) * 4 + 4);
    }
  }
  return nativeImage.createFromBitmap(destino, { width: 128, height: 128 });
}

async function definirIcone(id, { preset, arquivo } = {}) {
  if (!idValido(id)) return erro('Instância não encontrada.');
  if (preset) {
    if (!ICONES.includes(preset)) return erro('Ícone inválido.');
    fs.rmSync(pasta(id, 'icon.png'), { force: true });
    atualizarMeta(id, { icone: preset });
  } else {
    if (typeof arquivo !== 'string' || !fs.existsSync(arquivo)) return erro('Arquivo não encontrado.');
    let img = nativeImage.createFromPath(arquivo);
    // GIF/WebP: o próprio Windows gera a miniatura
    if (img.isEmpty() && ['.gif', '.webp', '.bmp'].includes(path.extname(arquivo).toLowerCase())) {
      try {
        img = await nativeImage.createThumbnailFromPath(arquivo, { width: 256, height: 256 });
      } catch {}
    }
    if (!img || img.isEmpty()) return erro('Não foi possível ler essa imagem. Use PNG ou JPG.');
    fs.writeFileSync(pasta(id, 'icon.png'), normalizarIcone(img).toPNG());
    atualizarMeta(id, { icone: 'personalizado' });
  }
  avisar();
  return { ok: true, instancia: obter(id) };
}

// ---------- Conteúdo (mods, resource packs, shaders) ----------
const metaCache = new Map(); // caminho → { chave, sha1, meta }

// Texto de componente do Minecraft (string, objeto ou lista) → texto simples
function textoComponente(c) {
  if (c == null) return '';
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.map(textoComponente).join('');
  return (c.text || c.translate || '') + (c.extra ? textoComponente(c.extra) : '');
}
const limparTexto = (s) => (s ? String(s).replace(/§./g, '').replace(/\r/g, '').trim() || null : null);

// TOML mínimo (mods.toml do Forge/NeoForge): chaves do topo e do primeiro [[mods]]
function lerToml(texto) {
  const topo = {};
  const mod = {};
  let secao = topo;
  let modsVistos = 0;
  const linhas = texto.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const cab = linha.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?/);
    if (cab) {
      secao = cab[1] === 'mods' && /^\s*\[\[/.test(linha) && ++modsVistos === 1 ? mod : null;
      continue;
    }
    const kv = linha.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)$/);
    if (!kv || !secao) continue;
    let valor = kv[2];
    const tripla = valor.match(/^("""|''')/);
    if (tripla) {
      const fim = tripla[1];
      let resto = valor.slice(3);
      while (!resto.includes(fim) && i + 1 < linhas.length) resto += '\n' + linhas[++i];
      valor = resto.slice(0, resto.indexOf(fim)).replace(/^\n/, '');
    } else if (valor.startsWith('"')) {
      const m = valor.match(/^"((?:[^"\\]|\\.)*)"/);
      try { valor = m ? JSON.parse(`"${m[1]}"`) : ''; } catch { valor = m ? m[1] : ''; }
    } else if (valor.startsWith("'")) {
      valor = valor.slice(1, valor.indexOf("'", 1));
    } else {
      valor = valor.replace(/#.*$/, '').trim();
    }
    secao[kv[1]] = valor;
  }
  return { ...topo, ...mod };
}

// Abre um "zip" que pode ser arquivo ou pasta (resource pack descompactado)
function abrirPacote(caminho) {
  if (fs.statSync(caminho).isDirectory()) {
    return {
      ler: (nome) => {
        const alvo = path.join(caminho, nome);
        return alvo.startsWith(caminho + path.sep) && fs.existsSync(alvo) ? fs.readFileSync(alvo) : null;
      },
    };
  }
  const zip = new AdmZip(caminho);
  return {
    ler: (nome, limite = 4 * 1048576) => {
      const e = zip.getEntry(nome.replace(/^\/+/, ''));
      return e && !e.isDirectory && e.header.size <= limite ? e.getData() : null;
    },
  };
}

function iconeDoPacote(pacote, nome) {
  if (!nome || typeof nome !== 'string') return null;
  const dados = pacote.ler(nome, 256 * 1024);
  if (!dados || dados.length < 8) return null;
  const tipo = dados[0] === 0x89 && dados[1] === 0x50 ? 'png' : dados[0] === 0xff && dados[1] === 0xd8 ? 'jpeg' : null;
  return tipo ? `data:image/${tipo};base64,${dados.toString('base64')}` : null;
}

const autores = (lista) => {
  const nomes = (Array.isArray(lista) ? lista : [lista]).map((a) => (a && typeof a === 'object' ? a.name : a)).filter((a) => typeof a === 'string' && a.trim());
  return nomes.length ? nomes.join(', ') : null;
};

// Metadados lidos de dentro do arquivo
function metadados(caminho, tipo) {
  const vazio = { nome: null, versao: null, autor: null, descricao: null, iconeUrl: null };
  let pacote;
  try {
    pacote = abrirPacote(caminho);
  } catch {
    return vazio;
  }
  const json = (nome) => {
    const dados = pacote.ler(nome);
    if (!dados) return null;
    try { return JSON.parse(dados.toString('utf8').replace(/^﻿/, '')); } catch { return undefined; }
  };

  if (tipo !== 'mods') {
    const mcmeta = json('pack.mcmeta');
    return {
      ...vazio,
      descricao: limparTexto(mcmeta && mcmeta.pack ? textoComponente(mcmeta.pack.description) : null),
      iconeUrl: iconeDoPacote(pacote, 'pack.png'),
    };
  }

  // Fabric
  const fabric = json('fabric.mod.json');
  if (fabric) {
    let icone = fabric.icon;
    if (icone && typeof icone === 'object') {
      const tamanhos = Object.keys(icone).map(Number).sort((a, b) => a - b);
      icone = icone[tamanhos.find((t) => t >= 64) || tamanhos[tamanhos.length - 1]];
    }
    return {
      nome: fabric.name || fabric.id || null,
      versao: fabric.version || null,
      autor: autores(fabric.authors),
      descricao: limparTexto(fabric.description),
      iconeUrl: iconeDoPacote(pacote, icone),
    };
  }
  // Quilt
  const quilt = json('quilt.mod.json');
  if (quilt && quilt.quilt_loader) {
    const q = quilt.quilt_loader;
    const md = q.metadata || {};
    let icone = md.icon;
    if (icone && typeof icone === 'object') icone = Object.values(icone).pop();
    return {
      nome: md.name || q.id || null,
      versao: q.version || null,
      autor: md.contributors ? Object.keys(md.contributors).join(', ') || null : null,
      descricao: limparTexto(md.description),
      iconeUrl: iconeDoPacote(pacote, icone),
    };
  }
  // Forge / NeoForge
  const toml = pacote.ler('META-INF/neoforge.mods.toml') || pacote.ler('META-INF/mods.toml');
  if (toml) {
    const t = lerToml(toml.toString('utf8'));
    let versao = t.version || null;
    if (versao && versao.includes('${')) {
      const manifesto = pacote.ler('META-INF/MANIFEST.MF');
      const m = manifesto && manifesto.toString('utf8').match(/^Implementation-Version:\s*(.+)$/m);
      versao = m ? m[1].trim() : null;
    }
    return {
      nome: t.displayName || t.modId || null,
      versao,
      autor: t.authors || null,
      descricao: limparTexto(t.description),
      iconeUrl: iconeDoPacote(pacote, t.logoFile),
    };
  }
  // Forge antigo (mcmod.info)
  let info = json('mcmod.info');
  if (info && !Array.isArray(info)) info = info.modList;
  if (Array.isArray(info) && info[0]) {
    const i = info[0];
    return {
      nome: i.name || i.modid || null,
      versao: i.version && !i.version.includes('${') ? i.version : null,
      autor: autores(i.authorList || i.authors),
      descricao: limparTexto(i.description),
      iconeUrl: iconeDoPacote(pacote, i.logoFile),
    };
  }
  return vazio;
}

function sha1Arquivo(caminho) {
  return crypto.createHash('sha1').update(fs.readFileSync(caminho)).digest('hex');
}

function validarTipo(tipo) {
  if (!TIPOS[tipo]) throw new Error('Tipo de conteúdo inválido.');
}

// Nome de arquivo vindo da interface: só o nome, sem caminho
function validarArquivo(arquivo) {
  if (typeof arquivo !== 'string') throw new Error('Arquivo inválido.');
  const nome = arquivo.replace(/\.disabled$/i, '');
  if (!nome || nome !== path.basename(nome) || nome === '.' || nome === '..' || /[\\/:*?"<>|\x00-\x1f]/.test(nome)) {
    throw new Error('Arquivo inválido.');
  }
  return nome;
}

async function listarConteudo(id, tipo) {
  if (!idValido(id) || !TIPOS[tipo]) return [];
  const dir = pasta(id, tipo);
  let entradas = [];
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true }).filter(ehConteudo(tipo));
  } catch {
    return [];
  }

  const itens = [];
  for (const d of entradas) {
    const caminho = path.join(dir, d.name);
    const ativo = !/\.disabled$/i.test(d.name);
    const arquivo = d.name.replace(/\.disabled$/i, '');
    let st;
    try { st = fs.statSync(caminho); } catch { continue; }
    const chave = `${st.size}:${st.mtimeMs}`;
    let c = metaCache.get(caminho);
    if (!c || c.chave !== chave) {
      let sha1 = null;
      try { if (st.isFile()) sha1 = sha1Arquivo(caminho); } catch {}
      c = { chave, sha1, meta: metadados(caminho, tipo) };
      metaCache.set(caminho, c);
    }
    itens.push({ caminho, arquivo, ativo, tamanho: st.isFile() ? st.size : null, sha1: c.sha1, meta: c.meta });
  }

  // Enriquece com o Modrinth (por hash). Sem internet ou sem modrinth.js: segue só com o local.
  let doModrinth = null;
  try {
    const modrinth = require('./modrinth');
    const caminhos = itens.filter((i) => i.sha1).map((i) => i.caminho);
    if (caminhos.length && typeof modrinth.hashes === 'function') {
      doModrinth = await Promise.race([modrinth.hashes(caminhos), new Promise((r) => setTimeout(() => r(null), 10000))]);
    }
  } catch {}
  const buscar = (h) => (!doModrinth || !h ? null : doModrinth instanceof Map ? doModrinth.get(h) : doModrinth[h]) || null;

  const saida = itens.map((i) => {
    const mr = buscar(i.sha1) || {};
    return {
      arquivo: i.arquivo,
      ativo: i.ativo,
      tamanho: i.tamanho,
      nome: mr.nome || i.meta.nome || i.arquivo.replace(/\.(jar|zip)$/i, ''),
      versao: mr.versao || i.meta.versao || null,
      autor: mr.autor || i.meta.autor || null,
      descricao: mr.descricao || i.meta.descricao || null,
      iconeUrl: mr.iconeUrl || i.meta.iconeUrl || null,
      projetoId: mr.projetoId || null,
      versaoId: mr.versaoId || null,
    };
  });
  saida.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
  return saida;
}

const emUso = (e) => ['EBUSY', 'EPERM', 'EACCES'].includes(e && e.code);

async function alternarConteudo(id, tipo, arquivo, ativo) {
  try {
    if (!idValido(id)) return erro('Instância não encontrada.');
    validarTipo(tipo);
    const nome = validarArquivo(arquivo);
    const ligado = pasta(id, tipo, nome);
    const desligado = `${ligado}.disabled`;
    const [de, para] = ativo ? [desligado, ligado] : [ligado, desligado];
    if (!fs.existsSync(de)) {
      if (fs.existsSync(para)) return { ok: true }; // já está assim
      return erro('Arquivo não encontrado.');
    }
    fs.renameSync(de, para);
    avisar();
    return { ok: true };
  } catch (e) {
    return erro(emUso(e) ? 'O arquivo está em uso. Feche o jogo e tente de novo.' : e.message);
  }
}

async function removerConteudo(id, tipo, arquivo) {
  try {
    if (!idValido(id)) return erro('Instância não encontrada.');
    validarTipo(tipo);
    const nome = validarArquivo(arquivo);
    const alvos = [pasta(id, tipo, nome), pasta(id, tipo, `${nome}.disabled`)].filter((a) => fs.existsSync(a));
    if (!alvos.length) return erro('Arquivo não encontrado.');
    for (const a of alvos) fs.rmSync(a, { recursive: true, force: true });
    avisar();
    return { ok: true };
  } catch (e) {
    return erro(emUso(e) ? 'O arquivo está em uso. Feche o jogo e tente de novo.' : e.message);
  }
}

// Copia arquivos escolhidos pelo usuário para a pasta do tipo (só .jar para mods, .zip para packs)
async function importarArquivos(id, tipo, arquivos) {
  try {
    if (!idValido(id)) return erro('Instância não encontrada.');
    validarTipo(tipo);
    if (!Array.isArray(arquivos)) return erro('Nenhum arquivo.');
    const dir = pasta(id, tipo);
    fs.mkdirSync(dir, { recursive: true });
    let adicionados = 0;
    const recusados = [];
    for (const origem of arquivos) {
      const nome = typeof origem === 'string' ? path.basename(origem) : '';
      try {
        if (!path.isAbsolute(origem) || !TIPOS[tipo].includes(path.extname(nome).toLowerCase())) throw 0;
        const st = fs.statSync(origem);
        if (!st.isFile()) throw 0;
        // tem que ser um zip de verdade (jar também é zip)
        const fd = fs.openSync(origem, 'r');
        const cab = Buffer.alloc(2);
        fs.readSync(fd, cab, 0, 2, 0);
        fs.closeSync(fd);
        if (cab.toString('latin1') !== 'PK') throw 0;
        validarArquivo(nome);
        fs.rmSync(path.join(dir, `${nome}.disabled`), { force: true });
        fs.copyFileSync(origem, path.join(dir, nome));
        adicionados++;
      } catch {
        recusados.push(nome || String(origem));
      }
    }
    if (adicionados) avisar();
    if (!adicionados && recusados.length) {
      return erro(tipo === 'mods' ? 'Nenhum arquivo válido: mods precisam ser .jar.' : 'Nenhum arquivo válido: use arquivos .zip.');
    }
    return { ok: true, adicionados, recusados };
  } catch (e) {
    return erro(e.message);
  }
}

// ---------- Mundos ----------
// Leitor NBT mínimo (formato dos arquivos de mundo do Minecraft, big-endian)
function lerNbt(buf) {
  let p = 0;
  const str = () => { const n = buf.readUInt16BE(p); p += 2; const s = buf.toString('utf8', p, p + n); p += n; return s; };
  const payload = (tipo) => {
    switch (tipo) {
      case 1: return buf.readInt8(p++);
      case 2: p += 2; return buf.readInt16BE(p - 2);
      case 3: p += 4; return buf.readInt32BE(p - 4);
      case 4: p += 8; return Number(buf.readBigInt64BE(p - 8));
      case 5: p += 4; return buf.readFloatBE(p - 4);
      case 6: p += 8; return buf.readDoubleBE(p - 8);
      case 7: { const n = buf.readInt32BE(p); p += 4 + n; return null; }
      case 8: return str();
      case 9: {
        const t = buf.readInt8(p++);
        const n = buf.readInt32BE(p); p += 4;
        const lista = [];
        for (let i = 0; i < n; i++) lista.push(payload(t));
        return lista;
      }
      case 10: {
        const obj = {};
        for (;;) {
          const t = buf.readInt8(p++);
          if (t === 0) return obj;
          const nome = str();
          obj[nome] = payload(t);
        }
      }
      case 11: { const n = buf.readInt32BE(p); p += 4 + n * 4; return null; }
      case 12: { const n = buf.readInt32BE(p); p += 4 + n * 8; return null; }
      default: throw new Error('NBT inválido');
    }
  };
  const tipo = buf.readInt8(p++);
  if (tipo !== 10) throw new Error('NBT inválido');
  str();
  return payload(10);
}

function tamanhoPasta(dir, limite = { arquivos: 20000 }) {
  let total = 0;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (--limite.arquivos < 0) throw new Error('grande demais');
    const c = path.join(dir, d.name);
    if (d.isDirectory()) total += tamanhoPasta(c, limite);
    else if (d.isFile()) total += fs.statSync(c).size;
  }
  return total;
}

async function listarMundos(id) {
  if (!idValido(id)) return [];
  const saves = pasta(id, 'saves');
  let dirs = [];
  try {
    dirs = fs.readdirSync(saves, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  const mundos = [];
  for (const d of dirs) {
    const dir = path.join(saves, d.name);
    const levelDat = path.join(dir, 'level.dat');
    if (!fs.existsSync(levelDat)) continue;
    let nome = d.name;
    let ultimoAcesso = null;
    try {
      const raiz = lerNbt(zlib.gunzipSync(fs.readFileSync(levelDat)));
      const dados = raiz.Data || {};
      if (typeof dados.LevelName === 'string' && dados.LevelName.trim()) nome = dados.LevelName;
      if (typeof dados.LastPlayed === 'number' && dados.LastPlayed > 0) ultimoAcesso = dados.LastPlayed;
    } catch {}
    if (!ultimoAcesso) {
      try { ultimoAcesso = fs.statSync(levelDat).mtimeMs; } catch {}
    }
    let tamanho = null;
    try { tamanho = tamanhoPasta(dir); } catch {}
    mundos.push({
      pasta: d.name,
      nome: limparTexto(nome) || d.name,
      ultimoAcesso: ultimoAcesso ? Math.round(ultimoAcesso) : null,
      iconeUrl: fs.existsSync(path.join(dir, 'icon.png')) ? dataUrlArquivo(path.join(dir, 'icon.png')) : null,
      tamanho,
    });
  }
  mundos.sort((a, b) => (b.ultimoAcesso || 0) - (a.ultimoAcesso || 0));
  return mundos;
}

// ---------- Logs ----------
// O stdout do jogo pode vir no formato XML do log4j (config de log oficial): vira texto comum.
const desescapar = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const cdata = (bloco, tag) => {
  const m = bloco.match(new RegExp(`<log4j:${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</log4j:${tag}>`));
  return m ? (m[1] !== undefined ? m[1] : desescapar(m[2] || '')) : '';
};
const hora = (ms) => {
  const d = new Date(Number(ms) || Date.now());
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
};

function eventoParaLinhas(bloco) {
  const attr = (n) => { const m = bloco.match(new RegExp(`${n}="([^"]*)"`)); return m ? desescapar(m[1]) : ''; };
  const prefixo = `[${hora(attr('timestamp'))}] [${attr('thread')}/${attr('level')}]: `;
  const msg = cdata(bloco, 'Message').replace(/\r/g, '').replace(/\n+$/, '').split('\n');
  const erroTxt = cdata(bloco, 'Throwable').replace(/\r/g, '').replace(/\n+$/, '');
  return [prefixo + msg[0], ...msg.slice(1), ...(erroTxt ? erroTxt.split('\n') : [])];
}

// Converte o texto acumulado: devolve as linhas completas e o que sobrou (incompleto)
function converterLog(texto, fim = false) {
  const linhas = [];
  let resto = texto;
  for (;;) {
    const ini = resto.indexOf('<log4j:Event');
    const antes = ini < 0 ? resto : resto.slice(0, ini);
    if (ini < 0) {
      // texto comum: só linhas terminadas (a última pode estar pela metade)
      const partes = antes.split(/\r?\n/);
      resto = fim ? '' : partes.pop();
      linhas.push(...partes.filter((l) => l.trim()));
      if (fim && resto) linhas.push(resto);
      break;
    }
    linhas.push(...antes.split(/\r?\n/).filter((l) => l.trim()));
    const fecha = resto.indexOf('</log4j:Event>', ini);
    if (fecha < 0) {
      resto = resto.slice(ini);
      if (fim || resto.length > 1048576) { linhas.push(...resto.split(/\r?\n/).filter((l) => l.trim())); resto = ''; }
      break;
    }
    linhas.push(...eventoParaLinhas(resto.slice(ini, fecha)));
    resto = resto.slice(fecha + '</log4j:Event>'.length);
  }
  return { linhas, resto };
}

function arquivoLog(id) {
  const lancamento = pasta(id, 'logs', ARQUIVO_LOG);
  if (fs.existsSync(lancamento)) return lancamento;
  const ultimo = pasta(id, 'logs', 'latest.log');
  return fs.existsSync(ultimo) ? ultimo : null;
}

async function lerLog(id) {
  if (!idValido(id)) return [];
  const arquivo = arquivoLog(id);
  if (!arquivo) return [];
  try {
    const tamanho = fs.statSync(arquivo).size;
    const ler = Math.min(tamanho, 4 * 1048576);
    const fd = fs.openSync(arquivo, 'r');
    const buf = Buffer.alloc(ler);
    fs.readSync(fd, buf, 0, ler, tamanho - ler);
    fs.closeSync(fd);
    let texto = buf.toString('utf8');
    if (ler < tamanho) texto = texto.slice(texto.indexOf('\n') + 1); // começa numa linha inteira
    return converterLog(texto, true).linhas.slice(-MAX_LINHAS_LOG);
  } catch {
    return [];
  }
}

// Acompanha o arquivo de log do jogo aberto e emite as linhas novas a cada ~500 ms
function acompanharLog(id, exec) {
  const arquivo = pasta(id, 'logs', ARQUIVO_LOG);
  const estado = { posicao: 0, decoder: new StringDecoder('utf8'), resto: '' };
  const ler = (fim = false) => {
    let texto = '';
    try {
      const tamanho = fs.statSync(arquivo).size;
      if (tamanho < estado.posicao) estado.posicao = 0; // arquivo recriado
      if (tamanho > estado.posicao) {
        const fd = fs.openSync(arquivo, 'r');
        const buf = Buffer.alloc(Math.min(tamanho - estado.posicao, 8 * 1048576));
        const lidos = fs.readSync(fd, buf, 0, buf.length, estado.posicao);
        fs.closeSync(fd);
        estado.posicao += lidos;
        texto = estado.decoder.write(buf.subarray(0, lidos));
      }
    } catch {}
    if (fim) texto += estado.decoder.end();
    if (!texto && !(fim && estado.resto)) return;
    const { linhas, resto } = converterLog(estado.resto + texto, fim);
    estado.resto = resto;
    if (linhas.length) eventos.emit('log', { id, linhas });
  };
  exec.timerLog = setInterval(ler, 500);
  exec.pararLog = () => {
    clearInterval(exec.timerLog);
    ler(true);
  };
}

// ---------- Jogar ----------
const execucoes = new Map(); // id → { estado, processo, inicio, parado, cancelar }

function emitirJogo(dados) {
  eventos.emit('jogo', dados);
}

async function jogar(id) {
  const meta = lerMeta(id);
  if (!idValido(id) || !meta) return erro('Instância não encontrada.');
  if (execucoes.has(id)) return erro('Essa instância já está aberta.');

  const exec = { estado: 'abrindo', processo: null, inicio: 0, parado: false, cancelar: false };
  execucoes.set(id, exec);
  emitirJogo({ id, estado: 'abrindo' });
  avisar();

  const cfg = config.ler();
  const gameDir = pasta(id);
  const r = await tarefas.executar(`Abrindo ${meta.nome}`, async (t) => {
    const progresso = (p) => t.atualizar(p);
    t.atualizar({ etapa: 'Verificando a conta...' });
    const sessao = await contas().sessao();
    if (exec.cancelar) return { mensagem: 'Cancelado.', cancelado: true };

    const loader = meta.loader || { tipo: 'vanilla', versao: null };
    t.atualizar({ etapa: 'Preparando a versão...' });
    const versaoId = await versoes().garantirLoader({ tipo: loader.tipo, mc: meta.mc, versao: loader.versao }, progresso);
    if (exec.cancelar) return { mensagem: 'Cancelado.', cancelado: true };

    const inst = await jogo().instalar(versaoId, progresso, { javaPersonalizado: cfg.javaPersonalizado });
    if (exec.cancelar) return { mensagem: 'Cancelado.', cancelado: true };

    t.atualizar({ etapa: 'Iniciando o jogo...' });
    for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'logs']) fs.mkdirSync(pasta(id, sub), { recursive: true });
    exec.processo = jogo().iniciar(inst, sessao, {
      ramMB: meta.ramMB || cfg.ramMB,
      gameDir,
      jvmArgs: meta.jvmArgs || '',
      resolucao: meta.resolucao || null,
      javaPersonalizado: cfg.javaPersonalizado,
    });
    return { mensagem: 'Jogo aberto!' };
  });

  if (!r.ok || r.cancelado || !exec.processo) {
    execucoes.delete(id);
    emitirJogo({ id, estado: 'fechado' });
    avisar();
    return r.ok ? { ok: true, cancelado: true } : erro(r.mensagem);
  }

  exec.estado = 'rodando';
  exec.inicio = Date.now();
  atualizarMeta(id, { ultimoJogo: exec.inicio });
  acompanharLog(id, exec);

  let encerrado = false;
  const encerrar = (codigo) => {
    if (encerrado) return;
    encerrado = true;
    exec.pararLog();
    const duracao = Date.now() - exec.inicio;
    const m = lerMeta(id);
    if (m) atualizarMeta(id, { tempoJogadoMs: (m.tempoJogadoMs || 0) + duracao });
    execucoes.delete(id);
    const cedo = !exec.parado && codigo !== 0 && duracao < 15000;
    emitirJogo({ id, estado: 'fechado', codigo: codigo == null ? null : codigo, cedo });
    avisar();
  };
  exec.processo.on('exit', (codigo) => encerrar(codigo));
  exec.processo.on('error', () => encerrar(-1));

  emitirJogo({ id, estado: 'rodando' });
  avisar();
  return { ok: true };
}

async function parar(id) {
  const exec = execucoes.get(id);
  if (!exec) return erro('Essa instância não está aberta.');
  if (exec.estado === 'abrindo') {
    exec.cancelar = true; // para assim que a etapa atual terminar
    return { ok: true };
  }
  exec.parado = true;
  const pid = exec.processo && exec.processo.pid;
  if (!pid) return erro('Não foi possível fechar o jogo.');
  await new Promise((resolve) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, (falha) => {
      if (falha) try { exec.processo.kill(); } catch {}
      resolve();
    });
  });
  return { ok: true };
}

function emExecucao() {
  return [...execucoes.entries()].map(([id, e]) => ({ id, estado: e.estado, desde: e.inicio || null }));
}

module.exports = {
  eventos, ICONES, LOADERS, PASTA,
  listar, obter, criar, editar, remover, duplicar, abrirPasta, definirIcone,
  listarConteudo, alternarConteudo, removerConteudo, importarArquivos,
  listarMundos, jogar, parar, emExecucao, lerLog,
  pasta, avisar, recarregar: avisar,
  // usados nos testes
  lerNbt, converterLog, lerToml, metadados,
};
