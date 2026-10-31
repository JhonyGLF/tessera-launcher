// Estado global reativo (bem simples): contas, instâncias, config, tarefas e jogos rodando.
// Nas páginas:
//   const instancias = useEstado((e) => e.instancias);   // re-renderiza só quando isso muda
//   const { config, contas } = useEstado();               // tudo
// Ações: recarregarInstancias(), recarregarContas(), salvarConfig({...}), jogar(id), parar(id)
import { useEffect, useRef, useState } from './vendor/preact-htm.js';
import { api } from './api.js';
import { lista } from './util.js';
import { toast } from './componentes/toasts.js';
import { navegar } from './rotas.js';
import { aplicarIdioma as aplicarIdiomaUI } from './i18n.js';

export const estado = {
  pronto: false,          // terminou a primeira carga
  info: { versao: '', raiz: '' },
  config: {
    ramMB: 4096, ramMaxMB: 8192, javaPersonalizado: null, minimizarAoJogar: true, mostrarSnapshots: false,
    atualizacaoAutomatica: true, idioma: 'pt-BR',
    tema: 'sculk', instanciaSelecionada: null, ordemInstancias: 'recentes',
  },
  contas: [],             // [{ id, tipo: 'msa'|'offline', nome, uuid }]
  contaAtiva: null,       // id
  podeOffline: false,
  skins: {},              // id da conta → data URL (ou null)
  instancias: [],
  tarefas: [],            // [{ id, titulo, etapa, feitos, total, estado: 'rodando'|'ok'|'erro', mensagem }]
  rodando: {},            // id da instância → 'preparando' | 'abrindo' | 'rodando'
  atualizacao: null,      // { estado, versao, progresso, notas, portatil } — atualização do próprio launcher
};

const ouvintes = new Set();

export function definir(parcial) {
  Object.assign(estado, parcial);
  ouvintes.forEach((f) => f());
}

function igual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

export function useEstado(seletor) {
  const sel = seletor || ((e) => ({ ...e }));
  const [valor, setValor] = useState(() => sel(estado));
  const ultimo = useRef(valor);
  const selRef = useRef(sel);
  selRef.current = sel;
  useEffect(() => {
    const f = () => {
      const novo = selRef.current(estado);
      if (!igual(novo, ultimo.current)) { ultimo.current = novo; setValor(novo); }
    };
    ouvintes.add(f);
    f();
    return () => ouvintes.delete(f);
  }, []);
  return seletor ? sel(estado) : valor;
}

// ---------- Tema ----------
export function aplicarTema(tema) {
  document.documentElement.dataset.tema = tema || 'sculk';
  try { localStorage.setItem('jg-tema', tema || 'sculk'); } catch {}
}

export function aplicarIdioma(idioma) {
  aplicarIdiomaUI(idioma || 'pt-BR');
}

// ---------- Cargas ----------
export async function recarregarConfig() {
  const c = await api.lerConfig();
  if (c && c.ok !== false) {
    definir({ config: { ...estado.config, ...c } });
    aplicarTema(estado.config.tema);
    aplicarIdioma(estado.config.idioma);
  }
}

export async function salvarConfig(mudancas) {
  const anterior = estado.config;
  definir({ config: { ...estado.config, ...mudancas } });
  if ('tema' in mudancas) aplicarTema(mudancas.tema);
  if ('idioma' in mudancas) aplicarIdioma(mudancas.idioma);
  const r = await api.salvarConfig(mudancas);
  if (r && r.ok === false) {
    definir({ config: anterior });
    aplicarTema(anterior.tema);
    aplicarIdioma(anterior.idioma);
    toast(r.mensagem || 'Não foi possível salvar.', { tipo: 'erro' });
    return false;
  }
  if (r && typeof r === 'object') definir({ config: { ...estado.config, ...r } });
  return true;
}

export async function recarregarContas() {
  const r = await api.listarContas();
  if (!r || r.ok === false) return;
  const contas = lista(r, 'contas');
  definir({ contas, contaAtiva: r.ativa ?? null, podeOffline: !!r.podeOffline });
  // skins em segundo plano (para a cabeça)
  for (const c of contas) {
    if (c.id in estado.skins) continue;
    api.skinConta(c.id).then((s) => {
      const url = typeof s === 'string' ? s : s && (s.dataUrl || s.skin || s.url) || null;
      definir({ skins: { ...estado.skins, [c.id]: url } });
    });
  }
}

export async function recarregarSkin(id) {
  const s = await api.skinConta(id);
  const url = typeof s === 'string' ? s : s && (s.dataUrl || s.skin || s.url) || null;
  definir({ skins: { ...estado.skins, [id]: url } });
  return url;
}

export async function recarregarInstancias() {
  const r = await api.listarInstancias();
  if (r && r.ok === false) return;
  definirInstancias(lista(r, 'instancias'));
}

function definirInstancias(instancias) {
  // jogos marcados como rodando pelo backend
  const rodando = { ...estado.rodando };
  for (const i of instancias) if (i.rodando && !rodando[i.id]) rodando[i.id] = 'rodando';
  definir({ instancias, rodando });
}

// ---------- Ações de jogo ----------
export const contaAtual = () => estado.contas.find((c) => c.id === estado.contaAtiva) || null;

export async function jogar(id) {
  if (!contaAtual()) {
    toast('Adicione uma conta para jogar.', { tipo: 'aviso', acao: { rotulo: 'Ir para Contas', aoClicar: () => navegar('/contas') } });
    return { ok: false };
  }
  if (estado.rodando[id]) return { ok: false };
  definir({ rodando: { ...estado.rodando, [id]: 'preparando' } });
  if (estado.config.instanciaSelecionada !== id) salvarConfig({ instanciaSelecionada: id });
  const r = await api.jogar(id);
  if (!r || r.ok === false) {
    const rodando = { ...estado.rodando };
    delete rodando[id];
    definir({ rodando });
    const inst = estado.instancias.find((i) => i.id === id);
    toast((r && r.mensagem) || 'Não foi possível abrir o jogo.', { tipo: 'erro', titulo: inst ? `Erro ao abrir ${inst.nome}` : 'Erro ao abrir o jogo' });
  }
  return r;
}

export async function parar(id) {
  const r = await api.parar(id);
  if (r && r.ok === false) toast(r.mensagem || 'Não foi possível fechar o jogo.', { tipo: 'erro' });
  return r;
}

// Instância "atual": a selecionada nas configurações, senão a jogada mais recentemente
export function instanciaAtual(e = estado) {
  const sel = e.instancias.find((i) => i.id === e.config.instanciaSelecionada);
  if (sel) return sel;
  return [...e.instancias].sort((a, b) => (b.ultimoJogo || b.criadaEm || 0) - (a.ultimoJogo || a.criadaEm || 0))[0] || null;
}

// ---------- Início ----------
let iniciado = false;

export async function iniciar() {
  if (iniciado) return;
  iniciado = true;

  // eventos do backend
  api.aoTarefas((tarefas) => definir({ tarefas: Array.isArray(tarefas) ? tarefas : [] }));
  api.aoAtualizacaoLauncher((a) => a && a.estado && definir({ atualizacao: a }));
  api.estadoAtualizacaoLauncher().then((a) => a && a.estado && !estado.atualizacao && definir({ atualizacao: a }));
  api.aoInstancias((l) => Array.isArray(l) && definirInstancias(l));
  api.aoJogo((ev) => {
    if (!ev || !ev.id) return;
    const rodando = { ...estado.rodando };
    if (ev.estado === 'fechado') {
      delete rodando[ev.id];
      const inst = estado.instancias.find((i) => i.id === ev.id);
      if (ev.cedo && ev.codigo !== 0) {
        toast(`O Minecraft fechou com erro${ev.codigo != null ? ` (código ${ev.codigo})` : ''}. Veja o log para entender o que houve.`, {
          tipo: 'erro', titulo: inst ? `${inst.nome} fechou` : 'O jogo fechou',
          acao: { rotulo: 'Ver log', aoClicar: () => navegar(`/instancia/${encodeURIComponent(ev.id)}/log`) },
        });
      }
    } else {
      rodando[ev.id] = ev.estado;
    }
    definir({ rodando });
  });

  const tarefa = (p, padrao) => Promise.resolve(p).catch(() => padrao);
  const [info, , , , tarefas, execucao] = await Promise.all([
    tarefa(api.info(), null),
    tarefa(recarregarConfig()),
    tarefa(recarregarContas()),
    tarefa(recarregarInstancias()),
    tarefa(api.listarTarefas(), []),
    tarefa(api.emExecucao(), []),
  ]);
  const rodando = { ...estado.rodando };
  for (const x of lista(execucao, 'ids').concat(lista(execucao, 'instancias'))) {
    const id = typeof x === 'string' ? x : x && x.id;
    if (id && !rodando[id]) rodando[id] = (x && x.estado) || 'rodando';
  }
  definir({
    pronto: true,
    info: info && info.ok !== false ? { ...estado.info, ...info } : estado.info,
    tarefas: lista(tarefas, 'tarefas'),
    rodando,
  });
}
