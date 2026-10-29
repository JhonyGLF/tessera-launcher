// Monta um zip byte a byte, com os nomes de entrada exatamente como passados.
// (O adm-zip normaliza nomes ao criar arquivos, o que esconderia ataques como "overrides/./x".)
// entradas: [{ nome, dados: Buffer|string, declarado? }]
// declarado: tamanho descompactado escrito no cabeçalho (para simular zips maliciosos)
const zlib = require('zlib');

const TABELA = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = TABELA[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipCru(entradas) {
  const locais = [];
  const central = [];
  let deslocamento = 0;
  for (const { nome, dados, declarado } of entradas) {
    const n = Buffer.from(nome, 'utf8');
    const conteudo = Buffer.isBuffer(dados) ? dados : Buffer.from(String(dados));
    const comprimido = zlib.deflateRawSync(conteudo);
    const crc = crc32(conteudo);
    const tamanho = declarado != null ? declarado >>> 0 : conteudo.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6); // nomes em UTF-8
    local.writeUInt16LE(8, 8);     // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(tamanho, 22);
    local.writeUInt16LE(n.length, 26);
    locais.push(local, n, comprimido);

    const cab = Buffer.alloc(46);
    cab.writeUInt32LE(0x02014b50, 0);
    cab.writeUInt16LE(20, 4);
    cab.writeUInt16LE(20, 6);
    cab.writeUInt16LE(0x800, 8);
    cab.writeUInt16LE(8, 10);
    cab.writeUInt32LE(crc, 16);
    cab.writeUInt32LE(comprimido.length, 20);
    cab.writeUInt32LE(tamanho, 24);
    cab.writeUInt16LE(n.length, 28);
    cab.writeUInt32LE(deslocamento, 42);
    central.push(cab, n);

    deslocamento += 30 + n.length + comprimido.length;
  }
  const diretorio = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}

module.exports = { zipCru };
