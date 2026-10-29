// Modal "Nova instância": nome (com sugestão automática), ícone, versão do Minecraft e loader.
// html`<${ModalNovaInstancia} aberto=${x} aoFechar=${fn} aoCriar=${(inst) => ...} />`
import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { api } from '../../api.js';
import { useEstado, recarregarInstancias } from '../../estado.js';
import { Modal, Botao, CampoTexto, Icone, IconeLoader, toast } from '../index.js';
import { NOMES_LOADER } from '../../util.js';
import { GradeIcones, ICONES, urlIcone } from './comum.js';
import { useEscolhaVersao, EscolhaVersao } from './versao.js';

const sugerirNome = (tipo, mc) => (!mc ? '' : tipo === 'vanilla' ? `Minecraft ${mc}` : `${NOMES_LOADER[tipo]} ${mc}`);

function Formulario({ aoFechar, aoCriar }) {
  const snapshots = useEstado((e) => e.config.mostrarSnapshots);
  const escolha = useEscolhaVersao({ snapshots });
  const [nome, setNome] = useState('');
  const [editado, setEditado] = useState(false);
  const [icone, setIcone] = useState('grama');
  const [criando, setCriando] = useState(false);

  const sugestao = sugerirNome(escolha.tipo, escolha.mc);
  const valorNome = editado ? nome : sugestao;
  const nomeLimpo = valorNome.trim();
  const nomeInvalido = editado && (!nomeLimpo || nomeLimpo.length > 48);
  const pode = escolha.valido && nomeLimpo && nomeLimpo.length <= 48 && !criando;

  const criar = async (e) => {
    if (e) e.preventDefault();
    if (!pode) return;
    setCriando(true);
    const r = await api.criarInstancia({ nome: nomeLimpo, mc: escolha.mc, loader: escolha.loader, icone });
    if (!r || r.ok === false) {
      setCriando(false);
      toast((r && r.mensagem) || 'Não foi possível criar a instância.', { tipo: 'erro', titulo: 'Erro ao criar' });
      return;
    }
    await recarregarInstancias();
    const inst = r.instancia;
    toast(`"${inst ? inst.nome : nomeLimpo}" está pronta. Ao jogar pela primeira vez, os arquivos do jogo serão baixados.`, { tipo: 'ok', titulo: 'Instância criada' });
    if (inst && aoCriar) aoCriar(inst);
    else aoFechar();
  };

  const nomeIcone = (ICONES.find(([id]) => id === icone) || [])[1];

  return html`<form class="nova-inst-form" onSubmit=${criar}>
    <div class="nova-inst-lado">
      <div class="previa-inst">
        <span class="previa-icone"><img class="pixelado" src=${urlIcone(icone)} alt="" draggable="false" /></span>
        <strong class="truncar">${nomeLimpo || 'Sem nome'}</strong>
        <span class="previa-versao">
          <${IconeLoader} tipo=${escolha.tipo} tamanho=${16} />
          ${escolha.mc || '...'} · ${NOMES_LOADER[escolha.tipo]}
        </span>
      </div>
      <label class="rotulo-campo">Ícone <span class="mais-suave">· ${nomeIcone}</span></label>
      <${GradeIcones} valor=${icone} aoEscolher=${setIcone} />
    </div>

    <div class="nova-inst-campos">
      <div class="campo">
        <label class="rotulo-campo" for="nome-nova-inst">Nome</label>
        <${CampoTexto} id="nome-nova-inst" valor=${valorNome} invalido=${nomeInvalido} maxLength=${48} autofocus
          placeholder=${sugestao || 'Minha instância'} icone="editar"
          aoMudar=${(v) => { setEditado(true); setNome(v); }} />
        ${nomeInvalido
          ? html`<p class="ajuda-campo erro">${nomeLimpo ? 'Use no máximo 48 caracteres.' : 'Dê um nome para a instância.'}</p>`
          : !editado && html`<p class="ajuda-campo">Sugerido pela versão escolhida. Pode trocar à vontade.</p>`}
      </div>
      <${EscolhaVersao} escolha=${escolha} />
    </div>
    <button type="submit" hidden></button>
    <div class="nova-inst-rodape">
      <span class="mais-suave nota-rodape"><${Icone} nome="info" tamanho=${16} /> Os arquivos são baixados quando você jogar.</span>
      <${Botao} aoClicar=${() => aoFechar()}>Cancelar<//>
      <${Botao} variante="principal" icone="mais" tipo="submit" carregando=${criando} desabilitado=${!pode}>Criar instância<//>
    </div>
  </form>`;
}

export function ModalNovaInstancia({ aberto, aoFechar, aoCriar }) {
  // remonta o formulário a cada abertura (começa limpo)
  const [chave, setChave] = useState(0);
  useEffect(() => { if (aberto) setChave((n) => n + 1); }, [aberto]);
  return html`<${Modal} aberto=${aberto} titulo="Nova instância" aoFechar=${() => aoFechar()} largura=${820} class="modal-nova-inst" semEspaco>
    <${Formulario} key=${chave} aoFechar=${aoFechar} aoCriar=${aoCriar} />
  <//>`;
}
