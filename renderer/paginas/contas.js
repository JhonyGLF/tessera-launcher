// Contas: Microsoft e offline. Política igual à do Prism Launcher: contas offline só
// depois de adicionar uma conta Microsoft que tenha o Minecraft: Java Edition.
import { html, useState } from '../vendor/preact-htm.js';
import { api } from '../api.js';
import { useEstado, recarregarContas } from '../estado.js';
import {
  Botao, Icone, LogoMicrosoft, Cartao, CabecaSkin, Etiqueta, Modal, CampoTexto, Vazio, confirmar, toast,
} from '../componentes/index.js';
import { cls } from '../util.js';

const NOME_VALIDO = /^[A-Za-z0-9_]{3,16}$/;
const EXPLICACAO_OFFLINE = 'Para criar contas offline, adicione antes uma conta Microsoft que tenha o Minecraft: Java Edition';

// 32 hex → 8-4-4-4-12
const formatarUuid = (u) => (u && /^[0-9a-f]{32}$/i.test(u) ? u.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : u || '');

function validarNome(nome) {
  if (!nome) return null;
  if (nome.length < 3) return 'Use pelo menos 3 caracteres.';
  if (nome.length > 16) return 'Use no máximo 16 caracteres.';
  if (!NOME_VALIDO.test(nome)) return 'Use só letras sem acento, números e _ (sem espaços).';
  return null;
}

function ModalOffline({ aberto, aoFechar }) {
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const problema = validarNome(nome);
  const fechar = () => { setNome(''); setErro(''); aoFechar(); };

  const criar = async (e) => {
    e && e.preventDefault();
    if (problema || !nome || enviando) return;
    setEnviando(true);
    setErro('');
    const r = await api.adicionarOffline(nome);
    setEnviando(false);
    if (!r || r.ok === false) { setErro((r && r.mensagem) || 'Não foi possível criar a conta.'); return; }
    await recarregarContas();
    toast(`Conta offline "${nome}" criada.`, { tipo: 'ok' });
    fechar();
  };

  return html`<${Modal} aberto=${aberto} titulo="Nova conta offline" aoFechar=${fechar} largura=${500}
    rodape=${html`
      <${Botao} aoClicar=${fechar}>Cancelar<//>
      <${Botao} variante="principal" icone="ok" carregando=${enviando} desabilitado=${!nome || !!problema} aoClicar=${criar}>Criar conta<//>
    `}>
    <form class="form-offline" onSubmit=${criar}>
      <div class="previa-offline">
        <${CabecaSkin} skin=${null} tamanho=${56} />
        <div>
          <strong class="pixel">${nome || 'Seu_Nome'}</strong>
          <span class="mais-suave">Conta offline · skin padrão</span>
        </div>
      </div>
      <label class="rotulo-campo" for="nome-offline">Nome de jogador</label>
      <${CampoTexto} id="nome-offline" valor=${nome} aoMudar=${(v) => { setNome(v.trim()); setErro(''); }} placeholder="Ex.: Steve_123"
        maxLength=${16} autofocus invalido=${!!problema || !!erro} icone="contas" />
      <p class=${cls('ajuda-campo', (problema || erro) && 'erro', !problema && !erro && nome && 'ok')}>
        ${erro || problema || (nome ? 'Nome válido.' : 'De 3 a 16 caracteres: letras, números e _.')}
      </p>
      <p class="nota-offline">
        <${Icone} nome="info" tamanho=${16} />
        <span>Contas offline servem para jogar sozinho, na LAN ou em servidores no modo offline.
        Servidores que exigem conta original não aceitam contas offline.</span>
      </p>
    </form>
  <//>`;
}

function CartaoConta({ conta, ativa, skin }) {
  const [ocupado, setOcupado] = useState(false);
  const msa = conta.tipo === 'msa';

  const selecionar = async () => {
    setOcupado(true);
    const r = await api.selecionarConta(conta.id);
    setOcupado(false);
    if (r && r.ok === false) return toast(r.mensagem, { tipo: 'erro' });
    await recarregarContas();
    toast(`Agora você está jogando como ${conta.nome}.`, { tipo: 'ok' });
  };

  const remover = async () => {
    const sim = await confirmar({
      titulo: 'Remover conta?',
      mensagem: msa
        ? `A conta Microsoft "${conta.nome}" sai do Tessera. Para usar de novo, será preciso entrar outra vez. Seus mundos e instâncias não são apagados.`
        : `A conta offline "${conta.nome}" será removida. Seus mundos e instâncias não são apagados.`,
      confirmar: 'Remover', perigo: true,
    });
    if (!sim) return;
    const r = await api.removerConta(conta.id);
    if (r && r.ok === false) return toast(r.mensagem, { tipo: 'erro' });
    await recarregarContas();
    toast(`Conta "${conta.nome}" removida.`);
  };

  const copiarUuid = async () => {
    try { await navigator.clipboard.writeText(formatarUuid(conta.uuid)); toast('UUID copiado.', { tipo: 'ok', duracao: 2000 }); }
    catch { toast('Não foi possível copiar.', { tipo: 'erro' }); }
  };

  return html`<${Cartao} class=${cls('conta-cartao', ativa && 'ativa')} selecionado=${ativa}>
    <${CabecaSkin} skin=${skin} tamanho=${56} />
    <div class="conta-info">
      <div class="conta-nome-linha">
        <h3 class="truncar">${conta.nome}</h3>
        ${msa ? html`<${Etiqueta} cor="verde">Microsoft<//>` : html`<${Etiqueta} cor="cinza">Offline<//>`}
        ${ativa && html`<${Etiqueta} cor="destaque" cheia icone="ok">Em uso<//>`}
      </div>
      <button type="button" class="conta-uuid" data-dica="Copiar UUID" onClick=${copiarUuid}>
        <span class="vt">${formatarUuid(conta.uuid)}</span><${Icone} nome="copiar" tamanho=${16} />
      </button>
    </div>
    <div class="conta-acoes">
      ${ativa
        ? html`<span class="conta-ativa-texto"><${Icone} nome="jogar" tamanho=${16} /> Conta usada para jogar</span>`
        : html`<${Botao} carregando=${ocupado} aoClicar=${selecionar}>Usar esta conta<//>`}
      <${Botao} variante="fantasma" class="perigo" icone="lixeira" dica="Remover conta" aoClicar=${remover} />
    </div>
  <//>`;
}

export default function PaginaContas() {
  const { contas, contaAtiva, podeOffline, skins } = useEstado((e) => ({
    contas: e.contas, contaAtiva: e.contaAtiva, podeOffline: e.podeOffline, skins: e.skins,
  }));
  const [entrando, setEntrando] = useState(false);
  const [offlineAberto, setOfflineAberto] = useState(false);

  const entrarMicrosoft = async () => {
    setEntrando(true);
    const r = await api.adicionarMicrosoft();
    setEntrando(false);
    if (!r || r.ok === false) {
      if (r && r.mensagem) toast(r.mensagem, { tipo: 'erro', titulo: 'Não foi possível entrar' });
      return;
    }
    await recarregarContas();
    toast(r.conta && r.conta.nome ? `Bem-vindo, ${r.conta.nome}!` : 'Conta Microsoft adicionada.', { tipo: 'ok' });
  };

  const msa = contas.filter((c) => c.tipo === 'msa');
  const offline = contas.filter((c) => c.tipo !== 'msa');

  const botoes = html`
    ${contas.length > 0 && html`<${Botao} variante="principal" carregando=${entrando} aoClicar=${entrarMicrosoft}>
      ${!entrando && html`<${LogoMicrosoft} tamanho=${16} />`}${entrando ? 'Aguardando login...' : 'Adicionar conta Microsoft'}
    <//>`}
    <span class="tem-dica" data-dica=${podeOffline ? undefined : `${EXPLICACAO_OFFLINE}.`}>
      <${Botao} icone="contas" desabilitado=${!podeOffline} aoClicar=${() => setOfflineAberto(true)}>Adicionar conta offline<//>
    </span>`;

  const grupo = (titulo, lista, sub) => lista.length > 0 && html`<section class="secao contas-grupo">
    <div class="secao-cabeca"><h2>${titulo}</h2><span class="sub">${sub}</span></div>
    <div class="lista-contas">
      ${lista.map((c) => html`<${CartaoConta} key=${c.id} conta=${c} ativa=${c.id === contaAtiva} skin=${skins[c.id]} />`)}
    </div>
  </section>`;

  return html`<div class="contas">
    <div class="contas-cabeca">
      <div>
        <p class="suave">Escolha com qual conta você entra no jogo. A conta em uso aparece no canto inferior da barra lateral.</p>
      </div>
      <div class="contas-botoes">${botoes}</div>
    </div>

    ${!podeOffline && html`<div class="aviso-faixa">
      <${Icone} nome="info" tamanho=${16} />
      <span>${EXPLICACAO_OFFLINE}.</span>
    </div>`}

    ${contas.length === 0
      ? html`<${Cartao} class="contas-vazio">
          <${Vazio} titulo="Nenhuma conta ainda" icone="contas"
            texto="Entre com a sua conta Microsoft para jogar. O login abre uma janela segura da própria Microsoft — o Tessera nunca vê a sua senha.">
            <${Botao} variante="principal" tamanho="g" carregando=${entrando} aoClicar=${entrarMicrosoft}>
              ${!entrando && html`<${LogoMicrosoft} tamanho=${16} />`}${entrando ? 'Aguardando login...' : 'Entrar com a Microsoft'}
            <//>
          <//>
        <//>`
      : html`
        ${grupo('Microsoft', msa, msa.length === 1 ? '1 conta' : `${msa.length} contas`)}
        ${grupo('Offline', offline, offline.length === 1 ? '1 conta' : `${offline.length} contas`)}
      `}

    <section class="secao">
      <${Cartao} class="contas-sobre">
        <span class="contas-sobre-icone"><${Icone} nome="info" tamanho=${16} /></span>
        <div>
          <h4>Sobre as contas</h4>
          <p>A sessão Microsoft fica salva criptografada pelo Windows, então você não precisa entrar de novo a cada abertura.
            Contas offline usam a skin padrão e funcionam em mundos próprios, na LAN e em servidores no modo offline.</p>
        </div>
      <//>
    </section>

    <${ModalOffline} aberto=${offlineAberto} aoFechar=${() => setOfflineAberto(false)} />
  </div>`;
}
