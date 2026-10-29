// Controles de formulário: Alternador (switch), Deslizador (range), Abas, CampoTexto.
import { html, useEffect, useState } from '../vendor/preact-htm.js';
import { Icone } from './icone.js';

// Alternador: html`<${Alternador} ligado=${x} aoMudar=${setX} rotulo="Mostrar snapshots" />`
export function Alternador({ ligado, aoMudar, rotulo, desabilitado = false, dica }) {
  const alternar = () => !desabilitado && aoMudar && aoMudar(!ligado);
  return html`<button type="button" role="switch" aria-checked=${!!ligado} aria-label=${typeof rotulo === 'string' ? rotulo : undefined}
    class=${`alternador ${ligado ? 'ligado' : ''} ${desabilitado ? 'desabilitado' : ''}`}
    disabled=${desabilitado} data-dica=${dica || undefined} onClick=${alternar}>
    <span class="trilho"><span class="botao-alt"></span></span>
    ${rotulo && html`<span class="rotulo-alt">${rotulo}</span>`}
  </button>`;
}

// Deslizador: aoMudar enquanto arrasta, aoSoltar quando solta (bom para salvar)
// html`<${Deslizador} valor=${ram} min=${1024} max=${16384} passo=${512} formatar=${(v) => v/1024 + ' GB'} aoSoltar=${salvar} />`
export function Deslizador({ valor, min = 0, max = 100, passo = 1, aoMudar, aoSoltar, formatar = (v) => v, rotulo, desabilitado = false }) {
  const [local, setLocal] = useState(valor);
  useEffect(() => setLocal(valor), [valor]);
  const pct = max > min ? ((local - min) / (max - min)) * 100 : 0;
  return html`<div class="deslizador">
    <input type="range" min=${min} max=${max} step=${passo} value=${local} disabled=${desabilitado}
      aria-label=${rotulo} aria-valuetext=${String(formatar(local))} style=${{ '--pct': `${pct}%` }}
      onInput=${(e) => { const v = Number(e.currentTarget.value); setLocal(v); aoMudar && aoMudar(v); }}
      onChange=${(e) => aoSoltar && aoSoltar(Number(e.currentTarget.value))} />
    <span class="valor-desl">${formatar(local)}</span>
  </div>`;
}

// Abas: abas = [{ id, rotulo, icone?, contagem? }]
export function Abas({ abas = [], ativa, aoMudar, class: classe = '' }) {
  const teclas = (e) => {
    const i = abas.findIndex((a) => a.id === ativa);
    if (e.key === 'ArrowRight' && i < abas.length - 1) aoMudar(abas[i + 1].id);
    if (e.key === 'ArrowLeft' && i > 0) aoMudar(abas[i - 1].id);
  };
  return html`<div class=${`abas ${classe}`} role="tablist" onKeyDown=${teclas}>
    ${abas.map((a) => html`<button key=${a.id} type="button" role="tab" aria-selected=${a.id === ativa}
      tabindex=${a.id === ativa ? 0 : -1} class=${`aba ${a.id === ativa ? 'ativa' : ''}`} onClick=${() => aoMudar(a.id)}>
      ${a.icone && html`<${Icone} nome=${a.icone} tamanho=${16} />`}
      ${a.rotulo}
      ${a.contagem != null && html`<span class="contagem">${a.contagem}</span>`}
    </button>`)}
  </div>`;
}

// Campo de texto com ícone opcional e botão de limpar
export function CampoTexto({ valor = '', aoMudar, placeholder, icone, limpar = false, invalido = false, class: classe = '', entradaRef, ...resto }) {
  return html`<label class=${`campo-texto ${invalido ? 'invalido' : ''} ${classe}`}>
    ${icone && html`<${Icone} nome=${icone} tamanho=${16} />`}
    <input ref=${entradaRef} value=${valor} placeholder=${placeholder} spellcheck="false"
      onInput=${(e) => aoMudar && aoMudar(e.currentTarget.value)} ...${resto} />
    ${limpar && valor && html`<button type="button" class="limpar" aria-label="Limpar" onClick=${() => aoMudar && aoMudar('')}>
      <${Icone} nome="fechar" tamanho=${16} />
    </button>`}
  </label>`;
}
