// Ícone personalizado de instância: imagens pequenas são ampliadas "pixel a pixel" para 128x128.
// (Electron 43+ mudou nativeImage.toBitmap(); a ampliação tem de continuar exata, sem borrar.)
const path = require('path');
const fs = require('fs');
const assert = require('node:assert/strict');
const { nativeImage } = require('electron');
const instancias = require('../launcher/instancias');
const { criarInstanciaTeste } = require('./util/instancia');
const { RAIZ } = require('../launcher/jogo');

// 16x16 em 4 quadrantes de cores puras (BGRA, que é o formato do bitmap no Windows)
const CORES = { se: [0, 0, 255], sd: [0, 255, 0], ie: [255, 0, 0], id: [255, 255, 255] }; // RGB
function imagemTeste() {
  const buf = Buffer.alloc(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const q = (y < 8 ? 's' : 'i') + (x < 8 ? 'e' : 'd');
      const [r, g, b] = CORES[q];
      buf.set([b, g, r, 255], (y * 16 + x) * 4);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: 16, height: 16 });
}

teste('imagem 16x16 vira 128x128 com as cores exatas em cada quadrante', async () => {
  const id = await criarInstanciaTeste('Icone');
  try {
    const arquivo = path.join(RAIZ, 'icone-teste.png');
    fs.writeFileSync(arquivo, imagemTeste().toPNG());
    const r = await instancias.definirIcone(id, { arquivo });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.instancia.icone, 'personalizado');

    const salvo = nativeImage.createFromPath(instancias.pasta(id, 'icon.png'));
    assert.deepEqual(salvo.getSize(), { width: 128, height: 128 });
    const px = salvo.toBitmap();
    const cor = (x, y) => { const i = (y * 128 + x) * 4; return [px[i + 2], px[i + 1], px[i]]; };
    // centro de cada quadrante e os pixels da borda entre eles (tem de ser nítido, sem mistura)
    assert.deepEqual(cor(32, 32), CORES.se);
    assert.deepEqual(cor(96, 32), CORES.sd);
    assert.deepEqual(cor(32, 96), CORES.ie);
    assert.deepEqual(cor(96, 96), CORES.id);
    assert.deepEqual(cor(63, 63), CORES.se, 'borda borrada');
    assert.deepEqual(cor(64, 64), CORES.id, 'borda borrada');
  } finally {
    await instancias.remover(id);
  }
});

teste('preset de ícone volta a funcionar depois do personalizado', async () => {
  const id = await criarInstanciaTeste('Icone Preset');
  try {
    const r = await instancias.definirIcone(id, { preset: 'diamante' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.instancia.icone, 'diamante');
    assert.ok(!fs.existsSync(instancias.pasta(id, 'icon.png')));
  } finally {
    await instancias.remover(id);
  }
});
