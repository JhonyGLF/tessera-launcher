// Botão no estilo Bedrock.
// variante: 'pedra' (padrão) | 'principal' (verde) | 'perigo' (vermelho) | 'destaque' (cor do tema) | 'fantasma'
// tamanho: 'p' | 'm' (padrão) | 'g' | 'gg'
// Uso: html`<${Botao} variante="principal" icone="jogar" aoClicar=${fn}>Jogar<//>`
import { html } from '../vendor/preact-htm.js';
import { Icone } from './icone.js';

const TAM_ICONE = { p: 16, m: 16, g: 24, gg: 32 };

export function Botao({
  variante = 'pedra', tamanho = 'm', icone, iconeDireita, carregando = false, desabilitado = false,
  dica, aoClicar, tipo = 'button', bloco = false, class: classe = '', rotulo, children, ...resto
}) {
  const soIcone = icone && (children == null || children === false || (Array.isArray(children) && !children.length));
  const classes = [
    'btn', `btn-${variante}`, tamanho !== 'm' && `btn-${tamanho}`, soIcone && 'so-icone',
    carregando && 'carregando', bloco && 'bloco', classe,
  ].filter(Boolean).join(' ');
  return html`<button type=${tipo} class=${classes} disabled=${desabilitado || carregando}
    aria-busy=${carregando ? 'true' : undefined} aria-label=${rotulo || (soIcone ? dica : undefined)}
    data-dica=${dica || undefined} onClick=${aoClicar} ...${resto}>
    ${icone && html`<${Icone} nome=${icone} tamanho=${TAM_ICONE[tamanho] || 16} />`}
    ${children}
    ${iconeDireita && html`<${Icone} nome=${iconeDireita} tamanho=${TAM_ICONE[tamanho] || 16} />`}
  </button>`;
}
