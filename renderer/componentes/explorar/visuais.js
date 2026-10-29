// Peças visuais do Explorar/Projeto: caixa de seleção, ícones extras, faixa da instância,
// números do projeto, botão Instalar com estados e esqueletos de carregamento.
import { html } from '../../vendor/preact-htm.js';
import { navegar, trocarQuery } from '../../rotas.js';
import { Botao, Icone, IconeInstancia, EtiquetaLoader, Etiqueta } from '../index.js';
import { numeroCompacto, numero, tempoRelativo, formatarData, cls } from '../../util.js';
import { rotaInstancia } from './comum.js';

// ---------- Ícones pixel que faltam no conjunto base (desenhados aqui em "arte ASCII") ----------
const ARTES = {
  cadeado: [
    '................',
    '.....######.....',
    '....##....##....',
    '....#......#....',
    '....#......#....',
    '....#......#....',
    '..############..',
    '..############..',
    '..#####..#####..',
    '..#####..#####..',
    '..######.#####..',
    '..############..',
    '..############..',
    '..############..',
    '................',
    '................',
  ],
  discord: [
    '................',
    '................',
    '...###....###...',
    '..############..',
    '.##############.',
    '.##############.',
    '.####..##..####.',
    '.###....#...###.',
    '.####..##..####.',
    '.##############.',
    '.##############.',
    '..####....####..',
    '...##......##...',
    '................',
    '................',
    '................',
  ],
  livro: [
    '................',
    '..###########...',
    '..#.........##..',
    '..#.######..##..',
    '..#.........##..',
    '..#.#####...##..',
    '..#.........##..',
    '..#.######..##..',
    '..#.........##..',
    '..#.........##..',
    '..###########...',
    '..#.........#...',
    '..###########...',
    '................',
    '................',
    '................',
  ],
  inseto: [
    '................',
    '.....#....#.....',
    '......#..#......',
    '.....######.....',
    '..#.########.#..',
    '...##########...',
    '....###..###....',
    '.######..######.',
    '....###..###....',
    '...##########...',
    '..#.########.#..',
    '.....######.....',
    '......####......',
    '................',
    '................',
    '................',
  ],
  codigo: [
    '................',
    '................',
    '.....#....#.....',
    '....##....##....',
    '...##......##...',
    '..##...##...##..',
    '.##....#.....##.',
    '##....##......##',
    '.##...#......##.',
    '..##.##.....##..',
    '...##......##...',
    '....##....##....',
    '.....#....#.....',
    '................',
    '................',
    '................',
  ],
};
const caminhoDe = (arte) => arte.map((linha, y) => {
  let d = '';
  for (let x = 0; x < linha.length;) {
    if (linha[x] !== '#') { x++; continue; }
    let f = x;
    while (f < linha.length && linha[f] === '#') f++;
    d += `M${x} ${y}h${f - x}v1h-${f - x}z`;
    x = f;
  }
  return d;
}).join('');
const CAMINHOS = Object.fromEntries(Object.entries(ARTES).map(([k, v]) => [k, caminhoDe(v)]));

export function IconeExtra({ nome, tamanho = 16, class: classe = '' }) {
  return html`<svg class=${`icone ${classe}`} width=${tamanho} height=${tamanho} viewBox="0 0 16 16" shape-rendering="crispEdges"
    fill="currentColor" aria-hidden="true"><path d=${CAMINHOS[nome] || ''} /></svg>`;
}

// ---------- Caixa de seleção (checkbox) pixel ----------
export function Caixa({ marcada, aoMudar, rotulo, detalhe, desabilitada = false }) {
  return html`<label class=${cls('caixa', marcada && 'marcada', desabilitada && 'desabilitada')}>
    <input type="checkbox" checked=${!!marcada} disabled=${desabilitada} onChange=${(e) => aoMudar && aoMudar(e.currentTarget.checked)} />
    <span class="caixa-quadro" aria-hidden="true">${marcada && html`<${Icone} nome="ok" tamanho=${12} />`}</span>
    <span class="caixa-rotulo truncar">${rotulo}</span>
    ${detalhe != null && html`<span class="caixa-detalhe">${detalhe}</span>`}
  </label>`;
}

// ---------- Faixa "Adicionando em: <instância>" ----------
export function FaixaContexto({ inst, aoSair }) {
  if (!inst) return null;
  return html`<div class="faixa-contexto">
    <span class="faixa-brilho" aria-hidden="true"></span>
    <span class="rotulo-faixa">Adicionando em</span>
    <a class="faixa-inst" href=${`#${rotaInstancia(inst.id)}`}
      onClick=${(e) => { e.preventDefault(); navegar(rotaInstancia(inst.id)); }}>
      <${IconeInstancia} inst=${inst} tamanho=${32} />
      <strong class="truncar">${inst.nome}</strong>
    </a>
    <span class="faixa-etiquetas">
      <${Etiqueta} cor="cinza">Minecraft ${inst.mc}<//>
      <${EtiquetaLoader} loader=${inst.loader} mostrarVersao />
    </span>
    <span class="faixa-acoes">
      <${Botao} tamanho="p" icone="voltar" aoClicar=${() => navegar(rotaInstancia(inst.id))}>Voltar para a instância<//>
      <${Botao} variante="fantasma" tamanho="p" icone="fechar" dica="Explorar sem instância"
        aoClicar=${aoSair || (() => trocarQuery({ instancia: '' }))} />
    </span>
  </div>`;
}

// ---------- Números (downloads, seguidores, atualizado) ----------
export function Numeros({ projeto, completo = false }) {
  return html`<span class="numeros">
    <span data-dica=${`${numero(projeto.downloads)} downloads`}>
      <${Icone} nome="download" tamanho=${16} /><b>${numeroCompacto(projeto.downloads)}</b>${completo && html` <small>downloads</small>`}
    </span>
    <span data-dica=${`${numero(projeto.seguidores)} seguidores`}>
      <${Icone} nome="coracao" tamanho=${16} /><b>${numeroCompacto(projeto.seguidores)}</b>${completo && html` <small>seguidores</small>`}
    </span>
    ${projeto.atualizado && html`<span data-dica=${`Atualizado em ${formatarData(projeto.atualizado)}`}>
      <${Icone} nome="relogio" tamanho=${16} />${completo ? `Atualizado ${tempoRelativo(projeto.atualizado)}` : tempoRelativo(projeto.atualizado)}
    </span>`}
  </span>`;
}

// ---------- Botão Instalar com estados ----------
// estado: 'livre' | 'instalando' | 'instalado' | 'incompativel'
export function BotaoInstalar({ estado = 'livre', motivo, tamanho = 'p', rotulo = 'Instalar', aoClicar, class: classe = '' }) {
  const parar = (e) => e.stopPropagation();
  if (estado === 'instalado') {
    return html`<span class=${cls('selo-instalado', `t-${tamanho}`, classe)} onClick=${parar}>
      <${Icone} nome="ok" tamanho=${16} /> Instalado
    </span>`;
  }
  if (estado === 'instalando') {
    return html`<${Botao} variante="principal" tamanho=${tamanho} carregando class=${classe} onClick=${parar}>Instalando<//>`;
  }
  if (estado === 'incompativel') {
    // botão desabilitado não recebe o mouse: a dica fica no invólucro
    return html`<span class="tem-dica" data-dica=${motivo || 'Não é compatível'} onClick=${parar}>
      <${Botao} tamanho=${tamanho} icone="download" class=${classe} desabilitado>${rotulo}<//>
    </span>`;
  }
  return html`<${Botao} variante="principal" tamanho=${tamanho} icone="download" class=${classe}
    aoClicar=${(e) => { e.stopPropagation(); aoClicar && aoClicar(); }}>${rotulo}<//>`;
}

// ---------- Esqueleto de carregamento ----------
export const Brilho = ({ l, a = 12, class: classe = '' }) => html`<i class=${cls('brilho', classe)} style=${{ width: l, height: `${a}px` }}></i>`;
