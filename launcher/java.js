// Baixa o Java certo para cada versão, direto do catálogo oficial da Mojang
// (o mesmo que o launcher oficial usa). Fica em .tessera\runtime\<componente>.
const fs = require('fs');
const path = require('path');
const { baixar, emLote } = require('./download');

const CATALOGO = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';
const PLATAFORMA = { x64: 'windows-x64', ia32: 'windows-x86', arm64: 'windows-arm64' }[process.arch] || 'windows-x64';

async function prepararJava(raiz, componente, progresso) {
  const pasta = path.join(raiz, 'runtime', componente);
  const javaw = path.join(pasta, 'bin', 'javaw.exe');
  const marca = path.join(pasta, '.tessera-ok');
  const marcaAntiga = path.join(pasta, '.jgclient-ok'); // do tempo do JG Client

  progresso({ etapa: 'Verificando o Java...' });
  const catalogo = await (await fetch(CATALOGO)).json();
  const opcoes = (catalogo[PLATAFORMA] || {})[componente];
  if (!opcoes || !opcoes.length) throw new Error(`Java "${componente}" não disponível para este PC.`);
  const { manifest, version } = opcoes[0];

  // Já instalado nessa mesma versão: pula a verificação arquivo por arquivo
  const marcou = (m) => fs.existsSync(m) && fs.readFileSync(m, 'utf8') === version.name;
  if (fs.existsSync(javaw) && (marcou(marca) || marcou(marcaAntiga))) {
    return javaw;
  }

  const { files } = await (await fetch(manifest.url)).json();
  const arquivos = [];
  for (const [nome, info] of Object.entries(files)) {
    const destino = path.join(pasta, nome);
    if (info.type === 'directory') fs.mkdirSync(destino, { recursive: true });
    else if (info.type === 'file') arquivos.push({ destino, ...info.downloads.raw });
  }
  await emLote(arquivos, (a) => baixar(a.url, a.destino, { size: a.size, sha1: a.sha1 }),
    (feitos, total) => progresso({ etapa: `Baixando o Java ${version.name}`, feitos, total }));

  fs.writeFileSync(marca, version.name);
  return javaw;
}

module.exports = { prepararJava };
