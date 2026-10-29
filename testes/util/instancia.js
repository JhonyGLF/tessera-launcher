// Cria uma instância vanilla 1.21.1 para os testes (funciona sem internet).
const path = require('path');
const fs = require('fs');
const instancias = require('../../launcher/instancias');
const { RAIZ } = require('../../launcher/jogo');

// sem internet, a validação da versão aceita uma versão "já instalada"
function prepararVersao() {
  const json = path.join(RAIZ, 'versions', '1.21.1', '1.21.1.json');
  if (!fs.existsSync(json)) {
    fs.mkdirSync(path.dirname(json), { recursive: true });
    fs.writeFileSync(json, '{}');
  }
}

async function criarInstanciaTeste(nome = 'Teste') {
  prepararVersao();
  const r = await instancias.criar({ nome, mc: '1.21.1', loader: { tipo: 'vanilla' }, icone: 'grama' });
  if (!r.ok) throw new Error(`não foi possível criar a instância de teste: ${r.mensagem}`);
  return r.instancia.id;
}

module.exports = { criarInstanciaTeste, prepararVersao };
