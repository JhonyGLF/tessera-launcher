// Modal "Otimizar instância": mostra os mods de desempenho que servem para a versão e o loader
// da instância (com o que cada um faz) e instala os escolhidos numa tarefa só.
import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { api } from '../../api.js';
import { navegar } from '../../rotas.js';
import { Modal, Botao, Icone, Etiqueta, Carregando, toast } from '../index.js';
import { nomeLoader, cls } from '../../util.js';
import { rotaInstancia } from './comum.js';

const ETIQUETA = {
  instalado: { cor: 'verde', texto: 'Instalado' },
  indisponivel: { cor: 'cinza', texto: 'Indisponível' },
  conflito: { cor: 'amarelo', texto: 'Conflito' },
};

function Linha({ item, marcado, aoMudar }) {
  const livre = item.estado === 'instalar';
  const [semIcone, setSemIcone] = useState(false);
  return html`<label class=${cls('linha-otimizar', !livre && 'bloqueada', livre && marcado && 'marcada')}>
    <input type="checkbox" checked=${livre && marcado} disabled=${!livre} onChange=${(e) => aoMudar(e.currentTarget.checked)} />
    <span class="caixa-quadro" aria-hidden="true">${livre && marcado && html`<${Icone} nome="ok" tamanho=${12} />`}</span>
    <span class="otimizar-icone">${item.iconeUrl && !semIcone ? html`<img src=${item.iconeUrl} alt="" draggable="false" onError=${() => setSemIcone(true)} />` : html`<${Icone} nome="mod" tamanho=${16} />`}</span>
    <span class="otimizar-textos">
      <strong>${item.nome}</strong>
      <span class="papel">${item.papel}</span>
      ${item.motivo && html`<span class="motivo">${item.motivo}</span>`}
    </span>
    ${!livre && html`<${Etiqueta} cor=${ETIQUETA[item.estado].cor}>${ETIQUETA[item.estado].texto}<//>`}
  </label>`;
}

export function ModalOtimizar({ inst, fase, aberto, aoFechar }) {
  const [plano, setPlano] = useState(null); // { itens } | { erro }
  const [escolhidos, setEscolhidos] = useState(new Set());
  const [instalando, setInstalando] = useState(false);
  const jogando = !!fase;

  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    setPlano(null);
    api.planoOtimizacao(inst.id).then((r) => {
      if (!vivo) return;
      if (!r || r.ok === false) { setPlano({ erro: (r && r.mensagem) || 'Não foi possível montar o plano.' }); return; }
      setPlano(r);
      setEscolhidos(new Set(r.itens.filter((i) => i.estado === 'instalar').map((i) => i.projetoId)));
    });
    return () => { vivo = false; };
  }, [aberto, inst.id]);

  const instalar = async () => {
    setInstalando(true);
    const r = await api.otimizarInstancia(inst.id, [...escolhidos]);
    setInstalando(false);
    if (!r || r.ok === false) { toast((r && r.mensagem) || 'Não foi possível otimizar.', { tipo: 'erro', titulo: 'Erro ao otimizar' }); return; }
    toast(`${r.mensagem}${r.falhas && r.falhas.length ? ` (${r.falhas.length} não deu para instalar)` : ''}`, { tipo: 'ok', titulo: `${inst.nome} otimizada` });
    aoFechar();
  };

  const alternar = (id, sim) => setEscolhidos((s) => { const n = new Set(s); if (sim) n.add(id); else n.delete(id); return n; });
  const vanilla = plano && plano.loader === 'vanilla';
  const livres = plano && plano.itens ? plano.itens.filter((i) => i.estado === 'instalar').length : 0;

  let corpo;
  if (!plano) corpo = html`<${Carregando} texto=${`Escolhendo os mods certos para ${inst.mc}...`} />`;
  else if (plano.erro) corpo = html`<p class="aviso-campo erro"><${Icone} nome="aviso" tamanho=${16} /><span>${plano.erro}</span></p>`;
  else if (vanilla) {
    corpo = html`<div class="otimizar-vanilla">
      <p>Mods de desempenho precisam de um <b>loader</b>. Esta instância é Vanilla (o Minecraft puro).</p>
      <p class="mais-suave">Troque para Fabric (recomendado) nas configurações da instância e volte aqui.</p>
    </div>`;
  } else {
    corpo = html`
      <p class="otimizar-intro">
        Mods que deixam o jogo mais leve <b>sem mudar nada no jogo</b>, escolhidos para${' '}
        <b>${inst.mc} com ${nomeLoader(plano.loader)}</b>. As dependências entram junto.
      </p>
      ${jogando && html`<p class="aviso-campo"><${Icone} nome="aviso" tamanho=${16} /><span>Feche o jogo antes de instalar.</span></p>`}
      <div class="lista-otimizar">
        ${plano.itens.map((i) => html`<${Linha} key=${i.projetoId} item=${i} marcado=${escolhidos.has(i.projetoId)} aoMudar=${(v) => alternar(i.projetoId, v)} />`)}
      </div>
      ${!livres && html`<p class="otimizar-pronto"><${Icone} nome="ok" tamanho=${16} /> Esta instância já tem tudo o que dá para instalar.</p>`}`;
  }

  return html`<${Modal} aberto=${aberto} titulo="Otimizar instância" aoFechar=${aoFechar} largura=${600} class="modal-otimizar"
    rodape=${html`
      <${Botao} aoClicar=${aoFechar}>${livres ? 'Cancelar' : 'Fechar'}<//>
      ${vanilla
        ? html`<${Botao} variante="principal" icone="engrenagem" aoClicar=${() => { aoFechar(); navegar(rotaInstancia(inst.id, 'config'), { substituir: true }); }}>Trocar o loader<//>`
        : livres > 0 && html`<${Botao} variante="principal" icone="raio" carregando=${instalando} desabilitado=${!escolhidos.size || jogando}
            aoClicar=${instalar}>Instalar ${escolhidos.size} ${escolhidos.size === 1 ? 'mod' : 'mods'}<//>`}`}>
    ${corpo}
  <//>`;
}
