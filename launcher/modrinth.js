// Biblioteca do Modrinth: busca, página do projeto, instalação de mods/resource packs/shaders
// (com dependências), modpacks .mrpack e verificação de atualizações.
// API: https://docs.modrinth.com/api/ (v2). Limite de 300 requisições/min: usamos chamadas
// em lote (/projects?ids=, /teams?ids=) e cache em memória e em disco.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
const { RAIZ } = require('./jogo');
const { baixar, emLote } = require('./download');
const tarefas = require('./tarefas');

const API = 'https://api.modrinth.com/v2';
const VERSAO_APP = (() => {
  try { return require('../package.json').version; } catch { return '0.0.0'; }
})();
const UA = `Tessera-Launcher/${VERSAO_APP}`;

// Pasta de cada tipo de projeto dentro da instância
const PASTA_TIPO = { mod: 'mods', resourcepack: 'resourcepacks', shader: 'shaderpacks' };
const TIPO_PASTA = { mods: 'mod', resourcepacks: 'resourcepack', shaderpacks: 'shader' };
const LOADERS_MOD = ['fabric', 'quilt', 'forge', 'neoforge'];
const LOADERS_SHADER = ['iris', 'optifine', 'canvas', 'vanilla'];
// Únicos domínios de onde um .mrpack pode baixar arquivos (regra da especificação)
const DOMINIOS_MRPACK = ['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com'];

// instancias.js é escrito à parte e também usa este módulo: carregar só quando precisar
function instanciasMod() {
  try { return require('./instancias'); } catch { return null; }
}

// ---------- Requisições ----------
const cacheMem = new Map(); // url → { ate, dados }

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(caminho, { metodo = 'GET', corpo, cacheMs = 0 } = {}) {
  const url = caminho.startsWith('http') ? caminho : API + caminho;
  const chave = metodo === 'GET' ? url : null;
  const guardado = chave && cacheMem.get(chave);
  if (guardado && guardado.ate > Date.now()) return guardado.dados;

  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    let resp;
    try {
      resp = await fetch(url, {
        method: metodo,
        headers: { 'User-Agent': UA, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(20000),
      });
    } catch (erro) {
      ultimoErro = new Error('Sem conexão com o Modrinth.');
      await esperar(500 * tentativa);
      continue;
    }
    if (resp.status === 429) {
      // passou do limite: espera o tempo que a API pede (no máximo 10 s)
      const reset = Number(resp.headers.get('x-ratelimit-reset')) || 2;
      ultimoErro = new Error('O Modrinth pediu para esperar um pouco. Tente de novo.');
      await esperar(Math.min(reset, 10) * 1000);
      continue;
    }
    if (resp.status === 404) {
      const erro = new Error('Não encontrado no Modrinth.');
      erro.status = 404;
      throw erro;
    }
    if (!resp.ok) {
      ultimoErro = new Error(`O Modrinth respondeu com erro (${resp.status}).`);
      if (resp.status < 500) break;
      await esperar(500 * tentativa);
      continue;
    }
    const dados = await resp.json();
    if (chave && cacheMs) cacheMem.set(chave, { ate: Date.now() + cacheMs, dados });
    return dados;
  }
  throw ultimoErro;
}

const q = (v) => encodeURIComponent(JSON.stringify(v));
const pedacos = (lista, n) => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));
const falha = (erro) => ({ ok: false, mensagem: (erro && erro.message) || 'Algo deu errado.' });

// ---------- HTML seguro (markdown do Modrinth e notas do Minecraft) ----------
// base: origem para transformar caminhos relativos ("/img.png") em absolutos.
function limparHtml(html, base) {
  const absoluto = (url) => {
    if (!url) return url;
    if (base && url.startsWith('/') && !url.startsWith('//')) return base + url;
    return url;
  };
  return sanitizeHtml(html || '', {
    allowedTags: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'hr', 'div', 'span', 'center',
      'a', 'img', 'b', 'strong', 'i', 'em', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup', 'kbd',
      'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'code', 'pre',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'details', 'summary',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      td: ['colspan', 'rowspan', 'align'],
      th: ['colspan', 'rowspan', 'align'],
      details: ['open'],
      '*': ['align'],
    },
    allowedSchemes: ['https'],
    allowedSchemesByTag: { img: ['https'] },
    allowProtocolRelative: false,
    transformTags: {
      // links só para https (abrem fora do launcher); o resto vira texto
      a: (tag, attribs) => {
        const href = absoluto(attribs.href);
        if (!/^https:\/\//i.test(href || '')) return { tagName: 'span', attribs: {} };
        return { tagName: 'a', attribs: { ...attribs, href, target: '_blank', rel: 'noopener noreferrer' } };
      },
      img: (tag, attribs) => {
        const src = absoluto(attribs.src);
        return { tagName: 'img', attribs: /^https:\/\//i.test(src || '') ? { ...attribs, src } : {} };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs.src,
  });
}

// ---------- Busca ----------
const ORDENS = ['relevance', 'downloads', 'follows', 'newest', 'updated'];

async function buscar(filtros = {}) {
  try {
    const { consulta = '', tipo = 'mod', versaoMc, loader, categorias = [], ordenar = 'relevance' } = filtros;
    const limite = Math.max(1, Math.min(100, Number(filtros.limite) || 20));
    const pagina = Math.max(0, Number(filtros.pagina) || 0);
    if (!PASTA_TIPO[tipo] && tipo !== 'modpack') throw new Error('Tipo de conteúdo inválido.');

    const facets = [[`project_type:${tipo}`]];
    if (versaoMc) facets.push([`versions:${versaoMc}`]);
    if (loader && loader !== 'vanilla' && (tipo === 'mod' || tipo === 'modpack')) {
      // mods de Fabric costumam funcionar no Quilt
      facets.push(loader === 'quilt' && tipo === 'mod' ? ['categories:quilt', 'categories:fabric'] : [`categories:${loader}`]);
    }
    for (const c of [].concat(categorias || [])) if (c) facets.push([`categories:${c}`]);

    const params = new URLSearchParams({
      query: String(consulta || ''),
      facets: JSON.stringify(facets),
      index: ORDENS.includes(ordenar) ? ordenar : 'relevance',
      offset: String(pagina * limite),
      limit: String(limite),
    });
    const r = await api(`/search?${params}`, { cacheMs: 2 * 60 * 1000 });
    const loadersConhecidos = new Set([...LOADERS_MOD, ...LOADERS_SHADER, 'minecraft', 'datapack']);
    return {
      ok: true,
      total: r.total_hits,
      hits: r.hits.map((h) => ({
        id: h.project_id,
        slug: h.slug,
        titulo: h.title,
        descricao: h.description,
        autor: h.author,
        iconeUrl: h.icon_url || null,
        downloads: h.downloads,
        seguidores: h.follows,
        categorias: (h.display_categories || h.categories || []).filter((c) => !loadersConhecidos.has(c)),
        loaders: (h.categories || []).filter((c) => loadersConhecidos.has(c)),
        versoesMc: h.versions || [],
        tipo: h.project_type,
        atualizado: h.date_modified,
        imagemUrl: h.featured_gallery || (h.gallery && h.gallery[0]) || null,
      })),
    };
  } catch (erro) {
    return falha(erro);
  }
}

// ---------- Projeto ----------
const projetoBruto = (id) => api(`/project/${encodeURIComponent(id)}`, { cacheMs: 5 * 60 * 1000 });

async function autorDoProjeto(p) {
  try {
    const membros = await api(`/team/${p.team}/members`, { cacheMs: 30 * 60 * 1000 });
    const dono = membros.find((m) => m.role === 'Owner');
    if (dono) return dono.user.username;
    if (p.organization) {
      // projetos de organização não têm "Owner" no time: usa o nome da organização
      try {
        const org = await api(`https://api.modrinth.com/v3/organization/${p.organization}`, { cacheMs: 30 * 60 * 1000 });
        if (org && org.name) return org.name;
      } catch { /* segue com o primeiro membro */ }
    }
    return membros[0] ? membros[0].user.username : null;
  } catch {
    return null;
  }
}

async function projeto(idOuSlug) {
  try {
    if (!idOuSlug || typeof idOuSlug !== 'string') throw new Error('Projeto inválido.');
    const p = await projetoBruto(idOuSlug);
    const galeria = [...(p.gallery || [])]
      .sort((a, b) => (b.featured - a.featured) || (a.ordering - b.ordering) || String(a.created).localeCompare(String(b.created)))
      .map((g) => ({ url: g.url, titulo: g.title || null, descricao: g.description || null }));
    return {
      ok: true,
      projeto: {
        id: p.id,
        slug: p.slug,
        titulo: p.title,
        descricao: p.description,
        corpoHtml: limparHtml(marked.parse(p.body || '')),
        iconeUrl: p.icon_url || null,
        autor: await autorDoProjeto(p),
        downloads: p.downloads,
        seguidores: p.followers,
        categorias: [...(p.categories || []), ...(p.additional_categories || [])],
        loaders: p.loaders || [],
        versoesMc: p.game_versions || [],
        tipo: p.project_type,
        licenca: p.license ? (p.license.name || p.license.id) : null,
        links: {
          fonte: p.source_url || null,
          wiki: p.wiki_url || null,
          discord: p.discord_url || null,
          issues: p.issues_url || null,
          site: `https://modrinth.com/${p.project_type}/${p.slug}`,
        },
        galeria,
        atualizado: p.updated,
        publicado: p.published,
        clienteLado: p.client_side,
        servidorLado: p.server_side,
      },
    };
  } catch (erro) {
    return falha(erro);
  }
}

// ---------- Versões ----------
function arquivoPrincipal(v) {
  return (v.files || []).find((f) => f.primary) || (v.files || [])[0] || null;
}

function formatarVersao(v) {
  const a = arquivoPrincipal(v);
  return {
    id: v.id,
    nome: v.name,
    numero: v.version_number,
    tipo: v.version_type,
    loaders: v.loaders,
    versoesMc: v.game_versions,
    data: v.date_published,
    downloads: v.downloads,
    arquivo: a ? { nome: a.filename, tamanho: a.size } : null,
  };
}

// Loaders aceitos para um tipo de projeto numa instância (null = não filtrar)
function loadersAceitos(tipoProjeto, loader) {
  if (tipoProjeto === 'resourcepack' || tipoProjeto === 'shader') return null;
  if (!loader || loader === 'vanilla') return null;
  return loader === 'quilt' && tipoProjeto === 'mod' ? ['quilt', 'fabric'] : [loader];
}

async function listarVersoesBrutas(id, { loaders, versaoMc } = {}) {
  const params = ['include_changelog=false'];
  if (loaders) params.push(`loaders=${q(loaders)}`);
  if (versaoMc) params.push(`game_versions=${q([versaoMc])}`);
  return api(`/project/${encodeURIComponent(id)}/version?${params.join('&')}`, { cacheMs: 3 * 60 * 1000 });
}

async function versoesProjeto(id, filtros = {}) {
  try {
    if (!id || typeof id !== 'string') throw new Error('Projeto inválido.');
    const p = await projetoBruto(id);
    const lista = await listarVersoesBrutas(p.id, {
      loaders: loadersAceitos(p.project_type, filtros.loader),
      versaoMc: filtros.versaoMc,
    });
    return { ok: true, versoes: lista.map(formatarVersao) };
  } catch (erro) {
    return falha(erro);
  }
}

// Melhor versão: a release mais nova; se não houver, a mais nova de qualquer tipo
const melhorVersao = (lista) => lista.find((v) => v.version_type === 'release') || lista[0] || null;

// ---------- Categorias ----------
const NOMES_CATEGORIA = {
  adventure: 'Aventura', cursed: 'Bizarro', decoration: 'Decoração', economy: 'Economia',
  equipment: 'Equipamentos', food: 'Comida', 'game-mechanics': 'Mecânicas de jogo', library: 'Biblioteca',
  magic: 'Magia', management: 'Gerenciamento', minigame: 'Minijogos', mobs: 'Criaturas',
  optimization: 'Otimização', social: 'Social', storage: 'Armazenamento', technology: 'Tecnologia',
  transportation: 'Transporte', utility: 'Utilidade', worldgen: 'Geração de mundo',
  challenging: 'Desafiador', combat: 'Combate', 'kitchen-sink': 'Completo', lightweight: 'Leve',
  multiplayer: 'Multijogador', quests: 'Missões',
  modded: 'Para mods', realistic: 'Realista', simplistic: 'Simples', themed: 'Temático', tweaks: 'Ajustes',
  'vanilla-like': 'Estilo vanilla', cartoon: 'Cartunesco', fantasy: 'Fantasia', 'semi-realistic': 'Semirrealista',
  atmosphere: 'Atmosfera', bloom: 'Brilho (bloom)', 'colored-lighting': 'Luz colorida', foliage: 'Folhagem',
  'path-tracing': 'Path tracing', pbr: 'PBR', reflections: 'Reflexos', shadows: 'Sombras',
  audio: 'Sons', blocks: 'Blocos', 'core-shaders': 'Core shaders', entities: 'Entidades', environment: 'Ambiente',
  fonts: 'Fontes', gui: 'Interface', items: 'Itens', locale: 'Idioma', models: 'Modelos',
  high: 'Alto', low: 'Baixo', medium: 'Médio', potato: 'Batata (PC fraco)', screenshot: 'Para screenshots',
  '8x-': '8x ou menos', '512x+': '512x ou mais',
};
const NOMES_CABECALHO = {
  categories: 'Categorias', features: 'Recursos', resolutions: 'Resolução', 'performance impact': 'Impacto no desempenho',
};

async function categorias(tipo) {
  try {
    const todas = await api('/tag/category', { cacheMs: 24 * 60 * 60 * 1000 });
    return {
      ok: true,
      categorias: todas
        .filter((c) => c.project_type === tipo)
        .map((c) => ({
          nome: c.name,
          rotulo: NOMES_CATEGORIA[c.name] || c.name.charAt(0).toUpperCase() + c.name.slice(1).replace(/-/g, ' '),
          cabecalho: c.header,
          cabecalhoRotulo: NOMES_CABECALHO[c.header] || c.header,
        }))
        .sort((a, b) => a.cabecalho.localeCompare(b.cabecalho) || a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    };
  } catch (erro) {
    return falha(erro);
  }
}

// ---------- Hashes (identificar arquivos instalados) ----------
const ARQ_CACHE = () => path.join(RAIZ, 'cache', 'modrinth-hashes.json');
const DESCONHECIDO_MS = 24 * 60 * 60 * 1000; // arquivo fora do Modrinth: pergunta de novo depois de 1 dia
const sha1Mem = new Map(); // "caminho|tamanho|mtime" → sha1
let cacheDisco = null;

function lerCacheDisco() {
  if (!cacheDisco) {
    try { cacheDisco = JSON.parse(fs.readFileSync(ARQ_CACHE(), 'utf8')); } catch { cacheDisco = {}; }
  }
  return cacheDisco;
}

function salvarCacheDisco() {
  try {
    fs.mkdirSync(path.dirname(ARQ_CACHE()), { recursive: true });
    const tmp = `${ARQ_CACHE()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(cacheDisco));
    fs.renameSync(tmp, ARQ_CACHE());
  } catch { /* cache é opcional */ }
}

async function sha1Arquivo(caminho) {
  const st = await fs.promises.stat(caminho);
  const chave = `${caminho}|${st.size}|${st.mtimeMs}`;
  if (sha1Mem.has(chave)) return sha1Mem.get(chave);
  const hash = crypto.createHash('sha1').update(await fs.promises.readFile(caminho)).digest('hex');
  sha1Mem.set(chave, hash);
  return hash;
}

// Consulta o Modrinth para hashes ainda não conhecidos e grava no cache em disco
async function identificar(listaSha1) {
  const cache = lerCacheDisco();
  const agora = Date.now();
  const faltam = [...new Set(listaSha1)].filter((h) => {
    const c = cache[h];
    return !c || (c.desconhecido && agora - c.em > DESCONHECIDO_MS);
  });
  if (!faltam.length) return cache;

  const versoes = {};
  for (const lote of pedacos(faltam, 200)) {
    Object.assign(versoes, await api('/version_files', { metodo: 'POST', corpo: { hashes: lote, algorithm: 'sha1' } }));
  }
  const idsProjetos = [...new Set(Object.values(versoes).map((v) => v.project_id))];
  const projetos = {};
  for (const lote of pedacos(idsProjetos, 100)) {
    for (const p of await api(`/projects?ids=${q(lote)}`)) projetos[p.id] = p;
  }
  const idsTimes = [...new Set(Object.values(projetos).map((p) => p.team))];
  const donos = {};    // time → usuário com papel "Owner"
  const primeiros = {}; // time → primeiro membro (reserva)
  for (const lote of pedacos(idsTimes, 100)) {
    for (const membros of await api(`/teams?ids=${q(lote)}`)) {
      if (!membros.length) continue;
      const dono = membros.find((m) => m.role === 'Owner');
      if (dono) donos[membros[0].team_id] = dono.user.username;
      primeiros[membros[0].team_id] = [...membros].sort((a, b) => a.ordering - b.ordering)[0].user.username;
    }
  }
  // projetos de organização não têm "Owner" no time: usa o nome da organização (API v3, em lote)
  const orgs = {};
  const idsOrgs = [...new Set(Object.values(projetos).filter((p) => p.organization && !donos[p.team]).map((p) => p.organization))];
  for (const lote of pedacos(idsOrgs, 100)) {
    try {
      for (const o of await api(`https://api.modrinth.com/v3/organizations?ids=${q(lote)}`)) orgs[o.id] = o.name;
    } catch { /* fica com o primeiro membro */ }
  }
  const autores = {};
  for (const p of Object.values(projetos)) autores[p.team] = donos[p.team] || orgs[p.organization] || primeiros[p.team] || null;
  for (const h of faltam) {
    const v = versoes[h];
    const p = v && projetos[v.project_id];
    cache[h] = p
      ? {
          projetoId: p.id, versaoId: v.id, nome: p.title, versao: v.version_number,
          autor: autores[p.team] || null, descricao: p.description, iconeUrl: p.icon_url || null,
          tipo: p.project_type, slug: p.slug,
        }
      : { desconhecido: true, em: agora };
  }
  salvarCacheDisco();
  return cache;
}

// hashes(caminhos) → Map sha1 → info. Por conveniência o mesmo Map também tem a chave
// do próprio caminho (map.get(caminho)). Arquivos não identificados ficam de fora.
async function hashes(caminhos = []) {
  const resultado = new Map();
  const porCaminho = [];
  for (const caminho of caminhos) {
    try { porCaminho.push([caminho, await sha1Arquivo(caminho)]); } catch { /* arquivo sumiu */ }
  }
  let cache;
  try {
    cache = await identificar(porCaminho.map(([, h]) => h));
  } catch {
    cache = lerCacheDisco(); // sem internet: só o que já está no cache
  }
  for (const [caminho, h] of porCaminho) {
    const info = cache[h];
    if (!info || info.desconhecido) continue;
    const { tipo, slug, ...publico } = info;
    resultado.set(h, publico);
    resultado.set(caminho, publico);
  }
  return resultado;
}

// ---------- Instâncias (leitura direta do instance.json) ----------
const PASTA_INSTANCIAS = () => path.join(RAIZ, 'instances');

function pastaInstancia(id) {
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(id) || id.includes('..')) {
    throw new Error('Instância inválida.');
  }
  return path.join(PASTA_INSTANCIAS(), id);
}

function lerInstancia(id) {
  const pasta = pastaInstancia(id);
  try {
    return { pasta, dados: JSON.parse(fs.readFileSync(path.join(pasta, 'instance.json'), 'utf8')) };
  } catch {
    throw new Error('Instância não encontrada.');
  }
}

// Avisa a interface que as instâncias mudaram (contagem de mods, modpack novo...)
async function notificar() {
  const inst = instanciasMod();
  if (!inst) return;
  try {
    if (typeof inst.recarregar === 'function') await inst.recarregar();
    else if (inst.eventos && typeof inst.listar === 'function') inst.eventos.emit('instancias', await inst.listar());
  } catch { /* só aviso */ }
}

// Nome de arquivo simples (sem pastas) — vale para nomes vindos da API ou da interface
function nomeSeguro(nome) {
  if (typeof nome !== 'string' || !nome || nome !== path.basename(nome) || /[\\/:*?"<>|\0]/.test(nome) || nome === '.' || nome === '..') {
    throw new Error('Nome de arquivo inválido.');
  }
  return nome;
}

function urlPermitida(url, dominios) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && dominios.includes(u.hostname);
  } catch {
    return false;
  }
}

function apagar(caminho) {
  try { fs.rmSync(caminho, { force: true }); } catch { /* ignora */ }
}

// Arquivos de uma pasta de conteúdo: [{ arquivo (sem .disabled), caminho, ativo }]
function arquivosDaPasta(pasta) {
  try {
    return fs.readdirSync(pasta, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.endsWith('.part'))
      .map((e) => ({
        arquivo: e.name.replace(/\.disabled$/, ''),
        caminho: path.join(pasta, e.name),
        ativo: !e.name.endsWith('.disabled'),
      }));
  } catch {
    return [];
  }
}

// ---------- Instalar mod / resource pack / shader ----------
async function instalarProjeto({ projetoId, versaoId, instanciaId } = {}) {
  let titulo = 'conteúdo';
  try {
    if (!projetoId) throw new Error('Projeto inválido.');
    const { dados: inst } = lerInstancia(instanciaId);
    const p = await projetoBruto(projetoId);
    titulo = p.title;
    if (p.project_type === 'modpack') throw new Error('Modpacks são instalados como uma instância nova.');
    if (!PASTA_TIPO[p.project_type]) throw new Error('Esse tipo de conteúdo não é suportado (datapacks entram na pasta do mundo).');
    const loader = (inst.loader && inst.loader.tipo) || 'vanilla';
    if (p.project_type === 'mod' && loader === 'vanilla') {
      throw new Error('Mods precisam de uma instância com Fabric, Quilt, Forge ou NeoForge.');
    }
  } catch (erro) {
    return falha(erro);
  }

  return tarefas.executar(`Instalando ${titulo}`, async (t) => {
    const { pasta, dados: inst } = lerInstancia(instanciaId);
    const mc = inst.mc;
    const loader = (inst.loader && inst.loader.tipo) || 'vanilla';
    const instalados = [];
    const visitados = new Set();

    // projetos já presentes em cada pasta (por hash → projeto)
    const presentes = {};
    const projetosNaPasta = async (sub) => {
      if (!presentes[sub]) {
        const arquivos = arquivosDaPasta(path.join(pasta, sub));
        const mapa = await hashes(arquivos.map((a) => a.caminho));
        presentes[sub] = arquivos.map((a) => ({ ...a, info: mapa.get(a.caminho) || null }));
      }
      return presentes[sub];
    };

    const instalarUm = async (idProjeto, idVersao, principal) => {
      const proj = await projetoBruto(idProjeto);
      if (visitados.has(proj.id)) return;
      visitados.add(proj.id);
      const sub = PASTA_TIPO[proj.project_type];
      if (!sub) {
        if (principal) throw new Error('Esse tipo de conteúdo não é suportado.');
        return; // dependência de tipo estranho (ex.: datapack): ignora
      }
      const existentes = await projetosNaPasta(sub);
      const doProjeto = existentes.filter((e) => e.info && e.info.projetoId === proj.id);
      if (!principal && doProjeto.length) return; // dependência já instalada

      t.atualizar({ etapa: `Procurando versão de ${proj.title}` });
      let versao;
      if (idVersao) {
        versao = await api(`/version/${encodeURIComponent(idVersao)}`, { cacheMs: 5 * 60 * 1000 });
        if (versao.project_id !== proj.id) throw new Error('Versão não pertence a esse projeto.');
      } else {
        const lista = await listarVersoesBrutas(proj.id, { loaders: loadersAceitos(proj.project_type, loader), versaoMc: mc });
        versao = melhorVersao(lista);
        if (!versao) throw new Error(`${proj.title} não tem versão para ${mc}${loadersAceitos(proj.project_type, loader) ? ` com ${loader}` : ''}.`);
      }
      const arq = arquivoPrincipal(versao);
      if (!arq) throw new Error(`${proj.title} não tem arquivo para baixar.`);
      const nome = nomeSeguro(arq.filename);
      if (!urlPermitida(arq.url, DOMINIOS_MRPACK)) throw new Error(`Endereço de download não permitido para ${proj.title}.`);

      const destino = path.join(pasta, sub, nome);
      const jaIgual = doProjeto.find((e) => e.info.versaoId === versao.id && e.ativo);
      if (!jaIgual) {
        t.atualizar({ etapa: `Baixando ${proj.title}` });
        apagar(`${destino}.disabled`); // havia o mesmo arquivo desativado: substitui
        await baixar(arq.url, destino, { size: arq.size, sha1: arq.hashes && arq.hashes.sha1 });
        // remove a versão antiga do mesmo projeto
        for (const antigo of doProjeto) {
          if (antigo.caminho !== destino) apagar(antigo.caminho);
        }
        existentes.push({ arquivo: nome, caminho: destino, ativo: true, info: { projetoId: proj.id, versaoId: versao.id } });
        instalados.push(proj.title);
      }

      // dependências obrigatórias
      for (const dep of versao.dependencies || []) {
        if (dep.dependency_type !== 'required') continue;
        let depProjeto = dep.project_id;
        if (!depProjeto && dep.version_id) {
          depProjeto = (await api(`/version/${dep.version_id}`, { cacheMs: 5 * 60 * 1000 })).project_id;
        }
        if (!depProjeto) continue;
        // a versão fixada pela dependência só vale se for compatível; senão escolhe a melhor
        let depVersao = null;
        if (dep.version_id) {
          const v = await api(`/version/${dep.version_id}`, { cacheMs: 5 * 60 * 1000 });
          const aceitos = loadersAceitos('mod', loader);
          if (v.game_versions.includes(mc) && (!aceitos || v.loaders.some((l) => aceitos.includes(l)))) depVersao = v.id;
        }
        await instalarUm(depProjeto, depVersao, false);
      }
    };

    await instalarUm(projetoId, versaoId || null, true);
    await notificar();
    return {
      instalados,
      mensagem: instalados.length ? `Instalado: ${instalados.join(', ')}` : 'Já estava instalado.',
    };
  });
}

// ---------- Modpacks (.mrpack) ----------
// Arquivos do launcher dentro da pasta da instância: um modpack nunca escreve neles
const PROTEGIDOS = ['instance.json'];
// Nomes que o Windows trata como dispositivo (com ou sem extensão)
const RESERVADOS_WIN = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

// Valida um caminho relativo vindo de fora e devolve o caminho absoluto dentro de `base`.
// Recusa também o que o Windows reinterpretaria e faria nomes diferentes caírem no mesmo arquivo:
// ":" (fluxos do NTFS — "arquivo::$DATA" é o próprio arquivo), ponto/espaço no fim do nome
// (descartados pelo Windows) e nomes de dispositivo.
function validarCaminhoPack(base, relativo) {
  const proibido = () => new Error(`Caminho proibido no modpack: ${relativo}`);
  if (typeof relativo !== 'string' || !relativo || relativo.includes('\0')) throw new Error('Caminho inválido no modpack.');
  if (path.isAbsolute(relativo) || path.win32.isAbsolute(relativo) || /^[a-zA-Z]:/.test(relativo)
      || relativo.startsWith('/') || relativo.startsWith('\\')) {
    throw proibido();
  }
  const partes = relativo.split(/[\\/]+/).filter((p) => p && p !== '.');
  if (!partes.length) throw proibido();
  for (const p of partes) {
    if (p === '..' || /[:*?"<>|\x00-\x1f]/.test(p) || /[. ]$/.test(p) || RESERVADOS_WIN.test(p)) throw proibido();
  }
  const raiz = path.resolve(base);
  const destino = path.resolve(raiz, ...partes);
  if (!destino.startsWith(raiz + path.sep)) throw proibido();
  return destino;
}

// O destino (já validado) é um arquivo do launcher? Compara o caminho final, sem diferenciar maiúsculas.
function ehProtegido(base, destino) {
  return PROTEGIDOS.includes(path.relative(path.resolve(base), destino).toLowerCase());
}

// O adm-zip reserva a memória que o próprio zip declara para cada arquivo: confere antes de ler
const LIMITE_INDICE = 32 * 1048576;   // índices reais têm poucas centenas de KB
const LIMITE_ENTRADA = 512 * 1048576; // por arquivo das overrides

function lerMrpack(caminho) {
  let zip;
  try { zip = new AdmZip(caminho); } catch { throw new Error('Arquivo de modpack inválido ou corrompido.'); }
  const entrada = zip.getEntry('modrinth.index.json');
  if (!entrada) throw new Error('Esse arquivo não é um modpack do Modrinth (.mrpack).');
  if (entrada.header.size > LIMITE_INDICE) throw new Error('O índice do modpack é grande demais.');
  let indice;
  try { indice = JSON.parse(zip.readAsText(entrada)); } catch { throw new Error('O índice do modpack está corrompido.'); }
  if (indice.game !== 'minecraft' || !indice.dependencies || !indice.dependencies.minecraft) {
    throw new Error('Modpack sem versão do Minecraft.');
  }
  return { zip, indice };
}

const LOADER_DEP = { 'fabric-loader': 'fabric', 'quilt-loader': 'quilt', forge: 'forge', neoforge: 'neoforge' };

// Confere tudo antes de escrever qualquer coisa: caminhos, domínios e hashes.
function validarMrpack({ zip, indice }, pastaFicticia) {
  const deps = indice.dependencies;
  const conhecidas = ['minecraft', ...Object.keys(LOADER_DEP)];
  const estranha = Object.keys(deps).find((d) => !conhecidas.includes(d));
  if (estranha) throw new Error(`O modpack precisa de "${estranha}", que não é suportado.`);
  const tipoLoader = Object.keys(LOADER_DEP).find((d) => deps[d]);
  const loader = tipoLoader ? { tipo: LOADER_DEP[tipoLoader], versao: String(deps[tipoLoader]) } : { tipo: 'vanilla', versao: null };

  const arquivos = [];
  for (const f of indice.files || []) {
    if (f.env && f.env.client === 'unsupported') continue;
    const destino = validarCaminhoPack(pastaFicticia, f.path);
    if (ehProtegido(pastaFicticia, destino)) throw new Error(`Caminho proibido no modpack: ${f.path}`);
    const url = (f.downloads || []).find((u) => urlPermitida(u, DOMINIOS_MRPACK));
    if (!url) throw new Error(`O modpack tenta baixar ${path.basename(f.path)} de um site não permitido.`);
    if (!f.hashes || !/^[0-9a-f]{40}$/i.test(f.hashes.sha1 || '')) throw new Error(`Arquivo sem hash no modpack: ${f.path}`);
    arquivos.push({ path: f.path, url, sha1: f.hashes.sha1.toLowerCase(), sha512: f.hashes.sha512, size: f.fileSize });
  }

  // overrides/ primeiro e client-overrides/ por cima
  const sobrescritas = new Map();
  for (const prefixo of ['overrides/', 'client-overrides/']) {
    for (const e of zip.getEntries()) {
      const nome = e.entryName.replace(/\\/g, '/');
      if (!nome.startsWith(prefixo) || e.isDirectory) continue;
      const rel = nome.slice(prefixo.length);
      if (!rel) continue;
      if (e.header.size > LIMITE_ENTRADA) throw new Error(`Arquivo grande demais no modpack: ${rel}`);
      const destino = validarCaminhoPack(pastaFicticia, rel);
      // instance.json exportado por outros launchers: ignora (não é nosso formato)
      if (ehProtegido(pastaFicticia, destino)) continue;
      // chave pelo destino final: "a/./b" e "a/b" são o mesmo arquivo
      sobrescritas.set(path.relative(pastaFicticia, destino).toLowerCase(), { rel, entrada: e });
    }
  }
  return { mc: String(deps.minecraft), loader, arquivos, sobrescritas: [...sobrescritas.values()] };
}

const slug = (nome) => String(nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'modpack';

function idUnico(base) {
  let id = base;
  for (let n = 2; fs.existsSync(path.join(PASTA_INSTANCIAS(), id)); n++) id = `${base}-${n}`;
  return id;
}

// Cria a pasta da instância (via instancias.criar se existir) e devolve { id, pasta }
async function criarInstancia({ nome, mc, loader, origem }) {
  const inst = instanciasMod();
  let id = null;
  if (inst && typeof inst.criar === 'function') {
    const r = await inst.criar({ nome, mc, loader, icone: 'grama', origem });
    if (r && r.ok === false) throw new Error(r.mensagem || 'Não foi possível criar a instância.');
    id = (r && (r.id || (r.instancia && r.instancia.id))) || null;
  }
  if (!id) {
    id = idUnico(slug(nome));
    const pasta = path.join(PASTA_INSTANCIAS(), id);
    fs.mkdirSync(pasta, { recursive: true });
    fs.writeFileSync(path.join(pasta, 'instance.json'), JSON.stringify({
      id, nome, mc, loader, icone: 'grama', criadaEm: Date.now(), ultimoJogo: null, tempoJogadoMs: 0,
      ramMB: null, jvmArgs: '', resolucao: null, origem,
    }, null, 2));
  }
  return { id, pasta: pastaInstancia(id) };
}

async function baixarDoPack(f, pasta) {
  const destino = validarCaminhoPack(pasta, f.path);
  if (ehProtegido(pasta, destino)) throw new Error(`Caminho proibido no modpack: ${f.path}`);
  await baixar(f.url, destino, { size: f.size, sha1: f.sha1 });
  if (f.sha512) {
    const h = crypto.createHash('sha512').update(await fs.promises.readFile(destino)).digest('hex');
    if (h !== String(f.sha512).toLowerCase()) {
      apagar(destino);
      throw new Error(`Arquivo corrompido: ${path.basename(f.path)}`);
    }
  }
}

async function instalarDeMrpack(caminhoMrpack, t, { nome, origem, iconeUrl }) {
  t.atualizar({ etapa: 'Lendo o modpack' });
  const pack = lerMrpack(caminhoMrpack);
  const plano = validarMrpack(pack, path.join(PASTA_INSTANCIAS(), '_validacao_'));
  const nomeFinal = String(nome || pack.indice.name || 'Modpack').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 48).trim() || 'Modpack';

  const { id, pasta } = await criarInstancia({ nome: nomeFinal, mc: plano.mc, loader: plano.loader, origem });
  try {
    t.atualizar({ etapa: 'Baixando arquivos do modpack', feitos: 0, total: plano.arquivos.length });
    let erroDownload = null; // no primeiro erro, para de começar downloads novos
    await emLote(plano.arquivos, async (f) => {
      if (erroDownload) return;
      try {
        await baixarDoPack(f, pasta);
      } catch (erro) {
        erroDownload = erroDownload || erro;
      }
    }, (feitos, total) => t.atualizar({ etapa: 'Baixando arquivos do modpack', feitos, total }), 8);
    if (erroDownload) throw erroDownload;

    t.atualizar({ etapa: 'Copiando configurações do modpack', feitos: 0, total: plano.sobrescritas.length });
    plano.sobrescritas.forEach(({ rel, entrada }, i) => {
      const destino = validarCaminhoPack(pasta, rel);
      if (ehProtegido(pasta, destino)) return;
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, entrada.getData());
      if (i % 20 === 0) t.atualizar({ etapa: 'Copiando configurações do modpack', feitos: i, total: plano.sobrescritas.length });
    });

    if (iconeUrl && urlPermitida(iconeUrl, ['cdn.modrinth.com'])) {
      try {
        await baixar(iconeUrl, path.join(pasta, 'icon.png'));
        const arq = path.join(pasta, 'instance.json');
        const dados = JSON.parse(fs.readFileSync(arq, 'utf8'));
        dados.icone = 'personalizado';
        fs.writeFileSync(arq, JSON.stringify(dados, null, 2));
      } catch { /* sem ícone: fica o preset */ }
    }
  } catch (erro) {
    fs.rmSync(pasta, { recursive: true, force: true }); // não deixa instância pela metade
    await notificar();
    throw erro;
  }
  await notificar();
  return { id, nome: nomeFinal, mensagem: `Modpack "${nomeFinal}" instalado.` };
}

async function instalarModpack({ projetoId, versaoId, nome } = {}) {
  let p;
  try {
    if (!projetoId) throw new Error('Projeto inválido.');
    p = await projetoBruto(projetoId);
    if (p.project_type !== 'modpack') throw new Error('Esse projeto não é um modpack.');
  } catch (erro) {
    return falha(erro);
  }
  return tarefas.executar(`Instalando ${p.title}`, async (t) => {
    t.atualizar({ etapa: 'Procurando a versão do modpack' });
    let versao;
    if (versaoId) {
      versao = await api(`/version/${encodeURIComponent(versaoId)}`);
      if (versao.project_id !== p.id) throw new Error('Versão não pertence a esse modpack.');
    } else {
      versao = melhorVersao(await listarVersoesBrutas(p.id));
      if (!versao) throw new Error('Esse modpack não tem versões.');
    }
    const arq = (versao.files || []).find((f) => f.primary && f.filename.endsWith('.mrpack'))
      || (versao.files || []).find((f) => f.filename.endsWith('.mrpack'));
    if (!arq || !urlPermitida(arq.url, DOMINIOS_MRPACK)) throw new Error('Essa versão do modpack não tem arquivo .mrpack.');
    const local = path.join(RAIZ, 'cache', 'modpacks', `${versao.id}.mrpack`);
    t.atualizar({ etapa: 'Baixando o modpack' });
    await baixar(arq.url, local, { size: arq.size, sha1: arq.hashes && arq.hashes.sha1 });
    return instalarDeMrpack(local, t, {
      nome: nome || p.title,
      iconeUrl: p.icon_url,
      origem: { tipo: 'modrinth', projetoId: p.id, versaoId: versao.id, nome: p.title, iconeUrl: p.icon_url || null },
    });
  });
}

async function importarMrpack(caminho) {
  if (typeof caminho !== 'string' || !fs.existsSync(caminho)) return { ok: false, mensagem: 'Arquivo não encontrado.' };
  return tarefas.executar(`Importando ${path.basename(caminho)}`, async (t) => {
    // se o arquivo veio do Modrinth, guarda a origem (para mostrar o ícone e o nome do projeto)
    let origem = null;
    let iconeUrl = null;
    try {
      const h = crypto.createHash('sha1').update(fs.readFileSync(caminho)).digest('hex');
      const v = await api(`/version_file/${h}?algorithm=sha1`);
      const p = await projetoBruto(v.project_id);
      if (p.project_type === 'modpack') {
        iconeUrl = p.icon_url || null;
        origem = { tipo: 'modrinth', projetoId: p.id, versaoId: v.id, nome: p.title, iconeUrl };
      }
    } catch { /* arquivo de fora do Modrinth */ }
    return instalarDeMrpack(caminho, t, { origem, iconeUrl });
  });
}

// ---------- Atualizações ----------
function loadersParaAtualizar(sub, loader) {
  if (sub === 'resourcepacks') return ['minecraft'];
  if (sub === 'shaderpacks') return LOADERS_SHADER;
  return loadersAceitos('mod', loader) || [];
}

async function verificarAtualizacoes(instanciaId) {
  try {
    const { pasta, dados: inst } = lerInstancia(instanciaId);
    const loader = (inst.loader && inst.loader.tipo) || 'vanilla';
    const atualizacoes = [];
    for (const sub of ['mods', 'resourcepacks', 'shaderpacks']) {
      const loaders = loadersParaAtualizar(sub, loader);
      if (!loaders.length) continue;
      const arquivos = arquivosDaPasta(path.join(pasta, sub));
      if (!arquivos.length) continue;
      const mapa = await hashes(arquivos.map((a) => a.caminho));
      const conhecidos = arquivos
        .map((a) => ({ ...a, info: mapa.get(a.caminho) }))
        .filter((a) => a.info);
      if (!conhecidos.length) continue;
      const shaDe = new Map();
      for (const a of conhecidos) shaDe.set(a.caminho, await sha1Arquivo(a.caminho));
      const novas = {};
      for (const lote of pedacos([...new Set(shaDe.values())], 200)) {
        Object.assign(novas, await api('/version_files/update', {
          metodo: 'POST',
          corpo: { hashes: lote, algorithm: 'sha1', loaders, game_versions: [inst.mc] },
        }));
      }
      for (const a of conhecidos) {
        let nova = novas[shaDe.get(a.caminho)];
        if (!nova || nova.id === a.info.versaoId || nova.project_id !== a.info.projetoId) continue;
        // quem está numa versão estável não recebe beta/alpha: procura a release mais nova
        if (nova.version_type !== 'release') {
          const lista = await listarVersoesBrutas(a.info.projetoId, { loaders, versaoMc: inst.mc });
          const atual = lista.find((v) => v.id === a.info.versaoId);
          if (atual && atual.version_type === 'release') {
            const release = lista.find((v) => v.version_type === 'release');
            if (!release || release.id === atual.id || release.date_published <= atual.date_published) continue;
            nova = release;
          }
        }
        atualizacoes.push({
          tipo: sub,
          arquivo: a.arquivo,
          nome: a.info.nome,
          versaoAtual: a.info.versao,
          versaoNova: nova.version_number,
          versaoId: nova.id,
          projetoId: a.info.projetoId,
          iconeUrl: a.info.iconeUrl,
        });
      }
    }
    return { ok: true, atualizacoes };
  } catch (erro) {
    return falha(erro);
  }
}

async function atualizarConteudo(instanciaId, itens = []) {
  let pasta;
  try {
    pasta = lerInstancia(instanciaId).pasta;
    if (!Array.isArray(itens) || !itens.length) return { ok: true, atualizados: 0 };
    for (const it of itens) {
      if (!TIPO_PASTA[it.tipo]) throw new Error('Tipo de conteúdo inválido.');
      nomeSeguro(it.arquivo);
      if (typeof it.versaoId !== 'string' || !/^[A-Za-z0-9]+$/.test(it.versaoId)) throw new Error('Versão inválida.');
    }
  } catch (erro) {
    return falha(erro);
  }
  return tarefas.executar(itens.length === 1 ? `Atualizando ${itens[0].nome || itens[0].arquivo}` : `Atualizando ${itens.length} itens`, async (t) => {
    const versoes = {};
    for (const lote of pedacos([...new Set(itens.map((i) => i.versaoId))], 100)) {
      for (const v of await api(`/versions?ids=${q(lote)}`)) versoes[v.id] = v;
    }
    let atualizados = 0;
    await emLote(itens, async (it) => {
      const v = versoes[it.versaoId];
      const arq = v && arquivoPrincipal(v);
      if (!arq || !urlPermitida(arq.url, DOMINIOS_MRPACK)) throw new Error(`Não foi possível atualizar ${it.nome || it.arquivo}.`);
      const dir = path.join(pasta, it.tipo);
      const antigoAtivo = path.join(dir, it.arquivo);
      const antigoDesativado = `${antigoAtivo}.disabled`;
      const desativado = !fs.existsSync(antigoAtivo) && fs.existsSync(antigoDesativado);
      const novo = path.join(dir, nomeSeguro(arq.filename));
      await baixar(arq.url, novo, { size: arq.size, sha1: arq.hashes && arq.hashes.sha1 });
      if (novo !== antigoAtivo) apagar(antigoAtivo);
      apagar(antigoDesativado);
      if (desativado) fs.renameSync(novo, `${novo}.disabled`); // mantém desativado como estava
      atualizados++;
    }, (feitos, total) => t.atualizar({ etapa: 'Baixando', feitos, total }), 6);
    await notificar();
    return { atualizados, mensagem: `${atualizados} ${atualizados === 1 ? 'item atualizado' : 'itens atualizados'}.` };
  });
}

module.exports = {
  buscar, projeto, versoesProjeto, categorias,
  instalarProjeto, instalarModpack, importarMrpack,
  verificarAtualizacoes, atualizarConteudo,
  hashes, sha1Arquivo, limparHtml,
  // usado nos testes
  validarCaminhoPack,
};
