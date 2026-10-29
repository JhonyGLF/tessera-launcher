// Select estilizado com lista própria (e busca opcional para listas longas, como versões).
// opcoes: [{ valor, rotulo, detalhe?, grupo?, desabilitado? }]  (ou strings)
// Uso: html`<${Select} valor=${v} opcoes=${lista} aoMudar=${setV} busca placeholder="Escolha" />`
import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import { Flutuante } from './camada.js';
import { Icone } from './icone.js';

const normalizar = (o) => (typeof o === 'object' && o !== null ? o : { valor: o, rotulo: String(o) });
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Select({
  valor, opcoes = [], aoMudar, busca = false, placeholder = 'Selecione...', largura, larguraLista,
  desabilitado = false, rotulo, class: classe = '', posicao = 'baixo-esq',
}) {
  const ancora = useRef(null);
  const campo = useRef(null);
  const rolagem = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [ativa, setAtiva] = useState(0);

  const todas = useMemo(() => opcoes.map(normalizar), [opcoes]);
  const atual = todas.find((o) => o.valor === valor);
  const visiveis = useMemo(() => {
    if (!filtro) return todas;
    const f = semAcento(filtro);
    return todas.filter((o) => semAcento(o.rotulo).includes(f) || semAcento(o.detalhe || '').includes(f));
  }, [todas, filtro]);

  const abrir = () => {
    if (desabilitado) return;
    setFiltro('');
    setAtiva(Math.max(0, todas.findIndex((o) => o.valor === valor)));
    setAberto(true);
  };
  const fechar = () => { setAberto(false); ancora.current && ancora.current.focus(); };
  const escolher = (o) => {
    if (!o || o.desabilitado) return;
    setAberto(false);
    ancora.current && ancora.current.focus();
    if (o.valor !== valor) aoMudar && aoMudar(o.valor, o);
  };

  // ao abrir: foca a busca e rola até a opção atual
  useEffect(() => {
    if (!aberto) return;
    requestAnimationFrame(() => {
      if (campo.current) campo.current.focus({ preventScroll: true });
      const el = rolagem.current && rolagem.current.querySelector('.opcao.ativa');
      if (el) el.scrollIntoView({ block: 'center' });
    });
  }, [aberto]);
  useEffect(() => { setAtiva(0); }, [filtro]);

  const teclas = (e) => {
    if (!aberto) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); abrir(); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAtiva((i) => Math.min(visiveis.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtiva((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); escolher(visiveis[ativa]); }
    else if (e.key === 'Tab') setAberto(false);
  };

  // mantém a opção ativa visível ao navegar com o teclado
  useEffect(() => {
    if (!aberto || !rolagem.current) return;
    const el = rolagem.current.querySelector('.opcao.ativa');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [ativa, aberto]);

  let grupoAnterior = null;
  const estilo = largura ? { width: typeof largura === 'number' ? `${largura}px` : largura } : undefined;

  return html`
    <button ref=${ancora} type="button" class=${`select ${aberto ? 'aberto' : ''} ${classe}`} style=${estilo}
      disabled=${desabilitado} aria-haspopup="listbox" aria-expanded=${aberto} aria-label=${rotulo}
      onClick=${() => (aberto ? fechar() : abrir())} onKeyDown=${teclas}>
      <span class=${`valor truncar ${atual ? '' : 'vazio'}`}>${atual ? atual.rotulo : placeholder}</span>
      <${Icone} nome="seta-baixo" tamanho=${16} />
    </button>
    <${Flutuante} ancora=${ancora} aberto=${aberto} aoFechar=${() => setAberto(false)} posicao=${posicao}
      largura=${larguraLista || 'ancora'} distancia=${6}>
      <div class="lista-opcoes" role="listbox" onKeyDown=${teclas} style=${{ maxHeight: 'inherit' }}>
        ${busca && html`<label class="campo-texto busca-opcoes">
          <${Icone} nome="busca" tamanho=${16} />
          <input ref=${campo} value=${filtro} placeholder="Buscar..." onInput=${(e) => setFiltro(e.currentTarget.value)} aria-label="Buscar opção" />
        </label>`}
        <div class="rolagem" ref=${rolagem}>
          ${visiveis.length === 0 && html`<div class="nenhuma">Nada encontrado.</div>`}
          ${visiveis.map((o, i) => {
            const cabecalho = o.grupo && o.grupo !== grupoAnterior ? html`<div class="grupo">${o.grupo}</div>` : null;
            grupoAnterior = o.grupo;
            return html`${cabecalho}<button type="button" role="option" aria-selected=${o.valor === valor}
              class=${`opcao ${i === ativa ? 'ativa' : ''} ${o.valor === valor ? 'selecionada' : ''}`}
              disabled=${o.desabilitado} tabindex="-1"
              onMouseMove=${() => i !== ativa && setAtiva(i)} onClick=${() => escolher(o)}>
              <span class="marca">${o.valor === valor && html`<${Icone} nome="ok" tamanho=${16} />`}</span>
              <span class="truncar">${o.rotulo}</span>
              ${o.detalhe && html`<span class="detalhe">${o.detalhe}</span>`}
            </button>`;
          })}
        </div>
      </div>
    <//>`;
}
