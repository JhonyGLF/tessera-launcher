// Testes de regressão do backend: `npm run testar` (ou `npm run testar -- mrpack` para filtrar).
// Rodam dentro do Electron (os módulos usam require('electron')), com pastas temporárias:
// nunca tocam em %APPDATA%\.tessera nem nas contas reais.
const path = require('path');
const fs = require('fs');
const os = require('os');
const electron = require('electron');

// Com ELECTRON_RUN_AS_NODE (terminal do VS Code) o Electron vira Node puro e require('electron')
// devolve só o caminho do executável: reabre como app de verdade.
if (typeof electron === 'string') {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const r = require('child_process').spawnSync(electron, [__filename, ...process.argv.slice(2)], { stdio: 'inherit', env });
  process.exit(r.status == null ? 1 : r.status);
}

const { app } = electron;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-testes-'));
process.env.JG_RAIZ = path.join(temp, 'raiz');
app.setPath('userData', path.join(temp, 'userData'));

const casos = [];
global.teste = (nome, fn) => casos.push({ nome, fn });

const filtro = process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('executar.js'));
const arquivos = fs.readdirSync(__dirname)
  .filter((a) => a.endsWith('.teste.js') && (!filtro || a.includes(filtro)))
  .sort();

app.whenReady().then(async () => {
  let falhas = 0;
  let pulados = 0;
  for (const arquivo of arquivos) {
    casos.length = 0;
    console.log(`\n${arquivo}`);
    require(path.join(__dirname, arquivo));
    for (const { nome, fn } of casos) {
      try {
        const r = await fn();
        if (r === 'pular') { pulados++; console.log(`  - ${nome} (pulado: sem internet)`); }
        else console.log(`  ✔ ${nome}`);
      } catch (erro) {
        falhas++;
        console.log(`  ✘ ${nome}\n      ${String((erro && erro.message) || erro).split('\n').join('\n      ')}`);
      }
    }
  }
  console.log(`\n${falhas ? `${falhas} falha(s)` : 'Tudo certo'}${pulados ? ` · ${pulados} pulado(s)` : ''}`);
  try { fs.rmSync(temp, { recursive: true, force: true }); } catch {}
  app.exit(falhas ? 1 : 0);
});
