// Versões do Minecraft e dos loaders de mods (Fabric, Quilt, Forge, NeoForge).
// garantirLoader instala o perfil do loader em versions/<id>/<id>.json, que herda do vanilla
// via "inheritsFrom" (o jogo.js resolve a herança na hora de instalar/iniciar).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const AdmZip = require('adm-zip');
const { baixar } = require('./download');
const jogo = require('./jogo');

const { RAIZ } = jogo;
const pasta = (...p) => path.join(RAIZ, ...p);

const NOMES = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
const FABRIC = 'https://meta.fabricmc.net/v2/versions/loader';
const QUILT = 'https://meta.quiltmc.org/v3/versions/loader';
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const NEO_API = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged';
const NEO_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged';
const ID_VALIDO = /^[\w.+-]+$/; // versões viram partes de URL e nomes de pasta

// ---------- Utilidades ----------
const cacheMemoria = new Map(); // url → { quando, dados }

async function buscar(url, tipo = 'json') {
  const guardado = cacheMemoria.get(url);
  if (guardado && Date.now() - guardado.quando < 10 * 60 * 1000) return guardado.dados;
  const resp = await fetch(url);
  if (resp.status === 404 || resp.status === 400) return null; // a API do Fabric responde 400 para versão desconhecida
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const dados = tipo === 'json' ? await resp.json() : await resp.text();
  cacheMemoria.set(url, { quando: Date.now(), dados });
  return dados;
}

// Compara versões tipo "0.16.10" / "47.4.10" / "0.20.0-beta.9" (maior primeiro ao ordenar com -comparar)
function comparar(a, b) {
  const partes = (v) => v.split(/[.+-]/).map((p) => (/^\d+$/.test(p) ? Number(p) : p));
  const pa = partes(a);
  const pb = partes(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return typeof y === 'number' ? -1 : 1; // "1.0" < "1.0.1", mas "1.0" > "1.0-beta"
    if (y === undefined) return typeof x === 'number' ? 1 : -1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    if (typeof x === 'number') return 1;  // número vem depois de texto (release > beta)
    if (typeof y === 'number') return -1;
    return x < y ? -1 : 1;
  }
  return 0;
}

const naoTem = (tipo, mc) => ({ ok: false, mensagem: `O ${NOMES[tipo]} não tem versão para o ${mc}.` });
const semInternet = (tipo) => ({
  ok: false, mensagem: `Não foi possível consultar as versões do ${NOMES[tipo]}. Verifique sua internet.`,
});

// ---------- Minecraft ----------
async function listarMc() {
  try {
    const manifesto = await jogo.listarVersoes();
    return {
      ok: true,
      ultima: { release: manifesto.latest.release, snapshot: manifesto.latest.snapshot },
      versoes: manifesto.versions.map((v) => ({ id: v.id, tipo: v.type, data: v.releaseTime })),
    };
  } catch (erro) {
    return { ok: false, mensagem: erro.message };
  }
}

// ---------- Listas de loaders ----------
async function loadersFabric(mc) {
  const lista = await buscar(`${FABRIC}/${encodeURIComponent(mc)}`);
  if (!Array.isArray(lista)) return [];
  return lista.map((x) => ({ id: x.loader.version, estavel: !!x.loader.stable }));
}

async function loadersQuilt(mc) {
  const lista = await buscar(`${QUILT}/${encodeURIComponent(mc)}`);
  if (!Array.isArray(lista)) return [];
  const ids = [...new Set(lista.map((x) => x.loader.version))].sort((a, b) => comparar(b, a));
  return ids.map((id) => ({ id, estavel: !/beta|alpha|pre|rc/i.test(id) }));
}

// Forge: versões "<mc>-<forge>" (as bem antigas ainda terminam com "-<mc>").
// O id do loader é a parte depois de "<mc>-".
async function loadersForge(mc) {
  const [xml, promos] = await Promise.all([
    buscar(`${FORGE_MAVEN}/maven-metadata.xml`, 'texto'),
    buscar(FORGE_PROMOS).catch(() => null),
  ]);
  if (!xml) throw new Error('lista do Forge indisponível');
  const prefixo = `${mc}-`;
  const ids = [...xml.matchAll(/<version>([^<]+)<\/version>/g)]
    .map((m) => m[1])
    .filter((v) => v.startsWith(prefixo))
    .map((v) => v.slice(prefixo.length))
    // "1.20-46..." começa com "1.2" mas não é do 1.2: o resto precisa começar com número de versão do Forge
    .filter((id) => /^\d+\.\d+/.test(id));
  const p = (promos && promos.promos) || {};
  const recomendada = p[`${mc}-recommended`];
  const ultima = p[`${mc}-latest`];
  const base = (id) => id.split('-')[0]; // "10.13.4.1614-1.7.10" → "10.13.4.1614"
  return [...new Set(ids)]
    .sort((a, b) => comparar(base(b), base(a)))
    .map((id) => ({
      id,
      // com versão recomendada, só ela conta como estável (é o que o Forge indica)
      estavel: recomendada ? base(id) === recomendada : true,
      ...(base(id) === recomendada ? { recomendada: true } : {}),
      ...(base(id) === ultima ? { ultima: true } : {}),
    }));
}

// NeoForge: "21.1.77" → 1.21.1; "21.0.5-beta" → 1.21; esquema novo "26.1.1.4-beta" → 26.1.1,
// "26.1.0.0-alpha.1+snapshot-1" → 26.1-snapshot-1. O 1.20.1 usa o artefato antigo "forge".
function mcDoNeoForge(v) {
  const novo = v.match(/^(\d{2,})\.(\d+)\.(\d+)\.\d+(?:-[^+]*)?(?:\+(.+))?$/);
  if (novo && Number(novo[1]) >= 26) {
    const [, ano, drop, hotfix, extra] = novo;
    const base = hotfix === '0' ? `${ano}.${drop}` : `${ano}.${drop}.${hotfix}`;
    return extra ? `${base}-${extra}` : base;
  }
  const antigo = v.match(/^(\d+)\.(\d+)\.\d+(?:-beta)?$/);
  if (antigo) return antigo[2] === '0' ? `1.${antigo[1]}` : `1.${antigo[1]}.${antigo[2]}`;
  const especial = v.match(/^0\.([^.]+)\.\d+(?:-beta)?$/); // "0.25w14craftmine.3-beta"
  if (especial) return especial[1];
  return null;
}

async function loadersNeoForge(mc) {
  if (mc === '1.20.1') {
    const dados = await buscar(`${NEO_API}/forge`);
    const ids = ((dados && dados.versions) || [])
      .filter((v) => v.startsWith('1.20.1-'))
      .map((v) => v.slice('1.20.1-'.length));
    return ids.sort((a, b) => comparar(b, a)).map((id) => ({ id, estavel: !/beta|alpha/i.test(id) }));
  }
  const dados = await buscar(`${NEO_API}/neoforge`);
  if (!dados || !dados.versions) throw new Error('lista do NeoForge indisponível');
  return dados.versions
    .filter((v) => mcDoNeoForge(v) === mc)
    .sort((a, b) => comparar(b, a))
    .map((id) => ({ id, estavel: !/beta|alpha/i.test(id) }));
}

const LISTAS = { fabric: loadersFabric, quilt: loadersQuilt, forge: loadersForge, neoforge: loadersNeoForge };

async function listarLoaders(tipo, mc) {
  if (tipo === 'vanilla') return { ok: true, versoes: [] };
  if (!LISTAS[tipo]) return { ok: false, mensagem: 'Tipo de loader desconhecido.' };
  if (typeof mc !== 'string' || !ID_VALIDO.test(mc)) return { ok: false, mensagem: 'Versão do Minecraft inválida.' };
  let versoes;
  try {
    versoes = await LISTAS[tipo](mc);
  } catch {
    return semInternet(tipo);
  }
  return versoes.length ? { ok: true, versoes } : naoTem(tipo, mc);
}

// ---------- Instalação ----------
const emAndamento = new Map(); // evita instalar o mesmo loader duas vezes ao mesmo tempo

async function garantirLoader({ tipo, mc, versao } = {}, progresso = () => {}) {
  if (!tipo || tipo === 'vanilla') return mc;
  if (!NOMES[tipo]) throw new Error('Tipo de loader desconhecido.');
  if (typeof mc !== 'string' || !ID_VALIDO.test(mc)) throw new Error('Versão do Minecraft inválida.');
  if (versao != null && (typeof versao !== 'string' || !ID_VALIDO.test(versao))) {
    throw new Error(`Versão do ${NOMES[tipo]} inválida.`);
  }

  // Sem versão escolhida: a estável mais nova
  if (!versao) {
    const r = await listarLoaders(tipo, mc);
    if (!r.ok) throw new Error(r.mensagem);
    versao = (r.versoes.find((v) => v.estavel) || r.versoes[0]).id;
  }

  const chave = `${tipo}:${mc}:${versao}`;
  if (!emAndamento.has(chave)) {
    const fn = tipo === 'fabric' || tipo === 'quilt' ? instalarPerfil : instalarComInstalador;
    emAndamento.set(chave, fn(tipo, mc, versao, progresso).finally(() => emAndamento.delete(chave)));
  }
  return emAndamento.get(chave);
}

const jsonDaVersao = (id) => pasta('versions', id, `${id}.json`);

// Fabric e Quilt: o perfil pronto vem da API de metadados
async function instalarPerfil(tipo, mc, versao, progresso) {
  const nome = NOMES[tipo];
  const idPadrao = `${tipo}-loader-${versao}-${mc}`;
  if (fs.existsSync(jsonDaVersao(idPadrao))) return idPadrao;

  progresso({ etapa: `Baixando o ${nome} ${versao}...` });
  const base = tipo === 'fabric' ? FABRIC : QUILT;
  let perfil;
  try {
    perfil = await buscar(`${base}/${encodeURIComponent(mc)}/${encodeURIComponent(versao)}/profile/json`);
  } catch {
    throw new Error(`Não foi possível baixar o ${nome}. Verifique sua internet.`);
  }
  if (!perfil || !perfil.id || !perfil.inheritsFrom) {
    throw new Error(`O ${nome} ${versao} não existe para o ${mc}.`);
  }
  if (!ID_VALIDO.test(perfil.id)) throw new Error(`Perfil do ${nome} inválido.`);
  fs.mkdirSync(path.dirname(jsonDaVersao(perfil.id)), { recursive: true });
  fs.writeFileSync(jsonDaVersao(perfil.id), JSON.stringify(perfil, null, 2));
  return perfil.id;
}

// URL do instalador oficial
function urlInstalador(tipo, mc, versao) {
  if (tipo === 'forge') {
    const v = `${mc}-${versao}`;
    return `${FORGE_MAVEN}/${v}/forge-${v}-installer.jar`;
  }
  if (mc === '1.20.1') { // NeoForge do 1.20.1 usa o artefato antigo
    const v = `1.20.1-${versao}`;
    return `${NEO_MAVEN}/forge/${v}/forge-${v}-installer.jar`;
  }
  return `${NEO_MAVEN}/neoforge/${versao}/neoforge-${versao}-installer.jar`;
}

// Bibliotecas que o instalador gera (sem URL) precisam existir
function arquivosGeradosOk(id) {
  try {
    const json = JSON.parse(fs.readFileSync(jsonDaVersao(id), 'utf8'));
    return (json.libraries || []).every((l) => {
      const art = l.downloads && l.downloads.artifact;
      return !art || art.url || fs.existsSync(pasta('libraries', art.path || jogo.caminhoMaven(l.name)));
    });
  } catch {
    return false;
  }
}

// Forge e NeoForge: roda o instalador oficial com o Java do jogo
async function instalarComInstalador(tipo, mc, versao, progresso) {
  const nome = NOMES[tipo];
  const url = urlInstalador(tipo, mc, versao);
  const instalador = pasta('cache', 'instaladores', path.basename(url));

  progresso({ etapa: `Baixando o instalador do ${nome} ${versao}...` });
  try {
    await baixar(url, instalador);
  } catch (erro) {
    throw new Error(/HTTP 404/.test(erro.message)
      ? `O ${nome} ${versao} não existe para o ${mc}.`
      : `Não foi possível baixar o instalador do ${nome}. Verifique sua internet.`);
  }

  // O id da versão que o instalador cria está no version.json de dentro dele
  let id;
  let legado = null; // instaladores antigos (até ~1.12): install_profile.json com versionInfo
  let zip;
  try {
    zip = new AdmZip(instalador);
    const entrada = zip.getEntry('version.json');
    if (entrada) id = JSON.parse(zip.readAsText(entrada)).id;
    else {
      legado = JSON.parse(zip.readAsText(zip.getEntry('install_profile.json')));
      id = legado.versionInfo && legado.versionInfo.id;
    }
  } catch {
    fs.rmSync(instalador, { force: true }); // arquivo estragado: baixa de novo na próxima vez
    throw new Error(`O instalador do ${nome} está corrompido. Tente de novo.`);
  }
  if (!id || !ID_VALIDO.test(id)) throw new Error(`Não foi possível identificar a versão do ${nome}.`);
  if (fs.existsSync(jsonDaVersao(id)) && arquivosGeradosOk(id)) return id;

  // Os instaladores antigos não têm modo sem janela: fazemos o que eles fariam
  if (legado) return instalarLegado(zip, legado, mc, progresso);

  // O instalador precisa do vanilla e do Java certo
  const inst = await jogo.instalar(mc, progresso);
  const javaw = inst.java;
  const javaCli = path.join(path.dirname(javaw), 'java.exe'); // java.exe mostra a saída; javaw não
  const java = fs.existsSync(javaCli) ? javaCli : javaw;

  const perfis = pasta('launcher_profiles.json');
  if (!fs.existsSync(perfis)) fs.writeFileSync(perfis, JSON.stringify({ profiles: {} }, null, 2));

  const flag = tipo === 'forge' ? '--installClient' : '--install-client';
  progresso({ etapa: `Instalando o ${nome} ${versao} (pode levar alguns minutos)...` });
  const saida = await rodarInstalador(java, ['-jar', instalador, flag, RAIZ], (linha) => {
    const curta = linha.trim().slice(0, 90);
    if (curta) progresso({ etapa: `Instalando o ${nome}: ${curta}` });
  });

  fs.mkdirSync(pasta('logs'), { recursive: true });
  fs.writeFileSync(pasta('logs', `instalador-${tipo}.log`), saida.texto);
  if (saida.codigo !== 0 || !fs.existsSync(jsonDaVersao(id))) {
    const ultimas = saida.texto.trim().split(/\r?\n/).slice(-3).join(' | ');
    throw new Error(`O instalador do ${nome} falhou (código ${saida.codigo}). ${ultimas}`.trim());
  }
  return id;
}

// Forge antigo: copia o jar "universal" de dentro do instalador para libraries/ e grava o
// versionInfo como perfil (as outras bibliotecas o jogo.js baixa normalmente)
async function instalarLegado(zip, perfil, mc, progresso) {
  const { install, versionInfo } = perfil;
  if (!install || !install.path || !install.filePath) throw new Error('Instalador do Forge em formato desconhecido.');
  progresso({ etapa: 'Instalando o Forge...' });
  const jarUniversal = zip.getEntry(install.filePath);
  if (!jarUniversal) throw new Error('O instalador do Forge está incompleto.');
  const destino = pasta('libraries', jogo.caminhoMaven(install.path));
  if (!destino.startsWith(pasta('libraries') + path.sep)) throw new Error('Instalador do Forge inválido.');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, zip.readFile(jarUniversal));

  const json = {
    ...versionInfo,
    inheritsFrom: versionInfo.inheritsFrom || install.minecraft || mc,
    libraries: (versionInfo.libraries || []).map(({ checksums, serverreq, clientreq, ...lib }) => lib),
  };
  fs.mkdirSync(path.dirname(jsonDaVersao(json.id)), { recursive: true });
  fs.writeFileSync(jsonDaVersao(json.id), JSON.stringify(json, null, 2));
  return json.id;
}

function rodarInstalador(java, args, aoLinha) {
  return new Promise((resolve, reject) => {
    let texto = '';
    let resto = '';
    const proc = spawn(java, args, { cwd: RAIZ, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const ler = (pedaco) => {
      const s = pedaco.toString();
      texto += s;
      const linhas = (resto + s).split(/\r?\n/);
      resto = linhas.pop();
      for (const l of linhas) aoLinha(l);
    };
    proc.stdout.on('data', ler);
    proc.stderr.on('data', ler);
    proc.on('error', (erro) => reject(new Error(`Não foi possível rodar o Java: ${erro.message}`)));
    proc.on('close', (codigo) => resolve({ codigo, texto }));
  });
}

module.exports = { listarMc, listarLoaders, garantirLoader, mcDoNeoForge, comparar };
