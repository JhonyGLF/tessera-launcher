// Instala e inicia o Minecraft: Java Edition seguindo o formato oficial
// dos arquivos de versão da Mojang (version_manifest_v2 + <versão>.json),
// inclusive perfis de loader (Fabric, Quilt, Forge, NeoForge) que herdam do vanilla via "inheritsFrom".
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { baixar, baixarJson, emLote } = require('./download');
const { prepararJava } = require('./java');

const { RAIZ } = require('./caminhos'); // %APPDATA%\.tessera (JG_RAIZ troca nos testes)
const MANIFESTO = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const RECURSOS = 'https://resources.download.minecraft.net';
const BIBLIOTECAS = 'https://libraries.minecraft.net/';
const ARCH = { ia32: 'x86', x64: 'x64', arm64: 'arm64' }[process.arch] || process.arch;
const ID_VALIDO = /^[\w.+-]+$/; // ids de versão viram nomes de pasta

const pasta = (...p) => path.join(RAIZ, ...p);

// ---------- Versões ----------
let manifestoMemoria = null; // { quando, dados }

async function listarVersoes() {
  if (manifestoMemoria && Date.now() - manifestoMemoria.quando < 5 * 60 * 1000) return manifestoMemoria.dados;
  const cache = pasta('versions', 'version_manifest_v2.json');
  let manifesto;
  try {
    const resp = await fetch(MANIFESTO);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    manifesto = await resp.json();
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, JSON.stringify(manifesto));
    manifestoMemoria = { quando: Date.now(), dados: manifesto };
  } catch {
    try {
      manifesto = JSON.parse(fs.readFileSync(cache, 'utf8')); // sem internet: usa o último
    } catch {
      throw new Error('Não foi possível baixar a lista de versões do Minecraft. Verifique sua internet.');
    }
  }
  return manifesto;
}

// ---------- Regras (quais bibliotecas/argumentos valem para este PC) ----------
// features: { has_custom_resolution: true, ... } — as que não estiverem aqui contam como false
function regraCasa(regra, features = {}) {
  if (regra.os) {
    if (regra.os.name && regra.os.name !== 'windows') return false;
    if (regra.os.arch && regra.os.arch !== ARCH) return false;
    if (regra.os.version && !new RegExp(regra.os.version).test(os.release())) return false;
  }
  if (regra.features) {
    for (const [nome, valor] of Object.entries(regra.features)) {
      if (!!features[nome] !== valor) return false;
    }
  }
  return true;
}

function permitido(regras, features) {
  if (!regras || !regras.length) return true;
  let ok = false;
  for (const r of regras) if (regraCasa(r, features)) ok = r.action === 'allow';
  return ok;
}

// As versões novas listam natives-windows e natives-windows-arm64 com a mesma regra;
// fica só a da arquitetura deste PC.
function arquiteturaCerta(nome) {
  const m = nome.match(/:natives-windows(?:-(x86|arm64))?$/);
  if (!m) return true;
  return (m[1] || 'x64') === ARCH;
}

// "grupo:artefato:versão[:classificador][@extensão]" → caminho no repositório maven
function caminhoMaven(nome) {
  const [coords, ext = 'jar'] = nome.split('@');
  const [grupo, artefato, versao, classificador] = coords.split(':');
  const arquivo = `${artefato}-${versao}${classificador ? '-' + classificador : ''}.${ext}`;
  return [...grupo.split('.'), artefato, versao, arquivo].join('/');
}

// grupo:artefato[:classificador] — identifica a "mesma" biblioteca em versões diferentes
function chaveBiblioteca(nome) {
  const [grupo, artefato, , classificador] = nome.split('@')[0].split(':');
  return [grupo, artefato, classificador].filter(Boolean).join(':');
}

// ---------- Arquivo da versão (vanilla ou perfil de loader) ----------
async function carregarJson(id) {
  if (!ID_VALIDO.test(id)) throw new Error(`Versão inválida: ${id}`);
  const local = pasta('versions', id, `${id}.json`);

  // Perfis de loader (e versões que não estão no manifesto) só existem no disco
  let existente = null;
  try { existente = JSON.parse(fs.readFileSync(local, 'utf8')); } catch {}
  if (existente && existente.inheritsFrom) return existente;

  let entrada = null;
  try {
    entrada = (await listarVersoes()).versions.find((v) => v.id === id);
  } catch (erro) {
    if (!existente) throw erro;
  }
  if (entrada) return baixarJson(entrada.url, local, { sha1: entrada.sha1 });
  if (existente) return existente;
  throw new Error(`Versão ${id} não encontrada.`);
}

// Junta o perfil do loader (filho) com a versão de que ele herda (pai), como o launcher oficial
function mesclar(pai, filho) {
  const doFilho = new Set((filho.libraries || []).map((l) => chaveBiblioteca(l.name)));
  const libraries = [
    ...(filho.libraries || []),
    ...(pai.libraries || []).filter((l) => !doFilho.has(chaveBiblioteca(l.name))),
  ];

  const resultado = { ...pai, ...filho, libraries };
  delete resultado.inheritsFrom;
  for (const campo of ['assetIndex', 'assets', 'downloads', 'javaVersion', 'logging', 'complianceLevel', 'type']) {
    const valor = filho[campo];
    const vazio = valor == null || (typeof valor === 'object' && !Object.keys(valor).length);
    resultado[campo] = vazio ? pai[campo] : valor;
  }
  resultado.mainClass = filho.mainClass || pai.mainClass;
  resultado.minecraftArguments = filho.minecraftArguments || pai.minecraftArguments;
  if (!resultado.minecraftArguments) delete resultado.minecraftArguments;

  if (pai.arguments || filho.arguments) {
    const a = pai.arguments || {};
    const b = filho.arguments || {};
    resultado.arguments = {
      game: [...(a.game || []), ...(b.game || [])],
      jvm: [...(a.jvm || []), ...(b.jvm || [])],
    };
  }
  // o jar do jogo é o do vanilla (a menos que o perfil diga outro)
  resultado.jar = filho.jar || pai.jar || pai.id;
  return resultado;
}

// Devolve o json final da versão, com toda a cadeia inheritsFrom resolvida
async function resolverVersao(id, cadeia = []) {
  if (cadeia.includes(id)) throw new Error(`O perfil ${id} herda de si mesmo.`);
  const json = await carregarJson(id);
  if (!json.inheritsFrom) return { ...json, jar: json.jar || json.id };
  const pai = await resolverVersao(json.inheritsFrom, [...cadeia, id]);
  return mesclar(pai, json);
}

// ---------- Instalação ----------
// opcoes: { javaPersonalizado }
async function instalar(id, progresso = () => {}, opcoes = {}) {
  progresso({ etapa: `Preparando ${id}...` });
  const versao = await resolverVersao(id);
  if (!versao.downloads || !versao.downloads.client) throw new Error(`A versão ${id} não tem o arquivo do jogo.`);
  if (!versao.assetIndex) throw new Error(`A versão ${id} está incompleta (sem assetIndex).`);

  // Cliente (sempre o do vanilla). Perfis de loader ganham uma cópia com o próprio nome,
  // como faz o launcher oficial (o Forge/NeoForge procura por "<versão>.jar").
  const cliente = versao.downloads.client;
  const jarVanilla = pasta('versions', versao.jar, `${versao.jar}.jar`);
  progresso({ etapa: `Baixando o Minecraft ${versao.jar}...` });
  await baixar(cliente.url, jarVanilla, { size: cliente.size, sha1: cliente.sha1 });
  let jar = jarVanilla;
  if (versao.id !== versao.jar) {
    jar = pasta('versions', versao.id, `${versao.id}.jar`);
    let igual = false;
    try { igual = fs.statSync(jar).size === cliente.size; } catch {}
    if (!igual) {
      fs.mkdirSync(path.dirname(jar), { recursive: true });
      fs.copyFileSync(jarVanilla, jar);
    }
  }

  // Bibliotecas e nativas
  const classpath = [];
  const tarefas = [];
  const faltando = [];
  const nativasAntigas = [];
  for (const lib of versao.libraries || []) {
    if (!lib.name || !permitido(lib.rules) || !arquiteturaCerta(lib.name)) continue;
    const art = lib.downloads && lib.downloads.artifact;
    if (art || !lib.natives) {
      const rel = art && art.path ? art.path : caminhoMaven(lib.name);
      const destino = pasta('libraries', rel);
      if (art && !art.url) {
        // gerada pelo instalador do Forge/NeoForge: não tem de onde baixar, só precisa existir
        if (!fs.existsSync(destino)) faltando.push(lib.name);
      } else if (art) {
        tarefas.push({ url: art.url, destino, size: art.size, sha1: art.sha1 });
      } else {
        // formato maven (Fabric/Quilt): "url" é o repositório
        let repo = lib.url || BIBLIOTECAS;
        if (!repo.endsWith('/')) repo += '/';
        tarefas.push({ url: repo + rel, destino, size: lib.size, sha1: lib.sha1 });
      }
      if (!classpath.includes(destino)) classpath.push(destino);
    }
    // Formato antigo (até ~1.18): nativas em "classifiers", extraídas para uma pasta
    if (lib.natives && lib.natives.windows) {
      const chave = lib.natives.windows.replace('${arch}', ARCH === 'x86' ? '32' : '64');
      const nat = lib.downloads && lib.downloads.classifiers && lib.downloads.classifiers[chave];
      if (nat) {
        const destino = pasta('libraries', nat.path);
        tarefas.push({ url: nat.url, destino, size: nat.size, sha1: nat.sha1 });
        nativasAntigas.push({ destino, excluir: (lib.extract && lib.extract.exclude) || [] });
      }
    }
  }
  if (faltando.length) {
    throw new Error(`Arquivos do loader estão faltando (${faltando[0]}). Reinstale o loader desta instância.`);
  }
  const tarefasUnicas = [...new Map(tarefas.map((t) => [t.destino, t])).values()];
  await emLote(tarefasUnicas, (t) => baixar(t.url, t.destino, t),
    (feitos, total) => progresso({ etapa: 'Baixando bibliotecas', feitos, total }));

  const nativas = pasta('versions', versao.id, 'natives');
  fs.mkdirSync(nativas, { recursive: true });
  for (const n of nativasAntigas) {
    for (const e of new AdmZip(n.destino).getEntries()) {
      if (e.isDirectory || n.excluir.some((x) => e.entryName.startsWith(x))) continue;
      const destino = path.resolve(nativas, e.entryName);
      if (!destino.startsWith(nativas + path.sep)) continue; // proteção contra "zip slip"
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, e.getData());
    }
  }

  // Assets (sons, idiomas, texturas extras)
  const idx = versao.assetIndex;
  const indice = await baixarJson(idx.url, pasta('assets', 'indexes', `${idx.id}.json`), { sha1: idx.sha1 });
  const objetos = Object.entries(indice.objects).map(([nome, o]) => ({
    nome, hash: o.hash, size: o.size,
    destino: pasta('assets', 'objects', o.hash.slice(0, 2), o.hash),
  }));
  const unicos = [...new Map(objetos.map((o) => [o.hash, o])).values()];
  await emLote(unicos, (o) => baixar(`${RECURSOS}/${o.hash.slice(0, 2)}/${o.hash}`, o.destino, o),
    (feitos, total) => progresso({ etapa: 'Baixando assets', feitos, total }), 24);

  // Versões bem antigas leem os assets com o nome original, não pelo hash
  let assetsLegados = pasta('assets', 'virtual', idx.id);
  if (indice.virtual || indice.map_to_resources) {
    const base = indice.map_to_resources ? pasta('resources') : assetsLegados;
    if (indice.map_to_resources) assetsLegados = base;
    for (const o of objetos) {
      const destino = path.join(base, o.nome);
      if (fs.existsSync(destino)) continue;
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(o.destino, destino);
    }
  }

  // Configuração de log oficial (também corrige o Log4Shell nas versões antigas)
  let argLog = null;
  if (versao.logging && versao.logging.client && versao.logging.client.file) {
    const { file, argument } = versao.logging.client;
    const destino = pasta('assets', 'log_configs', file.id);
    await baixar(file.url, destino, { size: file.size, sha1: file.sha1 });
    argLog = argument.replace('${path}', destino);
  }

  const java = await resolverJava(versao, progresso, opcoes.javaPersonalizado);
  return { id: versao.id, versao, jar, classpath, nativas, assetsLegados, argLog, java };
}

// Java escolhido pelo usuário ou o do catálogo da Mojang que a versão pede
async function resolverJava(versao, progresso, javaPersonalizado) {
  if (javaPersonalizado) {
    if (!fs.existsSync(javaPersonalizado)) throw new Error(`O Java escolhido não existe mais: ${javaPersonalizado}`);
    return javaPersonalizado;
  }
  const componente = (versao.javaVersion && versao.javaVersion.component) || 'jre-legacy';
  return prepararJava(RAIZ, componente, progresso);
}

// ---------- Argumentos ----------
function expandir(lista, features) {
  const saida = [];
  for (const a of lista || []) {
    if (typeof a === 'string') saida.push(a);
    else if (a && permitido(a.rules, features)) saida.push(...[].concat(a.value));
  }
  return saida;
}

// Divide "-Xss2M -Dnome='com espaço'" em argumentos, respeitando aspas simples e duplas
function dividirArgs(texto) {
  const saida = [];
  let atual = '';
  let aspas = null;
  let tem = false;
  for (const c of String(texto || '')) {
    if (aspas) {
      if (c === aspas) aspas = null;
      else atual += c;
    } else if (c === "'" || c === '"') {
      aspas = c;
      tem = true;
    } else if (/\s/.test(c)) {
      if (tem || atual) saida.push(atual);
      atual = '';
      tem = false;
    } else {
      atual += c;
    }
  }
  if (tem || atual) saida.push(atual);
  return saida;
}

// opcoes: { ramMB, gameDir, jvmArgs, resolucao: { largura, altura } }
function montarArgumentos(inst, sessao, opcoes = {}) {
  if (typeof opcoes === 'number') opcoes = { ramMB: opcoes }; // formato antigo
  const { versao } = inst;
  const ramMB = Math.max(512, Math.round(Number(opcoes.ramMB) || 2048));
  const gameDir = opcoes.gameDir || RAIZ;
  const res = opcoes.resolucao && opcoes.resolucao.largura > 0 && opcoes.resolucao.altura > 0
    ? { largura: Math.round(opcoes.resolucao.largura), altura: Math.round(opcoes.resolucao.altura) }
    : null;
  const features = { has_custom_resolution: !!res };

  const valores = {
    auth_player_name: sessao.nome,
    version_name: versao.id,
    game_directory: gameDir,
    assets_root: pasta('assets'),
    game_assets: inst.assetsLegados,
    assets_index_name: versao.assetIndex.id,
    auth_uuid: sessao.uuid,
    auth_access_token: sessao.token,
    auth_session: `token:${sessao.token}:${sessao.uuid}`,
    auth_xuid: sessao.xuid || '',
    clientid: '',
    user_type: sessao.tipo === 'offline' ? 'legacy' : 'msa',
    user_properties: '{}',
    version_type: versao.type,
    natives_directory: inst.nativas,
    library_directory: pasta('libraries'),
    classpath_separator: ';',
    classpath: [...inst.classpath, inst.jar].join(';'),
    launcher_name: 'tessera',
    launcher_version: app.getVersion(),
    resolution_width: res ? String(res.largura) : '',
    resolution_height: res ? String(res.altura) : '',
  };
  const trocar = (s) => s.replace(/\$\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m));

  // Versões antigas (e perfis de loader delas) usam minecraftArguments; os loaders
  // podem ainda trazer "arguments" extras, que vão depois.
  let jvm;
  let jogo;
  if (versao.minecraftArguments) {
    jvm = ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}',
      ...expandir(versao.arguments && versao.arguments.jvm, features)];
    jogo = [...versao.minecraftArguments.split(' ').filter(Boolean),
      ...expandir(versao.arguments && versao.arguments.game, features)];
    if (res) jogo.push('--width', '${resolution_width}', '--height', '${resolution_height}');
  } else {
    jvm = expandir(versao.arguments.jvm, features);
    jogo = expandir(versao.arguments.game, features);
  }

  const extras = dividirArgs(opcoes.jvmArgs);
  // se o usuário escolheu outro coletor de lixo, os ajustes do G1 não podem ir junto
  const outroGC = extras.some((a) => /^-XX:\+Use\w*GC$/.test(a) && a !== '-XX:+UseG1GC');
  return [
    `-Xmx${ramMB}M`, `-Xms${Math.min(ramMB, 1024)}M`,
    // mesmos ajustes de memória que o launcher oficial usa
    ...(outroGC ? [] : ['-XX:+UnlockExperimentalVMOptions', '-XX:+UseG1GC', '-XX:G1NewSizePercent=20',
      '-XX:G1ReservePercent=20', '-XX:MaxGCPauseMillis=50', '-XX:G1HeapRegionSize=32M']),
    ...extras,
    ...(inst.argLog ? [inst.argLog] : []),
    ...jvm.map(trocar),
    versao.mainClass,
    ...jogo.map(trocar),
  ];
}

// ---------- Iniciar ----------
// opcoes: { ramMB, gameDir, jvmArgs, resolucao, javaPersonalizado }
function iniciar(inst, sessao, opcoes = {}) {
  if (typeof opcoes === 'number') opcoes = { ramMB: opcoes }; // formato antigo
  const gameDir = opcoes.gameDir || RAIZ;
  const java = opcoes.javaPersonalizado || inst.java;
  if (!fs.existsSync(java)) throw new Error(`Java não encontrado: ${java}`);

  // as versões novas usam subpastas dentro de natives_directory
  for (const sub of ['java', 'jna', 'lwjgl', 'netty']) fs.mkdirSync(path.join(inst.nativas, sub), { recursive: true });
  fs.mkdirSync(path.join(gameDir, 'logs'), { recursive: true });
  const log = fs.openSync(path.join(gameDir, 'logs', 'tessera-launch.log'), 'w');

  let processo;
  try {
    processo = spawn(java, montarArgumentos(inst, sessao, { ...opcoes, gameDir }), {
      cwd: gameDir,
      detached: true,          // o jogo continua aberto mesmo se o launcher fechar
      stdio: ['ignore', log, log],
      windowsHide: true,
    });
  } finally {
    fs.closeSync(log);         // o processo filho já tem a própria cópia do descritor
  }
  processo.unref();
  return processo;
}

module.exports = {
  RAIZ, listarVersoes, resolverVersao, instalar, iniciar, montarArgumentos,
  caminhoMaven, dividirArgs,
};
