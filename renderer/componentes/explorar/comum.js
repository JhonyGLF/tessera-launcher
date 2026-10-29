// Dados e regras compartilhados pelas páginas do Explorar e do Projeto:
// tipos de conteúdo, compatibilidade com instâncias, caches (versões, categorias,
// conteúdo instalado) e o estado das instalações em andamento.
import { useEffect, useState } from '../../vendor/preact-htm.js';
import { api } from '../../api.js';
import { lista } from '../../util.js';

// ---------- Tipos de conteúdo ----------
export const TIPOS = {
  mod: { rotulo: 'Mods', singular: 'mod', icone: 'mod', pasta: 'mods', descricao: 'Novos recursos, otimizações e utilidades' },
  modpack: { rotulo: 'Modpacks', singular: 'modpack', icone: 'pacote', pasta: null, descricao: 'Coleções prontas: um clique e uma instância nova' },
  resourcepack: { rotulo: 'Resource packs', singular: 'resource pack', icone: 'pincel', pasta: 'resourcepacks', descricao: 'Texturas, sons e modelos' },
  shader: { rotulo: 'Shaders', singular: 'shader', icone: 'sol', pasta: 'shaderpacks', descricao: 'Iluminação, sombras e reflexos' },
};
export const ORDEM_TIPOS = ['mod', 'modpack', 'resourcepack', 'shader'];
export const tipoValido = (t) => (TIPOS[t] ? t : 'mod');

export const ORDENS = [
  { valor: 'relevance', rotulo: 'Relevância' },
  { valor: 'downloads', rotulo: 'Mais baixados' },
  { valor: 'follows', rotulo: 'Mais seguidos' },
  { valor: 'newest', rotulo: 'Mais novos' },
  { valor: 'updated', rotulo: 'Atualizados' },
];

export const LOADERS_MOD = ['fabric', 'quilt', 'forge', 'neoforge'];
const NOMES_LOADERS_EXTRA = {
  iris: 'Iris', optifine: 'OptiFine', canvas: 'Canvas', vanilla: 'Vanilla', minecraft: 'Minecraft',
  datapack: 'Datapack', babric: 'Babric', liteloader: 'LiteLoader', rift: 'Rift', modloader: 'ModLoader',
  'legacy-fabric': 'Legacy Fabric', ornithe: 'Ornithe', bukkit: 'Bukkit', paper: 'Paper', spigot: 'Spigot',
};
export const nomeLoaderQualquer = (l) => ({ fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' })[l]
  || NOMES_LOADERS_EXTRA[l] || (l ? l.charAt(0).toUpperCase() + l.slice(1) : '');

// "Mods de Fabric costumam funcionar no Quilt" (mesma regra do backend)
export function loadersAceitos(tipo, loaderInst) {
  if (tipo === 'resourcepack' || tipo === 'shader') return null;
  if (!loaderInst || loaderInst === 'vanilla') return [];
  return loaderInst === 'quilt' && tipo === 'mod' ? ['quilt', 'fabric'] : [loaderInst];
}

// Um projeto (ou uma versão específica) serve para a instância?
// alvo: { tipo, loaders?: [], versoesMc?: [] } → { ok, motivo }
export function compatibilidade(inst, alvo) {
  if (!inst || !alvo) return { ok: false, motivo: '' };
  const tipo = alvo.tipo;
  const loaderInst = (inst.loader && inst.loader.tipo) || 'vanilla';
  if (tipo === 'mod' && loaderInst === 'vanilla') return { ok: false, motivo: 'Vanilla não carrega mods' };
  const aceitos = loadersAceitos(tipo, loaderInst);
  const loaders = alvo.loaders || [];
  if (aceitos && aceitos.length && loaders.length && !loaders.some((l) => aceitos.includes(l))) {
    const nomes = loaders.filter((l) => LOADERS_MOD.includes(l)).map(nomeLoaderQualquer);
    return { ok: false, motivo: nomes.length ? `Precisa de ${nomes.join(' ou ')}` : 'Loader incompatível' };
  }
  const versoes = alvo.versoesMc || [];
  if (versoes.length && !versoes.includes(inst.mc)) return { ok: false, motivo: `Sem versão para o ${inst.mc}` };
  return { ok: true, motivo: '' };
}

// ---------- Rotas ----------
export const rotaInstancia = (id) => `/instancia/${encodeURIComponent(id)}`;
export function rotaProjeto(id, instanciaId) {
  return `/projeto/${encodeURIComponent(id)}${instanciaId ? `?instancia=${encodeURIComponent(instanciaId)}` : ''}`;
}

// ---------- Rótulos de categorias ----------
// O backend traduz as categorias em categoriasModrinth(); os resultados da busca vêm só com o
// nome ("optimization"). Guardamos os rótulos de todos os tipos já carregados.
const rotulos = {};
const ROTULOS_RESERVA = {
  optimization: 'Otimização', utility: 'Utilidade', library: 'Biblioteca', adventure: 'Aventura', decoration: 'Decoração',
  technology: 'Tecnologia', magic: 'Magia', 'game-mechanics': 'Mecânicas de jogo', worldgen: 'Geração de mundo',
  equipment: 'Equipamentos', transportation: 'Transporte', storage: 'Armazenamento', management: 'Gerenciamento',
  mobs: 'Criaturas', food: 'Comida', economy: 'Economia', social: 'Social', minigame: 'Minijogos', cursed: 'Bizarro',
  multiplayer: 'Multijogador', lightweight: 'Leve', combat: 'Combate', challenging: 'Desafiador', quests: 'Missões',
  'kitchen-sink': 'Completo', 'vanilla-like': 'Estilo vanilla', realistic: 'Realista', 'semi-realistic': 'Semirrealista',
  fantasy: 'Fantasia', cartoon: 'Cartunesco', 'colored-lighting': 'Luz colorida', atmosphere: 'Atmosfera', bloom: 'Brilho (bloom)',
  shadows: 'Sombras', reflections: 'Reflexos', foliage: 'Folhagem', pbr: 'PBR', 'path-tracing': 'Path tracing',
  potato: 'Batata (PC fraco)', low: 'Baixo', medium: 'Médio', high: 'Alto', screenshot: 'Para screenshots',
  tweaks: 'Ajustes', simplistic: 'Simples', themed: 'Temático', modded: 'Para mods', audio: 'Sons', blocks: 'Blocos',
  entities: 'Entidades', environment: 'Ambiente', fonts: 'Fontes', gui: 'Interface', items: 'Itens', locale: 'Idioma',
  models: 'Modelos', minecraft: 'Minecraft', '8x-': '8x ou menos', '512x+': '512x ou mais',
};
export function rotuloCategoria(nome) {
  if (!nome) return '';
  return rotulos[nome] || ROTULOS_RESERVA[nome] || nome.charAt(0).toUpperCase() + nome.slice(1).replace(/-/g, ' ');
}
const ROTULOS_CABECALHO = { categories: 'Categorias', features: 'Recursos', resolutions: 'Resolução', 'performance impact': 'Impacto no desempenho' };
export const rotuloCabecalho = (c) => ROTULOS_CABECALHO[c] || (c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Categorias');

// ---------- Caches simples (memória da sessão) ----------
const cacheCategorias = {};
export function useCategorias(tipo) {
  const [estado, setEstado] = useState(() => cacheCategorias[tipo] || { carregando: true, grupos: [] });
  useEffect(() => {
    let vivo = true;
    if (cacheCategorias[tipo]) { setEstado(cacheCategorias[tipo]); return; }
    setEstado({ carregando: true, grupos: [] });
    api.categoriasModrinth(tipo).then((r) => {
      if (!vivo) return;
      if (!r || r.ok === false) { setEstado({ carregando: false, grupos: [], erro: (r && r.mensagem) || 'Falhou' }); return; }
      const grupos = [];
      for (const c of lista(r, 'categorias')) {
        const rotulo = c.rotulo || rotuloCategoria(c.nome);
        rotulos[c.nome] = rotulo;
        const cab = c.cabecalho || 'categories';
        let g = grupos.find((x) => x.id === cab);
        if (!g) grupos.push((g = { id: cab, rotulo: c.cabecalhoRotulo || rotuloCabecalho(cab), itens: [] }));
        g.itens.push({ nome: c.nome, rotulo });
      }
      // "Categorias" primeiro; itens em ordem alfabética do rótulo
      grupos.sort((a, b) => (a.id === 'categories' ? -1 : b.id === 'categories' ? 1 : 0));
      grupos.forEach((g) => g.itens.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR')));
      cacheCategorias[tipo] = { carregando: false, grupos };
      setEstado(cacheCategorias[tipo]);
    });
    return () => { vivo = false; };
  }, [tipo]);
  return estado;
}

// Versões do Minecraft (para os filtros e para criar instância)
let cacheVersoes = null;
let promessaVersoes = null;
export function carregarVersoesMc() {
  if (cacheVersoes) return Promise.resolve(cacheVersoes);
  if (!promessaVersoes) {
    promessaVersoes = api.listarVersoesMc().then((r) => {
      promessaVersoes = null;
      if (!r || r.ok === false) return { versoes: [], erro: (r && r.mensagem) || 'Falhou' };
      cacheVersoes = { versoes: lista(r, 'versoes'), ultima: r.ultima || null };
      return cacheVersoes;
    });
  }
  return promessaVersoes;
}
export function useVersoesMc() {
  const [v, setV] = useState(cacheVersoes || { versoes: [], carregando: true });
  useEffect(() => { let vivo = true; carregarVersoesMc().then((x) => vivo && setV(x)); return () => { vivo = false; }; }, []);
  return v;
}

// Ordena ids de versão do mais novo para o mais velho usando a lista oficial (quando houver)
export function ordenarVersoes(ids, oficiais = []) {
  const pos = new Map(oficiais.map((v, i) => [v.id, i]));
  const chave = (id) => id.split(/[.\-]/).map((p) => (/^\d+$/.test(p) ? p.padStart(5, '0') : p)).join('.');
  return [...new Set(ids)].sort((a, b) => {
    const pa = pos.has(a) ? pos.get(a) : null;
    const pb = pos.has(b) ? pos.get(b) : null;
    if (pa != null && pb != null) return pa - pb;
    return chave(b).localeCompare(chave(a));
  });
}

// "1.16.5 – 26.3" (só lançamentos) a partir da lista de versões suportadas
export function faixaVersoes(ids = [], oficiais = []) {
  const tipos = new Map(oficiais.map((v) => [v.id, v.tipo]));
  const releases = ids.filter((id) => (tipos.size ? tipos.get(id) === 'release' : /^\d+(\.\d+)+$/.test(id)));
  const base = releases.length ? releases : ids;
  if (!base.length) return '';
  const ord = ordenarVersoes(base, oficiais);
  return ord.length === 1 ? ord[0] : `${ord[ord.length - 1]} – ${ord[0]}`;
}

// ---------- Conteúdo instalado numa instância (projetoId → versaoId) ----------
const cacheInstalados = new Map(); // `${inst}/${pasta}` → { mapa: Map, carregando }
const ouvintesInstalados = new Set();
const avisarInstalados = () => ouvintesInstalados.forEach((f) => f());

export async function recarregarInstalados(instId, pasta) {
  if (!instId || !pasta) return;
  const chave = `${instId}/${pasta}`;
  const atual = cacheInstalados.get(chave);
  cacheInstalados.set(chave, { mapa: atual ? atual.mapa : new Map(), carregando: true });
  avisarInstalados();
  const r = await api.listarConteudo(instId, pasta);
  const mapa = new Map();
  for (const c of lista(r, 'itens')) if (c.projetoId) mapa.set(c.projetoId, { versaoId: c.versaoId || null, ativo: c.ativo !== false });
  cacheInstalados.set(chave, { mapa, carregando: false });
  avisarInstalados();
}

// Map projetoId → { versaoId, ativo } do que já está na instância
export function useInstalados(instId, pasta) {
  const chave = instId && pasta ? `${instId}/${pasta}` : null;
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    ouvintesInstalados.add(f);
    if (chave && !cacheInstalados.has(chave)) recarregarInstalados(instId, pasta);
    return () => ouvintesInstalados.delete(f);
  }, [chave]);
  const c = chave && cacheInstalados.get(chave);
  return { mapa: (c && c.mapa) || new Map(), carregando: !c || c.carregando };
}

// Consulta rápida (sem hook) — usada pelo modal "Instalar em…"
export async function instaladoEm(instId, pasta, projetoId) {
  const chave = `${instId}/${pasta}`;
  if (!cacheInstalados.has(chave) || cacheInstalados.get(chave).carregando) await recarregarInstalados(instId, pasta);
  return cacheInstalados.get(chave).mapa.has(projetoId);
}

// ---------- Instalações em andamento ----------
// chave: projetoId (qualquer instância) e `${projetoId}@${instId}`
const emAndamento = new Map();
const ouvintesInst = new Set();
function marcar(chave, delta) {
  const n = (emAndamento.get(chave) || 0) + delta;
  if (n > 0) emAndamento.set(chave, n); else emAndamento.delete(chave);
  ouvintesInst.forEach((f) => f());
}
export function marcarInstalando(projetoId, instId, ligado) {
  const d = ligado ? 1 : -1;
  marcar(projetoId, d);
  if (instId) marcar(`${projetoId}@${instId}`, d);
}
export function useInstalando() {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    ouvintesInst.add(f);
    return () => ouvintesInst.delete(f);
  }, []);
  return (projetoId, instId) => emAndamento.has(instId ? `${projetoId}@${instId}` : projetoId);
}
