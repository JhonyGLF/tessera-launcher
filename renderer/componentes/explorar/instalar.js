// Fluxos de instalação do Explorar/Projeto:
//   instalarConteudo({ projeto, inst, versaoId })   → mod/resource pack/shader direto numa instância
//   instalarModpackFluxo({ projeto, versaoId, nome }) → modpack vira instância nova
//   useFluxoInstalar(ctxInst) → { pedir(projeto, versao?), modais }   (abre o modal certo quando precisa)
import { html, useEffect, useMemo, useState } from '../../vendor/preact-htm.js';
import { api } from '../../api.js';
import { useEstado } from '../../estado.js';
import { navegar, lerRota } from '../../rotas.js';
import { Modal, Botao, Icone, IconeInstancia, EtiquetaLoader, Etiqueta, Select, CampoTexto, toast } from '../index.js';
import { textoVersao, cls } from '../../util.js';
import {
  TIPOS, LOADERS_MOD, compatibilidade, nomeLoaderQualquer, rotaInstancia, marcarInstalando, recarregarInstalados,
  instaladoEm, useInstalando, carregarVersoesMc, ordenarVersoes,
} from './comum.js';

// ---------- Ações ----------
export async function instalarConteudo({ projeto, inst, versaoId }) {
  const pasta = TIPOS[projeto.tipo] && TIPOS[projeto.tipo].pasta;
  marcarInstalando(projeto.id, inst.id, true);
  const r = await api.instalarModrinth({ projetoId: projeto.id, versaoId: versaoId || undefined, instanciaId: inst.id });
  marcarInstalando(projeto.id, inst.id, false);
  if (pasta) recarregarInstalados(inst.id, pasta);
  if (r && r.ok !== false) {
    toast(r.mensagem || `${projeto.titulo} foi instalado.`, {
      tipo: 'ok', titulo: `Instalado em ${inst.nome}`,
      acao: lerRota().caminho.startsWith('/instancia/') ? undefined : { rotulo: 'Ver instância', aoClicar: () => navegar(rotaInstancia(inst.id)) },
    });
  } else {
    toast((r && r.mensagem) || 'Algo deu errado.', { tipo: 'erro', titulo: `Não foi possível instalar ${projeto.titulo}` });
  }
  return r;
}

export async function instalarModpackFluxo({ projeto, versaoId, nome }) {
  marcarInstalando(projeto.id, null, true);
  toast('Acompanhe o progresso em Tarefas, na barra lateral.', { titulo: `Instalando ${projeto.titulo}` });
  const r = await api.instalarModpack({ projetoId: projeto.id, versaoId: versaoId || undefined, nome: nome || undefined });
  marcarInstalando(projeto.id, null, false);
  if (!r || r.ok === false) {
    toast((r && r.mensagem) || 'Algo deu errado.', { tipo: 'erro', titulo: `Não foi possível instalar ${projeto.titulo}` });
    return r;
  }
  const id = r.id || (r.instancia && r.instancia.id);
  const nomeFinal = r.nome || (r.instancia && r.instancia.nome) || nome || projeto.titulo;
  const pagina = lerRota().pagina;
  const irAgora = id && (pagina === 'explorar' || pagina === 'projeto');
  toast(`A instância "${nomeFinal}" está pronta para jogar.`, {
    tipo: 'ok', titulo: 'Modpack instalado',
    acao: id && !irAgora ? { rotulo: 'Abrir instância', aoClicar: () => navegar(rotaInstancia(id)) } : undefined,
  });
  if (irAgora) navegar(rotaInstancia(id));
  return r;
}

// ---------- Cabeçalho comum dos modais ----------
function CabecaProjeto({ projeto, versao, sub }) {
  return html`<div class="modal-projeto">
    <${IconeInstancia} inst=${{ nome: projeto.titulo, iconeUrl: projeto.iconeUrl }} tamanho=${48} />
    <div class="modal-projeto-textos">
      <strong class="truncar">${projeto.titulo}</strong>
      <span class="truncar">${versao ? html`Versão <b>${versao.numero || versao.nome}</b>` : sub}</span>
    </div>
  </div>`;
}

// ---------- Modal "Instalar em…" ----------
function LinhaInstancia({ inst, compat, instalado, instalando, aoInstalar }) {
  const ok = compat.ok;
  return html`<div class=${cls('linha-inst', !ok && 'incompativel')}>
    <${IconeInstancia} inst=${inst} tamanho=${36} />
    <div class="linha-inst-textos">
      <strong class="truncar">${inst.nome}</strong>
      <span class="truncar">${textoVersao(inst)}</span>
    </div>
    ${!ok
      ? html`<span class="motivo">${compat.motivo}</span>`
      : instalado
        ? html`<span class="selo-instalado t-p"><${Icone} nome="ok" tamanho=${16} /> Instalado</span>`
        : html`<${Botao} variante="principal" tamanho="p" icone="download" carregando=${instalando} aoClicar=${aoInstalar}>
            ${instalando ? 'Instalando' : 'Instalar'}<//>`}
  </div>`;
}

function FormNovaInstancia({ projeto, versao, aoCriada, aoVoltar }) {
  const alvoVersoes = (versao && versao.versoesMc) || projeto.versoesMc || [];
  const alvoLoaders = ((versao && versao.loaders) || projeto.loaders || []).filter((l) => LOADERS_MOD.includes(l));
  const [oficiais, setOficiais] = useState([]);
  useEffect(() => { carregarVersoesMc().then((r) => setOficiais(r.versoes || [])); }, []);
  const opcoesMc = useMemo(() => {
    const tipos = new Map(oficiais.map((v) => [v.id, v.tipo]));
    const releases = alvoVersoes.filter((id) => !tipos.size || tipos.get(id) === 'release');
    return ordenarVersoes(releases.length ? releases : alvoVersoes, oficiais).map((id) => ({ valor: id, rotulo: id }));
  }, [oficiais, alvoVersoes.join()]);
  const loaders = alvoLoaders.length ? alvoLoaders : ['fabric'];
  const [nome, setNome] = useState(projeto.titulo.slice(0, 40));
  const [mc, setMc] = useState(null);
  const [loader, setLoader] = useState(loaders.includes('fabric') ? 'fabric' : loaders[0]);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => { if (!mc && opcoesMc.length) setMc(opcoesMc[0].valor); }, [opcoesMc]);

  const criar = async () => {
    if (!nome.trim()) { setErro('Dê um nome para a instância.'); return; }
    if (!mc) { setErro('Escolha a versão do Minecraft.'); return; }
    setCriando(true);
    setErro('');
    const r = await api.criarInstancia({ nome: nome.trim(), mc, loader: { tipo: loader, versao: null }, icone: 'grama' });
    setCriando(false);
    if (!r || r.ok === false || !r.instancia) { setErro((r && r.mensagem) || 'Não foi possível criar a instância.'); return; }
    aoCriada(r.instancia);
  };

  return html`<div class="form-nova">
    <p class="form-nova-texto">Uma instância nova, já com a versão do Minecraft e o loader que o <b>${projeto.titulo}</b> pede.</p>
    <div class="campo">
      <label class="rotulo-campo">Nome</label>
      <${CampoTexto} valor=${nome} aoMudar=${(v) => { setNome(v); setErro(''); }} maxlength="40" icone="editar"
        invalido=${!!erro && !nome.trim()} onKeyDown=${(e) => e.key === 'Enter' && criar()} />
    </div>
    <div class="form-nova-linha">
      <div class="campo">
        <label class="rotulo-campo">Versão do Minecraft</label>
        <${Select} valor=${mc} opcoes=${opcoesMc} aoMudar=${setMc} busca=${opcoesMc.length > 10} placeholder="Carregando..." />
      </div>
      <div class="campo">
        <label class="rotulo-campo">Loader</label>
        <${Select} valor=${loader} aoMudar=${setLoader}
          opcoes=${loaders.map((l) => ({ valor: l, rotulo: nomeLoaderQualquer(l) }))} />
      </div>
    </div>
    ${erro && html`<p class="ajuda-campo erro">${erro}</p>`}
    <div class="form-nova-acoes">
      <${Botao} variante="fantasma" icone="voltar" aoClicar=${aoVoltar}>Voltar<//>
      <${Botao} variante="principal" icone="mais" carregando=${criando} aoClicar=${criar}>Criar e instalar<//>
    </div>
  </div>`;
}

export function ModalInstalarEm({ projeto, versao, aoFechar }) {
  const instancias = useEstado((e) => e.instancias);
  const estaInstalando = useInstalando();
  const [vista, setVista] = useState('lista');
  const [verOutras, setVerOutras] = useState(false);
  const [instalados, setInstalados] = useState({});
  const tipo = projeto.tipo;
  const pasta = TIPOS[tipo] && TIPOS[tipo].pasta;
  const alvo = versao ? { tipo, loaders: versao.loaders, versoesMc: versao.versoesMc } : { tipo, loaders: projeto.loaders, versoesMc: projeto.versoesMc };

  const linhas = useMemo(() => [...instancias]
    .sort((a, b) => (b.ultimoJogo || b.criadaEm || 0) - (a.ultimoJogo || a.criadaEm || 0))
    .map((inst) => ({ inst, compat: compatibilidade(inst, alvo) })), [instancias, projeto.id, versao && versao.id]);
  const compativeis = linhas.filter((l) => l.compat.ok);
  const outras = linhas.filter((l) => !l.compat.ok);

  // quais instâncias compatíveis já têm o projeto
  useEffect(() => {
    let vivo = true;
    if (!pasta) return;
    compativeis.forEach(({ inst }) => instaladoEm(inst.id, pasta, projeto.id).then((sim) => {
      if (vivo) setInstalados((m) => (m[inst.id] === sim ? m : { ...m, [inst.id]: sim }));
    }));
    return () => { vivo = false; };
  }, [compativeis.length, projeto.id]);

  const instalarEm = (inst) => {
    aoFechar();
    instalarConteudo({ projeto, inst, versaoId: versao && versao.id });
  };

  const podeCriar = tipo === 'mod';
  const titulo = vista === 'nova' ? 'Nova instância' : 'Instalar em…';
  return html`<${Modal} aberto titulo=${titulo} aoFechar=${aoFechar} largura=${540} class="modal-instalar"
    rodape=${vista === 'lista' && html`
      ${podeCriar && html`<${Botao} variante="pedra" icone="mais" class="esquerda" aoClicar=${() => setVista('nova')}>Criar nova instância<//>`}
      <${Botao} variante=${podeCriar ? 'fantasma' : 'pedra'} aoClicar=${aoFechar}>Cancelar<//>`}>
    <${CabecaProjeto} projeto=${projeto} versao=${versao}
      sub=${vista === 'nova' ? 'Criar uma instância para este mod' : `Escolha onde instalar este ${TIPOS[tipo] ? TIPOS[tipo].singular : 'projeto'}`} />
    ${vista === 'nova'
      ? html`<${FormNovaInstancia} projeto=${projeto} versao=${versao} aoVoltar=${() => setVista('lista')}
          aoCriada=${(inst) => instalarEm(inst)} />`
      : html`
        ${compativeis.length
          ? html`<div class="lista-inst">
              ${compativeis.map(({ inst, compat }) => html`<${LinhaInstancia} key=${inst.id} inst=${inst} compat=${compat}
                instalado=${instalados[inst.id]} instalando=${estaInstalando(projeto.id, inst.id)} aoInstalar=${() => instalarEm(inst)} />`)}
            </div>`
          : html`<div class="sem-compativel">
              <${Icone} nome="aviso" tamanho=${24} />
              <div>
                <strong>Nenhuma instância compatível</strong>
                <p>${instancias.length
                  ? (podeCriar ? 'Crie uma instância com a versão e o loader certos e o mod é instalado nela.' : 'Nenhuma das suas instâncias usa uma versão do Minecraft suportada por este projeto.')
                  : 'Você ainda não tem instâncias.'}</p>
              </div>
            </div>`}
        ${outras.length > 0 && html`<div class="outras-inst">
          <button type="button" class=${cls('outras-titulo', verOutras && 'aberto')} aria-expanded=${verOutras} onClick=${() => setVerOutras(!verOutras)}>
            <${Icone} nome="seta-direita" tamanho=${16} /> Incompatíveis <span class="vt">${outras.length}</span>
          </button>
          ${verOutras && html`<div class="lista-inst">
            ${outras.map(({ inst, compat }) => html`<${LinhaInstancia} key=${inst.id} inst=${inst} compat=${compat} />`)}
          </div>`}
        </div>`}`}
  <//>`;
}

// ---------- Modal do modpack ----------
export function ModalModpack({ projeto, versao, aoFechar }) {
  const [nome, setNome] = useState('');
  const capa = projeto.imagemUrl || (projeto.galeria && projeto.galeria[0] && projeto.galeria[0].url) || null;
  const loaders = ((versao && versao.loaders) || projeto.loaders || []).filter((l) => LOADERS_MOD.includes(l));
  const instalar = () => {
    aoFechar();
    instalarModpackFluxo({ projeto, versaoId: versao && versao.id, nome: nome.trim() });
  };
  return html`<${Modal} aberto titulo="Instalar modpack" aoFechar=${aoFechar} largura=${520} class="modal-modpack"
    rodape=${html`
      <${Botao} variante="pedra" aoClicar=${aoFechar}>Cancelar<//>
      <${Botao} variante="principal" icone="download" aoClicar=${instalar}>Instalar modpack<//>`}>
    ${capa && html`<div class="modpack-capa"><img src=${capa} alt="" draggable="false" /></div>`}
    <${CabecaProjeto} projeto=${projeto} versao=${versao} sub=${projeto.autor ? `por ${projeto.autor} · versão mais recente` : 'Versão mais recente'} />
    ${(loaders.length > 0 || (versao && versao.versoesMc)) && html`<div class="modpack-etiquetas">
      ${versao && versao.versoesMc && versao.versoesMc[0] && html`<${Etiqueta} cor="cinza">Minecraft ${versao.versoesMc[0]}<//>`}
      ${loaders.map((l) => html`<${EtiquetaLoader} key=${l} loader=${l} />`)}
    </div>`}
    <p class="modpack-texto">
      Será criada uma <b>instância nova</b> com os mods, as configurações e a versão certa do Minecraft.
      O download pode levar alguns minutos.
    </p>
    <div class="campo">
      <label class="rotulo-campo">Nome da instância <span class="opcional">(opcional)</span></label>
      <${CampoTexto} valor=${nome} aoMudar=${setNome} placeholder=${projeto.titulo} maxlength="40" icone="editar"
        onKeyDown=${(e) => e.key === 'Enter' && instalar()} />
    </div>
  <//>`;
}

// ---------- Hook que junta tudo ----------
// ctxInst: instância do contexto (ou null). pedir(projeto, versao?) instala direto ou abre o modal.
export function useFluxoInstalar(ctxInst) {
  const [alvo, setAlvo] = useState(null); // { projeto, versao, modal: 'em'|'modpack' }
  const pedir = (projeto, versao) => {
    if (projeto.tipo === 'modpack') { setAlvo({ projeto, versao, modal: 'modpack' }); return; }
    if (ctxInst) { instalarConteudo({ projeto, inst: ctxInst, versaoId: versao && versao.id }); return; }
    setAlvo({ projeto, versao, modal: 'em' });
  };
  const fechar = () => setAlvo(null);
  const modais = alvo && (alvo.modal === 'modpack'
    ? html`<${ModalModpack} projeto=${alvo.projeto} versao=${alvo.versao} aoFechar=${fechar} />`
    : html`<${ModalInstalarEm} projeto=${alvo.projeto} versao=${alvo.versao} aoFechar=${fechar} />`);
  return { pedir, modais };
}
