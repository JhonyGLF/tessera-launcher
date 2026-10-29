// Todos os componentes num lugar só:
//   import { Botao, Icone, Modal, confirmar, toast, Select, ... } from '../componentes/index.js';
//
// Resumo das props (detalhes no topo de cada arquivo):
//   Botao({ variante: 'pedra'|'principal'|'perigo'|'destaque'|'fantasma', tamanho: 'p'|'m'|'g'|'gg',
//           icone, iconeDireita, carregando, desabilitado, dica, aoClicar, bloco })
//   Icone({ nome, tamanho })                       — NOMES_ICONES lista os nomes
//   Modal({ aberto, titulo, aoFechar, rodape, largura, semEspaco })
//   confirmar({ titulo, mensagem, confirmar, cancelar, perigo, icone }) → Promise<boolean>
//   toast(mensagem, { tipo: 'info'|'ok'|'erro'|'aviso', titulo, acao: { rotulo, aoClicar }, duracao })
//   Select({ valor, opcoes: [{ valor, rotulo, detalhe, grupo }], aoMudar, busca, placeholder, largura })
//   Alternador({ ligado, aoMudar, rotulo }) · Deslizador({ valor, min, max, passo, aoMudar, aoSoltar, formatar })
//   Abas({ abas: [{ id, rotulo, icone, contagem }], ativa, aoMudar }) · CampoTexto({ valor, aoMudar, icone, limpar })
//   CabecaSkin({ skin, tamanho }) · IconeInstancia({ inst, tamanho })
//   BarraProgresso({ valor: 0..1|null, fina }) · Carregando({ texto, inline }) · Vazio({ titulo, texto, icone })
//   Cartao({ interativo, selecionado, aoClicar }) · Etiqueta({ cor, icone }) · EtiquetaLoader({ loader, mostrarVersao })
//   IconeLoader({ tipo, tamanho }) — ícone pixel do loader (assets/loaders) · iconeLoaderUrl(tipo)
//   Menu({ ancora, aberto, aoFechar, itens: [{ rotulo, icone, aoClicar, perigo }] }) · Flutuante · Portal
//   Tooltip({ texto }) — ou o atributo data-dica="..." em qualquer elemento
export { Icone, LogoMicrosoft, NOMES_ICONES } from './icone.js';
export { Botao } from './botao.js';
export { Modal, confirmar, HostDialogos } from './modal.js';
export { toast, fecharToast, Toasts } from './toasts.js';
export { Select } from './select.js';
export { Alternador, Deslizador, Abas, CampoTexto } from './controles.js';
export {
  CabecaSkin, IconeInstancia, BarraProgresso, Carregando, Vazio, Cartao, Etiqueta, EtiquetaLoader, IconeLoader, iconeLoaderUrl,
  NOMES_LOADER, Menu,
} from './visuais.js';
export { Portal, Flutuante, Tooltip, iniciarDicas } from './camada.js';
