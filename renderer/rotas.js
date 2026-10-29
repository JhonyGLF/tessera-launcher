// Roteador por hash.
// Rotas: #/inicio, #/instancias, #/instancia/<id>[/<aba>], #/explorar?tipo=mod&instancia=<id>&q=...,
//        #/projeto/<id>[?instancia=<id>], #/contas, #/configuracoes
// Nas páginas:
//   const rota = useRota();   → { pagina, params, query, caminho, hash }
//   navegar('/instancia/meu-fabric/mods')   ou   navegar({ caminho: '/explorar', query: { tipo: 'mod' } })
//   useTitulo('Meu Fabric', '1.21.11')       → troca o título da barra superior
import { useEffect, useState } from './vendor/preact-htm.js';

export const TITULOS = {
  inicio: 'Início',
  instancias: 'Instâncias',
  instancia: 'Instância',
  explorar: 'Explorar',
  projeto: 'Projeto',
  contas: 'Contas',
  configuracoes: 'Configurações',
};

export function lerRota(hash = location.hash) {
  const h = hash.replace(/^#/, '') || '/inicio';
  const [caminho, qs = ''] = h.split('?');
  const partes = caminho.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const query = Object.fromEntries(new URLSearchParams(qs));
  const pagina = partes[0] && TITULOS[partes[0]] ? partes[0] : 'inicio';
  return { pagina, params: partes.slice(1), query, caminho: `/${partes.join('/')}`, hash: `#${h}` };
}

// Monta a string da rota a partir de { caminho, query } (query sem valores vazios)
export function montarRota({ caminho, query = {} }) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString();
  return `${caminho}${qs ? `?${qs}` : ''}`;
}

// ---------- Histórico interno (para o botão voltar) ----------
const pilha = [location.hash || '#/inicio'];
let movimento = null; // 'voltar' | 'substituir'
const ouvintes = new Set();
let rotaAtual = lerRota();

window.addEventListener('hashchange', () => {
  const novo = location.hash || '#/inicio';
  if (movimento === 'voltar') pilha.pop();
  else if (movimento === 'substituir') pilha[pilha.length - 1] = novo;
  else if (pilha[pilha.length - 1] !== novo) pilha.push(novo);
  movimento = null;
  if (pilha.length > 50) pilha.splice(0, pilha.length - 50);
  rotaAtual = lerRota();
  ouvintes.forEach((f) => f(rotaAtual));
});

export function navegar(rota, { substituir = false } = {}) {
  const texto = typeof rota === 'string' ? rota : montarRota(rota);
  const hash = `#${texto.replace(/^#/, '').replace(/^(?!\/)/, '/')}`;
  if (hash === location.hash) return;
  if (substituir) {
    movimento = 'substituir';
    location.replace(hash);
  } else {
    location.hash = hash;
  }
}

export const podeVoltar = () => pilha.length > 1;

export function voltar() {
  if (!podeVoltar()) return navegar('/inicio');
  movimento = 'voltar';
  history.back();
}

// Muda só a query da rota atual (ex.: filtros do Explorar), sem empilhar no histórico
export function trocarQuery(mudancas, { substituir = true } = {}) {
  const r = lerRota();
  navegar({ caminho: r.caminho, query: { ...r.query, ...mudancas } }, { substituir });
}

export function useRota() {
  const [rota, setRota] = useState(rotaAtual);
  useEffect(() => {
    ouvintes.add(setRota);
    setRota(rotaAtual);
    return () => ouvintes.delete(setRota);
  }, []);
  return rota;
}

// ---------- Título da barra superior ----------
let titulo = null;
const ouvintesTitulo = new Set();
const avisarTitulo = () => ouvintesTitulo.forEach((f) => f(titulo));

export function useTitulo(texto, sub) {
  useEffect(() => {
    titulo = texto ? { texto, sub } : null;
    avisarTitulo();
    return () => { titulo = null; avisarTitulo(); };
  }, [texto, sub]);
}

export function useTituloAtual() {
  const [t, setT] = useState(titulo);
  useEffect(() => { ouvintesTitulo.add(setT); return () => ouvintesTitulo.delete(setT); }, []);
  return t;
}
