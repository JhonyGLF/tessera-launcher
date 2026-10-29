// Configurações globais do launcher, salvas em %APPDATA%\Tessera Launcher\config.json.
// A interface só vê (e só pode mudar) as chaves de PUBLICAS; o resto é interno.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEMAS = ['sculk', 'grama', 'ametista', 'nether', 'gelo'];
const ORDENS = ['recentes', 'nome'];
const MB_TOTAL = Math.floor(os.totalmem() / 1048576);

// Máximo de RAM que dá para escolher: a RAM do PC (em blocos de 512 MB)
const RAM_MAX = Math.max(1024, Math.floor(MB_TOTAL / 512) * 512);
const RAM_MIN = 512;
// Padrão: metade da RAM, entre 2 GB e 4 GB (nunca mais que o PC tem)
const RAM_PADRAO = Math.min(RAM_MAX, Math.max(2048, Math.min(4096, Math.floor(MB_TOTAL / 2 / 512) * 512)));

const PADRAO = {
  ramMB: RAM_PADRAO,
  javaPersonalizado: null,
  minimizarAoJogar: true,
  mostrarSnapshots: false,
  tema: 'sculk',
  instanciaSelecionada: null,
  ordemInstancias: 'recentes',
};
const PUBLICAS = Object.keys(PADRAO);

// Cada validador devolve o valor normalizado ou undefined (inválido → ignorado)
const VALIDAR = {
  ramMB: (v) => (Number.isFinite(v) ? Math.min(RAM_MAX, Math.max(RAM_MIN, Math.round(v))) : undefined),
  javaPersonalizado: (v) => {
    if (v === null || v === '') return null;
    if (typeof v !== 'string' || !path.isAbsolute(v) || !/^javaw?\.exe$/i.test(path.basename(v))) return undefined;
    return fs.existsSync(v) ? path.normalize(v) : undefined;
  },
  minimizarAoJogar: (v) => (typeof v === 'boolean' ? v : undefined),
  mostrarSnapshots: (v) => (typeof v === 'boolean' ? v : undefined),
  tema: (v) => (TEMAS.includes(v) ? v : undefined),
  instanciaSelecionada: (v) => (v === null || (typeof v === 'string' && /^[a-z0-9-]{1,64}$/.test(v)) ? v : undefined),
  ordemInstancias: (v) => (ORDENS.includes(v) ? v : undefined),
};

const arquivo = () => path.join(app.getPath('userData'), 'config.json');
let cache = null;

function lerDisco() {
  let dados = {};
  try {
    dados = JSON.parse(fs.readFileSync(arquivo(), 'utf8')) || {};
  } catch {}
  // Versão anterior: "snapshots" virou "mostrarSnapshots"; "versao" não existe mais
  if ('snapshots' in dados) {
    if (!('mostrarSnapshots' in dados)) dados.mostrarSnapshots = !!dados.snapshots;
    delete dados.snapshots;
  }
  delete dados.versao;
  return dados;
}

function gravar(dados) {
  fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
  const tmp = `${arquivo()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, arquivo());
  cache = dados;
}

// Tudo (públicas já validadas + chaves internas, como o token antigo "conta")
function ler() {
  if (!cache) cache = lerDisco();
  const saida = { ...PADRAO, ...cache };
  for (const chave of PUBLICAS) {
    const v = VALIDAR[chave](saida[chave]);
    saida[chave] = v === undefined ? PADRAO[chave] : v;
  }
  return saida;
}

// O que a interface vê
function publica() {
  const tudo = ler();
  const saida = { ramMaxMB: RAM_MAX };
  for (const chave of PUBLICAS) saida[chave] = tudo[chave];
  return saida;
}

// Mudanças vindas da interface: só chaves públicas e valores válidos
function salvar(mudancas) {
  if (!mudancas || typeof mudancas !== 'object') return publica();
  const dados = { ...ler() };
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (!PUBLICAS.includes(chave)) continue;
    const v = VALIDAR[chave](valor);
    if (v !== undefined) dados[chave] = v;
  }
  gravar(dados);
  return publica();
}

// Chaves internas (usadas pelo backend: migração da conta antiga, primeiro uso...)
function interno(chave) {
  return ler()[chave];
}

function definirInterno(mudancas) {
  const dados = { ...ler() };
  for (const [chave, valor] of Object.entries(mudancas)) {
    if (PUBLICAS.includes(chave)) continue;
    if (valor === undefined || valor === null) delete dados[chave];
    else dados[chave] = valor;
  }
  gravar(dados);
}

module.exports = { ler, publica, salvar, interno, definirInterno, RAM_MAX, RAM_MIN, TEMAS };
