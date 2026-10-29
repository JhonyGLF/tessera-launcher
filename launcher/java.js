// Baixa o Java certo para cada versão, direto do catálogo oficial da Mojang
// (o mesmo que o launcher oficial usa). Fica em .tessera\runtime\<componente>.
const fs = require('fs');
const path = require('path');
const { baixar, emLote } = require('./download');

const CATALOGO = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
const PLATAFORMA = { x64: 'windows-x64', ia32: 'windows-x86', arm64: 'windows-arm64' }[process.arch] || 'windows-x64';
const UM_DIA = 24 * 60 * 60 * 1000;
const SEM_INTERNET = 'Sem internet para baixar o Java deste jogo. Conecte-se e tente de novo.';

// Catálogo do Java: consulta a internet no máximo uma vez por dia (muda raramente).
// Sem internet, usa a última cópia em disco; sem cópia, devolve null.
async function lerCatalogo(raiz) {
  const arquivo = path.join(raiz, 'cache', 'java-runtime-catalogo.json');
  let copia = null;
  try { copia = JSON.parse(fs.readFileSync(arquivo, 'utf8')); } catch {}
  if (copia && Date.now() - (copia.em || 0) < UM_DIA) return copia.dados;
  try {
    const resp = await fetch(CATALOGO, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const dados = await resp.json();
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify({ em: Date.now(), dados }));
    return dados;
  } catch {
    return copia ? copia.dados : null;
  }
}

async function prepararJava(raiz, componente, progresso) {
  const pasta = path.join(raiz, 'runtime', componente);
  const javaw = path.join(pasta, 'bin', 'javaw.exe');
  // versão instalada (a marca é gravada só depois do download completo)
  const lerMarca = (nome) => { try { return fs.readFileSync(path.join(pasta, nome), 'utf8'); } catch { return null; } };
  const instalada = fs.existsSync(javaw) ? lerMarca('.tessera-ok') || lerMarca('.jgclient-ok') : null; // .jgclient-ok: do tempo do JG Client

  progresso({ etapa: 'Verificando o Java...' });
  const catalogo = await lerCatalogo(raiz);
  const opcoes = catalogo && (catalogo[PLATAFORMA] || {})[componente];
  if (!opcoes || !opcoes.length) {
    if (instalada) return javaw; // sem internet (ou catálogo sem o componente): usa o que já tem
    if (!catalogo) throw new Error(SEM_INTERNET);
    throw new Error(`Java "${componente}" não disponível para este PC.`);
  }
  const { manifest, version } = opcoes[0];

  // Já instalado nessa mesma versão: pula a verificação arquivo por arquivo
  if (instalada === version.name) return javaw;

  let files;
  try {
    files = (await (await fetch(manifest.url, { signal: AbortSignal.timeout(15000) })).json()).files;
  } catch {
    if (instalada) return javaw; // não deu para buscar a versão nova agora: segue com a instalada
    throw new Error(SEM_INTERNET);
  }
  const arquivos = [];
  for (const [nome, info] of Object.entries(files)) {
    const destino = path.join(pasta, nome);
    if (info.type === 'directory') fs.mkdirSync(destino, { recursive: true });
    else if (info.type === 'file') arquivos.push({ destino, ...info.downloads.raw });
  }
  await emLote(arquivos, (a) => baixar(a.url, a.destino, { size: a.size, sha1: a.sha1 }),
    (feitos, total) => progresso({ etapa: `Baixando o Java ${version.name}`, feitos, total }));

  fs.writeFileSync(path.join(pasta, '.tessera-ok'), version.name);
  return javaw;
}

module.exports = { prepararJava };
