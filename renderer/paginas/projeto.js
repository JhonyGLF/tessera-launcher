// Página de um projeto do Modrinth: cabeçalho, abas Descrição, Galeria e Versões.
// Rota: #/projeto/<id>[?instancia=<id>]  →  rota.params[0], rota.query.instancia
import { html, useEffect, useMemo, useState } from '../vendor/preact-htm.js';
import { api } from '../api.js';
import { useEstado } from '../estado.js';
import { navegar, useTitulo } from '../rotas.js';
import {
  Abas, Botao, Carregando, Cartao, Etiqueta, Icone, IconeInstancia, IconeLoader, Modal, Select, Vazio, Alternador,
} from '../componentes/index.js';
import { cls, formatarBytes, formatarData, lista, numeroCompacto, tempoRelativo } from '../util.js';
import {
  TIPOS, LOADERS_MOD, compatibilidade, nomeLoaderQualquer, rotuloCategoria, faixaVersoes, ordenarVersoes,
  useVersoesMc, useInstalados, useInstalando,
} from '../componentes/explorar/comum.js';
import { FaixaContexto, Numeros, BotaoInstalar, IconeExtra } from '../componentes/explorar/visuais.js';
import { useFluxoInstalar } from '../componentes/explorar/instalar.js';

// memória da sessão (voltar para o projeto é instantâneo)
const cacheProjetos = new Map();

const LADOS = { required: 'Obrigatório', optional: 'Opcional', unsupported: 'Não usa', unknown: '?' };
const TIPOS_VERSAO = {
  release: { rotulo: 'Estável', cor: 'verde' },
  beta: { rotulo: 'Beta', cor: 'amarelo' },
  alpha: { rotulo: 'Alpha', cor: 'vermelho' },
};

function Link({ icone, extra, rotulo, url }) {
  if (!url) return null;
  return html`<button type="button" class="link-projeto" onClick=${() => api.abrirLink(url)} data-dica=${url}>
    ${extra ? html`<${IconeExtra} nome=${extra} />` : html`<${Icone} nome=${icone} tamanho=${16} />`}
    ${rotulo}
  </button>`;
}

// ---------- Cabeçalho ----------
function Cabecalho({ projeto, botao, aoInstalar }) {
  const { versoes } = useVersoesMc();
  const loaders = (projeto.loaders || []).filter((l) => LOADERS_MOD.includes(l));
  const faixa = faixaVersoes(projeto.versoesMc || [], versoes || []);
  const cats = (projeto.categorias || []).filter((c) => !LOADERS_MOD.includes(c));
  const links = projeto.links || {};

  return html`<${Cartao} class="projeto-cabeca">
    <div class="projeto-cabeca-capa" aria-hidden="true">
      ${projeto.iconeUrl && html`<img src=${projeto.iconeUrl} alt="" draggable="false" />`}
    </div>
    <div class="projeto-cabeca-corpo">
      <${IconeInstancia} inst=${{ nome: projeto.titulo, iconeUrl: projeto.iconeUrl }} tamanho=${112} class="projeto-icone" />
      <div class="projeto-info">
        <div class="projeto-titulo-linha">
          <h1 class="truncar" title=${projeto.titulo}>${projeto.titulo}</h1>
          <${Etiqueta} cor="destaque" icone=${TIPOS[projeto.tipo] ? TIPOS[projeto.tipo].icone : 'mod'}>${TIPOS[projeto.tipo] ? TIPOS[projeto.tipo].singular : projeto.tipo}<//>
        </div>
        ${projeto.autor && html`<span class="autor">por <b>${projeto.autor}</b></span>`}
        <p class="projeto-descricao">${projeto.descricao}</p>
        <${Numeros} projeto=${projeto} completo />
        <div class="projeto-etiquetas">
          ${loaders.map((l) => html`<span key=${l} class="loader-projeto"><${IconeLoader} tipo=${l} tamanho=${16} />${nomeLoaderQualquer(l)}</span>`)}
          ${faixa && html`<${Etiqueta} cor="cinza">Minecraft ${faixa}<//>`}
          ${cats.slice(0, 5).map((c) => html`<${Etiqueta} key=${c}>${rotuloCategoria(c)}<//>`)}
        </div>
      </div>
      <div class="projeto-acoes">
        <${BotaoInstalar} ...${botao} tamanho="g" rotulo=${projeto.tipo === 'modpack' ? 'Instalar modpack' : 'Instalar'} aoClicar=${aoInstalar} class="projeto-instalar" />
        <div class="links-projeto">
          <${Link} icone="link" rotulo="Site" url=${links.site} />
          <${Link} extra="codigo" rotulo="Código" url=${links.fonte} />
          <${Link} extra="livro" rotulo="Wiki" url=${links.wiki} />
          <${Link} extra="discord" rotulo="Discord" url=${links.discord} />
          <${Link} extra="inseto" rotulo="Problemas" url=${links.issues} />
          <${Link} icone="explorar" rotulo="Modrinth" url=${`https://modrinth.com/${projeto.tipo || 'project'}/${projeto.slug || projeto.id}`} />
        </div>
      </div>
    </div>
  <//>`;
}

// ---------- Descrição ----------
function AbaDescricao({ projeto }) {
  const { versoes } = useVersoesMc();
  const loaders = (projeto.loaders || []).filter((l) => LOADERS_MOD.includes(l));
  const versoesOrd = ordenarVersoes((projeto.versoesMc || []), versoes || []);
  const releases = versoesOrd.filter((v) => /^\d+(\.\d+)+$/.test(v));
  const licenca = typeof projeto.licenca === 'string' ? projeto.licenca
    : projeto.licenca && (projeto.licenca.nome || projeto.licenca.name || projeto.licenca.id);
  return html`<div class="projeto-descricao-grade">
    <article class="texto-rico corpo-projeto">
      ${projeto.corpoHtml
        ? html`<div dangerouslySetInnerHTML=${{ __html: projeto.corpoHtml }}></div>`
        : html`<p class="mais-suave">${projeto.descricao || 'Este projeto não tem descrição.'}</p>`}
    </article>
    <aside class="projeto-lateral">
      <${Cartao} class="info-bloco">
        <h4>Compatibilidade</h4>
        ${loaders.length > 0 && html`<div class="info-linha"><span class="mais-suave">Loaders</span>
          <span class="info-loaders">${loaders.map((l) => html`<span key=${l} class="loader-projeto"><${IconeLoader} tipo=${l} tamanho=${16} />${nomeLoaderQualquer(l)}</span>`)}</span></div>`}
        <div class="info-linha"><span class="mais-suave">Minecraft</span>
          <span class="info-versoes">${(releases.length ? releases : versoesOrd).slice(0, 12).map((v) => html`<span key=${v} class="versao-mini vt">${v}</span>`)}
            ${(releases.length ? releases : versoesOrd).length > 12 && html`<span class="versao-mini vt mais-suave">+${(releases.length ? releases : versoesOrd).length - 12}</span>`}
          </span></div>
        ${(projeto.clienteLado || projeto.servidorLado) && html`<div class="info-linha"><span class="mais-suave">Cliente / servidor</span>
          <span>${LADOS[projeto.clienteLado] || '?'} / ${LADOS[projeto.servidorLado] || '?'}</span></div>`}
      <//>
      <${Cartao} class="info-bloco">
        <h4>Detalhes</h4>
        ${licenca && html`<div class="info-linha"><span class="mais-suave">Licença</span><span class="truncar">${licenca}</span></div>`}
        ${projeto.publicado && html`<div class="info-linha"><span class="mais-suave">Publicado</span><span>${formatarData(projeto.publicado)}</span></div>`}
        ${projeto.atualizado && html`<div class="info-linha"><span class="mais-suave">Atualizado</span><span>${tempoRelativo(projeto.atualizado)}</span></div>`}
        <div class="info-linha"><span class="mais-suave">Downloads</span><span class="vt grande">${numeroCompacto(projeto.downloads)}</span></div>
      <//>
    </aside>
  </div>`;
}

// ---------- Galeria ----------
function AbaGaleria({ projeto }) {
  const imagens = projeto.galeria || [];
  const [aberta, setAberta] = useState(-1);
  useEffect(() => {
    if (aberta < 0) return;
    const f = (e) => {
      if (e.key === 'ArrowRight') setAberta((i) => (i + 1) % imagens.length);
      if (e.key === 'ArrowLeft') setAberta((i) => (i - 1 + imagens.length) % imagens.length);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aberta, imagens.length]);

  if (!imagens.length) return html`<${Vazio} titulo="Sem imagens" texto="Este projeto não tem galeria." icone="grade" imagem=${false} />`;
  const atual = imagens[aberta];
  return html`<div class="galeria">
    ${imagens.map((g, i) => html`<button key=${g.url} type="button" class="galeria-item" onClick=${() => setAberta(i)} aria-label=${g.titulo || `Imagem ${i + 1}`}>
      <img src=${g.url} alt="" loading="lazy" draggable="false" />
      ${g.titulo && html`<span class="galeria-legenda truncar">${g.titulo}</span>`}
    </button>`)}
    ${atual && html`<${Modal} aberto titulo=${atual.titulo || `Imagem ${aberta + 1} de ${imagens.length}`} aoFechar=${() => setAberta(-1)} largura=${1040} class="modal-lightbox">
      <div class="lightbox">
        <img src=${atual.url} alt=${atual.titulo || ''} draggable="false" />
        ${imagens.length > 1 && html`
          <button type="button" class="lightbox-nav ant" aria-label="Anterior" onClick=${() => setAberta((aberta - 1 + imagens.length) % imagens.length)}><${Icone} nome="voltar" tamanho=${16} /></button>
          <button type="button" class="lightbox-nav prox" aria-label="Próxima" onClick=${() => setAberta((aberta + 1) % imagens.length)}><${Icone} nome="seta-direita" tamanho=${16} /></button>`}
      </div>
      ${atual.descricao && html`<p class="lightbox-descricao">${atual.descricao}</p>`}
      <p class="lightbox-contagem vt">${aberta + 1} / ${imagens.length}</p>
    <//>`}
  </div>`;
}

// ---------- Versões ----------
function AbaVersoes({ projeto, ctxInst, pedir, instaladoVersao, estaInstalando }) {
  const { versoes: oficiais } = useVersoesMc();
  const loadersProj = (projeto.loaders || []).filter((l) => LOADERS_MOD.includes(l));
  const [loader, setLoader] = useState('');
  const [mc, setMc] = useState('');
  const [soCompat, setSoCompat] = useState(!!ctxInst);
  const [estado, setEstado] = useState({ carregando: true, erro: null, versoes: [] });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    api.versoesModrinth(projeto.id, {}).then((r) => {
      if (!vivo) return;
      if (!r || r.ok === false) setEstado({ carregando: false, erro: (r && r.mensagem) || 'Não foi possível carregar as versões.', versoes: [] });
      else setEstado({ carregando: false, erro: null, versoes: lista(r, 'versoes') });
    });
    return () => { vivo = false; };
  }, [projeto.id, tentativa]);

  const todasMc = useMemo(() => ordenarVersoes(estado.versoes.flatMap((v) => v.versoesMc || []), oficiais || [])
    .filter((v) => /^\d+(\.\d+)+$/.test(v)), [estado.versoes, oficiais]);

  const visiveis = estado.versoes.filter((v) => (!loader || (v.loaders || []).includes(loader))
    && (!mc || (v.versoesMc || []).includes(mc))
    && (!soCompat || !ctxInst || compatibilidade(ctxInst, { tipo: projeto.tipo, loaders: v.loaders, versoesMc: v.versoesMc }).ok));

  if (estado.carregando) return html`<${Carregando} texto="Carregando versões..." />`;
  if (estado.erro) {
    return html`<${Vazio} titulo="Não foi possível carregar" texto=${estado.erro} icone="aviso" imagem=${false}>
      <${Botao} icone="atualizar" aoClicar=${() => setTentativa((n) => n + 1)}>Tentar de novo<//>
    <//>`;
  }

  return html`<div class="aba-versoes">
    <div class="versoes-filtros">
      ${loadersProj.length > 1 && html`<${Select} valor=${loader} largura=${170} rotulo="Loader"
        opcoes=${[{ valor: '', rotulo: 'Todos os loaders' }, ...loadersProj.map((l) => ({ valor: l, rotulo: nomeLoaderQualquer(l) }))]} aoMudar=${setLoader} />`}
      <${Select} valor=${mc} largura=${190} busca=${todasMc.length > 10} rotulo="Versão do Minecraft"
        opcoes=${[{ valor: '', rotulo: 'Todas as versões' }, ...todasMc.map((v) => ({ valor: v, rotulo: v }))]} aoMudar=${setMc} />
      ${ctxInst && html`<${Alternador} ligado=${soCompat} aoMudar=${setSoCompat} rotulo=${`Só as que servem em ${ctxInst.nome}`} />`}
      <span class="vt mais-suave versoes-contagem">${visiveis.length} de ${estado.versoes.length}</span>
    </div>
    ${!visiveis.length
      ? html`<${Vazio} titulo="Nenhuma versão" texto="Nenhuma versão combina com esses filtros." icone="filtro" imagem=${false} />`
      : html`<div class="lista-versoes" role="list">
          ${visiveis.slice(0, 120).map((v) => {
            const tv = TIPOS_VERSAO[v.tipo] || TIPOS_VERSAO.release;
            const compat = ctxInst ? compatibilidade(ctxInst, { tipo: projeto.tipo, loaders: v.loaders, versoesMc: v.versoesMc }) : { ok: true };
            const estadoBotao = ctxInst
              ? (estaInstalando(projeto.id, ctxInst.id) ? { estado: 'instalando' }
                : instaladoVersao === v.id ? { estado: 'instalado' }
                  : compat.ok ? { estado: 'livre' } : { estado: 'incompativel', motivo: compat.motivo })
              : { estado: 'livre' };
            const ls = (v.loaders || []).filter((l) => LOADERS_MOD.includes(l));
            return html`<div key=${v.id} class="versao-linha" role="listitem">
              <span class=${cls('tipo-versao', `t-${v.tipo || 'release'}`)} data-dica=${tv.rotulo}>${(v.tipo || 'release')[0].toUpperCase()}</span>
              <div class="versao-textos">
                <strong class="truncar" title=${v.nome}>${v.nome || v.numero}</strong>
                <span class="versao-detalhe">
                  <${Etiqueta} cor=${tv.cor}>${tv.rotulo}<//>
                  <span class="vt">${v.numero}</span>
                  ${ls.map((l) => html`<${IconeLoader} key=${l} tipo=${l} tamanho=${14} />`)}
                  <span class="mais-suave truncar">${faixaVersoes(v.versoesMc || [], oficiais || [])}</span>
                </span>
              </div>
              <span class="versao-numeros vt">
                <span>${tempoRelativo(v.data)}</span>
                <span class="mais-suave">${numeroCompacto(v.downloads)} downloads</span>
                ${v.arquivo && v.arquivo.tamanho && html`<span class="mais-suave">${formatarBytes(v.arquivo.tamanho)}</span>`}
              </span>
              <${BotaoInstalar} ...${estadoBotao} aoClicar=${() => pedir(projeto, v)} />
            </div>`;
          })}
          ${visiveis.length > 120 && html`<p class="mais-suave versoes-corte">Mostrando as 120 mais recentes. Use os filtros para achar uma versão antiga.</p>`}
        </div>`}
  </div>`;
}

// ---------- Página ----------
export default function PaginaProjeto({ rota }) {
  const id = rota.params[0];
  const ctxId = rota.query.instancia || '';
  const ctxInst = useEstado((e) => (ctxId ? e.instancias.find((i) => i.id === ctxId) || null : null));
  const [estado, setEstado] = useState(() => (cacheProjetos.has(id)
    ? { carregando: false, erro: null, projeto: cacheProjetos.get(id) } : { carregando: true, erro: null, projeto: null }));
  const [aba, setAba] = useState('descricao');
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    setAba('descricao');
    if (cacheProjetos.has(id) && !tentativa) { setEstado({ carregando: false, erro: null, projeto: cacheProjetos.get(id) }); return; }
    setEstado({ carregando: true, erro: null, projeto: null });
    api.projetoModrinth(id).then((r) => {
      if (!vivo) return;
      if (!r || r.ok === false || !r.projeto) { setEstado({ carregando: false, erro: (r && r.mensagem) || 'Projeto não encontrado.', projeto: null }); return; }
      cacheProjetos.set(id, r.projeto);
      if (r.projeto.slug) cacheProjetos.set(r.projeto.slug, r.projeto);
      setEstado({ carregando: false, erro: null, projeto: r.projeto });
    });
    return () => { vivo = false; };
  }, [id, tentativa]);

  const projeto = estado.projeto;
  useTitulo(projeto ? projeto.titulo : 'Projeto', ctxInst ? `para ${ctxInst.nome}` : 'Modrinth');

  const pasta = projeto && TIPOS[projeto.tipo] ? TIPOS[projeto.tipo].pasta : null;
  const { mapa: instalados } = useInstalados(ctxInst && pasta ? ctxInst.id : null, pasta);
  const estaInstalando = useInstalando();
  const { pedir, modais } = useFluxoInstalar(ctxInst);

  if (estado.carregando) return html`<${Carregando} texto="Abrindo projeto..." />`;
  if (estado.erro) {
    return html`<${Vazio} titulo="Não foi possível abrir o projeto" texto=${`${estado.erro} Confira sua conexão com a internet.`} icone="aviso" imagem=${false}>
      <${Botao} icone="atualizar" aoClicar=${() => setTentativa((n) => n + 1)}>Tentar de novo<//>
      <${Botao} variante="fantasma" icone="explorar" aoClicar=${() => navegar('/explorar')}>Explorar<//>
    <//>`;
  }

  const instaladoInfo = instalados.get(projeto.id);
  let botao;
  if (ctxInst) {
    if (estaInstalando(projeto.id, ctxInst.id)) botao = { estado: 'instalando' };
    else if (instaladoInfo) botao = { estado: 'instalado' };
    else {
      const c = compatibilidade(ctxInst, { tipo: projeto.tipo, loaders: projeto.loaders, versoesMc: projeto.versoesMc });
      botao = c.ok ? { estado: 'livre' } : { estado: 'incompativel', motivo: c.motivo };
    }
  } else {
    botao = { estado: estaInstalando(projeto.id) ? 'instalando' : 'livre' };
  }

  const qtdGaleria = (projeto.galeria || []).length;
  const abas = [
    { id: 'descricao', rotulo: 'Descrição', icone: 'info' },
    { id: 'galeria', rotulo: 'Galeria', icone: 'grade', contagem: qtdGaleria || undefined },
    { id: 'versoes', rotulo: 'Versões', icone: 'lista' },
  ];

  return html`<div class="pagina-projeto">
    <${FaixaContexto} inst=${ctxInst} />
    <${Cabecalho} projeto=${projeto} botao=${botao} aoInstalar=${() => pedir(projeto)} />
    <${Abas} class="projeto-abas" abas=${abas} ativa=${aba} aoMudar=${setAba} />
    <div class="projeto-aba-corpo" key=${aba}>
      ${aba === 'descricao' && html`<${AbaDescricao} projeto=${projeto} />`}
      ${aba === 'galeria' && html`<${AbaGaleria} projeto=${projeto} />`}
      ${aba === 'versoes' && html`<${AbaVersoes} projeto=${projeto} ctxInst=${ctxInst} pedir=${pedir}
        instaladoVersao=${instaladoInfo && instaladoInfo.versaoId} estaInstalando=${estaInstalando} />`}
    </div>
    ${modais}
  </div>`;
}
