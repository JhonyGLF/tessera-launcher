// Ponte entre a interface e o processo principal. Toda a API da interface está aqui:
// cada função devolve uma Promise (exceto minimizar/fechar e os ouvintes "ao...").
const { contextBridge, ipcRenderer } = require('electron');

const chamar = (canal) => (...args) => ipcRenderer.invoke(canal, ...args);
const ouvir = (canal) => (fn) => {
  const ouvinte = (_e, dados) => fn(dados);
  ipcRenderer.on(canal, ouvinte);
  return () => ipcRenderer.removeListener(canal, ouvinte); // para parar de ouvir
};

contextBridge.exposeInMainWorld('jg', {
  // Janela e app
  minimizar: () => ipcRenderer.send('janela:minimizar'),
  fechar: () => ipcRenderer.send('janela:fechar'),
  info: chamar('app:info'),
  abrirLink: chamar('app:abrirLink'),
  abrirPastaRaiz: chamar('app:abrirPastaRaiz'),

  // Atualização do próprio launcher
  estadoAtualizacaoLauncher: chamar('atualizacao:estado'),
  verificarAtualizacaoLauncher: chamar('atualizacao:verificar'),
  instalarAtualizacaoLauncher: chamar('atualizacao:instalar'),
  aoAtualizacaoLauncher: ouvir('atualizacao'),

  // Configurações
  lerConfig: chamar('config:ler'),
  salvarConfig: chamar('config:salvar'),
  escolherJava: chamar('config:escolherJava'),

  // Contas
  listarContas: chamar('contas:listar'),
  adicionarMicrosoft: chamar('contas:adicionarMicrosoft'),
  adicionarOffline: chamar('contas:adicionarOffline'),
  removerConta: chamar('contas:remover'),
  selecionarConta: chamar('contas:selecionar'),
  skinConta: chamar('contas:skin'),
  escolherSkin: chamar('contas:escolherSkin'),
  alterarSkin: chamar('contas:alterarSkin'),

  // Versões e loaders
  listarVersoesMc: chamar('versoes:listarMc'),
  listarLoaders: chamar('versoes:listarLoaders'),

  // Instâncias
  listarInstancias: chamar('instancias:listar'),
  criarInstancia: chamar('instancias:criar'),
  editarInstancia: chamar('instancias:editar'),
  removerInstancia: chamar('instancias:remover'),
  duplicarInstancia: chamar('instancias:duplicar'),
  abrirPastaInstancia: chamar('instancias:abrirPasta'),
  definirIconeInstancia: chamar('instancias:definirIcone'),
  listarConteudo: chamar('instancias:listarConteudo'),
  alternarConteudo: chamar('instancias:alternarConteudo'),
  removerConteudo: chamar('instancias:removerConteudo'),
  importarArquivos: chamar('instancias:importarArquivos'),
  listarMundos: chamar('instancias:listarMundos'),
  jogar: chamar('instancias:jogar'),
  parar: chamar('instancias:parar'),
  emExecucao: chamar('instancias:emExecucao'),
  lerLog: chamar('instancias:lerLog'),
  verificarAtualizacoes: chamar('instancias:verificarAtualizacoes'),
  atualizarConteudo: chamar('instancias:atualizarConteudo'),
  planoOtimizacao: chamar('instancias:planoOtimizacao'),
  otimizarInstancia: chamar('instancias:otimizar'),
  importarMrpack: chamar('instancias:importarMrpack'),

  // Modrinth
  buscarModrinth: chamar('modrinth:buscar'),
  projetoModrinth: chamar('modrinth:projeto'),
  versoesModrinth: chamar('modrinth:versoes'),
  categoriasModrinth: chamar('modrinth:categorias'),
  instalarModrinth: chamar('modrinth:instalar'),
  instalarModpack: chamar('modrinth:instalarModpack'),

  // Novidades
  listarNoticias: chamar('noticias:listar'),

  // Tarefas e eventos
  listarTarefas: chamar('tarefas:listar'),
  aoTarefas: ouvir('tarefas'),
  aoInstancias: ouvir('instancias'),
  aoJogo: ouvir('jogo'),
  aoLog: ouvir('log'),
});
