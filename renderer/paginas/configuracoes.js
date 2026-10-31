// Configurações globais: aparência (tema), memória e Java, comportamento do launcher e "sobre".
import { html, useState } from '../vendor/preact-htm.js';
import { api } from '../api.js';
import { useEstado, salvarConfig } from '../estado.js';
import { Botao, Icone, Cartao, Alternador, Deslizador, Etiqueta, Select, toast } from '../componentes/index.js';
import { formatarRam, cls } from '../util.js';

const TEMAS = [
  { id: 'sculk', nome: 'Sculk', cor: '#2fd3d0', escuro: '#0d6b70' },
  { id: 'grama', nome: 'Grama', cor: '#74d43f', escuro: '#2d6a17' },
  { id: 'ametista', nome: 'Ametista', cor: '#b583ff', escuro: '#5b30a3' },
  { id: 'nether', nome: 'Nether', cor: '#ff7036', escuro: '#8c2a0a' },
  { id: 'gelo', nome: 'Gelo', cor: '#8fd9ff', escuro: '#2c6a96' },
];

// Estado da atualização do próprio launcher + botão "Verificar atualizações"
const TEXTOS_ATU = {
  indisponivel: 'Atualização automática só no launcher instalado (não no modo de desenvolvimento).',
  parado: 'Ainda não procurou atualizações.',
  verificando: 'Procurando atualizações...',
  atualizado: 'Você está na versão mais recente.',
};
function LinhaAtualizacao() {
  const a = useEstado((e) => e.atualizacao) || { estado: 'parado' };
  const [ocupado, setOcupado] = useState(false);
  const verificar = async () => {
    setOcupado(true);
    const r = await api.verificarAtualizacaoLauncher();
    setOcupado(false);
    if (r && r.ok === false) toast(r.mensagem || 'Não foi possível procurar atualizações.', { tipo: 'erro' });
  };
  let texto = TEXTOS_ATU[a.estado] || '';
  if (a.estado === 'baixando') texto = `Baixando a versão ${a.versao}${a.progresso ? ` (${Math.round(a.progresso * 100)}%)` : ''}...`;
  if (a.estado === 'pronta') texto = `A versão ${a.versao} foi baixada e será instalada ao reiniciar.`;
  if (a.estado === 'disponivel') texto = `A versão ${a.versao} está disponível para baixar.`;
  if (a.estado === 'erro') texto = a.mensagem || 'Não foi possível procurar atualizações.';
  return html`<div class=${cls('sobre-atualizacao', a.estado)}>
    <${Icone} nome=${a.estado === 'erro' ? 'aviso' : ['pronta', 'disponivel'].includes(a.estado) ? 'download' : a.estado === 'atualizado' ? 'ok' : 'atualizar'} tamanho=${16} />
    <span>${texto}</span>
    ${a.estado === 'pronta' || a.estado === 'disponivel'
      ? html`<${Botao} variante="principal" tamanho="p" aoClicar=${() => api.instalarAtualizacaoLauncher()}>${a.estado === 'pronta' ? 'Reiniciar e atualizar' : 'Baixar'}<//>`
      : !['indisponivel', 'baixando'].includes(a.estado) && html`<${Botao} tamanho="p" icone="atualizar" carregando=${ocupado || a.estado === 'verificando'}
          aoClicar=${verificar}>Verificar atualizações<//>`}
  </div>`;
}

// Uma linha de configuração: rótulo + descrição à esquerda, controle à direita
function Linha({ titulo, descricao, children, class: classe = '' }) {
  return html`<div class=${cls('config-linha', classe)}>
    <div class="config-textos">
      <h4>${titulo}</h4>
      ${descricao && html`<p>${descricao}</p>`}
    </div>
    <div class="config-controle">${children}</div>
  </div>`;
}

function Grupo({ icone, titulo, children }) {
  return html`<${Cartao} class="config-grupo">
    <div class="config-grupo-cabeca"><span class="config-grupo-icone"><${Icone} nome=${icone} tamanho=${16} /></span><h3>${titulo}</h3></div>
    ${children}
  <//>`;
}

function SeletorTema({ tema }) {
  return html`<div class="temas" role="radiogroup" aria-label="Tema">
    ${TEMAS.map((t) => html`<button key=${t.id} type="button" role="radio" aria-checked=${tema === t.id}
      class=${cls('tema', tema === t.id && 'ativo')} style=${{ '--cor-tema': t.cor, '--cor-tema-escuro': t.escuro }}
      onClick=${() => salvarConfig({ tema: t.id })}>
      <span class="tema-amostra">
        <i></i><i></i><i></i>
        ${tema === t.id && html`<span class="tema-marca"><${Icone} nome="ok" tamanho=${16} /></span>`}
      </span>
      <span class="tema-nome">${t.nome}</span>
    </button>`)}
  </div>`;
}

function recomendacao(mb) {
  if (mb < 2048) return { texto: 'Pouca memória: o jogo pode travar.', cor: 'vermelho' };
  if (mb <= 4096) return { texto: 'Bom para o vanilla e poucos mods.', cor: 'verde' };
  if (mb <= 8192) return { texto: 'Ideal para modpacks.', cor: 'verde' };
  return { texto: 'Muita memória pode causar travadinhas; use só em modpacks enormes.', cor: 'amarelo' };
}

export default function PaginaConfiguracoes() {
  const { config, info } = useEstado((e) => ({ config: e.config, info: e.info }));
  const [ramArrastando, setRamArrastando] = useState(null);
  const ramMax = Math.max(2048, config.ramMaxMB || 8192);
  const ram = ramArrastando ?? config.ramMB;
  const rec = recomendacao(ram);
  const javaAuto = !config.javaPersonalizado;

  const escolherJava = async () => {
    const caminho = await api.escolherJava();
    if (typeof caminho === 'string' && caminho) {
      await salvarConfig({ javaPersonalizado: caminho });
      toast('Java personalizado definido.', { tipo: 'ok' });
      return true;
    }
    return false;
  };

  const alternarJava = async (automatico) => {
    if (automatico) return salvarConfig({ javaPersonalizado: null });
    await escolherJava();
  };

  // marcas embaixo do deslizador (1 GB, metade, máximo)
  const marcas = [1024, Math.round(ramMax / 2048) * 1024, ramMax];

  return html`<div class="configuracoes">
    <${Grupo} icone="pincel" titulo="Aparência">
      <${Linha} titulo="Tema" descricao="Muda a cor de destaque do launcher. Aplica na hora.">
        <${SeletorTema} tema=${config.tema} />
      <//>
    <//>

    <${Grupo} icone="terminal" titulo="Desempenho e Java">
      <${Linha} titulo="Memória RAM padrão" class="linha-ram"
        descricao="Quanto de memória o Minecraft pode usar. Cada instância pode ter o seu próprio valor.">
        <div class="ram">
          <${Deslizador} valor=${config.ramMB} min=${1024} max=${ramMax} passo=${512} rotulo="Memória RAM"
            formatar=${formatarRam} aoMudar=${setRamArrastando}
            aoSoltar=${async (v) => { await salvarConfig({ ramMB: v }); setRamArrastando(null); }} />
          <div class="marcas-desl">${marcas.map((m) => html`<span key=${m}>${formatarRam(m)}</span>`)}</div>
          <p class=${cls('ram-dica', rec.cor)}><${Icone} nome=${rec.cor === 'verde' ? 'ok' : 'aviso'} tamanho=${16} />${rec.texto}</p>
        </div>
      <//>
      <${Linha} titulo="Java automático"
        descricao="Baixa e usa a versão certa do Java para cada versão do jogo (8, 17, 21 ou 25). Recomendado.">
        <${Alternador} ligado=${javaAuto} aoMudar=${alternarJava} rotulo=${javaAuto ? 'Ligado' : 'Desligado'} />
      <//>
      ${!javaAuto && html`<div class="java-personalizado">
        <span class="java-caminho" data-dica=${config.javaPersonalizado}>
          <${Icone} nome="terminal" tamanho=${16} />
          <span class="truncar vt">${config.javaPersonalizado}</span>
        </span>
        <${Botao} tamanho="p" icone="pasta" aoClicar=${escolherJava}>Trocar<//>
        <${Botao} tamanho="p" variante="fantasma" aoClicar=${() => salvarConfig({ javaPersonalizado: null })}>Usar automático<//>
        <p class="java-aviso"><${Icone} nome="aviso" tamanho=${16} />Versões antigas do jogo precisam do Java 8 e as novas, do Java 21 ou 25. Um Java errado impede o jogo de abrir.</p>
      </div>`}
    <//>

    <${Grupo} icone="engrenagem" titulo="Launcher">
      <${Linha} titulo="Idioma" descricao="Escolha o idioma usado nos menus e nas configurações do launcher.">
        <${Select} valor=${config.idioma || 'pt-BR'} opcoes=${[
          { valor: 'pt-BR', rotulo: 'Português (Brasil)' },
          { valor: 'en-US', rotulo: 'English (US)' },
        ]} aoMudar=${(v) => salvarConfig({ idioma: v })} rotulo="Idioma" largura=${190} />
      <//>
      <${Linha} titulo="Minimizar ao jogar" descricao="Esconde o launcher enquanto o jogo está aberto e o traz de volta quando você fecha.">
        <${Alternador} ligado=${config.minimizarAoJogar} aoMudar=${(v) => salvarConfig({ minimizarAoJogar: v })} rotulo=${config.minimizarAoJogar ? 'Ligado' : 'Desligado'} />
      <//>
      <${Linha} titulo="Mostrar snapshots" descricao="Inclui as versões de teste do Minecraft ao criar instâncias. Podem ter bugs e corromper mundos.">
        <${Alternador} ligado=${config.mostrarSnapshots} aoMudar=${(v) => salvarConfig({ mostrarSnapshots: v })} rotulo=${config.mostrarSnapshots ? 'Ligado' : 'Desligado'} />
      <//>
      <${Linha} titulo="Atualização automática" descricao="Procura, baixa e prepara atualizações do launcher em segundo plano. Desligada, você pode verificar e baixar em Sobre.">
        <${Alternador} ligado=${config.atualizacaoAutomatica} aoMudar=${(v) => salvarConfig({ atualizacaoAutomatica: v })} rotulo=${config.atualizacaoAutomatica ? 'Ligado' : 'Desligado'} />
      <//>
      <${Linha} titulo="Pasta de dados" descricao="Onde ficam as instâncias, versões baixadas, bibliotecas e o Java.">
        <${Botao} icone="pasta" aoClicar=${() => api.abrirPastaRaiz()}>Abrir pasta<//>
      <//>
      ${info.raiz && html`<div class="caminho-raiz"><span class="vt truncar" data-dica=${info.raiz}>${info.raiz}</span></div>`}
    <//>

    <${Grupo} icone="info" titulo="Sobre">
      <div class="sobre">
        <img src="../assets/logo.png" alt="Tessera" draggable="false" />
        <div class="sobre-textos">
          <p class="sobre-versao">Versão <span class="vt amarelo">${info.versao || '—'}</span> <${Etiqueta} cor="destaque">Java Edition<//></p>
          <${LinhaAtualizacao} />
          <p class="sobre-aviso"><${Icone} nome="aviso" tamanho=${16} />Não oficial. Não aprovado pela Mojang ou Microsoft.</p>
          <p>Minecraft é marca registrada da Mojang AB. Mods, modpacks, resource packs e shaders vêm do${' '}<a href="https://modrinth.com" onClick=${(e) => { e.preventDefault(); api.abrirLink('https://modrinth.com'); }}>Modrinth</a>.</p>
        </div>
      </div>
      <div class="creditos">
        <h4>Créditos</h4>
        <ul>
          <li><strong>Pixelify Sans</strong> — Copyright The Pixelify Sans Project Authors. SIL Open Font License 1.1.</li>
          <li><strong>VT323</strong> — Copyright Peter Hull. SIL Open Font License 1.1.</li>
          <li><strong>Preact</strong> e <strong>htm</strong> — Licença MIT.</li>
          <li><strong>skinview3d</strong> — Licença MIT.</li>
        </ul>
        <button type="button" class="link" onClick=${() => api.abrirLink('https://openfontlicense.org')}>
          Ler a SIL Open Font License <${Icone} nome="link" tamanho=${16} />
        </button>
      </div>
    <//>
  </div>`;
}
