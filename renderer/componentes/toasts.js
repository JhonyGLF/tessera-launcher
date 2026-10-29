// Avisos rápidos no canto da janela.
// Uso: toast('Instância criada!', { tipo: 'ok' })
//      toast('Falhou ao baixar', { tipo: 'erro', titulo: 'Erro', acao: { rotulo: 'Ver log', aoClicar: fn } })
// tipo: 'info' (padrão) | 'ok' | 'erro' | 'aviso'
import { html, useEffect, useState } from '../vendor/preact-htm.js';
import { Icone } from './icone.js';
import { Botao } from './botao.js';

let lista = [];
let contador = 0;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f(lista));

const ICONE = { info: 'info', ok: 'ok', erro: 'aviso', aviso: 'aviso' };

export function toast(mensagem, { tipo = 'info', titulo, acao, duracao } = {}) {
  const id = ++contador;
  lista = [...lista, { id, mensagem, tipo, titulo, acao }].slice(-4);
  avisar();
  const tempo = duracao ?? (tipo === 'erro' ? 8000 : 4500);
  if (tempo > 0) setTimeout(() => fecharToast(id), tempo);
  return id;
}

export function fecharToast(id) {
  if (!lista.some((t) => t.id === id && !t.saindo)) return;
  lista = lista.map((t) => (t.id === id ? { ...t, saindo: true } : t));
  avisar();
  setTimeout(() => { lista = lista.filter((t) => t.id !== id); avisar(); }, 170);
}

export function Toasts() {
  const [itens, setItens] = useState(lista);
  useEffect(() => {
    ouvintes.add(setItens);
    return () => ouvintes.delete(setItens);
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${itens.map((t) => html`<div key=${t.id} class=${`toast ${t.tipo} ${t.saindo ? 'saindo' : ''}`}>
      <${Icone} nome=${ICONE[t.tipo] || 'info'} tamanho=${16} />
      <div class="texto">
        ${t.titulo && html`<strong>${t.titulo}</strong>`}
        ${t.mensagem}
        ${t.acao && html`<div class="acao-toast">
          <${Botao} tamanho="p" aoClicar=${() => { t.acao.aoClicar(); fecharToast(t.id); }}>${t.acao.rotulo}<//>
        </div>`}
      </div>
      <button class="fechar-toast" aria-label="Fechar aviso" onClick=${() => fecharToast(t.id)}><${Icone} nome="fechar" tamanho=${16} /></button>
    </div>`)}
  </div>`;
}
