// Escolha de versão: Minecraft (com snapshots opcionais) + loader + versão do loader.
// Usada no modal "Nova instância" e em "Trocar versão" das configurações da instância.
//   const escolha = useEscolhaVersao({ mc, loader, snapshots });
//   html`<${EscolhaVersao} escolha=${escolha} />`   →   escolha.valido, escolha.mc, escolha.loader
import { html, useEffect, useMemo, useState } from '../../vendor/preact-htm.js';
import { api } from '../../api.js';
import { Select, Alternador, IconeLoader, Icone, Botao, Carregando } from '../index.js';
import { formatarData, NOMES_LOADER, cls } from '../../util.js';

export const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];

// As listas mudam pouco: guarda em memória enquanto o launcher está aberto
let cacheMc = null;
const cacheLoaders = new Map();

function carregarMc() {
  if (!cacheMc) {
    cacheMc = api.listarVersoesMc().then((r) => {
      if (!r || r.ok === false) cacheMc = null; // tenta de novo na próxima
      return r;
    });
  }
  return cacheMc;
}

function carregarLoaders(tipo, mc) {
  const chave = `${tipo}:${mc}`;
  if (!cacheLoaders.has(chave)) {
    cacheLoaders.set(chave, api.listarLoaders(tipo, mc).then((r) => {
      if (!r || (r.ok === false && /conex|internet|rede|tempo/i.test(r.mensagem || ''))) cacheLoaders.delete(chave);
      return r;
    }));
  }
  return cacheLoaders.get(chave);
}

export function useEscolhaVersao({ mc: mcInicial = null, loader: loaderInicial = null, snapshots: snapInicial = false } = {}) {
  const [mc, setMc] = useState(mcInicial);
  const [tipo, setTipo] = useState((loaderInicial && loaderInicial.tipo) || 'vanilla');
  const [versaoLoader, setVersaoLoader] = useState((loaderInicial && loaderInicial.versao) || null);
  const [snapshots, setSnapshots] = useState(snapInicial);
  const [mcs, setMcs] = useState({ carregando: true, erro: null, versoes: [], ultima: null });
  const [loaders, setLoaders] = useState({ carregando: false, erro: null, versoes: [] });
  const [tentativa, setTentativa] = useState(0);

  // versões do Minecraft
  useEffect(() => {
    let vivo = true;
    setMcs((s) => ({ ...s, carregando: true, erro: null }));
    carregarMc().then((r) => {
      if (!vivo) return;
      if (!r || r.ok === false) { setMcs({ carregando: false, erro: (r && r.mensagem) || 'Não foi possível carregar as versões.', versoes: [], ultima: null }); return; }
      setMcs({ carregando: false, erro: null, versoes: r.versoes || [], ultima: r.ultima || null });
      setMc((atual) => atual || (r.ultima && r.ultima.release) || (r.versoes[0] && r.versoes[0].id) || null);
    });
    return () => { vivo = false; };
  }, [tentativa]);

  // versões do loader (muda com o loader e com a versão do Minecraft)
  useEffect(() => {
    if (tipo === 'vanilla' || !mc) { setLoaders({ carregando: false, erro: null, versoes: [] }); return; }
    let vivo = true;
    setLoaders({ carregando: true, erro: null, versoes: [] });
    carregarLoaders(tipo, mc).then((r) => {
      if (!vivo) return;
      if (!r || r.ok === false || !(r.versoes || []).length) {
        setLoaders({ carregando: false, erro: (r && r.mensagem) || `O ${NOMES_LOADER[tipo]} não tem versão para o ${mc}.`, versoes: [] });
        return;
      }
      setLoaders({ carregando: false, erro: null, versoes: r.versoes });
      // mantém a escolhida (ex.: a da instância) se existir; senão a estável mais nova
      setVersaoLoader((atual) => (atual && r.versoes.some((v) => v.id === atual) ? atual
        : (r.versoes.find((v) => v.estavel) || r.versoes[0]).id));
    });
    return () => { vivo = false; };
  }, [tipo, mc]);

  const trocarTipo = (t) => { if (t !== tipo) { setTipo(t); setVersaoLoader(null); } };
  const valido = !!mc && !mcs.erro && (tipo === 'vanilla' || (!!versaoLoader && !loaders.carregando && !loaders.erro));

  return {
    mc, setMc, tipo, setTipo: trocarTipo, versaoLoader, setVersaoLoader, snapshots, setSnapshots,
    mcs, loaders, valido, recarregar: () => setTentativa((n) => n + 1),
    loader: { tipo, versao: tipo === 'vanilla' ? null : versaoLoader },
  };
}

const ANTIGAS = new Set(['old_beta', 'old_alpha']);

function opcoesMc(versoes, snapshots, atual) {
  const visiveis = versoes.filter((v) => v.tipo === 'release' || (snapshots && !ANTIGAS.has(v.tipo)) || v.id === atual);
  const op = (v) => ({
    valor: v.id, rotulo: v.id,
    detalhe: v.tipo === 'release' ? (v.data ? formatarData(v.data) : '') : v.tipo === 'snapshot' ? 'snapshot' : 'antiga',
    grupo: snapshots ? (v.tipo === 'release' ? 'Lançamentos' : 'Snapshots') : undefined,
  });
  if (!snapshots) return visiveis.map(op);
  // com snapshots: lançamentos primeiro, depois as de teste (cada grupo do mais novo ao mais antigo)
  return [...visiveis.filter((v) => v.tipo === 'release'), ...visiveis.filter((v) => v.tipo !== 'release')].map(op);
}

// Seletor de loader em botões (Vanilla, Fabric, Quilt, Forge, NeoForge)
export function SegmentoLoader({ valor, aoMudar }) {
  return html`<div class="segmentado segmento-loader" role="radiogroup" aria-label="Loader">
    ${LOADERS.map((t) => html`<button key=${t} type="button" role="radio" aria-checked=${valor === t}
      class=${cls('segmento', `loader-${t}`, valor === t && 'ativo')} onClick=${() => aoMudar(t)}>
      <${IconeLoader} tipo=${t} tamanho=${16} />
      <span>${NOMES_LOADER[t]}</span>
    </button>`)}
  </div>`;
}

export function EscolhaVersao({ escolha: e }) {
  const opcoes = useMemo(() => opcoesMc(e.mcs.versoes, e.snapshots, e.mc), [e.mcs.versoes, e.snapshots, e.mc]);
  const recomendada = e.loaders.versoes.find((v) => v.estavel) || e.loaders.versoes[0];
  const opcoesLoader = e.loaders.versoes.map((v) => ({
    valor: v.id, rotulo: v.id,
    detalhe: recomendada && v.id === recomendada.id ? 'recomendada' : v.estavel ? 'estável' : 'beta',
  }));
  const nomeLoader = NOMES_LOADER[e.tipo];

  return html`<div class="escolha-versao">
    <div class="campo">
      <div class="campo-cabeca">
        <label class="rotulo-campo">Versão do Minecraft</label>
        <${Alternador} ligado=${e.snapshots} aoMudar=${e.setSnapshots} rotulo="Mostrar snapshots" />
      </div>
      ${e.mcs.erro
        ? html`<div class="aviso-campo erro">
            <${Icone} nome="aviso" tamanho=${16} />
            <span>${e.mcs.erro}</span>
            <${Botao} tamanho="p" icone="atualizar" aoClicar=${e.recarregar}>Tentar de novo<//>
          </div>`
        : html`<${Select} valor=${e.mc} opcoes=${opcoes} aoMudar=${e.setMc} busca rotulo="Versão do Minecraft"
            placeholder=${e.mcs.carregando ? 'Carregando versões...' : 'Escolha a versão'} desabilitado=${e.mcs.carregando} />`}
    </div>

    <div class="campo">
      <label class="rotulo-campo">Loader de mods</label>
      <${SegmentoLoader} valor=${e.tipo} aoMudar=${e.setTipo} />
    </div>

    ${e.tipo === 'vanilla'
      ? html`<p class="ajuda-campo nota-loader"><${Icone} nome="info" tamanho=${16} />
          Minecraft puro, sem mods. Você ainda pode usar resource packs e mundos.</p>`
      : html`<div class="campo">
          <label class="rotulo-campo">Versão do ${nomeLoader}</label>
          ${e.loaders.carregando
            ? html`<div class="carregando-campo"><${Carregando} inline texto=${`Procurando versões do ${nomeLoader}...`} tamanho=${4} /></div>`
            : e.loaders.erro
              ? html`<div class="aviso-campo"><${Icone} nome="aviso" tamanho=${16} /><span>${e.loaders.erro} Escolha outra versão do Minecraft ou outro loader.</span></div>`
              : html`<${Select} valor=${e.versaoLoader} opcoes=${opcoesLoader} aoMudar=${e.setVersaoLoader} busca=${opcoesLoader.length > 10}
                  rotulo=${`Versão do ${nomeLoader}`} />`}
        </div>`}
  </div>`;
}
