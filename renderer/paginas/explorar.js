// Explorar: biblioteca do Modrinth (mods, modpacks, resource packs e shaders) com busca,
// filtros, ordenação e instalação.
// Rota: #/explorar?tipo=mod|modpack|resourcepack|shader[&instancia=<id>][&q=][&v=<mc>][&loader=][&cat=a,b][&ordem=]
// Com &instancia=<id> a página fica "presa" à instância: filtros travados na versão/loader
// dela e o botão Instalar instala direto.
import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import { api } from '../api.js';
import { useEstado } from '../estado.js';
import { navegar, trocarQuery, useTitulo } from '../rotas.js';
import { Abas, Botao, CampoTexto, Cartao, Icone, IconeInstancia, IconeLoader, Select, Vazio, Etiqueta } from '../componentes/index.js';
import { cls, numero } from '../util.js';
import {
  TIPOS, ORDEM_TIPOS, ORDENS, LOADERS_MOD, tipoValido, compatibilidade, rotaProjeto, rotuloCategoria, nomeLoaderQualquer,
  useCategorias, useVersoesMc, useInstalados, useInstalando,
} from '../componentes/explorar/comum.js';
import { Caixa, FaixaContexto, Numeros, BotaoInstalar, IconeExtra, Brilho } from '../componentes/explorar/visuais.js';
import { useFluxoInstalar } from '../componentes/explorar/instalar.js';

const LIMITE = 20;
const ID_IRIS = 'YL57xq9U';

// última busca (para voltar do projeto sem recarregar nem perder a rolagem)
let ultima = { chave: null, hits: [], total: 0, pagina: 0, rolagem: 0 };

const conteudoEl = () => document.querySelector('.conteudo');

function lerVista(tipo) {
  try { const v = localStorage.getItem(`jg-explorar-vista-${tipo}`); if (v === 'lista' || v === 'grade') return v; } catch {}
  return tipo === 'shader' || tipo === 'resourcepack' ? 'grade' : 'lista';
}

// ---------- Filtros (painel lateral) ----------
function GrupoFiltro({ titulo, children, contagem }) {
  return html`<div class="grupo-filtro">
    <div class="grupo-filtro-titulo">${titulo}${contagem ? html`<span class="vt">${contagem}</span>` : ''}</div>
    ${children}
  </div>`;
}

function Travado({ children, dica }) {
  return html`<div class="travado" data-dica=${dica}>
    <${IconeExtra} nome="cadeado" />
    <span class="truncar">${children}</span>
  </div>`;
}

function PainelFiltros({ tipo, ctxInst, filtros, mudar, limpar, ativos }) {
  const { versoes } = useVersoesMc();
  const snapshots = useEstado((e) => e.config.mostrarSnapshots);
  const cats = useCategorias(tipo);
  const comLoader = tipo === 'mod' || tipo === 'modpack';

  const opcoesVersao = useMemo(() => [
    { valor: '', rotulo: 'Todas as versões' },
    ...(versoes || []).filter((v) => v.tipo === 'release').map((v) => ({ valor: v.id, rotulo: v.id, grupo: 'Lançamentos' })),
    ...(snapshots ? (versoes || []).filter((v) => v.tipo === 'snapshot').map((v) => ({ valor: v.id, rotulo: v.id, grupo: 'Snapshots' })) : []),
  ], [versoes, snapshots]);
  // versão vinda do link que não está na lista (ex.: snapshot com snapshots ocultos)
  if (filtros.versaoMc && !opcoesVersao.some((o) => o.valor === filtros.versaoMc)) opcoesVersao.push({ valor: filtros.versaoMc, rotulo: filtros.versaoMc });

  const alternarCategoria = (nome, ligar) => {
    const lista = new Set(filtros.categorias);
    if (ligar) lista.add(nome); else lista.delete(nome);
    mudar({ cat: [...lista].join(',') });
  };
  const loaderCtx = ctxInst && ctxInst.loader ? ctxInst.loader.tipo : null;

  return html`<aside class="filtros" aria-label="Filtros">
    <div class="filtros-cabeca">
      <${Icone} nome="filtro" tamanho=${16} />
      <span>Filtros</span>
      ${ativos > 0 && html`<button type="button" class="link limpar-filtros" onClick=${limpar}>Limpar (${ativos})</button>`}
    </div>

    <${GrupoFiltro} titulo="Versão do Minecraft">
      ${ctxInst
        ? html`<${Travado} dica="Travado na versão da instância">${ctxInst.mc}<//>`
        : html`<${Select} valor=${filtros.versaoMc} opcoes=${opcoesVersao} busca rotulo="Versão do Minecraft"
            aoMudar=${(v) => mudar({ v })} larguraLista=${220} placeholder="Todas as versões" />`}
    <//>

    ${comLoader && html`<${GrupoFiltro} titulo="Loader">
      ${ctxInst
        ? html`<${Travado} dica="Travado no loader da instância">
            ${loaderCtx && loaderCtx !== 'vanilla' ? html`<${IconeLoader} tipo=${loaderCtx} />` : ''}
            ${loaderCtx === 'quilt' && tipo === 'mod' ? 'Quilt e Fabric' : nomeLoaderQualquer(loaderCtx || 'vanilla')}
          <//>`
        : html`<div class="opcoes-loader" role="radiogroup" aria-label="Loader">
            ${['', ...LOADERS_MOD].map((l) => html`<button key=${l || 'todos'} type="button" role="radio" aria-checked=${filtros.loader === l}
              class=${cls('opcao-loader', filtros.loader === l && 'ativa')} onClick=${() => mudar({ loader: l })}>
              ${l ? html`<${IconeLoader} tipo=${l} />` : html`<span class="todos-loaders"><${Icone} nome="grade" tamanho=${12} /></span>`}
              ${l ? nomeLoaderQualquer(l) : 'Todos'}
            </button>`)}
          </div>`}
    <//>`}

    ${cats.carregando
      ? html`<${GrupoFiltro} titulo="Categorias">
          ${[70, 52, 84, 60, 74, 48].map((l, i) => html`<div key=${i} class="caixa-esqueleto"><${Brilho} l="14px" a=${14} /><${Brilho} l=${`${l}%`} /></div>`)}
        <//>`
      : cats.grupos.map((g) => {
        const marcadas = g.itens.filter((c) => filtros.categorias.includes(c.nome)).length;
        return html`<${GrupoFiltro} key=${g.id} titulo=${g.rotulo} contagem=${marcadas || null}>
          <div class="lista-caixas">
            ${g.itens.map((c) => html`<${Caixa} key=${c.nome} rotulo=${c.rotulo} marcada=${filtros.categorias.includes(c.nome)}
              aoMudar=${(v) => alternarCategoria(c.nome, v)} />`)}
          </div>
        <//>`;
      })}
    ${cats.erro && html`<p class="filtros-erro">Não foi possível carregar as categorias.</p>`}
  </aside>`;
}

// ---------- Cartões de resultado ----------
function estadoBotao({ hit, ctxInst, instalados, estaInstalando }) {
  if (ctxInst) {
    if (estaInstalando(hit.id, ctxInst.id)) return { estado: 'instalando' };
    if (instalados.has(hit.id)) return { estado: 'instalado' };
    const c = compatibilidade(ctxInst, { tipo: hit.tipo, loaders: hit.loaders, versoesMc: hit.versoesMc });
    return c.ok ? { estado: 'livre' } : { estado: 'incompativel', motivo: c.motivo };
  }
  return { estado: estaInstalando(hit.id) ? 'instalando' : 'livre' };
}

function Etiquetas({ hit, max = 3 }) {
  const cats = (hit.categorias || []).filter((c) => !LOADERS_MOD.includes(c));
  return html`<span class="etiquetas-projeto">
    ${cats.slice(0, max).map((c) => html`<${Etiqueta} key=${c}>${rotuloCategoria(c)}<//>`)}
    ${cats.length > max && html`<${Etiqueta} cor="cinza" dica=${cats.slice(max).map(rotuloCategoria).join(', ')}>+${cats.length - max}<//>`}
  </span>`;
}

function LoadersHit({ hit }) {
  const ls = (hit.loaders || []).filter((l) => LOADERS_MOD.includes(l));
  if (!ls.length) return null;
  return html`<span class="loaders-hit" data-dica=${ls.map(nomeLoaderQualquer).join(', ')}>
    ${ls.map((l) => html`<${IconeLoader} key=${l} tipo=${l} tamanho=${16} />`)}
  </span>`;
}

function CartaoResultado({ hit, botao, naBiblioteca, aoAbrir, aoInstalar }) {
  return html`<${Cartao} interativo class="resultado" aoClicar=${aoAbrir}>
    <${IconeInstancia} inst=${{ nome: hit.titulo, iconeUrl: hit.iconeUrl }} tamanho=${72} />
    <div class="resultado-corpo">
      <div class="resultado-linha1">
        <h3 class="truncar">${hit.titulo}</h3>
        ${hit.autor && html`<span class="autor truncar">por <b>${hit.autor}</b></span>`}
      </div>
      <p class="resultado-descricao">${hit.descricao}</p>
      <div class="resultado-meta">
        <${Numeros} projeto=${hit} />
        <${Etiquetas} hit=${hit} />
      </div>
    </div>
    <div class="resultado-lado">
      <${BotaoInstalar} ...${botao} aoClicar=${aoInstalar} />
      <span class="resultado-extra">
        ${naBiblioteca && html`<${Etiqueta} cor="verde" icone="ok" dica="Você já tem uma instância com este modpack">Na biblioteca<//>`}
        <${LoadersHit} hit=${hit} />
      </span>
    </div>
  <//>`;
}

function CartaoGaleria({ hit, botao, aoAbrir, aoInstalar }) {
  const [falhou, setFalhou] = useState(false);
  const imagem = hit.imagemUrl && !falhou ? hit.imagemUrl : null;
  return html`<${Cartao} interativo class="resultado-grade" aoClicar=${aoAbrir}>
    <div class=${cls('grade-imagem', !imagem && 'sem-imagem')}>
      ${imagem
        ? html`<img src=${imagem} alt="" loading="lazy" draggable="false" onError=${() => setFalhou(true)} />`
        : hit.iconeUrl && html`<img class="fundo-icone" src=${hit.iconeUrl} alt="" draggable="false" />`}
    </div>
    <div class="grade-corpo">
      <${IconeInstancia} inst=${{ nome: hit.titulo, iconeUrl: hit.iconeUrl }} tamanho=${52} class="grade-icone" />
      <div class="grade-titulos">
        <h3 class="truncar">${hit.titulo}</h3>
        ${hit.autor && html`<span class="autor truncar">por <b>${hit.autor}</b></span>`}
      </div>
      <p class="resultado-descricao">${hit.descricao}</p>
      <div class="grade-rodape">
        <${Numeros} projeto=${hit} />
        <${BotaoInstalar} ...${botao} aoClicar=${aoInstalar} />
      </div>
    </div>
  <//>`;
}

function Esqueletos({ vista }) {
  if (vista === 'grade') {
    return html`<div class="grade-resultados">${[0, 1, 2, 3].map((i) => html`<div key=${i} class="cartao resultado-grade esqueleto-cartao">
      <div class="grade-imagem"><${Brilho} l="100%" a=${200} /></div>
      <div class="grade-corpo"><${Brilho} l="60%" a=${16} /><${Brilho} l="90%" /><${Brilho} l="70%" /></div>
    </div>`)}</div>`;
  }
  return html`<div class="lista-resultados">${[86, 64, 92, 70, 80, 58].map((l, i) => html`<div key=${i} class="cartao resultado esqueleto-cartao">
    <${Brilho} l="72px" a=${72} class="brilho-icone" />
    <div class="resultado-corpo">
      <${Brilho} l=${`${30 + (i % 3) * 8}%`} a=${18} />
      <${Brilho} l=${`${l}%`} />
      <${Brilho} l=${`${l - 30}%`} />
      <div class="resultado-meta"><${Brilho} l="64px" a=${16} /><${Brilho} l="64px" a=${16} /><${Brilho} l="80px" a=${16} /></div>
    </div>
    <div class="resultado-lado"><${Brilho} l="96px" a=${32} /></div>
  </div>`)}</div>`;
}

// ---------- Página ----------
export default function PaginaExplorar({ rota }) {
  const q = rota.query;
  const ctxId = q.instancia || '';
  const ctxInst = useEstado((e) => (ctxId ? e.instancias.find((i) => i.id === ctxId) || null : null));
  const instancias = useEstado((e) => e.instancias);
  let tipo = tipoValido(q.tipo);
  if (ctxInst && tipo === 'modpack') tipo = 'mod';
  const comLoader = tipo === 'mod' || tipo === 'modpack';
  const loaderCtx = ctxInst && ctxInst.loader ? ctxInst.loader.tipo : 'vanilla';

  const filtros = {
    consulta: q.q || '',
    versaoMc: ctxInst ? ctxInst.mc : (q.v || ''),
    loader: comLoader ? (ctxInst ? (loaderCtx !== 'vanilla' ? loaderCtx : '') : (q.loader || '')) : '',
    categorias: (q.cat || '').split(',').filter(Boolean),
    ordenar: ORDENS.some((o) => o.valor === q.ordem) ? q.ordem : 'relevance',
  };
  const chave = JSON.stringify([tipo, filtros.consulta, filtros.versaoMc, filtros.loader, [...filtros.categorias].sort(), filtros.ordenar]);

  useTitulo('Explorar', ctxInst ? `para ${ctxInst.nome}` : 'Conteúdo do Modrinth');

  // ----- busca com atraso (debounce) -----
  const [texto, setTexto] = useState(filtros.consulta);
  useEffect(() => { if (filtros.consulta !== texto.trim()) setTexto(filtros.consulta); }, [filtros.consulta]);
  useEffect(() => {
    if (texto.trim() === filtros.consulta) return;
    const t = setTimeout(() => trocarQuery({ q: texto.trim() }), 350);
    return () => clearTimeout(t);
  }, [texto]);

  // ----- resultados -----
  const voltando = useRef(ultima.chave === chave);
  const [res, setRes] = useState(() => (voltando.current
    ? { hits: ultima.hits, total: ultima.total, pagina: ultima.pagina, carregando: false, mais: false, erro: null }
    : { hits: [], total: 0, pagina: 0, carregando: true, mais: false, erro: null }));
  const pedido = useRef(0);

  const buscar = async (pagina) => {
    const meu = ++pedido.current;
    setRes((r) => (pagina === 0 ? { ...r, carregando: true, erro: null } : { ...r, mais: true }));
    const r = await api.buscarModrinth({
      consulta: filtros.consulta, tipo, versaoMc: filtros.versaoMc || undefined, loader: filtros.loader || undefined,
      categorias: filtros.categorias, ordenar: filtros.ordenar, pagina, limite: LIMITE,
    });
    if (meu !== pedido.current) return;
    if (!r || r.ok === false) {
      const mensagem = (r && r.mensagem) || 'Não foi possível falar com o Modrinth.';
      if (pagina === 0) setRes({ hits: [], total: 0, pagina: 0, carregando: false, mais: false, erro: mensagem });
      else { setRes((x) => ({ ...x, mais: false })); toast(mensagem); }
      return;
    }
    setRes((x) => {
      const vistos = new Set(pagina === 0 ? [] : x.hits.map((h) => h.id));
      const hits = pagina === 0 ? (r.hits || []) : [...x.hits, ...(r.hits || []).filter((h) => !vistos.has(h.id))];
      const novo = { hits, total: r.total || 0, pagina, carregando: false, mais: false, erro: null };
      ultima = { ...ultima, chave, hits, total: novo.total, pagina };
      return novo;
    });
  };

  useEffect(() => {
    if (voltando.current) {
      // voltou do projeto: mostra o que já tinha e devolve a rolagem
      voltando.current = false;
      const alvo = ultima.rolagem;
      setTimeout(() => { const el = conteudoEl(); if (el) el.scrollTop = alvo; }, 30);
      return;
    }
    ultima = { chave: null, hits: [], total: 0, pagina: 0, rolagem: 0 };
    buscar(0);
  }, [chave]);

  // guarda a rolagem para quando voltar
  useEffect(() => {
    const el = conteudoEl();
    if (!el) return;
    const f = () => { ultima.rolagem = el.scrollTop; };
    el.addEventListener('scroll', f, { passive: true });
    return () => el.removeEventListener('scroll', f);
  }, []);

  // ----- instalação -----
  const pasta = TIPOS[tipo].pasta;
  const { mapa: instalados } = useInstalados(ctxInst && pasta ? ctxInst.id : null, pasta);
  const { mapa: modsCtx } = useInstalados(ctxInst && tipo === 'shader' ? ctxInst.id : null, 'mods');
  const estaInstalando = useInstalando();
  const { pedir, modais } = useFluxoInstalar(ctxInst);
  const modpacksNaBiblioteca = useMemo(() => new Set(instancias.map((i) => i.origem && i.origem.projetoId).filter(Boolean)), [instancias]);

  // ----- vista (lista/grade) -----
  const [vista, setVistaEstado] = useState(() => lerVista(tipo));
  useEffect(() => setVistaEstado(lerVista(tipo)), [tipo]);
  const setVista = (v) => { setVistaEstado(v); try { localStorage.setItem(`jg-explorar-vista-${tipo}`, v); } catch {} };

  // ----- ações dos filtros -----
  const mudar = (m) => trocarQuery(m);
  const ativos = (ctxInst ? 0 : (filtros.versaoMc ? 1 : 0) + (filtros.loader ? 1 : 0)) + filtros.categorias.length;
  const limpar = () => trocarQuery({ v: '', loader: '', cat: '' });
  const trocarTipo = (t) => {
    const novoComLoader = t === 'mod' || t === 'modpack';
    trocarQuery({ tipo: t, cat: '', loader: novoComLoader ? (q.loader || '') : '' });
    const el = conteudoEl();
    if (el) el.scrollTop = 0;
  };

  const abas = ORDEM_TIPOS.filter((t) => !(ctxInst && t === 'modpack'))
    .map((t) => ({ id: t, rotulo: TIPOS[t].rotulo, icone: TIPOS[t].icone }));

  // chips dos filtros ativos
  const chips = [
    !ctxInst && filtros.versaoMc && { rotulo: `Minecraft ${filtros.versaoMc}`, tirar: { v: '' } },
    !ctxInst && filtros.loader && { rotulo: nomeLoaderQualquer(filtros.loader), loader: filtros.loader, tirar: { loader: '' } },
    ...filtros.categorias.map((c) => ({ rotulo: rotuloCategoria(c), tirar: { cat: filtros.categorias.filter((x) => x !== c).join(',') } })),
  ].filter(Boolean);

  const abrir = (hit) => navegar(rotaProjeto(hit.id, ctxInst && ctxInst.id));
  const restante = Math.max(0, res.total - res.hits.length);

  // avisos do contexto
  let aviso = null;
  if (ctxInst && tipo === 'mod' && loaderCtx === 'vanilla') {
    aviso = html`<div class="aviso-explorar">
      <${Icone} nome="aviso" tamanho=${16} />
      <span><b>${ctxInst.nome}</b> é Vanilla e não carrega mods. Resource packs funcionam, ou crie uma instância com Fabric para usar mods.</span>
      <${Botao} tamanho="p" icone="pincel" aoClicar=${() => trocarTipo('resourcepack')}>Resource packs<//>
    </div>`;
  } else if (ctxInst && tipo === 'shader' && !modsCtx.has(ID_IRIS)) {
    const temIris = ['fabric', 'quilt', 'neoforge'].includes(loaderCtx);
    aviso = html`<div class="aviso-explorar">
      <${IconeExtra} nome="cadeado" />
      <span>${temIris
        ? html`Shaders precisam do mod <b>Iris</b>. Instale-o nesta instância para poder usá-los.`
        : html`Shaders precisam do mod <b>Iris</b>, que funciona em instâncias Fabric, Quilt ou NeoForge.`}</span>
      ${temIris && html`<${Botao} tamanho="p" icone="sol" aoClicar=${() => navegar(rotaProjeto(ID_IRIS, ctxInst.id))}>Ver o Iris<//>`}
    </div>`;
  }

  let corpo;
  if (res.carregando) {
    corpo = html`<${Esqueletos} vista=${vista} />`;
  } else if (res.erro) {
    corpo = html`<div class="explorar-estado">
      <${Vazio} titulo="Não foi possível carregar" icone="aviso" imagem=${false} class="erro-rede"
        texto=${/internet|conex/i.test(res.erro) ? res.erro : `${res.erro} Confira sua conexão com a internet e tente de novo.`}>
        <${Botao} icone="atualizar" aoClicar=${() => buscar(0)}>Tentar de novo<//>
      <//>
    </div>`;
  } else if (!res.hits.length) {
    corpo = html`<div class="explorar-estado">
      <${Vazio} titulo="Nada encontrado"
        texto=${filtros.consulta
          ? `Nenhum resultado para "${filtros.consulta}"${chips.length ? ' com esses filtros' : ''}. Tente outras palavras${chips.length ? ' ou tire alguns filtros' : ''}.`
          : 'Nenhum projeto combina com esses filtros. Tente tirar alguns.'}>
        ${chips.length > 0 && html`<${Botao} icone="fechar" aoClicar=${limpar}>Limpar filtros<//>`}
        ${filtros.consulta && html`<${Botao} variante="fantasma" aoClicar=${() => { setTexto(''); trocarQuery({ q: '' }); }}>Limpar busca<//>`}
      <//>
    </div>`;
  } else {
    const cartao = (hit) => {
      const props = {
        key: hit.id, hit, botao: estadoBotao({ hit, ctxInst, instalados, estaInstalando }),
        naBiblioteca: hit.tipo === 'modpack' && modpacksNaBiblioteca.has(hit.id),
        aoAbrir: () => abrir(hit), aoInstalar: () => pedir(hit),
      };
      return vista === 'grade' ? html`<${CartaoGaleria} ...${props} />` : html`<${CartaoResultado} ...${props} />`;
    };
    corpo = html`
      <div class=${vista === 'grade' ? 'grade-resultados' : 'lista-resultados'}>${res.hits.map(cartao)}</div>
      <div class="mais-resultados">
        <span class="vt">Mostrando ${numero(res.hits.length)} de ${numero(res.total)}</span>
        ${restante > 0 && html`<${Botao} icone="seta-baixo" carregando=${res.mais} aoClicar=${() => buscar(res.pagina + 1)}>
          ${res.mais ? 'Carregando...' : `Carregar mais ${Math.min(LIMITE, restante)}`}<//>`}
      </div>`;
  }

  return html`<div class="explorar">
    ${ctxId && !ctxInst && html`<div class="aviso-explorar">
      <${Icone} nome="aviso" tamanho=${16} />
      <span>A instância "${ctxId}" não existe mais. Mostrando o conteúdo sem instância.</span>
      <${Botao} tamanho="p" variante="fantasma" icone="fechar" aoClicar=${() => trocarQuery({ instancia: '' })}>Fechar<//>
    </div>`}
    <${FaixaContexto} inst=${ctxInst} />

    <div class="explorar-tipos">
      <${Abas} abas=${abas} ativa=${tipo} aoMudar=${trocarTipo} />
      <span class="explorar-fonte"><span class="ponto-modrinth" aria-hidden="true"></span>Modrinth</span>
    </div>

    <div class="explorar-barra">
      <${CampoTexto} class="busca-explorar" valor=${texto} aoMudar=${setTexto} limpar icone="busca"
        placeholder=${`Buscar ${TIPOS[tipo].rotulo.toLowerCase()}...`} aria-label="Buscar"
        onKeyDown=${(e) => { if (e.key === 'Enter') trocarQuery({ q: texto.trim() }); }} />
      <div class="ordenar">
        <span class="ordenar-rotulo">Ordenar</span>
        <${Select} valor=${filtros.ordenar} opcoes=${ORDENS} aoMudar=${(v) => mudar({ ordem: v === 'relevance' ? '' : v })}
          largura=${168} rotulo="Ordenar por" posicao="baixo-dir" />
      </div>
      <div class="vistas" role="group" aria-label="Modo de exibição">
        <button type="button" class=${cls('vista', vista === 'lista' && 'ativa')} aria-pressed=${vista === 'lista'}
          data-dica="Lista" onClick=${() => setVista('lista')}><${Icone} nome="lista" tamanho=${16} /></button>
        <button type="button" class=${cls('vista', vista === 'grade' && 'ativa')} aria-pressed=${vista === 'grade'}
          data-dica="Grade com imagens" onClick=${() => setVista('grade')}><${Icone} nome="grade" tamanho=${16} /></button>
      </div>
    </div>

    <div class="explorar-corpo">
      <${PainelFiltros} tipo=${tipo} ctxInst=${ctxInst} filtros=${filtros} mudar=${mudar} limpar=${limpar} ativos=${ativos} />
      <section class="resultados" aria-live="polite" aria-busy=${res.carregando}>
        ${aviso}
        <div class="resultados-cabeca">
          <span class="resultados-total">
            ${res.carregando ? html`<span class="mais-suave">Buscando...</span>`
              : res.erro ? '' : html`<b class="vt">${numero(res.total)}</b> ${res.total === 1 ? 'resultado' : 'resultados'}`}
          </span>
          ${chips.map((c) => html`<button key=${c.rotulo} type="button" class="chip" onClick=${() => mudar(c.tirar)} aria-label=${`Tirar filtro ${c.rotulo}`}>
            ${c.loader && html`<${IconeLoader} tipo=${c.loader} tamanho=${14} />`}${c.rotulo}<${Icone} nome="fechar" tamanho=${12} />
          </button>`)}
          ${chips.length > 1 && html`<button type="button" class="link" onClick=${limpar}>Limpar tudo</button>`}
        </div>
        ${corpo}
      </section>
    </div>
    ${modais}
  </div>`;
}

// toast só é usado em falhas de "carregar mais"
import { toast } from '../componentes/index.js';
