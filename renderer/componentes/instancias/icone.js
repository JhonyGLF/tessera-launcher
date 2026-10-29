// Modal para trocar o ícone de uma instância: um dos 20 presets ou uma imagem do computador.
import { html, useState } from '../../vendor/preact-htm.js';
import { api } from '../../api.js';
import { recarregarInstancias } from '../../estado.js';
import { Modal, Botao, IconeInstancia, toast } from '../index.js';
import { GradeIcones } from './comum.js';

export function ModalIcone({ inst, aberto, aoFechar }) {
  const [ocupado, setOcupado] = useState(false);

  const aplicar = async (preset) => {
    setOcupado(true);
    const r = await api.definirIconeInstancia(inst.id, preset);
    setOcupado(false);
    if (!r) return; // cancelou a escolha do arquivo
    if (r.ok === false) { toast(r.mensagem || 'Não foi possível trocar o ícone.', { tipo: 'erro' }); return; }
    await recarregarInstancias();
    toast('Ícone atualizado.', { tipo: 'ok' });
    aoFechar();
  };

  return html`<${Modal} aberto=${aberto} titulo="Ícone da instância" aoFechar=${aoFechar} largura=${520} class="modal-icone"
    rodape=${html`
      <${Botao} class="esquerda" icone="importar" desabilitado=${ocupado} aoClicar=${() => aplicar(null)}>Escolher imagem...<//>
      <${Botao} aoClicar=${aoFechar}>Fechar<//>
    `}>
    <div class="modal-icone-previa">
      <${IconeInstancia} inst=${inst} tamanho=${72} />
      <div>
        <strong>${inst.nome}</strong>
        <p class="mais-suave">Escolha um bloco abaixo ou use uma imagem sua (PNG ou JPG). Imagens pequenas ficam pixeladas, como no jogo.</p>
      </div>
    </div>
    <${GradeIcones} valor=${inst.icone} aoEscolher=${aplicar} desabilitado=${ocupado} />
  <//>`;
}
