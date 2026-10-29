// Componentes visuais: CabecaSkin, IconeInstancia, BarraProgresso, Carregando, Vazio,
// Cartao, Etiqueta, EtiquetaLoader e Menu.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import { Icone } from './icone.js';
import { Flutuante } from './camada.js';

// ---------- Cabeça da skin ----------
// Rosto padrão (parecido com o Steve) quando a conta não tem skin
const PALETA = { h: '#2c1d0c', H: '#3d2914', s: '#c99a78', S: '#b2826a', w: '#f2f2f2', e: '#4a3f8f', n: '#8c5a43', m: '#6a3c2c' };
const ROSTO_PADRAO = ['HHHHHHHH', 'HhHHHHhH', 'HssssssH', 'sssssssS', 'swesSews', 'sssnnssS', 'ssmmmmsS', 'ssssssSS'];

function desenharPadrao(ctx) {
  ROSTO_PADRAO.forEach((linha, y) => [...linha].forEach((c, x) => { ctx.fillStyle = PALETA[c]; ctx.fillRect(x, y, 1, 1); }));
}

// skin: data URL da textura da skin (64x64 ou 64x32) ou null
export function CabecaSkin({ skin, tamanho = 40, class: classe = '' }) {
  const tela = useRef(null);
  useEffect(() => {
    const ctx = tela.current.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 8, 8);
    if (!skin) { desenharPadrao(ctx); return; }
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      if (!vivo) return;
      ctx.clearRect(0, 0, 8, 8);
      ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);    // rosto
      ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);   // camada do chapéu/cabelo
    };
    img.onerror = () => vivo && desenharPadrao(ctx);
    img.src = skin;
    return () => { vivo = false; };
  }, [skin]);
  return html`<canvas ref=${tela} class=${`cabeca ${classe}`} width="8" height="8"
    style=${{ width: `${tamanho}px`, height: `${tamanho}px` }} aria-hidden="true"></canvas>`;
}

// ---------- Ícone de instância (com reserva quando a imagem não existe) ----------
const CORES_LETRA = ['#3c8527', '#2a6f9e', '#7a4bb3', '#a8452b', '#8a6d1d', '#1f7f78', '#5d5d6b', '#9e3060'];

export function IconeInstancia({ inst, tamanho = 48, class: classe = '' }) {
  const url = inst && inst.iconeUrl;
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [url]);
  const nome = (inst && inst.nome) || '?';
  const cor = CORES_LETRA[[...nome].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES_LETRA.length];
  const remoto = url && url.startsWith('https:');
  return html`<span class=${`icone-inst ${remoto ? 'remoto' : ''} ${classe}`} style=${{ width: `${tamanho}px`, height: `${tamanho}px`, background: !url || falhou ? cor : undefined }}>
    ${url && !falhou
      ? html`<img src=${url} alt="" draggable="false" onError=${() => setFalhou(true)} />`
      : html`<span class="letra" style=${{ fontSize: `${Math.round(tamanho * 0.5)}px` }}>${nome.trim()[0]?.toUpperCase() || '?'}</span>`}
  </span>`;
}

// ---------- Barra de progresso ----------
// valor: 0..1, ou null/undefined para indeterminada
export function BarraProgresso({ valor, fina = false, cor, rotulo, class: classe = '' }) {
  const indeterminada = valor == null || Number.isNaN(valor);
  const pct = indeterminada ? 0 : Math.max(0, Math.min(1, valor)) * 100;
  return html`<div class=${`barra-progresso ${fina ? 'fina' : ''} ${indeterminada ? 'indeterminada' : ''} ${classe}`}
    role="progressbar" aria-label=${rotulo} aria-valuemin="0" aria-valuemax="100" aria-valuenow=${indeterminada ? undefined : Math.round(pct)}
    style=${cor ? { '--cor-barra': cor } : undefined}>
    <div class="enchimento" style=${indeterminada ? undefined : { width: `${pct}%` }}></div>
  </div>`;
}

// ---------- Carregando ----------
export function Carregando({ texto = 'Carregando...', inline = false, tamanho = 6 }) {
  return html`<div class=${`carregando-bloco ${inline ? 'inline' : ''}`} role="status">
    <div class="spinner" style=${{ '--t': `${tamanho}px` }} aria-hidden="true">${Array.from({ length: 9 }, () => html`<i></i>`)}</div>
    ${texto && html`<span>${texto}</span>`}
  </div>`;
}

// ---------- Estado vazio ----------
// Usa assets/vazio.png quando existir; senão mostra o ícone
export function Vazio({ titulo, texto, icone = 'mundo', imagem = true, children, class: classe = '' }) {
  const [semImagem, setSemImagem] = useState(!imagem);
  return html`<div class=${`vazio ${classe}`}>
    ${semImagem
      ? html`<span class="ilustracao-icone"><${Icone} nome=${icone} tamanho=${48} /></span>`
      : html`<img class="ilustracao" src="../assets/vazio.png" alt="" draggable="false" onError=${() => setSemImagem(true)} />`}
    ${titulo && html`<h3>${titulo}</h3>`}
    ${texto && html`<p>${texto}</p>`}
    ${children && html`<div class="acoes">${children}</div>`}
  </div>`;
}

// ---------- Cartão ----------
export function Cartao({ children, interativo = false, selecionado = false, aoClicar, class: classe = '', ...resto }) {
  const teclas = interativo ? (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); aoClicar && aoClicar(e); } } : undefined;
  return html`<div class=${`cartao ${interativo ? 'interativo' : ''} ${selecionado ? 'selecionado' : ''} ${classe}`}
    tabindex=${interativo ? 0 : undefined} role=${interativo ? 'button' : undefined}
    onClick=${aoClicar} onKeyDown=${teclas} ...${resto}>${children}</div>`;
}

// ---------- Etiquetas ----------
// cor: 'destaque' | 'verde' | 'amarelo' | 'vermelho' | 'cinza' | (vazio = neutra)
export function Etiqueta({ cor = '', icone, cheia = false, dica, children, class: classe = '' }) {
  return html`<span class=${`etiqueta ${cor} ${cheia ? 'cheia' : ''} ${classe}`} data-dica=${dica || undefined}>
    ${icone && html`<${Icone} nome=${icone} tamanho=${12} />`}${children}
  </span>`;
}

export const NOMES_LOADER = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

// Ícone pixel do loader (assets/loaders/<tipo>.png, 32x32)
export const iconeLoaderUrl = (tipo) => `../assets/loaders/${tipo || 'vanilla'}.png`;

export function IconeLoader({ tipo = 'vanilla', tamanho = 16 }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return html`<i class="losango"></i>`;
  return html`<img class="icone-loader pixelado" src=${iconeLoaderUrl(tipo)} alt="" width=${tamanho} height=${tamanho}
    draggable="false" onError=${() => setFalhou(true)} />`;
}

// loader: { tipo, versao } ou só o tipo ('fabric')
export function EtiquetaLoader({ loader, mostrarVersao = false, class: classe = '' }) {
  const tipo = (typeof loader === 'string' ? loader : loader && loader.tipo) || 'vanilla';
  const versao = typeof loader === 'object' && loader ? loader.versao : null;
  return html`<span class=${`etiqueta loader-${tipo} ${classe}`}>
    <${IconeLoader} tipo=${tipo} tamanho=${14} />${NOMES_LOADER[tipo] || tipo}${mostrarVersao && versao ? ` ${versao}` : ''}
  </span>`;
}

// ---------- Menu de ações ----------
// itens: [{ rotulo, icone?, aoClicar, perigo?, desabilitado? } | { separador: true }]
// html`<${Menu} ancora=${ref} aberto=${aberto} aoFechar=${fechar} itens=${[...]} />`
export function Menu({ ancora, aberto, aoFechar, itens = [], posicao = 'baixo-dir', largura = 220 }) {
  return html`<${Flutuante} ancora=${ancora} aberto=${aberto} aoFechar=${aoFechar} posicao=${posicao} largura=${largura}>
    <div class="lista-opcoes" role="menu">
      ${itens.filter(Boolean).map((it, i) => it.separador
        ? html`<div key=${i} class="separador"></div>`
        : html`<button key=${i} type="button" role="menuitem" class=${`opcao ${it.perigo ? 'perigo' : ''}`} disabled=${it.desabilitado}
            onClick=${() => { aoFechar && aoFechar(); it.aoClicar && it.aoClicar(); }}>
            ${it.icone && html`<${Icone} nome=${it.icone} tamanho=${16} />`}
            <span class="truncar">${it.rotulo}</span>
            ${it.detalhe && html`<span class="detalhe">${it.detalhe}</span>`}
          </button>`)}
    </div>
  <//>`;
}
