// Ponto de entrada da interface: monta a janela (barra lateral + área de conteúdo) e
// escolhe a página pela rota (hash).
import { html, render, useEffect, useErrorBoundary, useRef, useState } from './vendor/preact-htm.js';
import { api } from './api.js';
import { iniciar, useEstado, recarregarContas, jogar, parar } from './estado.js';
import { useRota, navegar, voltar, podeVoltar, TITULOS, useTituloAtual } from './rotas.js';
import {
  Icone, Botao, CabecaSkin, BarraProgresso, Flutuante, Portal, Toasts, HostDialogos, Vazio, toast, iniciarDicas, IconeInstancia,
} from './componentes/index.js';
import { cls } from './util.js';

import PaginaInicio from './paginas/inicio.js';
import PaginaInstancias from './paginas/instancias.js';
import PaginaInstancia from './paginas/instancia.js';
import PaginaExplorar from './paginas/explorar.js';
import PaginaProjeto from './paginas/projeto.js';
import PaginaContas from './paginas/contas.js';
import PaginaConfiguracoes from './paginas/configuracoes.js';

const PAGINAS = {
  inicio: PaginaInicio,
  instancias: PaginaInstancias,
  instancia: PaginaInstancia,
  explorar: PaginaExplorar,
  projeto: PaginaProjeto,
  contas: PaginaContas,
  configuracoes: PaginaConfiguracoes,
};

const NAV = [
  { id: 'inicio', rotulo: 'Início', icone: 'inicio', rota: '/inicio' },
  { id: 'instancias', rotulo: 'Instâncias', icone: 'instancias', rota: '/instancias', tambem: ['instancia'] },
  { id: 'explorar', rotulo: 'Explorar', icone: 'explorar', rota: '/explorar', tambem: ['projeto'] },
  { id: 'contas', rotulo: 'Contas', icone: 'contas', rota: '/contas' },
  { id: 'configuracoes', rotulo: 'Configurações', icone: 'engrenagem', rota: '/configuracoes' },
];

// ---------- Barra lateral ----------
function Navegacao({ pagina }) {
  const qtd = useEstado((e) => e.instancias.length);
  return html`<nav class="nav" aria-label="Navegação principal">
    ${NAV.map((n) => {
      const ativo = n.id === pagina || (n.tambem && n.tambem.includes(pagina));
      return html`<a key=${n.id} href=${`#${n.rota}`} class=${cls('nav-item', ativo && 'ativo')} aria-current=${ativo ? 'page' : undefined}
        onClick=${(e) => { e.preventDefault(); navegar(n.rota); }}>
        <${Icone} nome=${n.icone} tamanho=${16} />
        ${n.rotulo}
        ${n.id === 'instancias' && qtd > 0 && html`<span class="nav-contagem">${qtd}</span>`}
      </a>`;
    })}
  </nav>`;
}

// Atalhos para as instâncias jogadas por último
function Recentes() {
  const { instancias, rodando } = useEstado((e) => ({ instancias: e.instancias, rodando: e.rodando }));
  const recentes = [...instancias].filter((i) => i.ultimoJogo || rodando[i.id])
    .sort((a, b) => (rodando[b.id] ? 1 : 0) - (rodando[a.id] ? 1 : 0) || (b.ultimoJogo || 0) - (a.ultimoJogo || 0))
    .slice(0, 3);
  if (!recentes.length) return null;
  return html`<div class="recentes">
    <div class="nav-titulo">Jogadas recentemente</div>
    ${recentes.map((i) => {
      const fase = rodando[i.id];
      return html`<div key=${i.id} class=${cls('recente', fase && 'ativa')}>
        <a class="recente-link" href=${`#/instancia/${encodeURIComponent(i.id)}`}
          onClick=${(e) => { e.preventDefault(); navegar(`/instancia/${encodeURIComponent(i.id)}`); }}>
          <${IconeInstancia} inst=${i} tamanho=${24} />
          <span class="truncar">${i.nome}</span>
          ${fase && html`<span class="ponto-rodando" data-dica=${fase === 'rodando' ? 'Jogando agora' : 'Abrindo...'}></span>`}
        </a>
        ${!fase && html`<button type="button" class="recente-jogar" aria-label=${`Jogar ${i.nome}`} data-dica="Jogar" onClick=${() => jogar(i.id)}>
          <${Icone} nome="jogar" tamanho=${16} />
        </button>`}
      </div>`;
    })}
  </div>`;
}

function progressoDe(t) {
  return t.total ? t.feitos / t.total : null;
}

function PainelTarefas({ tarefas }) {
  if (!tarefas.length) {
    return html`<div class="painel-tarefas"><div class="painel-tarefas-vazio">
      <${Icone} nome="ok" tamanho=${16} /> Nenhuma tarefa em andamento.
    </div></div>`;
  }
  return html`<div class="painel-tarefas">
    <div class="painel-tarefas-cabeca">Tarefas <span>${tarefas.length}</span></div>
    <div class="painel-tarefas-lista">
      ${tarefas.map((t) => html`<div key=${t.id} class=${cls('tarefa', t.estado)}>
        <div class="tarefa-linha">
          <span class="tarefa-titulo truncar">${t.titulo}</span>
          ${t.estado === 'rodando' && t.total > 0 && html`<span class="tarefa-pct">${Math.floor((t.feitos / t.total) * 100)}%</span>`}
          ${t.estado === 'ok' && html`<${Icone} nome="ok" tamanho=${16} class="tarefa-ok" />`}
          ${t.estado === 'erro' && html`<${Icone} nome="aviso" tamanho=${16} class="tarefa-erro" />`}
        </div>
        ${t.estado === 'rodando' && html`<${BarraProgresso} valor=${progressoDe(t)} fina />`}
        <div class="tarefa-etapa truncar">
          ${t.estado === 'rodando'
            ? html`${t.etapa || 'Preparando...'}${t.total > 0 ? html` <span class="vt">${t.feitos}/${t.total}</span>` : ''}`
            : t.estado === 'ok' ? (t.mensagem || 'Concluído') : (t.mensagem || 'Falhou')}
        </div>
      </div>`)}
    </div>
  </div>`;
}

function IndicadorTarefas() {
  const tarefas = useEstado((e) => e.tarefas);
  const [aberto, setAberto] = useState(false);
  const ancora = useRef(null);
  const ativas = tarefas.filter((t) => t.estado === 'rodando');
  const comTotal = ativas.filter((t) => t.total > 0);
  const media = comTotal.length ? comTotal.reduce((s, t) => s + t.feitos / t.total, 0) / comTotal.length : null;
  const erro = tarefas.some((t) => t.estado === 'erro');
  const texto = ativas.length
    ? (ativas.length === 1 ? ativas[0].titulo : `${ativas.length} tarefas em andamento`)
    : erro ? 'Uma tarefa falhou' : 'Nenhuma tarefa';
  return html`
    <button ref=${ancora} type="button" class=${cls('ind-tarefas', ativas.length && 'ativo', aberto && 'aberto', erro && !ativas.length && 'com-erro')}
      aria-expanded=${aberto} onClick=${() => setAberto(!aberto)}>
      <span class="ind-tarefas-linha">
        <${Icone} nome=${erro && !ativas.length ? 'aviso' : 'download'} tamanho=${16} />
        <span class="truncar">${texto}</span>
        ${tarefas.length > 0 && html`<span class="contagem">${ativas.length || tarefas.length}</span>`}
      </span>
      ${ativas.length > 0 && html`<${BarraProgresso} valor=${media} fina />`}
    </button>
    <${Flutuante} ancora=${ancora} aberto=${aberto} aoFechar=${() => setAberto(false)} posicao="direita" distancia=${14} largura=${340}>
      <${PainelTarefas} tarefas=${tarefas} />
    <//>`;
}

// Atualização do próprio launcher: baixando → pronta (reiniciar); na versão portátil, link para baixar
function IndicadorAtualizacao() {
  const a = useEstado((e) => e.atualizacao);
  if (!a || !['baixando', 'pronta', 'disponivel'].includes(a.estado)) return null;
  const pronta = a.estado === 'pronta' || a.estado === 'disponivel';
  const instalar = async () => {
    const r = await api.instalarAtualizacaoLauncher();
    if (r && r.ok === false) toast(r.mensagem || 'Não foi possível atualizar.', { tipo: 'erro' });
  };
  return html`<div class=${cls('ind-atualizacao', pronta && 'pronta')}>
    <span class="icone-atu"><${Icone} nome=${pronta ? 'download' : 'atualizar'} tamanho=${16} /></span>
    <span class="textos">
      <span class="rotulo">${a.estado === 'baixando' ? 'Baixando' : a.estado === 'pronta' ? 'Atualização pronta' : 'Nova versão'}</span>
      <span class="nome truncar">Versão ${a.versao}</span>
      ${a.estado === 'baixando' && html`<${BarraProgresso} valor=${a.progresso || null} fina rotulo="Download da atualização" />`}
    </span>
    ${a.estado === 'pronta' && html`<${Botao} variante="principal" tamanho="p" aoClicar=${instalar}
      dica="Fecha o launcher, instala a versão nova e abre de novo. Um jogo aberto continua rodando.">Reiniciar<//>`}
    ${a.estado === 'disponivel' && html`<${Botao} tamanho="p" aoClicar=${instalar} dica="Abre a página de download no navegador">Baixar<//>`}
  </div>`;
}

function IndicadorJogando() {
  const { rodando, instancias } = useEstado((e) => ({ rodando: e.rodando, instancias: e.instancias }));
  const ids = Object.keys(rodando);
  if (!ids.length) return null;
  const id = ids[0];
  const inst = instancias.find((i) => i.id === id);
  const fase = rodando[id];
  const rotulo = fase === 'rodando' ? 'Jogando' : fase === 'abrindo' ? 'Abrindo' : 'Preparando';
  return html`<div class="ind-jogando">
    <span class="ponto"></span>
    <a class="textos" href=${`#/instancia/${encodeURIComponent(id)}`} onClick=${(e) => { e.preventDefault(); navegar(`/instancia/${encodeURIComponent(id)}`); }}>
      <span class="rotulo">${rotulo}${ids.length > 1 ? ` (+${ids.length - 1})` : ''}</span>
      <span class="nome truncar">${inst ? inst.nome : id}</span>
    </a>
    ${fase !== 'preparando' && html`<${Botao} variante="fantasma" tamanho="p" icone="parar" dica="Fechar o jogo" class="perigo"
      aoClicar=${() => parar(id)} />`}
  </div>`;
}

function SeletorConta() {
  const { contas, contaAtiva, skins } = useEstado((e) => ({ contas: e.contas, contaAtiva: e.contaAtiva, skins: e.skins }));
  const [aberto, setAberto] = useState(false);
  const ancora = useRef(null);
  const atual = contas.find((c) => c.id === contaAtiva);

  if (!contas.length) {
    return html`<button type="button" class="seletor-conta sem-conta" onClick=${() => navegar('/contas')}>
      <${CabecaSkin} skin=${null} tamanho=${32} />
      <span class="textos"><span class="nome">Sem conta</span><span class="tipo">Adicionar conta</span></span>
      <${Icone} nome="mais" tamanho=${16} />
    </button>`;
  }

  const trocar = async (id) => {
    setAberto(false);
    if (id === contaAtiva) return;
    const r = await api.selecionarConta(id);
    if (r && r.ok === false) toast(r.mensagem, { tipo: 'erro' });
    await recarregarContas();
  };

  return html`
    <button ref=${ancora} type="button" class=${cls('seletor-conta', aberto && 'aberto')} aria-haspopup="menu" aria-expanded=${aberto}
      onClick=${() => setAberto(!aberto)}>
      <${CabecaSkin} skin=${atual ? skins[atual.id] : null} tamanho=${32} />
      <span class="textos">
        <span class="nome truncar">${atual ? atual.nome : 'Escolha uma conta'}</span>
        <span class="tipo">${atual ? (atual.tipo === 'msa' ? 'Conta Microsoft' : 'Conta offline') : `${contas.length} contas`}</span>
      </span>
      <${Icone} nome="seta-baixo" tamanho=${16} />
    </button>
    <${Flutuante} ancora=${ancora} aberto=${aberto} aoFechar=${() => setAberto(false)} posicao="direita" distancia=${14} largura=${260}>
      <div class="lista-opcoes menu-contas" role="menu">
        <div class="grupo">Trocar de conta</div>
        ${contas.map((c) => html`<button key=${c.id} type="button" role="menuitemradio" aria-checked=${c.id === contaAtiva}
          class=${cls('opcao conta-opcao', c.id === contaAtiva && 'selecionada')} onClick=${() => trocar(c.id)}>
          <${CabecaSkin} skin=${skins[c.id]} tamanho=${24} />
          <span class="textos"><span class="truncar">${c.nome}</span><small>${c.tipo === 'msa' ? 'Microsoft' : 'Offline'}</small></span>
          ${c.id === contaAtiva && html`<${Icone} nome="ok" tamanho=${16} class="destaque" />`}
        </button>`)}
        <div class="separador"></div>
        <button type="button" class="opcao" onClick=${() => { setAberto(false); navegar('/contas'); }}>
          <${Icone} nome="contas" tamanho=${16} /> Gerenciar contas
        </button>
      </div>
    <//>`;
}

function Lateral({ pagina }) {
  return html`<aside class="lateral">
    <div class="lateral-marca">
      <img src="../assets/logo.png" alt="Tessera" draggable="false" />
      <span class="lateral-edicao">Java Edition</span>
    </div>
    <${Navegacao} pagina=${pagina} />
    <${Recentes} />
    <div class="lateral-rodape">
      <${IndicadorAtualizacao} />
      <${IndicadorJogando} />
      <${IndicadorTarefas} />
      <${SeletorConta} />
    </div>
  </aside>`;
}

// ---------- Barra superior ----------
function Topo({ rota }) {
  const sobrescrito = useTituloAtual();
  const titulo = sobrescrito ? sobrescrito.texto : TITULOS[rota.pagina];
  const sub = sobrescrito && sobrescrito.sub;
  const comVoltar = podeVoltar() && rota.pagina !== 'inicio';
  return html`<header class=${cls('topo', comVoltar && 'com-voltar')}>
    ${comVoltar && html`<${Botao} variante="fantasma" icone="voltar" dica="Voltar" class="botao-voltar" aoClicar=${voltar} />`}
    <div class="topo-titulo">
      <h1 class="truncar">${titulo}</h1>
      ${sub && html`<span class="sub truncar">${sub}</span>`}
    </div>
    <div class="topo-controles">
      <button type="button" class="ctl-janela" aria-label="Minimizar" data-dica="Minimizar" data-dica-lado="baixo" onClick=${() => api.minimizar()}>
        <${Icone} nome="minimizar" tamanho=${16} />
      </button>
      <button type="button" class="ctl-janela fechar" aria-label="Fechar" data-dica="Fechar" data-dica-lado="baixo" onClick=${() => api.fechar()}>
        <${Icone} nome="fechar" tamanho=${16} />
      </button>
    </div>
  </header>`;
}

// ---------- Página com limite de erro ----------
function PaginaSegura({ rota }) {
  const [erro, reiniciar] = useErrorBoundary((e) => console.error('Erro na página:', e));
  const Pagina = PAGINAS[rota.pagina] || PaginaInicio;
  if (erro) {
    return html`<div class="pagina erro-pagina">
      <${Vazio} titulo="Algo deu errado nesta página" icone="aviso" imagem=${false}
        texto="Um erro inesperado aconteceu. Você pode tentar de novo ou voltar ao início.">
        <${Botao} aoClicar=${reiniciar} icone="atualizar">Tentar de novo<//>
        <${Botao} variante="fantasma" aoClicar=${() => { reiniciar(); navegar('/inicio'); }}>Ir para o Início<//>
      <//>
      <pre>${String((erro && erro.stack) || erro)}</pre>
    </div>`;
  }
  return html`<${Pagina} rota=${rota} />`;
}

function App() {
  const rota = useRota();
  const pronto = useEstado((e) => e.pronto);
  const conteudo = useRef(null);

  // volta ao topo ao trocar de página (mas não quando só a query muda)
  useEffect(() => { if (conteudo.current) conteudo.current.scrollTop = 0; }, [rota.caminho]);

  return html`<div class="app">
    <${Lateral} pagina=${rota.pagina} />
    <div class="principal">
      <${Topo} rota=${rota} />
      <main class="conteudo" ref=${conteudo}>
        ${pronto
          ? html`<div class="pagina" key=${rota.caminho}><${PaginaSegura} rota=${rota} /></div>`
          : null}
      </main>
    </div>
    <${Portal}><${Toasts} /><//>
    <${HostDialogos} />
  </div>`;
}

// ---------- Início ----------
// aplica o último tema já na abertura (evita piscar a cor padrão)
try { const t = localStorage.getItem('jg-tema'); if (t) document.documentElement.dataset.tema = t; } catch {}
iniciarDicas();
// links externos (no texto das notícias, descrições do Modrinth...) abrem no navegador
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || e.defaultPrevented) return;
  const href = a.getAttribute('href');
  if (/^https?:\/\//i.test(href)) { e.preventDefault(); if (href.startsWith('https://')) api.abrirLink(href); }
});
// atalhos: Ctrl+W/Ctrl+Q não fecham sem querer; Alt+← volta
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'ArrowLeft') voltar();
});
// a roda do mouse/botões laterais "voltar"
document.addEventListener('mouseup', (e) => { if (e.button === 3) voltar(); });
// arquivos arrastados para a janela não devem navegar para eles
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

if (!location.hash) history.replaceState(null, '', '#/inicio');
render(html`<${App} />`, document.getElementById('app'));
iniciar();
