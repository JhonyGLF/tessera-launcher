// Downloads com verificação (tamanho/SHA-1), novas tentativas e paralelismo.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

// Considera o arquivo pronto se existe e bate o tamanho (rápido).
// Sem tamanho conhecido, confere o SHA-1.
function pronto(destino, { size, sha1: hash } = {}) {
  try {
    const st = fs.statSync(destino);
    if (size != null) return st.size === size;
    if (hash) return sha1(fs.readFileSync(destino)) === hash;
    return st.size > 0;
  } catch {
    return false;
  }
}

async function baixar(url, destino, info = {}) {
  if (pronto(destino, info)) return false;
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const dados = Buffer.from(await resp.arrayBuffer());
      if (info.sha1 && sha1(dados) !== info.sha1) throw new Error('arquivo corrompido');
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      const tmp = `${destino}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.part`;
      fs.writeFileSync(tmp, dados);
      fs.renameSync(tmp, destino);
      return true;
    } catch (erro) {
      ultimoErro = erro;
      await new Promise((r) => setTimeout(r, 600 * tentativa));
    }
  }
  throw new Error(`Falha ao baixar ${path.basename(destino)} (${ultimoErro.message})`);
}

async function baixarJson(url, destino, info) {
  await baixar(url, destino, info);
  return JSON.parse(fs.readFileSync(destino, 'utf8'));
}

// Executa fn em todos os itens, até `limite` ao mesmo tempo, avisando o progresso.
async function emLote(itens, fn, aoAvancar, limite = 16) {
  let feitos = 0;
  let proximo = 0;
  aoAvancar(0, itens.length);
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const item = itens[proximo++];
      await fn(item);
      aoAvancar(++feitos, itens.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
}

module.exports = { baixar, baixarJson, emLote, pronto };
