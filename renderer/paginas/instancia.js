// Página de uma instância: cabeçalho (ícone, nome, versão, Jogar/Parar) e abas
// Mods, Resource packs, Shaders, Mundos, Log e Configurações.
// Rota: #/instancia/<id>[/<aba>]  →  rota.params = [id, aba?]
import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import { api } from '../api.js';
import { useEstado, recarregarInstancias } from '../estado.js';
import { navegar, useTitulo } from '../rotas.js';
import {
  Abas, Alternador, Botao, CampoTexto, Carregando, Cartao, Deslizador, Etiqueta, EtiquetaLoader, Icone, IconeInstancia,
  Menu, Modal, Vazio, confirmar, toast,
} from '../componentes/index.js';
import {
  cls, formatarBytes, formatarRam, formatarTempo, lista, tempoRelativo, textoVersao, useCarregar,
} from '../util.js';
import {
  BotaoJogar, ProgressoPreparo, abrirPasta, excluir, itensMenu, rotaInstancia, useAoConcluirTarefa,
} from '../componentes/instancias/comum.js';
import { ModalIcone } from '../componentes/instancias/icone.js';
import { ModalOtimizar } from '../componentes/instancias/otimizar.js';
import { EscolhaVersao, useEscolhaVersao } from '../componentes/instancias/versao.js';

const ABAS = [
  { id: 'mods', rotulo: 'Mods', icone: 'mod', qtd: 'mods' },
  { id: 'resourcepacks', rotulo: 'Resource packs', icone: 'pincel', qtd: 'resourcepacks' },
  { id: 'shaderpacks', rotulo: 'Shaders', icone: 'sol', qtd: 'shaderpacks' },
  { id: 'mundos', rotulo: 'Mundos', icone: 'mundo', qtd: 'mundos' },
  { id: 'log', rotulo: 'Log', icone: 'terminal' },
  { id: 'config', rotulo: 'Configurações', icone: 'engrenagem' },
];

// tipo da aba → tipo no Explorar, textos
const CONTEUDO = {
  mods: { explorar: 'mod', singular: 'mod', plural: 'mods', icone: 'mod', extensao: '.jar' },
  resourcepacks: { explorar: 'resourcepack', singular: 'resource pack', plural: 'resource packs', icone: 'pincel', extensao: '.zip' },
  shaderpacks: { explorar: 'shader', singular: 'shader', plural: 'shaders', icone: 'sol', extensao: '.zip' },
};

const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ocupadoFase = (f) => f === 'preparando' || f === 'abrindo';

// ======================================================================
// Cabeçalho
// ======================================================================
function Cabecalho({ inst, fase, semConta }) {
  const [menu, setMenu] = useState(false);
  const [icone, setIcone] = useState(false);
  const ancora = useRef(null);
  const qtd = inst.quantidades || {};
  const modpack = inst.origem && inst.origem.tipo === 'modrinth';

  return html`<${Cartao} class=${cls('inst-cabeca', fase && `fase-${fase}`)}>
    <div class="inst-cabeca-capa" aria-hidden="true">
      ${inst.iconeUrl && html`<img src=${inst.iconeUrl} alt="" draggable="false" onError=${(e) => { e.currentTarget.style.display = 'none'; }} />`}
    </div>
    <div class="inst-cabeca-corpo">
      <button type="button" class="inst-cabeca-icone" onClick=${() => setIcone(true)} aria-label="Trocar ícone" data-dica="Trocar ícone">
        <${IconeInstancia} inst=${inst} tamanho=${104} />
        <span class="trocar-icone" aria-hidden="true"><${Icone} nome="editar" tamanho=${16} /></span>
        ${fase === 'rodando' && html`<span class="selo-rodando" aria-hidden="true"></span>`}
      </button>

      <div class="inst-cabeca-info">
        <h1 class="truncar" title=${inst.nome}>${inst.nome}</h1>
        <div class="inst-cabeca-etiquetas">
          <${Etiqueta} cor="cinza">Minecraft ${inst.mc}<//>
          <${EtiquetaLoader} loader=${inst.loader} mostrarVersao />
          ${modpack && html`<${Etiqueta} cor="verde" icone="pacote">Modpack${inst.origem.nome ? `: ${inst.origem.nome}` : ''}<//>`}
        </div>
        <div class="inst-cabeca-stats">
          ${fase === 'rodando'
            ? html`<span class="jogando-agora"><i class="ponto-vivo"></i>Jogando agora</span>`
            : html`<span data-dica="Última vez que você jogou"><${Icone} nome="estrela" tamanho=${16} />${inst.ultimoJogo ? `Jogou ${tempoRelativo(inst.ultimoJogo)}` : 'Nunca jogada'}</span>`}
          <span data-dica="Tempo jogado"><${Icone} nome="relogio" tamanho=${16} />${formatarTempo(inst.tempoJogadoMs)}</span>
          ${(inst.loader && inst.loader.tipo !== 'vanilla') && html`<span data-dica="Mods instalados"><${Icone} nome="mod" tamanho=${16} />${qtd.mods || 0} mods</span>`}
          <span data-dica="Mundos salvos"><${Icone} nome="mundo" tamanho=${16} />${qtd.mundos || 0} ${qtd.mundos === 1 ? 'mundo' : 'mundos'}</span>
        </div>
      </div>

      <div class="inst-cabeca-acoes">
        <${BotaoJogar} inst=${inst} fase=${fase} semConta=${semConta} tamanho="gg" class="inst-jogar" />
        <div class="inst-cabeca-secundarias">
          <${Botao} icone="pasta" dica="Abrir pasta da instância" aoClicar=${() => abrirPasta(inst.id)} />
          <button ref=${ancora} type="button" class=${cls('btn', 'inst-mais', menu && 'aberto')} aria-label="Mais ações"
            aria-haspopup="menu" aria-expanded=${menu} data-dica="Mais ações" onClick=${() => setMenu(!menu)}>
            <${Icone} nome="reticencias" tamanho=${16} />
          </button>
        </div>
      </div>
    </div>
    ${ocupadoFase(fase) && html`<div class="inst-cabeca-preparo"><${ProgressoPreparo} inst=${inst} /></div>`}
    <${Menu} ancora=${ancora} aberto=${menu} aoFechar=${() => setMenu(false)}
      itens=${itensMenu(inst, fase, { naPagina: true, aoExcluir: () => navegar('/instancias', { substituir: true }) })} />
    ${icone && html`<${ModalIcone} inst=${inst} aberto=${icone} aoFechar=${() => setIcone(false)} />`}
  <//>`;
}

// ======================================================================
// Conteúdo (mods, resource packs, shaders)
// ======================================================================
function IconeConteudo({ item, tipo }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [item.iconeUrl]);
  return html`<span class="conteudo-icone">
    ${item.iconeUrl && !falhou
      ? html`<img src=${item.iconeUrl} alt="" draggable="false" loading="lazy" onError=${() => setFalhou(true)} />`
      : html`<${Icone} nome=${CONTEUDO[tipo].icone} tamanho=${24} />`}
  </span>`;
}

function LinhaConteudo({ inst, tipo, item, bloqueado, aoMudou }) {
  const [ocupado, setOcupado] = useState(false);

  const alternar = async (ativo) => {
    setOcupado(true);
    const r = await api.alternarConteudo(inst.id, tipo, item.arquivo, ativo);
    setOcupado(false);
    if (r && r.ok === false) { toast(r.mensagem || 'Não foi possível mudar.', { tipo: 'erro' }); return; }
    aoMudou();
  };

  const remover = async () => {
    const sim = await confirmar({
      titulo: `Remover ${CONTEUDO[tipo].singular}?`,
      mensagem: `"${item.nome || item.arquivo}" será apagado da instância. Você pode instalar de novo depois.`,
      confirmar: 'Remover', perigo: true, icone: 'lixeira',
    });
    if (!sim) return;
    setOcupado(true);
    const r = await api.removerConteudo(inst.id, tipo, item.arquivo);
    setOcupado(false);
    if (r && r.ok === false) { toast(r.mensagem || 'Não foi possível remover.', { tipo: 'erro' }); return; }
    toast(`"${item.nome || item.arquivo}" removido.`, { tipo: 'ok' });
    aoMudou();
  };

  const abrirProjeto = item.projetoId
    ? () => navegar(`/projeto/${encodeURIComponent(item.projetoId)}?instancia=${encodeURIComponent(inst.id)}`)
    : null;

  return html`<div class=${cls('conteudo-linha', !item.ativo && 'inativo')} role="listitem">
    <${IconeConteudo} item=${item} tipo=${tipo} />
    <div class="conteudo-textos">
      <div class="conteudo-nome-linha">
        ${abrirProjeto
          ? html`<button type="button" class="conteudo-nome truncar link-nome" onClick=${abrirProjeto} title=${item.nome}>${item.nome || item.arquivo}</button>`
          : html`<strong class="conteudo-nome truncar" title=${item.nome}>${item.nome || item.arquivo}</strong>`}
        ${item.versao && html`<span class="conteudo-versao vt truncar">${item.versao}</span>`}
        ${!item.ativo && html`<${Etiqueta} cor="cinza">desativado<//>`}
      </div>
      <div class="conteudo-detalhe truncar">
        ${item.autor && html`<span>por <b>${item.autor}</b></span>`}
        ${item.descricao
          ? html`<span class="truncar" title=${item.descricao}>${item.descricao}</span>`
          : html`<span class="conteudo-arquivo truncar" title=${item.arquivo}>${item.arquivo}</span>`}
      </div>
    </div>
    <span class="conteudo-tamanho vt">${formatarBytes(item.tamanho)}</span>
    <${Alternador} ligado=${item.ativo} desabilitado=${ocupado || bloqueado}
      dica=${bloqueado ? 'Feche o jogo para mudar' : item.ativo ? 'Desativar' : 'Ativar'} aoMudar=${alternar} />
    <button type="button" class="conteudo-remover" aria-label=${`Remover ${item.nome || item.arquivo}`}
      data-dica=${bloqueado ? 'Feche o jogo para remover' : 'Remover'} disabled=${ocupado || bloqueado} onClick=${remover}>
      <${Icone} nome="lixeira" tamanho=${16} />
    </button>
  </div>`;
}

// Painel de atualizações (Modrinth)
function PainelAtualizacoes({ inst, atualizacoes, aoFechar, aoAtualizou }) {
  const [ocupados, setOcupados] = useState(new Set());
  const [tudo, setTudo] = useState(false);

  const atualizar = async (itens, todos = false) => {
    if (todos) setTudo(true);
    setOcupados((s) => new Set([...s, ...itens.map((i) => i.arquivo)]));
    const r = await api.atualizarConteudo(inst.id, itens);
    setOcupados((s) => { const n = new Set(s); itens.forEach((i) => n.delete(i.arquivo)); return n; });
    if (todos) setTudo(false);
    if (r && r.ok === false) { toast(r.mensagem || 'Não foi possível atualizar.', { tipo: 'erro', titulo: 'Erro ao atualizar' }); return; }
    toast(itens.length === 1 ? `${itens[0].nome || itens[0].arquivo} atualizado.` : `${itens.length} itens atualizados.`, { tipo: 'ok' });
    aoAtualizou(itens);
  };

  return html`<div class="painel-atualizacoes">
    <div class="painel-atualizacoes-cabeca">
      <span class="painel-atualizacoes-icone"><${Icone} nome="atualizar" tamanho=${16} /></span>
      <strong>${atualizacoes.length === 1 ? '1 atualização disponível' : `${atualizacoes.length} atualizações disponíveis`}</strong>
      <div class="acoes">
        <${Botao} tamanho="p" variante="principal" icone="download" carregando=${tudo} aoClicar=${() => atualizar(atualizacoes, true)}>Atualizar tudo<//>
        <button type="button" class="fechar-painel" aria-label="Fechar" onClick=${aoFechar}><${Icone} nome="fechar" tamanho=${16} /></button>
      </div>
    </div>
    <div class="painel-atualizacoes-lista">
      ${atualizacoes.map((a) => html`<div key=${a.arquivo} class="atualizacao">
        <span class="conteudo-icone p">${a.iconeUrl ? html`<img src=${a.iconeUrl} alt="" draggable="false" />` : html`<${Icone} nome="mod" tamanho=${16} />`}</span>
        <strong class="truncar">${a.nome || a.arquivo}</strong>
        <span class="versoes vt truncar"><span class="mais-suave">${a.versaoAtual || '?'}</span> <span class="seta">→</span> <span class="destaque">${a.versaoNova}</span></span>
        <${Botao} tamanho="p" icone="download" carregando=${ocupados.has(a.arquivo)} aoClicar=${() => atualizar([a])}>Atualizar<//>
      </div>`)}
    </div>
  </div>`;
}

// Dica de shaders: precisam do Iris (Fabric/Quilt) ou Oculus (Forge/NeoForge)
function DicaShaders({ inst, mods }) {
  const tipo = (inst.loader && inst.loader.tipo) || 'vanilla';
  const [instalando, setInstalando] = useState(false);
  const temIris = mods.some((m) => /\b(iris|oculus)\b/i.test(`${m.nome} ${m.arquivo}`));
  if (temIris) return null;
  const projeto = tipo === 'fabric' || tipo === 'quilt' ? { id: 'YL57xq9U', nome: 'Iris' }
    : tipo === 'forge' || tipo === 'neoforge' ? { id: 'GchcoXML', nome: 'Oculus' } : null;

  const instalar = async () => {
    setInstalando(true);
    const r = await api.instalarModrinth({ projetoId: projeto.id, instanciaId: inst.id });
    setInstalando(false);
    if (r && r.ok === false) toast(r.mensagem || `Não foi possível instalar o ${projeto.nome}.`, { tipo: 'erro' });
    else toast(`${projeto.nome} instalado. Agora os shaders funcionam nesta instância.`, { tipo: 'ok' });
  };

  return html`<div class="dica-faixa">
    <${Icone} nome="sol" tamanho=${16} />
    <span>
      ${projeto
        ? html`Shaders precisam do mod <b>${projeto.nome}</b>, que ainda não está nesta instância.`
        : html`Shaders precisam do <b>Iris</b> (Fabric/Quilt) ou do <b>Oculus</b> (Forge/NeoForge). Instâncias vanilla não carregam shaders.`}
    </span>
    ${projeto && html`<${Botao} tamanho="p" variante="principal" icone="download" carregando=${instalando} aoClicar=${instalar}>Instalar ${projeto.nome}<//>`}
  </div>`;
}

function AbaConteudo({ inst, tipo, fase }) {
  const info = CONTEUDO[tipo];
  const { dados, carregando, erro, recarregar } = useCarregar(() => api.listarConteudo(inst.id, tipo), [inst.id, tipo]);
  const mods = useCarregar(() => (tipo === 'shaderpacks' ? api.listarConteudo(inst.id, 'mods') : Promise.resolve([])), [inst.id, tipo]);
  const [busca, setBusca] = useState('');
  const [verificando, setVerificando] = useState(false);
  const [atualizacoes, setAtualizacoes] = useState(null);
  const [importando, setImportando] = useState(false);
  const [otimizar, setOtimizar] = useState(false);
  const bloqueado = fase === 'rodando' || ocupadoFase(fase);
  const vanillaSemMods = tipo === 'mods' && (!inst.loader || inst.loader.tipo === 'vanilla');

  // recarrega quando uma instalação/atualização termina
  useAoConcluirTarefa(() => { recarregar(); mods.recarregar(); });
  useEffect(() => { setAtualizacoes(null); setBusca(''); }, [inst.id, tipo]);

  const itens = lista(dados, 'itens');
  const visiveis = useMemo(() => {
    const f = semAcento(busca.trim());
    const l = f ? itens.filter((i) => semAcento(`${i.nome} ${i.arquivo} ${i.autor || ''}`).includes(f)) : itens;
    return [...l].sort((a, b) => (a.nome || a.arquivo).localeCompare(b.nome || b.arquivo, 'pt-BR', { sensitivity: 'base' }));
  }, [itens, busca]);
  const ativos = itens.filter((i) => i.ativo).length;

  const aoMudou = () => { recarregar(); recarregarInstancias(); };

  const verificar = async () => {
    setVerificando(true);
    const r = await api.verificarAtualizacoes(inst.id);
    setVerificando(false);
    if (!r || r.ok === false) { toast((r && r.mensagem) || 'Não foi possível verificar.', { tipo: 'erro' }); return; }
    const deste = lista(r, 'atualizacoes').filter((a) => !a.tipo || a.tipo === tipo);
    if (!deste.length) { toast(`Todos os ${info.plural} estão atualizados.`, { tipo: 'ok' }); setAtualizacoes(null); return; }
    setAtualizacoes(deste);
  };

  const importar = async () => {
    setImportando(true);
    const r = await api.importarArquivos(inst.id, tipo);
    setImportando(false);
    if (!r) return;
    if (r.ok === false) { toast(r.mensagem || 'Não foi possível adicionar.', { tipo: 'erro' }); return; }
    if (r.adicionados) toast(`${r.adicionados} ${r.adicionados === 1 ? 'arquivo adicionado' : 'arquivos adicionados'}.`, { tipo: 'ok' });
    if (r.recusados && r.recusados.length) toast(`Ignorados (formato errado): ${r.recusados.join(', ')}`, { tipo: 'aviso' });
    aoMudou();
  };

  const explorar = () => navegar(`/explorar?tipo=${info.explorar}&instancia=${encodeURIComponent(inst.id)}`);

  if (vanillaSemMods) {
    return html`<${Vazio} titulo="Instância vanilla" icone="mod"
      texto="O Minecraft puro não carrega mods. Troque o loader para Fabric, Quilt, Forge ou NeoForge nas configurações desta instância, ou crie uma instância nova.">
      <${Botao} icone="engrenagem" aoClicar=${() => navegar(rotaInstancia(inst.id, 'config'), { substituir: true })}>Trocar o loader<//>
      <${Botao} variante="principal" icone="mais" aoClicar=${() => navegar('/instancias?nova=1')}>Nova instância<//>
    <//>`;
  }

  return html`<div class="aba-conteudo">
    ${tipo === 'shaderpacks' && !mods.carregando && html`<${DicaShaders} inst=${inst} mods=${lista(mods.dados, 'itens')} />`}
    ${bloqueado && html`<div class="dica-faixa aviso"><${Icone} nome="aviso" tamanho=${16} /><span>O jogo está aberto: feche-o para ativar, desativar ou remover ${info.plural}.</span></div>`}

    <div class="conteudo-barra">
      <${CampoTexto} class="conteudo-busca" valor=${busca} aoMudar=${setBusca} icone="busca" limpar
        placeholder=${`Buscar ${info.plural}...`} aria-label=${`Buscar ${info.plural}`} />
      <span class="conteudo-contagem vt">${itens.length} ${itens.length === 1 ? info.singular : info.plural}${itens.length ? ` · ${ativos} ${ativos === 1 ? 'ativo' : 'ativos'}` : ''}</span>
      <div class="conteudo-acoes">
        ${tipo === 'mods' && html`<${Botao} variante="destaque" icone="raio" aoClicar=${() => setOtimizar(true)} dica="Instala mods que deixam o jogo mais leve, sem mudar nada no jogo">Otimizar<//>`}
        ${itens.length > 0 && html`<${Botao} icone="atualizar" carregando=${verificando} aoClicar=${verificar} dica="Procurar versões novas no Modrinth">Atualizações<//>`}
        <${Botao} icone="importar" carregando=${importando} aoClicar=${importar} dica=${`Adicionar arquivos ${info.extensao} do computador`} />
        <${Botao} variante="principal" icone="explorar" aoClicar=${explorar}>Adicionar do Modrinth<//>
      </div>
    </div>

    ${atualizacoes && html`<${PainelAtualizacoes} inst=${inst} atualizacoes=${atualizacoes} aoFechar=${() => setAtualizacoes(null)}
      aoAtualizou=${(feitos) => {
        const nomes = new Set(feitos.map((f) => f.arquivo));
        const resto = atualizacoes.filter((a) => !nomes.has(a.arquivo));
        setAtualizacoes(resto.length ? resto : null);
        aoMudou();
      }} />`}

    ${carregando && !dados
      ? html`<${Carregando} texto=${`Lendo ${info.plural}...`} />`
      : erro
        ? html`<${Vazio} titulo="Não foi possível ler os arquivos" texto=${erro} icone="aviso" imagem=${false}>
            <${Botao} icone="atualizar" aoClicar=${recarregar}>Tentar de novo<//>
          <//>`
        : !itens.length
          ? html`<${Vazio} titulo=${`Nenhum ${info.singular} ainda`}
              texto=${`Procure ${info.plural} no Modrinth ou adicione arquivos ${info.extensao} do computador.`}>
              ${tipo === 'mods' && html`<${Botao} variante="destaque" icone="raio" aoClicar=${() => setOtimizar(true)}>Otimizar com um clique<//>`}
              <${Botao} variante="principal" icone="explorar" aoClicar=${explorar}>Explorar ${info.plural}<//>
              <${Botao} icone="pasta" aoClicar=${() => abrirPasta(inst.id, tipo)}>Abrir pasta<//>
            <//>`
          : !visiveis.length
            ? html`<${Vazio} titulo="Nada encontrado" icone="busca" imagem=${false} texto=${`Nenhum ${info.singular} combina com "${busca}".`} />`
            : html`<div class="lista-conteudo" role="list">
                ${visiveis.map((i) => html`<${LinhaConteudo} key=${i.arquivo} inst=${inst} tipo=${tipo} item=${i} bloqueado=${bloqueado} aoMudou=${aoMudou} />`)}
              </div>`}
    ${otimizar && html`<${ModalOtimizar} inst=${inst} fase=${fase} aberto=${otimizar} aoFechar=${() => setOtimizar(false)} />`}
  </div>`;
}

// ======================================================================
// Mundos
// ======================================================================
function AbaMundos({ inst }) {
  const { dados, carregando, erro, recarregar } = useCarregar(() => api.listarMundos(inst.id), [inst.id]);
  const mundos = [...lista(dados, 'mundos')].sort((a, b) => (b.ultimoAcesso || 0) - (a.ultimoAcesso || 0));

  if (carregando && !dados) return html`<${Carregando} texto="Lendo mundos..." />`;
  if (erro) return html`<${Vazio} titulo="Não foi possível ler os mundos" texto=${erro} icone="aviso" imagem=${false}><${Botao} icone="atualizar" aoClicar=${recarregar}>Tentar de novo<//><//>`;
  if (!mundos.length) {
    return html`<${Vazio} titulo="Nenhum mundo ainda" texto="Os mundos que você criar jogando nesta instância aparecem aqui. Também dá para colar mundos baixados na pasta saves.">
      <${Botao} icone="pasta" aoClicar=${() => abrirPasta(inst.id, 'saves')}>Abrir pasta saves<//>
    <//>`;
  }
  return html`<div class="aba-mundos">
    <div class="conteudo-barra">
      <span class="conteudo-contagem vt">${mundos.length} ${mundos.length === 1 ? 'mundo' : 'mundos'}</span>
      <div class="conteudo-acoes">
        <${Botao} icone="atualizar" aoClicar=${recarregar}>Recarregar<//>
        <${Botao} icone="pasta" aoClicar=${() => abrirPasta(inst.id, 'saves')}>Abrir pasta saves<//>
      </div>
    </div>
    <div class="grade-mundos">
      ${mundos.map((m) => html`<${Cartao} key=${m.pasta} interativo class="mundo" aoClicar=${() => abrirPasta(inst.id, `saves/${m.pasta}`)}
        aria-label=${`Abrir pasta do mundo ${m.nome}`}>
        <span class="mundo-icone">
          ${m.iconeUrl ? html`<img src=${m.iconeUrl} alt="" draggable="false" />` : html`<${Icone} nome="mundo" tamanho=${32} />`}
        </span>
        <div class="mundo-textos">
          <strong class="truncar" title=${m.nome}>${m.nome || m.pasta}</strong>
          <span class="mais-suave truncar">${m.ultimoAcesso ? `Jogado ${tempoRelativo(m.ultimoAcesso)}` : 'Nunca aberto'}</span>
          <span class="mundo-pasta vt truncar" title=${m.pasta}>${m.pasta}${m.tamanho ? ` · ${formatarBytes(m.tamanho)}` : ''}</span>
        </div>
        <span class="mundo-abrir" aria-hidden="true"><${Icone} nome="pasta" tamanho=${16} /></span>
      <//>`)}
    </div>
  </div>`;
}

// ======================================================================
// Log
// ======================================================================
const MAX_LINHAS = 3000;
const nivelLinha = (l) => (/\/(ERROR|FATAL)\]|\b(ERROR|FATAL|Exception|Caused by)\b|^\s+at /.test(l) ? 'erro'
  : /\/WARN\]|\bWARN(ING)?\b/.test(l) ? 'aviso' : /\/DEBUG\]/.test(l) ? 'debug' : '');

function AbaLog({ inst, fase }) {
  const [linhas, setLinhas] = useState(null);
  const [inicio, setInicio] = useState(0); // "limpar visão": esconde as linhas até aqui
  const [seguir, setSeguir] = useState(true);
  const [filtro, setFiltro] = useState('');
  const caixa = useRef(null);

  useEffect(() => {
    let vivo = true;
    setLinhas(null);
    setInicio(0);
    api.lerLog(inst.id).then((r) => vivo && setLinhas(lista(r, 'linhas').slice(-MAX_LINHAS)));
    const parar = api.aoLog((ev) => {
      if (!ev || ev.id !== inst.id || !Array.isArray(ev.linhas)) return;
      setLinhas((atual) => {
        const novo = [...(atual || []), ...ev.linhas];
        if (novo.length <= MAX_LINHAS) return novo;
        const corte = novo.length - MAX_LINHAS;
        setInicio((i) => Math.max(0, i - corte));
        return novo.slice(corte);
      });
    });
    return () => { vivo = false; if (typeof parar === 'function') parar(); };
  }, [inst.id]);

  // um jogo novo começou: volta a mostrar tudo
  useEffect(() => { if (fase === 'abrindo') { setInicio(0); setSeguir(true); } }, [fase]);

  useEffect(() => {
    if (seguir && caixa.current) caixa.current.scrollTop = caixa.current.scrollHeight;
  }, [linhas, seguir, inicio, filtro]);

  const aoRolar = () => {
    const c = caixa.current;
    if (!c) return;
    const noFim = c.scrollHeight - c.scrollTop - c.clientHeight < 24;
    if (noFim !== seguir) setSeguir(noFim);
  };

  const visiveis = useMemo(() => {
    const l = (linhas || []).slice(inicio);
    const f = filtro.trim().toLowerCase();
    return f ? l.filter((x) => x.toLowerCase().includes(f)) : l;
  }, [linhas, inicio, filtro]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(visiveis.join('\n'));
      toast('Log copiado.', { tipo: 'ok' });
    } catch {
      toast('Não foi possível copiar.', { tipo: 'erro' });
    }
  };

  return html`<div class="aba-log">
    <div class="conteudo-barra">
      <${CampoTexto} class="conteudo-busca" valor=${filtro} aoMudar=${setFiltro} icone="filtro" limpar placeholder="Filtrar linhas..." aria-label="Filtrar log" />
      <span class=${cls('estado-log', fase === 'rodando' && 'vivo')}>
        ${fase === 'rodando' ? html`<i class="ponto-vivo"></i>Ao vivo` : ocupadoFase(fase) ? 'Abrindo...' : 'Última sessão'}
      </span>
      <div class="conteudo-acoes">
        <${Botao} icone="copiar" desabilitado=${!visiveis.length} aoClicar=${copiar}>Copiar<//>
        <${Botao} icone="fechar" desabilitado=${!visiveis.length} dica="Esconde as linhas atuais (o arquivo continua igual)"
          aoClicar=${() => setInicio((linhas || []).length)}>Limpar<//>
        <${Botao} icone="pasta" aoClicar=${() => abrirPasta(inst.id, 'logs')}>Pasta de logs<//>
      </div>
    </div>
    <div class="console-log-moldura">
      <div class="console-log" ref=${caixa} onScroll=${aoRolar} role="log" aria-live="off" tabindex="0">
        ${linhas === null
          ? html`<div class="console-vazio"><${Carregando} inline texto="Lendo log..." /></div>`
          : !visiveis.length
            ? html`<div class="console-vazio mais-suave">${filtro ? 'Nenhuma linha com esse filtro.' : 'Nada por aqui ainda. Jogue esta instância e o log aparece ao vivo.'}</div>`
            : visiveis.map((l, i) => html`<div key=${i} class=${cls('linha-log', nivelLinha(l))}>${l}</div>`)}
      </div>
      ${!seguir && visiveis.length > 0 && html`<button type="button" class="ir-fim" onClick=${() => setSeguir(true)}>
        <${Icone} nome="download" tamanho=${16} /> Ir para o fim
      </button>`}
    </div>
  </div>`;
}

// ======================================================================
// Configurações
// ======================================================================
function Grupo({ titulo, icone, children, descricao }) {
  return html`<section class="config-grupo">
    <div class="config-grupo-cabeca">
      <span class="config-grupo-icone"><${Icone} nome=${icone} tamanho=${16} /></span>
      <div><h3>${titulo}</h3>${descricao && html`<p class="mais-suave">${descricao}</p>`}</div>
    </div>
    ${children}
  </section>`;
}

function Linha({ titulo, texto, children }) {
  return html`<div class="config-linha">
    <div class="config-textos"><strong>${titulo}</strong>${texto && html`<span class="mais-suave">${texto}</span>`}</div>
    <div class="config-controle">${children}</div>
  </div>`;
}

function ModalVersao({ inst, aberto, aoFechar }) {
  const snapshots = useEstado((e) => e.config.mostrarSnapshots);
  const escolha = useEscolhaVersao({ mc: inst.mc, loader: inst.loader, snapshots });
  const [salvando, setSalvando] = useState(false);
  const mudou = escolha.mc !== inst.mc || escolha.loader.tipo !== ((inst.loader && inst.loader.tipo) || 'vanilla')
    || (escolha.loader.versao || null) !== ((inst.loader && inst.loader.versao) || null);

  const salvar = async () => {
    const trocouLoader = escolha.loader.tipo !== ((inst.loader && inst.loader.tipo) || 'vanilla');
    const temMods = (inst.quantidades && inst.quantidades.mods) > 0;
    if ((trocouLoader || escolha.mc !== inst.mc) && temMods) {
      const sim = await confirmar({
        titulo: 'Trocar versão?',
        mensagem: 'Os mods instalados podem não funcionar na versão nova e nada é apagado automaticamente. Se o jogo não abrir, remova ou atualize os mods incompatíveis.',
        confirmar: 'Trocar mesmo assim',
      });
      if (!sim) return;
    }
    setSalvando(true);
    const r = await api.editarInstancia(inst.id, { mc: escolha.mc, loader: escolha.loader });
    setSalvando(false);
    if (!r || r.ok === false) { toast((r && r.mensagem) || 'Não foi possível trocar a versão.', { tipo: 'erro' }); return; }
    await recarregarInstancias();
    toast(`Agora em ${textoVersao(r.instancia || { ...inst, mc: escolha.mc, loader: escolha.loader })}.`, { tipo: 'ok', titulo: 'Versão trocada' });
    aoFechar();
  };

  return html`<${Modal} aberto=${aberto} titulo="Versão e loader" aoFechar=${aoFechar} largura=${560}
    rodape=${html`<${Botao} aoClicar=${aoFechar}>Cancelar<//>
      <${Botao} variante="principal" icone="ok" carregando=${salvando} desabilitado=${!escolha.valido || !mudou} aoClicar=${salvar}>Salvar<//>`}>
    <${EscolhaVersao} escolha=${escolha} />
  <//>`;
}

function AbaConfig({ inst, fase }) {
  const ramPadrao = useEstado((e) => e.config.ramMB);
  const ramMax = useEstado((e) => e.config.ramMaxMB);
  const [nome, setNome] = useState(inst.nome);
  const [jvm, setJvm] = useState(inst.jvmArgs || '');
  const [res, setRes] = useState(inst.resolucao || { largura: 1280, altura: 720 });
  const [versao, setVersao] = useState(false);
  useEffect(() => { setNome(inst.nome); setJvm(inst.jvmArgs || ''); setRes(inst.resolucao || { largura: 1280, altura: 720 }); }, [inst.id]);

  const salvar = async (mudancas, aviso = 'Salvo.') => {
    const r = await api.editarInstancia(inst.id, mudancas);
    if (!r || r.ok === false) { toast((r && r.mensagem) || 'Não foi possível salvar.', { tipo: 'erro' }); return false; }
    await recarregarInstancias();
    if (aviso) toast(aviso, { tipo: 'ok', duracao: 1800 });
    return true;
  };

  const nomeLimpo = nome.trim();
  const salvarNome = () => { if (nomeLimpo && nomeLimpo !== inst.nome) salvar({ nome: nomeLimpo }, 'Nome atualizado.'); };
  const ramPropria = inst.ramMB != null;
  const resPropria = !!inst.resolucao;
  const resValida = res.largura >= 320 && res.altura >= 240 && res.largura <= 7680 && res.altura <= 4320;
  const rodando = !!fase;

  return html`<div class="aba-config">
    <${Grupo} titulo="Geral" icone="editar">
      <${Linha} titulo="Nome" texto="Como a instância aparece no launcher.">
        <div class="linha-campo">
          <${CampoTexto} valor=${nome} aoMudar=${setNome} maxLength=${48} invalido=${!nomeLimpo}
            onKeyDown=${(e) => { if (e.key === 'Enter') salvarNome(); }} aria-label="Nome da instância" />
          <${Botao} desabilitado=${!nomeLimpo || nomeLimpo === inst.nome} aoClicar=${salvarNome}>Salvar<//>
        </div>
      <//>
      <${Linha} titulo="Versão" texto=${textoVersao(inst)}>
        <${Botao} icone="editar" desabilitado=${rodando} dica=${rodando ? 'Feche o jogo primeiro' : undefined} aoClicar=${() => setVersao(true)}>Trocar versão ou loader<//>
      <//>
    <//>

    <${Grupo} titulo="Memória" icone="info" descricao=${`Padrão do launcher: ${formatarRam(ramPadrao)} (muda em Configurações).`}>
      <${Linha} titulo="Usar a memória padrão" texto="Desligue para escolher quanta RAM só esta instância usa. Modpacks grandes costumam pedir 6–8 GB.">
        <${Alternador} ligado=${!ramPropria} aoMudar=${(padrao) => salvar({ ramMB: padrao ? null : ramPadrao }, padrao ? 'Usando a memória padrão.' : null)} />
      <//>
      ${ramPropria && html`<div class="linha-ram-inst">
        <${Deslizador} valor=${inst.ramMB} min=${1024} max=${Math.max(2048, ramMax || 8192)} passo=${512} formatar=${formatarRam}
          rotulo="Memória da instância" aoSoltar=${(v) => salvar({ ramMB: v }, `Memória: ${formatarRam(v)}.`)} />
      </div>`}
    <//>

    <${Grupo} titulo="Janela do jogo" icone="grade">
      <${Linha} titulo="Tamanho padrão" texto="Desligue para abrir o jogo com uma resolução escolhida.">
        <${Alternador} ligado=${!resPropria} aoMudar=${(padrao) => salvar({ resolucao: padrao ? null : res }, null)} />
      <//>
      ${resPropria && html`<div class="linha-resolucao">
        <label class="campo-numero"><span class="mais-suave">Largura</span>
          <input type="number" min="320" max="7680" value=${res.largura} onInput=${(e) => setRes({ ...res, largura: Number(e.currentTarget.value) })} />
        </label>
        <span class="vezes">×</span>
        <label class="campo-numero"><span class="mais-suave">Altura</span>
          <input type="number" min="240" max="4320" value=${res.altura} onInput=${(e) => setRes({ ...res, altura: Number(e.currentTarget.value) })} />
        </label>
        <${Botao} desabilitado=${!resValida} aoClicar=${() => salvar({ resolucao: res }, `Resolução: ${res.largura}×${res.altura}.`)}>Salvar<//>
        ${!resValida && html`<span class="ajuda-campo erro">Entre 320×240 e 7680×4320.</span>`}
      </div>`}
    <//>

    <${Grupo} titulo="Avançado" icone="terminal">
      <${Linha} titulo="Argumentos da JVM" texto="Para quem sabe o que está fazendo. Ex.: -XX:+UseZGC">
        <div class="linha-campo larga">
          <${CampoTexto} valor=${jvm} aoMudar=${setJvm} placeholder="nenhum" aria-label="Argumentos da JVM" />
          <${Botao} desabilitado=${jvm === (inst.jvmArgs || '')} aoClicar=${() => salvar({ jvmArgs: jvm.trim() }, 'Argumentos salvos.')}>Salvar<//>
        </div>
      <//>
      <${Linha} titulo="Pasta da instância" texto="Mods, mundos, configurações e logs ficam aqui.">
        <${Botao} icone="pasta" aoClicar=${() => abrirPasta(inst.id)}>Abrir pasta<//>
      <//>
    <//>

    <section class="config-grupo zona-perigo">
      <div class="config-linha">
        <div class="config-textos"><strong>Excluir instância</strong><span class="mais-suave">Apaga a pasta inteira, com mundos e mods. Não dá para desfazer.</span></div>
        <div class="config-controle">
          <${Botao} variante="perigo" icone="lixeira" desabilitado=${rodando}
            dica=${rodando ? 'Feche o jogo primeiro' : undefined}
            aoClicar=${async () => { if (await excluir(inst)) navegar('/instancias', { substituir: true }); }}>
            Excluir<//>
        </div>
      </div>
    </section>

    ${versao && html`<${ModalVersao} inst=${inst} aberto=${versao} aoFechar=${() => setVersao(false)} />`}
  </div>`;
}

// ======================================================================
// Página
// ======================================================================
export default function PaginaInstancia({ rota }) {
  const [id, abaRota] = rota.params;
  const { inst, fase, semConta, pronto } = useEstado((e) => ({
    inst: e.instancias.find((i) => i.id === id), fase: e.rodando[id], semConta: !e.contaAtiva, pronto: e.pronto,
  }));
  useTitulo(inst ? inst.nome : 'Instância', inst ? textoVersao(inst) : undefined);

  if (!inst) {
    if (!pronto) return html`<${Carregando} texto="Carregando..." />`;
    return html`<${Vazio} titulo="Instância não encontrada" icone="aviso" imagem=${false}
      texto="Ela pode ter sido excluída ou renomeada.">
      <${Botao} icone="instancias" aoClicar=${() => navegar('/instancias', { substituir: true })}>Ver instâncias<//>
    <//>`;
  }

  const aba = ABAS.some((a) => a.id === abaRota) ? abaRota : 'mods';
  const qtd = inst.quantidades || {};
  const abas = ABAS.map((a) => ({ id: a.id, rotulo: a.rotulo, icone: a.icone, contagem: a.qtd ? qtd[a.qtd] || undefined : undefined }));

  return html`<div class="pagina-inst">
    <${Cabecalho} inst=${inst} fase=${fase} semConta=${semConta} />
    <${Abas} class="inst-abas" abas=${abas} ativa=${aba} aoMudar=${(a) => navegar(rotaInstancia(inst.id, a), { substituir: true })} />
    <div class="inst-aba-corpo" key=${aba}>
      ${CONTEUDO[aba] && html`<${AbaConteudo} inst=${inst} tipo=${aba} fase=${fase} />`}
      ${aba === 'mundos' && html`<${AbaMundos} inst=${inst} />`}
      ${aba === 'log' && html`<${AbaLog} inst=${inst} fase=${fase} />`}
      ${aba === 'config' && html`<${AbaConfig} inst=${inst} fase=${fase} />`}
    </div>
  </div>`;
}
