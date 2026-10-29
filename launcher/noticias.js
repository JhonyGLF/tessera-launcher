// Novidades: notas de atualização do Minecraft: Java Edition (feed oficial do launcher da Mojang).
// Cache em memória por 30 min; sem internet, usa a última lista salva em disco.
const fs = require('fs');
const path = require('path');
const { RAIZ } = require('./jogo');
const { limparHtml } = require('./modrinth');

const BASE = 'https://launchercontent.mojang.com';
const FEED = `${BASE}/v2/javaPatchNotes.json`;
const QUANTIDADE = 30;             // notícias mais recentes
const VALIDADE_MS = 30 * 60 * 1000;
const ARQ_CACHE = () => path.join(RAIZ, 'cache', 'noticias.json');

let memoria = null;                // { em, noticias }
const corpos = new Map();          // id → corpoHtml (o conteúdo de cada nota não muda)
let emAndamento = null;

const absoluto = (url) => (url && url.startsWith('/') ? BASE + url : url || null);
const escapar = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function baixarJson(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

// O resumo do feed vem cortado no meio da palavra: termina com reticências
function resumir(texto) {
  const t = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!t || /[.!?…]$/.test(t)) return t;
  return t.replace(/\s+\S*$/, '') + '…';
}

async function buscarCorpo(entrada) {
  if (corpos.has(entrada.id)) return corpos.get(entrada.id);
  try {
    const nota = await baixarJson(`${BASE}/v2/${entrada.contentPath}`);
    const html = limparHtml(nota.body || '', BASE);
    corpos.set(entrada.id, html);
    return html;
  } catch {
    return null;
  }
}

function lerDisco() {
  try {
    return JSON.parse(fs.readFileSync(ARQ_CACHE(), 'utf8'));
  } catch {
    return null;
  }
}

function salvarDisco(dados) {
  try {
    fs.mkdirSync(path.dirname(ARQ_CACHE()), { recursive: true });
    fs.writeFileSync(ARQ_CACHE(), JSON.stringify(dados));
  } catch { /* cache é opcional */ }
}

async function atualizar() {
  const feed = await baixarJson(FEED);
  const anteriores = new Map(((lerDisco() || {}).noticias || []).map((n) => [n.id, n]));
  const entradas = [...(feed.entries || [])]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, QUANTIDADE);

  // conteúdo completo de cada nota (até 6 ao mesmo tempo)
  const noticias = new Array(entradas.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < entradas.length) {
      const i = proximo++;
      const e = entradas[i];
      const resumo = resumir(e.shortText);
      const salvo = anteriores.get(e.id);
      if (salvo && salvo.corpoHtml && !corpos.has(e.id)) corpos.set(e.id, salvo.corpoHtml);
      const corpo = await buscarCorpo(e);
      noticias[i] = {
        id: e.id,
        titulo: e.title,
        versao: e.version,
        tipo: e.type,                     // 'release' | 'snapshot'
        data: e.date,
        imagemUrl: absoluto(e.image && e.image.url),
        resumo,
        corpoHtml: corpo || (resumo ? `<p>${escapar(resumo)}</p>` : ''),
      };
    }
  };
  await Promise.all(Array.from({ length: 6 }, trabalhador));

  memoria = { em: Date.now(), noticias };
  salvarDisco(memoria);
  return noticias;
}

async function listar() {
  if (memoria && Date.now() - memoria.em < VALIDADE_MS) return { ok: true, noticias: memoria.noticias };
  try {
    // várias chamadas ao mesmo tempo esperam a mesma busca
    emAndamento = emAndamento || atualizar().finally(() => { emAndamento = null; });
    return { ok: true, noticias: await emAndamento };
  } catch {
    const disco = memoria || lerDisco();
    if (disco && disco.noticias && disco.noticias.length) return { ok: true, noticias: disco.noticias, offline: true };
    return { ok: false, mensagem: 'Não foi possível carregar as novidades. Verifique sua internet.' };
  }
}

module.exports = { listar };
