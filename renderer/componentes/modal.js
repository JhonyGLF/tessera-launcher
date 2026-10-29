// Modal (diálogo) e Confirmar (substitui o confirm() nativo, que não existe aqui).
//
// Modal declarativo:
//   html`<${Modal} aberto=${aberto} titulo="Nova instância" aoFechar=${fechar}
//          rodape=${html`<${Botao} ...>Criar<//>`} largura=${560}>...conteúdo...<//>`
// Confirmar (Promise<boolean>):
//   if (await confirmar({ titulo: 'Remover conta?', mensagem: '...', confirmar: 'Remover', perigo: true })) ...
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import { Portal } from './camada.js';
import { Botao } from './botao.js';
import { Icone } from './icone.js';

let pilhaModais = 0; // para o Esc fechar só o de cima

export function Modal({ aberto, titulo, aoFechar, rodape, largura, semEspaco = false, fecharFora = true, class: classe = '', children }) {
  const caixa = useRef(null);
  const nivel = useRef(0);

  useEffect(() => {
    if (!aberto) return;
    nivel.current = ++pilhaModais;
    const anterior = document.activeElement;
    // foca o primeiro campo (ou o próprio modal)
    requestAnimationFrame(() => {
      if (!caixa.current) return;
      const alvo = caixa.current.querySelector('[autofocus], input, textarea') || caixa.current;
      alvo.focus({ preventScroll: true });
    });
    const tecla = (e) => {
      if (e.key === 'Escape' && nivel.current === pilhaModais) { e.stopPropagation(); aoFechar && aoFechar(); }
      // mantém o Tab dentro do modal
      if (e.key === 'Tab' && caixa.current && nivel.current === pilhaModais) {
        const focaveis = [...caixa.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"]), a[href], textarea, select')];
        if (!focaveis.length) return;
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
      }
    };
    document.addEventListener('keydown', tecla);
    return () => {
      pilhaModais--;
      document.removeEventListener('keydown', tecla);
      if (anterior && anterior.focus && anterior.isConnected) anterior.focus();
    };
  }, [aberto]);

  if (!aberto) return null;
  const estilo = largura ? { width: typeof largura === 'number' ? `${largura}px` : largura } : undefined;
  return html`<${Portal}>
    <div class="modal-fundo" onPointerDown=${(e) => { if (fecharFora && e.target === e.currentTarget) aoFechar && aoFechar(); }}>
      <div ref=${caixa} class=${`modal ${semEspaco ? 'sem-espaco' : ''} ${classe}`} style=${estilo}
        role="dialog" aria-modal="true" aria-label=${typeof titulo === 'string' ? titulo : undefined} tabindex="-1">
        ${titulo != null && html`<div class="modal-cabeca">
          <h2 class="truncar">${titulo}</h2>
          ${aoFechar && html`<${Botao} variante="fantasma" tamanho="p" icone="fechar" dica="Fechar" aoClicar=${aoFechar} />`}
        </div>`}
        <div class="modal-corpo">${children}</div>
        ${rodape && html`<div class="modal-rodape">${rodape}</div>`}
      </div>
    </div>
  <//>`;
}

// ---------- Confirmar ----------
let pedirConfirmacao = null;
const fila = [];

export function confirmar(opcoes) {
  return new Promise((resolver) => {
    const pedido = { ...opcoes, resolver };
    if (pedirConfirmacao) pedirConfirmacao(pedido);
    else fila.push(pedido);
  });
}

// Fica montado uma vez no app (já está em app.js)
export function HostDialogos() {
  const [pedido, setPedido] = useState(null);
  useEffect(() => {
    pedirConfirmacao = (p) => setPedido(p);
    if (fila.length) setPedido(fila.shift());
    return () => { pedirConfirmacao = null; };
  }, []);
  if (!pedido) return null;
  const responder = (sim) => { pedido.resolver(sim); setPedido(fila.shift() || null); };
  const perigo = !!pedido.perigo;
  return html`<${Modal} aberto titulo=${pedido.titulo || 'Tem certeza?'} aoFechar=${() => responder(false)} largura=${460}
    rodape=${html`
      <${Botao} variante="pedra" aoClicar=${() => responder(false)}>${pedido.cancelar || 'Cancelar'}<//>
      <${Botao} variante=${perigo ? 'perigo' : 'principal'} autofocus aoClicar=${() => responder(true)}>${pedido.confirmar || 'Confirmar'}<//>
    `}>
    <div class=${`confirmar-corpo ${perigo ? 'perigo' : ''}`}>
      <span class="icone-grande"><${Icone} nome=${pedido.icone || (perigo ? 'lixeira' : 'aviso')} tamanho=${32} /></span>
      <p>${pedido.mensagem}</p>
    </div>
  <//>`;
}
