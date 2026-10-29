// Camada de flutuantes: tudo que precisa ficar por cima (modais, menus, selects, dicas)
// é desenhado em #camada, fora das áreas com rolagem — assim nada é cortado.
import { html, render, useEffect, useLayoutEffect, useRef, useState } from '../vendor/preact-htm.js';

export const camada = () => document.getElementById('camada') || document.body;

// Renderiza os filhos em #camada (um "portal" simples para o Preact sem compat)
export function Portal({ children }) {
  const host = useRef(null);
  if (!host.current) host.current = document.createElement('div');
  useLayoutEffect(() => {
    const el = host.current;
    el.className = 'portal';
    camada().appendChild(el);
    return () => { render(null, el); el.remove(); };
  }, []);
  useLayoutEffect(() => { render(html`${children}`, host.current); });
  return null;
}

// Retângulo de um elemento relativo à camada
export function retanguloNaCamada(el) {
  const r = el.getBoundingClientRect();
  const c = camada().getBoundingClientRect();
  return { top: r.top - c.top, left: r.left - c.left, right: r.right - c.left, bottom: r.bottom - c.top, width: r.width, height: r.height, cw: c.width, ch: c.height };
}

// Painel ancorado em um elemento (menus, popovers, lista do select).
// posicao: 'baixo-esq' | 'baixo-dir' | 'cima-esq' | 'cima-dir' | 'direita' (vira sozinho se não couber)
export function Flutuante({ ancora, aberto, aoFechar, posicao = 'baixo-esq', largura, distancia = 8, class: classe = '', children }) {
  const painel = useRef(null);
  const [estilo, setEstilo] = useState({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!aberto) return;
    const alvo = ancora && (ancora.current || ancora);
    if (!alvo || !painel.current) return;
    const a = retanguloNaCamada(alvo);
    const p = painel.current.getBoundingClientRect();
    const margem = 10;
    let [vertical, horizontal] = posicao.split('-');
    const est = {};
    if (largura === 'ancora') est.width = `${a.width}px`;
    else if (largura) est.width = typeof largura === 'number' ? `${largura}px` : largura;
    const larg = largura === 'ancora' ? a.width : p.width;

    if (vertical === 'direita') {
      let left = a.right + distancia;
      if (left + larg > a.cw - margem) left = a.left - distancia - larg;
      let top = a.top;
      if (top + p.height > a.ch - margem) top = Math.max(margem, a.ch - margem - p.height);
      Object.assign(est, { left: `${left}px`, top: `${top}px` });
    } else {
      // vira para cima/baixo se não couber
      if (vertical === 'baixo' && a.bottom + distancia + p.height > a.ch - margem && a.top - distancia - p.height > margem) vertical = 'cima';
      if (vertical === 'cima' && a.top - distancia - p.height < margem && a.bottom + distancia + p.height < a.ch - margem) vertical = 'baixo';
      let left = horizontal === 'dir' ? a.right - larg : a.left;
      left = Math.max(margem, Math.min(left, a.cw - margem - larg));
      if (vertical === 'baixo') {
        est.top = `${a.bottom + distancia}px`;
        est.maxHeight = `${a.ch - a.bottom - distancia - margem}px`;
      } else {
        est.bottom = `${a.ch - a.top + distancia}px`;
        est.maxHeight = `${a.top - distancia - margem}px`;
      }
      est.left = `${left}px`;
      est['--surgir-y'] = vertical === 'baixo' ? '-4px' : '4px';
    }
    setEstilo(est);
  }, [aberto, ancora, posicao, largura]);

  // fecha ao clicar fora, Esc, rolar ou redimensionar
  useEffect(() => {
    if (!aberto) return;
    const alvo = () => ancora && (ancora.current || ancora);
    const fora = (e) => {
      const el = alvo();
      if (painel.current && !painel.current.contains(e.target) && !(el && el.contains(e.target))) aoFechar && aoFechar();
    };
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar && aoFechar(); } };
    const rolar = (e) => { if (painel.current && !painel.current.contains(e.target)) aoFechar && aoFechar(); };
    document.addEventListener('pointerdown', fora, true);
    document.addEventListener('keydown', tecla, true);
    document.addEventListener('scroll', rolar, true);
    return () => {
      document.removeEventListener('pointerdown', fora, true);
      document.removeEventListener('keydown', tecla, true);
      document.removeEventListener('scroll', rolar, true);
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return html`<${Portal}>
    <div ref=${painel} class=${`flutuante ${classe}`} style=${estilo}>${children}</div>
  <//>`;
}

// ---------- Dicas (tooltips) ----------
// Qualquer elemento com o atributo data-dica="texto" ganha uma dica ao passar o mouse.
let dicaEl = null;
let timer = null;
let alvoAtual = null;

function esconderDica() {
  clearTimeout(timer);
  alvoAtual = null;
  if (dicaEl) { dicaEl.remove(); dicaEl = null; }
}

function mostrarDica(alvo) {
  const texto = alvo.getAttribute('data-dica');
  if (!texto || !alvo.isConnected) return;
  esconderDica();
  alvoAtual = alvo;
  dicaEl = document.createElement('div');
  dicaEl.className = 'dica';
  dicaEl.textContent = texto;
  camada().appendChild(dicaEl);
  const a = retanguloNaCamada(alvo);
  const d = dicaEl.getBoundingClientRect();
  const lado = alvo.getAttribute('data-dica-lado') || 'cima';
  let top = lado === 'baixo' ? a.bottom + 10 : a.top - d.height - 10;
  if (top < 8) top = a.bottom + 10;
  if (lado === 'direita') top = a.top + (a.height - d.height) / 2;
  let left = lado === 'direita' ? a.right + 12 : a.left + a.width / 2 - d.width / 2;
  left = Math.max(8, Math.min(left, a.cw - d.width - 8));
  dicaEl.style.top = `${Math.round(top)}px`;
  dicaEl.style.left = `${Math.round(left)}px`;
}

export function iniciarDicas() {
  document.addEventListener('mouseover', (e) => {
    const alvo = e.target.closest && e.target.closest('[data-dica]');
    if (alvo === alvoAtual) return;
    esconderDica();
    if (alvo && alvo.getAttribute('data-dica')) {
      alvoAtual = alvo;
      timer = setTimeout(() => mostrarDica(alvo), 380);
    }
  });
  document.addEventListener('pointerdown', esconderDica, true);
  document.addEventListener('scroll', esconderDica, true);
  window.addEventListener('blur', esconderDica);
  window.addEventListener('hashchange', esconderDica);
}

// Componente que só envolve o filho com a dica (equivalente ao atributo data-dica)
export function Tooltip({ texto, lado, children, class: classe = '' }) {
  return html`<span class=${`tem-dica ${classe}`} data-dica=${texto || undefined} data-dica-lado=${lado}>${children}</span>`;
}
