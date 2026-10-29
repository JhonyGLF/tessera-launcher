// API do launcher. No Electron vem do preload (window.jg); fora dele (testes da
// interface) usa o mock com dados de exemplo.
// Toda função que devolve Promise é "blindada": se o processo principal lançar um erro,
// a interface recebe { ok:false, mensagem } em vez de uma exceção.
if (!window.jg) await import('./mock-api.js');

const bruta = window.jg;
const SINCRONAS = new Set(['minimizar', 'fechar']);

function mensagemDeErro(erro) {
  const texto = (erro && erro.message) || String(erro);
  // "Error invoking remote method 'x': Error: mensagem" → "mensagem"
  const partes = texto.split(/Error: /);
  return partes[partes.length - 1] || 'Algo deu errado.';
}

const api = {};
for (const nome of Object.keys(bruta)) {
  const fn = bruta[nome];
  if (typeof fn !== 'function') continue;
  if (SINCRONAS.has(nome) || nome.startsWith('ao')) { api[nome] = (...a) => fn(...a); continue; }
  api[nome] = async (...args) => {
    try {
      return await fn(...args);
    } catch (erro) {
      console.error(`[api] ${nome} falhou:`, erro);
      return { ok: false, mensagem: mensagemDeErro(erro) };
    }
  };
}

export { api };
