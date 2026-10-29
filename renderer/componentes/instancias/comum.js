// Peças compartilhadas pelas páginas de instâncias: presets de ícone, botão Jogar/Parar,
// progresso do preparo, ações (pasta, duplicar, excluir) e o menu "...".
import { html, useEffect, useRef } from '../../vendor/preact-htm.js';
import { api } from '../../api.js';
import { useEstado, jogar, parar, recarregarInstancias } from '../../estado.js';
import { navegar } from '../../rotas.js';
import { Botao, BarraProgresso, confirmar, toast } from '../index.js';
import { cls } from '../../util.js';

// ---------- Ícones (assets/icones/<nome>.png) ----------
export const ICONES = [
  ['grama', 'Grama'], ['pedra', 'Pedra'], ['terra', 'Terra'], ['madeira', 'Madeira'], ['folhas', 'Folhas'],
  ['areia', 'Areia'], ['neve', 'Neve'], ['obsidiana', 'Obsidiana'], ['diamante', 'Diamante'], ['esmeralda', 'Esmeralda'],
  ['ouro', 'Ouro'], ['ferro', 'Ferro'], ['redstone', 'Redstone'], ['ametista', 'Ametista'], ['lava', 'Lava'],
  ['agua', 'Água'], ['livro', 'Livro'], ['espada', 'Espada'], ['picareta', 'Picareta'], ['maca', 'Maçã'],
];
export const urlIcone = (nome) => `../assets/icones/${nome}.png`;

// Grade com os 20 presets
export function GradeIcones({ valor, aoEscolher, desabilitado = false }) {
  return html`<div class="grade-icones" role="radiogroup" aria-label="Ícone">
    ${ICONES.map(([id, nome]) => html`<button key=${id} type="button" role="radio" aria-checked=${valor === id}
      class=${cls('opcao-icone', valor === id && 'ativa')} data-dica=${nome} aria-label=${nome}
      disabled=${desabilitado} onClick=${() => aoEscolher(id)}>
      <img class="pixelado" src=${urlIcone(id)} alt="" draggable="false" />
    </button>`)}
  </div>`;
}

// ---------- Rotas ----------
export const rotaInstancia = (id, aba) => `/instancia/${encodeURIComponent(id)}${aba ? `/${aba}` : ''}`;

// ---------- Ordem ----------
export function ordenar(instancias, ordem, rodando = {}) {
  const l = [...instancias];
  if (ordem === 'nome') return l.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true }));
  // recentes: abertas primeiro, depois a jogada (ou criada) por último
  return l.sort((a, b) => (rodando[b.id] ? 1 : 0) - (rodando[a.id] ? 1 : 0)
    || (b.ultimoJogo || b.criadaEm || 0) - (a.ultimoJogo || a.criadaEm || 0));
}

// ---------- Jogar / Parar ----------
// fase: undefined | 'preparando' | 'abrindo' | 'rodando'
export function BotaoJogar({ inst, fase, semConta, tamanho = 'gg', soIcone = false, class: classe = '' }) {
  const ocupado = fase === 'preparando' || fase === 'abrindo';
  const parar_ = (e) => { e.stopPropagation(); parar(inst.id); };
  const jogar_ = (e) => { e.stopPropagation(); jogar(inst.id); };
  if (fase === 'rodando') {
    return html`<${Botao} variante="perigo" tamanho=${tamanho} icone="parar" class=${cls('botao-jogar-inst', classe)}
      dica=${soIcone ? 'Fechar o jogo' : undefined} aoClicar=${parar_}>${soIcone ? null : 'Parar'}<//>`;
  }
  return html`<${Botao} variante="principal" tamanho=${tamanho} icone=${ocupado && !soIcone ? undefined : 'jogar'}
    class=${cls('botao-jogar-inst', classe)} carregando=${ocupado} desabilitado=${semConta}
    dica=${semConta ? 'Adicione uma conta para jogar' : soIcone ? (ocupado ? 'Abrindo...' : 'Jogar') : undefined}
    aoClicar=${jogar_}>${soIcone ? null : fase === 'abrindo' ? 'Abrindo...' : ocupado ? 'Preparando...' : 'Jogar'}<//>`;
}

// Tarefa de preparo da instância ("Abrindo <nome>"); senão a mais recente em andamento
export function tarefaDe(tarefas, inst) {
  const rodando = tarefas.filter((t) => t.estado === 'rodando');
  return rodando.find((t) => t.titulo && t.titulo.includes(inst.nome)) || null;
}

export function ProgressoPreparo({ inst }) {
  const tarefas = useEstado((e) => e.tarefas);
  const t = tarefaDe(tarefas, inst);
  return html`<div class="inst-preparo" role="status">
    <${BarraProgresso} valor=${t && t.total ? t.feitos / t.total : null} rotulo="Progresso do preparo" />
    <span class="etapa truncar">
      ${t ? (t.etapa || t.titulo) : 'Abrindo o Minecraft...'}
      ${t && t.total ? html` <span class="vt">${t.feitos}/${t.total}</span>` : ''}
    </span>
    ${t && t.total ? html`<span class="pct vt">${Math.floor((t.feitos / t.total) * 100)}%</span>` : ''}
  </div>`;
}

// ---------- Ações ----------
const avisarErro = (r, padrao) => toast((r && r.mensagem) || padrao, { tipo: 'erro' });

export async function abrirPasta(id, sub) {
  const r = await api.abrirPastaInstancia(id, sub);
  if (r && r.ok === false) avisarErro(r, 'Não foi possível abrir a pasta.');
}

export async function duplicar(inst) {
  toast(`Duplicando ${inst.nome}...`, { duracao: 2500 });
  const r = await api.duplicarInstancia(inst.id);
  if (!r || r.ok === false) return avisarErro(r, 'Não foi possível duplicar a instância.');
  await recarregarInstancias();
  const nova = r.instancia;
  toast(nova ? `"${nova.nome}" criada.` : 'Instância duplicada.', {
    tipo: 'ok', titulo: 'Cópia pronta',
    acao: nova ? { rotulo: 'Abrir', aoClicar: () => navegar(rotaInstancia(nova.id)) } : undefined,
  });
}

// Pede confirmação; devolve true se excluiu
export async function excluir(inst) {
  const sim = await confirmar({
    titulo: 'Excluir instância?',
    mensagem: `"${inst.nome}" será apagada do computador, com todos os mundos, mods e configurações dela. Isso não pode ser desfeito.`,
    confirmar: 'Excluir', perigo: true,
  });
  if (!sim) return false;
  const r = await api.removerInstancia(inst.id);
  if (!r || r.ok === false) { avisarErro(r, 'Não foi possível excluir a instância.'); return false; }
  await recarregarInstancias();
  toast(`"${inst.nome}" foi excluída.`, { tipo: 'ok' });
  return true;
}

// Itens do menu "..." de uma instância
export function itensMenu(inst, fase, { naPagina = false, aoExcluir } = {}) {
  const aberta = !!fase;
  return [
    !naPagina && { rotulo: 'Ver detalhes', icone: 'info', aoClicar: () => navegar(rotaInstancia(inst.id)) },
    { rotulo: 'Abrir pasta', icone: 'pasta', aoClicar: () => abrirPasta(inst.id) },
    { rotulo: 'Duplicar', icone: 'copiar', aoClicar: () => duplicar(inst) },
    naPagina && { rotulo: 'Ver log', icone: 'log', aoClicar: () => navegar(rotaInstancia(inst.id, 'log'), { substituir: true }) },
    { separador: true },
    {
      rotulo: 'Excluir', icone: 'lixeira', perigo: true, desabilitado: aberta,
      detalhe: aberta ? 'feche o jogo' : undefined,
      aoClicar: async () => { if (await excluir(inst) && aoExcluir) aoExcluir(); },
    },
  ].filter(Boolean);
}

// ---------- Tarefas ----------
// Chama fn(tarefas) quando alguma tarefa termina com sucesso (ex.: instalou um mod)
export function useAoConcluirTarefa(fn) {
  const tarefas = useEstado((e) => e.tarefas);
  const vistas = useRef(null);
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const prontas = tarefas.filter((t) => t.estado === 'ok');
    if (vistas.current) {
      const novas = prontas.filter((t) => !vistas.current.has(t.id));
      if (novas.length) ref.current(novas);
    }
    vistas.current = new Set(prontas.map((t) => t.id));
  }, [tarefas]);
}
