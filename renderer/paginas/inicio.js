// Início: banner com o logo, "Continuar jogando", suas instâncias e as novidades do Minecraft.
import { html, useMemo, useState } from '../vendor/preact-htm.js';
import { api } from '../api.js';
import { useEstado, jogar, parar, salvarConfig, instanciaAtual } from '../estado.js';
import { navegar } from '../rotas.js';
import {
  Botao, Icone, Cartao, IconeInstancia, EtiquetaLoader, Etiqueta, Modal, Select, BarraProgresso,
} from '../componentes/index.js';
import { formatarTempo, tempoRelativo, formatarData, textoVersao, useCarregar, lista, cls, numero } from '../util.js';

// texto puro → HTML seguro (o resumo da notícia não passa pelo sanitize do backend)
const escaparHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const SPLASHES = [
  'Agora com mods!', 'Feito em casa!', '100% pixelado!', 'Com Java 25!', 'Também em 26.x!', 'Modpacks em um clique!',
  'Blocos e mais blocos!', 'Sem fila no lobby!', 'Shaders brilhando!', 'Cuidado com o Warden!', 'Sculk por toda parte!',
  'Sodium e companhia!', 'Agora em tela grande!',
];

function saudacao() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

const rotaInst = (id) => `/instancia/${encodeURIComponent(id)}`;

// ---------- Banner ----------
function Heroi({ nome }) {
  const splash = useMemo(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)], []);
  return html`<section class="heroi">
    <div class="heroi-logo">
      <img src="../assets/logo.png" alt="Tessera" draggable="false" />
      <span class="splash" aria-hidden="true">${splash}</span>
    </div>
    <p class="heroi-saudacao">
      ${nome ? html`${saudacao()}, <strong>${nome}!</strong>` : `${saudacao()}!`}
      <span>Pronto para mais uma aventura?</span>
    </p>
  </section>`;
}

// ---------- Aviso de conta ----------
function AvisoConta() {
  return html`<${Cartao} class="aviso-conta">
    <span class="aviso-icone"><${Icone} nome="contas" tamanho=${32} /></span>
    <div class="aviso-textos">
      <h3>Adicione uma conta para jogar</h3>
      <p>Entre com a sua conta Microsoft que tem o Minecraft: Java Edition. Depois você também pode criar contas offline.</p>
    </div>
    <${Botao} variante="principal" icone="mais" aoClicar=${() => navegar('/contas')}>Adicionar conta<//>
  <//>`;
}

// Tarefa de preparo da instância (pelo título; senão a mais recente em andamento)
function ProgressoPreparo({ inst }) {
  const tarefas = useEstado((e) => e.tarefas);
  const rodando = tarefas.filter((t) => t.estado === 'rodando');
  const t = rodando.find((x) => x.titulo && x.titulo.includes(inst.nome)) || rodando[rodando.length - 1];
  if (!t) return html`<div class="continuar-progresso"><span class="etapa">Abrindo o Minecraft...</span></div>`;
  return html`<div class="continuar-progresso">
    <${BarraProgresso} valor=${t.total ? t.feitos / t.total : null} />
    <span class="etapa truncar">${t.etapa || t.titulo}${t.total ? html` <span class="vt">${t.feitos}/${t.total}</span>` : ''}</span>
  </div>`;
}

// ---------- Continuar jogando ----------
function Continuar({ inst, instancias, fase, semConta }) {
  if (!inst) {
    return html`<${Cartao} class="continuar continuar-vazio">
      <span class="rotulo-secao">Comece por aqui</span>
      <h2>Crie sua primeira instância</h2>
      <p class="suave">Uma instância é um Minecraft separado, com a versão, os mods e os mundos que você quiser.
        Crie uma do zero ou instale um modpack pronto do Modrinth.</p>
      <div class="continuar-acoes">
        <${Botao} variante="principal" tamanho="g" icone="mais" aoClicar=${() => navegar('/instancias?nova=1')}>Nova instância<//>
        <${Botao} tamanho="g" icone="pacote" aoClicar=${() => navegar('/explorar?tipo=modpack')}>Explorar modpacks<//>
      </div>
    <//>`;
  }

  const ocupado = fase === 'preparando' || fase === 'abrindo';
  const rodando = fase === 'rodando';
  const opcoes = instancias.map((i) => ({ valor: i.id, rotulo: i.nome, detalhe: i.mc }));

  return html`<${Cartao} class=${cls('continuar', rodando && 'rodando')}>
    <div class="continuar-brilho" aria-hidden="true"></div>
    <div class="continuar-topo">
      <span class="rotulo-secao">${rodando ? 'Jogando agora' : 'Continuar jogando'}</span>
      ${instancias.length > 1 && html`<${Select} class="select-compacto" valor=${inst.id} opcoes=${opcoes} busca=${instancias.length > 8}
        rotulo="Trocar instância" larguraLista=${260} posicao="baixo-dir"
        aoMudar=${(id) => salvarConfig({ instanciaSelecionada: id })} />`}
    </div>
    <div class="continuar-corpo">
      <a href=${`#${rotaInst(inst.id)}`} class="continuar-icone" aria-label=${`Abrir ${inst.nome}`}>
        <${IconeInstancia} inst=${inst} tamanho=${88} />
        ${rodando && html`<span class="selo-rodando" aria-hidden="true"></span>`}
      </a>
      <div class="continuar-info">
        <h2 class="truncar">${inst.nome}</h2>
        <div class="continuar-meta">
          <${EtiquetaLoader} loader=${inst.loader} mostrarVersao />
          <${Etiqueta} cor="cinza">Minecraft ${inst.mc}<//>
          ${inst.origem && inst.origem.tipo === 'modrinth' && html`<${Etiqueta} cor="verde" icone="pacote">Modpack<//>`}
        </div>
        <div class="continuar-stats">
          <span><${Icone} nome="relogio" tamanho=${16} /> ${formatarTempo(inst.tempoJogadoMs)} jogadas</span>
          <span><${Icone} nome="estrela" tamanho=${16} /> ${inst.ultimoJogo ? `Jogou ${tempoRelativo(inst.ultimoJogo)}` : 'Ainda não jogada'}</span>
          ${inst.quantidades && inst.quantidades.mods > 0 && html`<span><${Icone} nome="mod" tamanho=${16} /> ${inst.quantidades.mods} mods</span>`}
        </div>
      </div>
    </div>
    <div class="continuar-acoes">
      ${rodando
        ? html`<${Botao} variante="perigo" tamanho="gg" icone="parar" class="botao-jogar" aoClicar=${() => parar(inst.id)}>Parar<//>`
        : html`<${Botao} variante="principal" tamanho="gg" icone=${ocupado ? undefined : 'jogar'} class="botao-jogar"
            carregando=${ocupado} desabilitado=${semConta} dica=${semConta ? 'Adicione uma conta para jogar' : undefined}
            aoClicar=${() => jogar(inst.id)}>${fase === 'abrindo' ? 'Abrindo...' : ocupado ? 'Preparando...' : 'Jogar'}<//>`}
      <${Botao} tamanho="g" icone="engrenagem" dica="Detalhes da instância" aoClicar=${() => navegar(rotaInst(inst.id))} />
      <${Botao} tamanho="g" icone="pasta" dica="Abrir pasta da instância" aoClicar=${() => api.abrirPastaInstancia(inst.id)} />
      <${Botao} tamanho="g" icone="mod" dica="Adicionar mods" aoClicar=${() => navegar(`/explorar?tipo=mod&instancia=${encodeURIComponent(inst.id)}`)} />
    </div>
    ${ocupado && html`<${ProgressoPreparo} inst=${inst} />`}
  <//>`;
}

// ---------- Resumo ----------
function Resumo({ instancias }) {
  const tempo = instancias.reduce((s, i) => s + (i.tempoJogadoMs || 0), 0);
  const mods = instancias.reduce((s, i) => s + ((i.quantidades && i.quantidades.mods) || 0), 0);
  const mundos = instancias.reduce((s, i) => s + ((i.quantidades && i.quantidades.mundos) || 0), 0);
  const itens = [
    { icone: 'relogio', valor: tempo >= 3600_000 ? `${numero(Math.floor(tempo / 3600_000))} h` : `${Math.floor(tempo / 60_000)} min`, rotulo: 'jogadas no total' },
    { icone: 'instancias', valor: numero(instancias.length), rotulo: instancias.length === 1 ? 'instância' : 'instâncias' },
    { icone: 'mod', valor: numero(mods), rotulo: 'mods instalados' },
    { icone: 'mundo', valor: numero(mundos), rotulo: mundos === 1 ? 'mundo salvo' : 'mundos salvos' },
  ];
  return html`<${Cartao} class="resumo">
    <span class="rotulo-secao">Seu resumo</span>
    <ul>
      ${itens.map((it) => html`<li key=${it.rotulo}>
        <span class="resumo-icone"><${Icone} nome=${it.icone} tamanho=${16} /></span>
        <span class="resumo-valor">${it.valor}</span>
        <span class="resumo-rotulo">${it.rotulo}</span>
      </li>`)}
    </ul>
  <//>`;
}

// ---------- Suas instâncias ----------
function CartaoInstancia({ inst, fase, semConta }) {
  const ocupado = fase === 'preparando' || fase === 'abrindo';
  return html`<${Cartao} interativo class=${cls('mini-inst', fase && 'ativa')} aoClicar=${() => navegar(rotaInst(inst.id))}>
    <${IconeInstancia} inst=${inst} tamanho=${48} />
    <div class="mini-inst-info">
      <h4 class="truncar">${inst.nome}</h4>
      <span class="mini-inst-versao truncar">${textoVersao(inst)}</span>
      <span class="mini-inst-quando">
        ${fase === 'rodando' ? html`<span class="jogando-agora">Jogando agora</span>`
          : ocupado ? 'Abrindo...'
          : inst.ultimoJogo ? tempoRelativo(inst.ultimoJogo) : 'Nunca jogada'}
      </span>
    </div>
    ${fase === 'rodando'
      ? html`<${Botao} variante="perigo" tamanho="p" icone="parar" dica="Fechar o jogo" class="mini-inst-jogar"
          aoClicar=${(e) => { e.stopPropagation(); parar(inst.id); }} />`
      : html`<${Botao} variante="principal" tamanho="p" icone="jogar" dica=${semConta ? 'Adicione uma conta para jogar' : 'Jogar'}
          class="mini-inst-jogar" carregando=${ocupado} desabilitado=${semConta}
          aoClicar=${(e) => { e.stopPropagation(); jogar(inst.id); }} />`}
  <//>`;
}

function SuasInstancias({ instancias, rodando, semConta }) {
  const recentes = [...instancias]
    .sort((a, b) => (b.ultimoJogo || b.criadaEm || 0) - (a.ultimoJogo || a.criadaEm || 0))
    .slice(0, 5);
  return html`<section class="secao">
    <div class="secao-cabeca">
      <h2>Suas instâncias</h2>
      <span class="sub">${instancias.length ? `${instancias.length} no total` : ''}</span>
      <div class="acoes">
        ${instancias.length > 0 && html`<a class="link" href="#/instancias" onClick=${(e) => { e.preventDefault(); navegar('/instancias'); }}>
          Ver todas <${Icone} nome="seta-direita" tamanho=${16} />
        </a>`}
      </div>
    </div>
    <div class="grade-inst">
      ${recentes.map((i) => html`<${CartaoInstancia} key=${i.id} inst=${i} fase=${rodando[i.id]} semConta=${semConta} />`)}
      <button type="button" class="nova-inst" onClick=${() => navegar('/instancias?nova=1')}>
        <span class="nova-inst-icone"><${Icone} nome="mais" tamanho=${16} /></span>
        <span><strong>Nova instância</strong><small>Vanilla ou com mods</small></span>
      </button>
    </div>
  </section>`;
}

// ---------- Novidades ----------
function Noticia({ n, aoAbrir }) {
  const snapshot = n.tipo === 'snapshot';
  return html`<${Cartao} interativo class="noticia" aoClicar=${() => aoAbrir(n)}>
    <div class="noticia-imagem">
      ${n.imagemUrl && html`<img src=${n.imagemUrl} alt="" loading="lazy" draggable="false" onError=${(e) => { e.currentTarget.style.display = 'none'; }} />`}
      <${Etiqueta} cor=${snapshot ? 'amarelo' : 'verde'} cheia class="noticia-tipo">${snapshot ? 'Snapshot' : 'Lançamento'}<//>
    </div>
    <div class="noticia-textos">
      <h4>${n.titulo}</h4>
      <span class="noticia-data">${formatarData(n.data)}</span>
    </div>
  <//>`;
}

function Novidades() {
  const { dados, carregando, erro, recarregar } = useCarregar(() => api.listarNoticias(), []);
  const [aberta, setAberta] = useState(null);
  const [todas, setTodas] = useState(false);
  const noticias = lista(dados, 'noticias');
  const visiveis = noticias.slice(0, todas ? 9 : 3);

  return html`<section class="secao">
    <div class="secao-cabeca">
      <h2>Novidades</h2>
      <span class="sub">Notas de atualização do Minecraft: Java Edition</span>
      <div class="acoes">
        ${noticias.length > 3 && html`<button type="button" class="link" onClick=${() => setTodas(!todas)}>
          ${todas ? 'Mostrar menos' : 'Ver mais'}
        </button>`}
      </div>
    </div>
    ${carregando && !noticias.length
      ? html`<div class="grade-noticias">${[0, 1, 2].map((i) => html`<div key=${i} class="cartao noticia esqueleto"><div class="noticia-imagem"></div><div class="noticia-textos"><i></i><i></i></div></div>`)}</div>`
      : erro
        ? html`<${Cartao} class="aviso-inline">
            <${Icone} nome="aviso" tamanho=${16} />
            <span>Não foi possível carregar as novidades. ${erro}</span>
            <${Botao} tamanho="p" icone="atualizar" aoClicar=${recarregar}>Tentar de novo<//>
          <//>`
        : !noticias.length
          ? html`<p class="mais-suave">Nenhuma novidade por enquanto.</p>`
          : html`<div class="grade-noticias">${visiveis.map((n) => html`<${Noticia} key=${n.id} n=${n} aoAbrir=${setAberta} />`)}</div>`}

    <${Modal} aberto=${!!aberta} titulo=${aberta && aberta.titulo} aoFechar=${() => setAberta(null)} largura=${760} class="modal-noticia"
      rodape=${aberta && html`<span class="esquerda mais-suave vt">${formatarData(aberta.data)} · ${aberta.versao}</span>
        <${Botao} variante="principal" aoClicar=${() => setAberta(null)}>Fechar<//>`}>
      ${aberta && html`
        ${aberta.imagemUrl && html`<div class="noticia-capa" style=${{ backgroundImage: `url("${aberta.imagemUrl}")` }}></div>`}
        <div class="texto-rico" dangerouslySetInnerHTML=${{ __html: aberta.corpoHtml || `<p>${escaparHtml(aberta.resumo || '')}</p>` }}></div>
      `}
    <//>
  </section>`;
}

// ---------- Página ----------
export default function PaginaInicio() {
  const { instancias, rodando, contas, contaAtiva, config } = useEstado((e) => ({
    instancias: e.instancias, rodando: e.rodando, contas: e.contas, contaAtiva: e.contaAtiva, config: e.config,
  }));
  const conta = contas.find((c) => c.id === contaAtiva);
  const semConta = !conta;
  const inst = instanciaAtual({ instancias, config });
  // se há um jogo aberto, ele vira o destaque
  const idRodando = Object.keys(rodando)[0];
  const destaque = (idRodando && instancias.find((i) => i.id === idRodando)) || inst;

  return html`<div class="inicio">
    <${Heroi} nome=${conta && conta.nome} />
    ${semConta && html`<${AvisoConta} />`}
    <div class="inicio-linha">
      <${Continuar} inst=${destaque} instancias=${instancias} fase=${destaque && rodando[destaque.id]} semConta=${semConta} />
      <${Resumo} instancias=${instancias} />
    </div>
    ${instancias.length > 0 && html`<${SuasInstancias} instancias=${instancias} rodando=${rodando} semConta=${semConta} />`}
    <${Novidades} />
  </div>`;
}
