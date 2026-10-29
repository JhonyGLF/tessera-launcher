// Com ELECTRON_RUN_AS_NODE (o terminal do VS Code define), "npm start" roda o Electron como Node puro
// e require('electron') devolve só o caminho do executável: reabre como app de verdade.
// (No launcher instalado isso nunca acontece.)
if (typeof require('electron') === 'string') {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = require('child_process').spawnSync(require('electron'), [__dirname, ...process.argv.slice(2)], { stdio: 'inherit', env });
  process.exit(r.status == null ? 1 : r.status);
}

const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

// O launcher se chamava "JG Client": contas e configurações ficavam em %APPDATA%\JG Client.
// Na primeira abertura como Tessera, a pasta é renomeada (inteira: o arquivo "Local State" guarda a
// chave que protege os tokens). Tem de rodar antes de qualquer coisa criar a pasta nova.
function migrarDadosAntigos() {
  const appData = app.getPath('appData');
  const nova = path.join(appData, 'Tessera Launcher');
  const antiga = path.join(appData, 'JG Client');
  if (path.resolve(app.getPath('userData')) !== path.resolve(nova)) return; // testes usam outra pasta
  const temDados = (p) => ['contas.json', 'config.json'].some((f) => fs.existsSync(path.join(p, f)));
  if (temDados(nova) || !temDados(antiga)) return;
  try {
    if (fs.existsSync(nova)) fs.rmSync(nova, { recursive: true, force: true }); // só cache, sem dados nossos
    fs.renameSync(antiga, nova);
  } catch {
    app.setPath('userData', antiga); // algo em uso (JG Client aberto?): usa a pasta antiga desta vez
  }
}
migrarDadosAntigos();

const config = require('./launcher/config');
const contas = require('./launcher/contas');
const versoes = require('./launcher/versoes');
const instancias = require('./launcher/instancias');
const modrinth = require('./launcher/modrinth');
const noticias = require('./launcher/noticias');
const tarefas = require('./launcher/tarefas');
const atualizacao = require('./launcher/atualizacao');
const { RAIZ } = require('./launcher/jogo');

app.setAppUserModelId('com.tessera.launcher');

// Só uma janela do Tessera por vez
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// A interface é servida por app://jg/... (permite módulos ES sem servidor)
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const SERVIDAS = ['renderer', 'assets'].map((p) => path.join(__dirname, p) + path.sep);

let janela = null;

function criarJanela() {
  janela = new BrowserWindow({
    width: 1240,         // cartão (1200x740) + margem para a sombra
    height: 780,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    hasShadow: false,
    show: !process.env.JG_OCULTO, // testes automáticos rodam sem mostrar a janela
    backgroundColor: '#00000000',
    title: 'Tessera',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: !!process.env.JG_OCULTO,
    },
  });

  // Links externos nunca abrem dentro do launcher
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://jg/')) e.preventDefault();
  });

  janela.loadURL('app://jg/renderer/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const alvo = path.normalize(path.join(__dirname, decodeURIComponent(pathname)));
    if (!SERVIDAS.some((p) => alvo.startsWith(p))) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(alvo).toString());
  });
  criarJanela();
  atualizacao.iniciar();
});

app.on('second-instance', () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  }
});

app.on('window-all-closed', () => app.quit());

// ---------- Eventos do backend → interface ----------
const enviar = (canal, dados) => janela && !janela.isDestroyed() && janela.webContents.send(canal, dados);
tarefas.eventos.on('mudou', (lista) => enviar('tarefas', lista));
instancias.eventos.on('instancias', (lista) => enviar('instancias', lista));
instancias.eventos.on('jogo', (estado) => {
  // estado: { id, estado: 'abrindo'|'rodando'|'fechado', codigo?, cedo? }
  if (!janela || janela.isDestroyed()) return;
  if (estado.estado === 'rodando' && config.ler().minimizarAoJogar) janela.minimize();
  if (estado.estado === 'fechado' && janela.isMinimized()) janela.restore();
  enviar('jogo', estado);
});
instancias.eventos.on('log', (dados) => enviar('log', dados));
atualizacao.eventos.on('estado', (estado) => enviar('atualizacao', estado));

// ---------- Utilidades ----------
const handle = (canal, fn) => ipcMain.handle(canal, (_e, ...args) => fn(...args));

async function escolherArquivos(opcoes) {
  const r = await dialog.showOpenDialog(janela, opcoes);
  return r.canceled ? [] : r.filePaths;
}

// ---------- Janela e app ----------
ipcMain.on('janela:minimizar', () => janela && janela.minimize());
ipcMain.on('janela:fechar', () => janela && janela.close());
handle('app:info', () => ({ versao: app.getVersion(), raiz: RAIZ }));
handle('app:abrirLink', (url) => {
  if (typeof url === 'string' && url.startsWith('https://')) shell.openExternal(url);
});
handle('app:abrirPastaRaiz', () => shell.openPath(RAIZ));

// ---------- Atualização do launcher ----------
handle('atualizacao:estado', () => atualizacao.estado());
handle('atualizacao:verificar', () => atualizacao.verificar());
handle('atualizacao:instalar', () => atualizacao.instalar());

// ---------- Configurações ----------
handle('config:ler', () => config.publica());
handle('config:salvar', (mudancas) => config.salvar(mudancas));
handle('config:escolherJava', async () => {
  const [arquivo] = await escolherArquivos({
    title: 'Escolha o java.exe ou javaw.exe',
    filters: [{ name: 'Java', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  return arquivo || null;
});

// ---------- Contas ----------
handle('contas:listar', () => contas.listar());
handle('contas:adicionarMicrosoft', () => contas.adicionarMicrosoft());
handle('contas:adicionarOffline', (nome) => contas.adicionarOffline(nome));
handle('contas:remover', (id) => contas.remover(id));
handle('contas:selecionar', (id) => contas.selecionar(id));
handle('contas:skin', (id) => contas.skin(id));

// ---------- Versões do Minecraft e loaders ----------
handle('versoes:listarMc', () => versoes.listarMc());
handle('versoes:listarLoaders', (tipo, mc) => versoes.listarLoaders(tipo, mc));

// ---------- Instâncias ----------
handle('instancias:listar', () => instancias.listar());
handle('instancias:criar', (dados) => instancias.criar(dados));
handle('instancias:editar', (id, mudancas) => instancias.editar(id, mudancas));
handle('instancias:remover', (id) => instancias.remover(id));
handle('instancias:duplicar', (id) => instancias.duplicar(id));
handle('instancias:abrirPasta', (id, sub) => instancias.abrirPasta(id, sub));
handle('instancias:definirIcone', async (id, preset) => {
  if (preset) return instancias.definirIcone(id, { preset });
  const [arquivo] = await escolherArquivos({
    title: 'Escolha uma imagem para o ícone',
    filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    properties: ['openFile'],
  });
  return arquivo ? instancias.definirIcone(id, { arquivo }) : null;
});
handle('instancias:listarConteudo', (id, tipo) => instancias.listarConteudo(id, tipo));
handle('instancias:alternarConteudo', (id, tipo, arquivo, ativo) => instancias.alternarConteudo(id, tipo, arquivo, ativo));
handle('instancias:removerConteudo', (id, tipo, arquivo) => instancias.removerConteudo(id, tipo, arquivo));
handle('instancias:importarArquivos', async (id, tipo) => {
  const extensoes = tipo === 'mods' ? ['jar'] : ['zip'];
  const arquivos = await escolherArquivos({
    title: 'Adicionar arquivos',
    filters: [{ name: tipo, extensions: extensoes }],
    properties: ['openFile', 'multiSelections'],
  });
  return arquivos.length ? instancias.importarArquivos(id, tipo, arquivos) : { ok: true, adicionados: 0 };
});
handle('instancias:listarMundos', (id) => instancias.listarMundos(id));
handle('instancias:jogar', (id) => instancias.jogar(id));
handle('instancias:parar', (id) => instancias.parar(id));
handle('instancias:emExecucao', () => instancias.emExecucao());
handle('instancias:lerLog', (id) => instancias.lerLog(id));
handle('instancias:verificarAtualizacoes', (id) => modrinth.verificarAtualizacoes(id));
handle('instancias:atualizarConteudo', (id, itens) => modrinth.atualizarConteudo(id, itens));
handle('instancias:importarMrpack', async () => {
  const [arquivo] = await escolherArquivos({
    title: 'Importar modpack (.mrpack)',
    filters: [{ name: 'Modpack do Modrinth', extensions: ['mrpack'] }],
    properties: ['openFile'],
  });
  return arquivo ? modrinth.importarMrpack(arquivo) : null;
});

// ---------- Modrinth (biblioteca de mods, modpacks, resource packs e shaders) ----------
handle('modrinth:buscar', (filtros) => modrinth.buscar(filtros));
handle('modrinth:projeto', (id) => modrinth.projeto(id));
handle('modrinth:versoes', (id, filtros) => modrinth.versoesProjeto(id, filtros));
handle('modrinth:categorias', (tipo) => modrinth.categorias(tipo));
handle('modrinth:instalar', (dados) => modrinth.instalarProjeto(dados));
handle('modrinth:instalarModpack', (dados) => modrinth.instalarModpack(dados));

// ---------- Novidades ----------
handle('noticias:listar', () => noticias.listar());

// ---------- Tarefas ----------
handle('tarefas:listar', () => tarefas.listar());
