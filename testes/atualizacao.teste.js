// Comparação de versões usada no aviso de atualização da versão portátil.
const assert = require('node:assert/strict');
const { maisNova } = require('../launcher/atualizacao');

teste('compara versões numericamente (não como texto)', () => {
  assert.equal(maisNova('1.10.0', '1.9.3'), true);
  assert.equal(maisNova('v1.0.1', '1.0.0'), true);
  assert.equal(maisNova('2.0', '1.99.99'), true);
  assert.equal(maisNova('1.0.0', '1.0.0'), false);
  assert.equal(maisNova('v1.0.0', '1.0.1'), false);
  assert.equal(maisNova('1.0', '1.0.0'), false);
});

teste('sufixos de pré-lançamento não contam como versão mais nova', () => {
  assert.equal(maisNova('1.0.0-beta.2', '1.0.0'), false);
  assert.equal(maisNova('1.1.0-beta', '1.0.0'), true);
});
