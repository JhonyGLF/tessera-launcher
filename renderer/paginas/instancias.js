// Instâncias: busca, ordem (salva em config.ordemInstancias), filtro por loader, grade de cartões,
// "Nova instância" (modal; também abre com #/instancias?nova=1) e "Importar .mrpack".
import { html, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import { api } from '../api.js';
import { useEstado, salvarConfig, recarregarInstancias } from '../estado.js';
import { navegar, trocarQuery } from '../rotas.js';
import {
  Botao, Icone, Cartao, IconeInstancia, EtiquetaLoader, Etiqueta, CampoTexto, Select, Menu, Vazio, toast,
} from '../componentes/index.js';
import { formatarTempo, tempoRelativo, cls, NOMES_LOADER } from '../util.js';
import {
  BotaoJogar, itensMenu, ordenar, rotaInstancia, tarefaDe,
} from '../componentes/instancias/comum.js';
import { ModalNovaInstancia } from '../componentes/instancias/nova.js';

const ORDENS = [
  { valor: 'recentes', rotulo: 'Recentes' },
  { valor: 'nome', rotulo: 'Nome (A–Z)' },
];

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Barrinha de progresso no rodapé do cartão enquanto o jogo é preparado
function PreparoMini({ inst }) {
  const t = useEstado((e) => tarefaDe(e.tarefas, inst));
  const pct = t && t.total ? Math.floor((t.feitos / t.total) * 100) : null;
  return html`<div class="cartao-inst-preparo">
    <span class=${cls('enchimento', pct == null && 'indeterminada')} style=${pct == null ? undefined : { width: `${pct}%` }}></span>
  </div>`;
}

function CartaoInstancia({ inst, fase, semConta }) {
  const [menu, setMenu] = useState(false);
  const ancora = useRef(null);
  const ocupado = fase === 'preparando' || fase === 'abrindo';
  const qtd = inst.quantidades || {};
  const modpack = inst.origem && inst.origem.tipo === 'modrinth';

  return html`<${Cartao} interativo class=${cls('cartao-inst', fase && `fase-${fase}`, menu && 'com-menu')}
    aoClicar=${() => navegar(rotaInstancia(inst.id))} aria-label=${`Abrir ${inst.nome}`}>
    <div class="cartao-inst-capa" aria-hidden="true">
      ${inst.iconeUrl && html`<img src=${inst.iconeUrl} alt="" draggable="false" onError=${(e) => { e.currentTarget.style.display = 'none'; }} />`}
    </div>
    <div class="cartao-inst-topo">
      <span class="cartao-inst-icone">
        <${IconeInstancia} inst=${inst} tamanho=${72} />
        ${fase === 'rodando' && html`<span class="selo-rodando" aria-hidden="true"></span>`}
      </span>
      <div class="cartao-inst-titulo">
        <h3 class="truncar" title=${inst.nome}>${inst.nome}</h3>
        <div class="cartao-inst-etiquetas">
          <${Etiqueta} cor="cinza">${inst.mc}<//>
          <${EtiquetaLoader} loader=${inst.loader} />
          ${modpack && html`<${Etiqueta} cor="verde" icone="pacote" dica=${`Modpack do Modrinth${inst.origem.nome ? `: ${inst.origem.nome}` : ''}`}>Modpack<//>`}
        </div>
      </div>
      <button ref=${ancora} type="button" class=${cls('cartao-inst-mais', menu && 'aberto')} aria-label="Mais ações" aria-haspopup="menu"
        aria-expanded=${menu} data-dica="Mais ações" onClick=${(e) => { e.stopPropagation(); setMenu(!menu); }}>
        <${Icone} nome="reticencias" tamanho=${16} />
      </button>
    </div>
    <div class="cartao-inst-rodape">
      <div class="cartao-inst-stats">
        ${fase === 'rodando'
          ? html`<span class="jogando-agora"><i class="ponto-vivo"></i>Jogando agora</span>`
          : ocupado
            ? html`<span class="abrindo-agora">${fase === 'abrindo' ? 'Abrindo...' : 'Preparando...'}</span>`
            : html`<span data-dica="Última vez que você jogou"><${Icone} nome="estrela" tamanho=${16} />${inst.ultimoJogo ? tempoRelativo(inst.ultimoJogo) : 'Nunca jogada'}</span>`}
        <span data-dica="Tempo jogado"><${Icone} nome="relogio" tamanho=${16} />${formatarTempo(inst.tempoJogadoMs)}</span>
        ${qtd.mods > 0 && html`<span data-dica="Mods instalados"><${Icone} nome="mod" tamanho=${16} />${qtd.mods}</span>`}
      </div>
      <${BotaoJogar} inst=${inst} fase=${fase} semConta=${semConta} tamanho="p" soIcone class="cartao-inst-jogar" />
    </div>
    ${ocupado && html`<${PreparoMini} inst=${inst} />`}
    <${Menu} ancora=${ancora} aberto=${menu} aoFechar=${() => setMenu(false)} itens=${itensMenu(inst, fase)} />
  <//>`;
}

function BotaoNova({ aoClicar }) {
  return html`<button type="button" class="cartao-inst-nova" onClick=${aoClicar}>
    <span class="nova-inst-icone"><${Icone} nome="mais" tamanho=${32} /></span>
    <strong>Nova instância</strong>
    <small>Vanilla, Fabric, Quilt, Forge ou NeoForge</small>
  </button>`;
}

export default function PaginaInstancias({ rota }) {
  const { instancias, rodando, ordem, semConta } = useEstado((e) => ({
    instancias: e.instancias, rodando: e.rodando, ordem: e.config.ordemInstancias || 'recentes', semConta: !e.contaAtiva,
  }));
  const [busca, setBusca] = useState('');
  const [filtroLoader, setFiltroLoader] = useState('todos');
  const [importando, setImportando] = useState(false);
  const modalAberto = rota.query.nova === '1';
  const abrirModal = () => trocarQuery({ nova: '1' }, { substituir: false });
  const fecharModal = () => trocarQuery({ nova: '' });
  // a entrada "?nova=1" do histórico vira a página da instância criada (voltar não reabre o modal)
  const aoCriar = (inst) => navegar(rotaInstancia(inst.id), { substituir: true });

  // loaders presentes (para os filtros rápidos)
  const tipos = useMemo(() => {
    const c = {};
    for (const i of instancias) { const t = (i.loader && i.loader.tipo) || 'vanilla'; c[t] = (c[t] || 0) + 1; }
    return Object.keys(NOMES_LOADER).filter((t) => c[t]).map((t) => ({ tipo: t, qtd: c[t] }));
  }, [instancias]);

  const visiveis = useMemo(() => {
    const f = semAcento(busca.trim());
    const filtradas = instancias.filter((i) => (filtroLoader === 'todos' || ((i.loader && i.loader.tipo) || 'vanilla') === filtroLoader)
      && (!f || semAcento(`${i.nome} ${i.mc} ${(i.loader && i.loader.tipo) || ''}`).includes(f)));
    return ordenar(filtradas, ordem, rodando);
  }, [instancias, busca, filtroLoader, ordem, rodando]);

  const importar = async () => {
    setImportando(true);
    const r = await api.importarMrpack();
    setImportando(false);
    if (!r) return; // cancelou a escolha do arquivo
    if (r.ok === false) { toast(r.mensagem || 'Não foi possível importar o modpack.', { tipo: 'erro', titulo: 'Erro ao importar' }); return; }
    await recarregarInstancias();
    const id = r.id || (r.instancia && r.instancia.id);
    toast(r.mensagem || 'Modpack importado.', {
      tipo: 'ok', titulo: 'Modpack importado',
      acao: id ? { rotulo: 'Abrir instância', aoClicar: () => navegar(rotaInstancia(id)) } : undefined,
    });
  };

  const modal = html`<${ModalNovaInstancia} aberto=${modalAberto} aoFechar=${fecharModal} aoCriar=${aoCriar} />`;

  if (!instancias.length) {
    return html`<div class="insts insts-vazia">
      <${Cartao} class="insts-vazio">
        <div class="insts-vazio-brilho" aria-hidden="true"></div>
        <${Vazio} titulo="Nenhuma instância ainda"
          texto="Uma instância é um Minecraft separado, com a versão, os mods e os mundos que você quiser. Crie uma do zero, instale um modpack pronto ou importe um arquivo .mrpack.">
          <${Botao} variante="principal" tamanho="g" icone="mais" aoClicar=${abrirModal}>Nova instância<//>
          <${Botao} tamanho="g" icone="pacote" aoClicar=${() => navegar('/explorar?tipo=modpack')}>Explorar modpacks<//>
        <//>
        <button type="button" class="link insts-vazio-importar" onClick=${importar} disabled=${importando}>
          <${Icone} nome="importar" tamanho=${16} /> ${importando ? 'Importando...' : 'Importar arquivo .mrpack'}
        </button>
      <//>
      ${modal}
    </div>`;
  }

  return html`<div class="insts">
    <div class="insts-barra">
      <${CampoTexto} class="insts-busca" valor=${busca} aoMudar=${setBusca} icone="busca" limpar
        placeholder="Buscar por nome ou versão..." aria-label="Buscar instâncias" />
      <${Select} class="insts-ordem" valor=${ordem} opcoes=${ORDENS} rotulo="Ordenar por" largura=${170}
        aoMudar=${(v) => salvarConfig({ ordemInstancias: v })} />
      <div class="insts-acoes">
        <${Botao} icone="importar" carregando=${importando} aoClicar=${importar} dica="Instalar um modpack a partir de um arquivo .mrpack">Importar .mrpack<//>
        <${Botao} variante="principal" icone="mais" aoClicar=${abrirModal}>Nova instância<//>
      </div>
    </div>

    ${tipos.length > 1 && html`<div class="insts-filtros" role="radiogroup" aria-label="Filtrar por loader">
      <button type="button" role="radio" aria-checked=${filtroLoader === 'todos'} class=${cls('chip', filtroLoader === 'todos' && 'ativo')}
        onClick=${() => setFiltroLoader('todos')}>Todas <span class="vt">${instancias.length}</span></button>
      ${tipos.map((t) => html`<button key=${t.tipo} type="button" role="radio" aria-checked=${filtroLoader === t.tipo}
        class=${cls('chip', filtroLoader === t.tipo && 'ativo')} onClick=${() => setFiltroLoader(filtroLoader === t.tipo ? 'todos' : t.tipo)}>
        <img class="pixelado" src=${`../assets/loaders/${t.tipo}.png`} alt="" width="14" height="14" draggable="false" />
        ${NOMES_LOADER[t.tipo]} <span class="vt">${t.qtd}</span>
      </button>`)}
    </div>`}

    ${visiveis.length
      ? html`<div class="grade-cartoes-inst">
          ${visiveis.map((i) => html`<${CartaoInstancia} key=${i.id} inst=${i} fase=${rodando[i.id]} semConta=${semConta} />`)}
          ${!busca && filtroLoader === 'todos' && html`<${BotaoNova} aoClicar=${abrirModal} />`}
        </div>`
      : html`<${Vazio} titulo="Nada encontrado" icone="busca" imagem=${false}
          texto=${busca ? `Nenhuma instância combina com "${busca}".` : 'Nenhuma instância com esse loader.'}>
          <${Botao} icone="fechar" aoClicar=${() => { setBusca(''); setFiltroLoader('todos'); }}>Limpar filtros<//>
        <//>`}
    ${modal}
  </div>`;
}
