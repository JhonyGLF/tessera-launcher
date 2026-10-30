// Atualização automática do Tessera, pelos lançamentos do GitHub (JhonyGLF/tessera-launcher).
// - Instalador (NSIS): o electron-updater baixa a versão nova em segundo plano — conferida pelo
//   sha512 publicado no latest.yml — e ela é instalada ao reiniciar (ou ao fechar o launcher).
// - Portátil: um .exe portátil não consegue se substituir; só avisamos que há versão nova, com o
//   link da página de download.
// Só funciona no app empacotado. TESSERA_ATUALIZACAO_TESTE=<url> aponta para um servidor de teste.
const { app, shell } = require('electron');
const { EventEmitter } = require('events');
const config = require('./config');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const DONO = 'JhonyGLF';
const REPO = 'tessera-launcher';
const API_ULTIMA = `https://api.github.com/repos/${DONO}/${REPO}/releases/latest`;
const PAGINA = `https://github.com/${DONO}/${REPO}/releases/latest`;
const INTERVALO = 6 * 60 * 60 * 1000; // procura de novo a cada 6 h

const eventos = new EventEmitter();
const URL_TESTE = process.env.TESSERA_ATUALIZACAO_TESTE || null;
const portatil = () => !!process.env.PORTABLE_EXECUTABLE_DIR; // definido pelo .exe portátil
const ativo = () => app.isPackaged || !!URL_TESTE;

// estado: 'indisponivel' | 'parado' | 'verificando' | 'atualizado' | 'disponivel' | 'baixando' | 'pronta' | 'erro'
let atual = { estado: 'parado' };
function definir(novo) {
  atual = { ...novo, versaoAtual: app.getVersion(), portatil: portatil() };
  if (URL_TESTE) console.log('[atualizacao]', JSON.stringify(atual));
  eventos.emit('estado', atual);
}

// "1.10.0" > "1.9.3"; ignora o "v" do começo e sufixos como "-beta"
function maisNova(a, b) {
  const p = (v) => String(v).replace(/^v/, '').split('-')[0].split('.').map((n) => parseInt(n, 10) || 0);
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  }
  return false;
}

// Notas do lançamento como texto simples (a interface nunca as trata como HTML)
const notasTexto = (n) => (typeof n === 'string' ? n : Array.isArray(n) ? n.map((x) => x && x.note).join('\n') : '')
  .replace(/<[^>]*>/g, '').trim().slice(0, 2000);

// ---------- Portátil: só consulta a API do GitHub ----------
async function verificarPortatil() {
  definir({ estado: 'verificando' });
  try {
    const resp = await fetch(API_ULTIMA, {
      headers: { 'User-Agent': `Tessera-Launcher/${app.getVersion()}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    });
    if (resp.status === 404) return definir({ estado: 'atualizado' }); // ainda não há lançamentos
    if (!resp.ok) throw new Error(`GitHub respondeu ${resp.status}`);
    const r = await resp.json();
    if (r.draft || r.prerelease || !maisNova(r.tag_name, app.getVersion())) return definir({ estado: 'atualizado' });
    definir({ estado: 'disponivel', versao: String(r.tag_name).replace(/^v/, ''), notas: notasTexto(r.body), url: PAGINA });
  } catch {
    definir({ estado: 'erro', mensagem: 'Não foi possível procurar atualizações.' });
  }
}

// ---------- Instalador: electron-updater ----------
let atualizador = null;
function obterAtualizador() {
  if (atualizador) return atualizador;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = config.interno('atualizacaoAutomatica') !== false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;
  if (URL_TESTE) {
    // fora do app empacotado não existe o app-update.yml que o build gera: cria um temporário
    const configTeste = require('path').join(require('os').tmpdir(), 'tessera-atualizacao-teste.yml');
    require('fs').writeFileSync(configTeste, `provider: generic\nurl: ${URL_TESTE}\nupdaterCacheDirName: tessera-launcher-updater-teste\n`);
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.updateConfigPath = configTeste;
    autoUpdater.setFeedURL({ provider: 'generic', url: URL_TESTE });
  }
  let versao = null;
  autoUpdater.on('checking-for-update', () => definir({ estado: 'verificando' }));
  autoUpdater.on('update-not-available', () => definir({ estado: 'atualizado' }));
  autoUpdater.on('update-available', (info) => {
    versao = info.version;
    definir(autoUpdater.autoDownload ? { estado: 'baixando', versao, progresso: 0 } : { estado: 'disponivel', versao });
  });
  autoUpdater.on('download-progress', (p) => definir({ estado: 'baixando', versao, progresso: Math.max(0, Math.min(1, (p.percent || 0) / 100)) }));
  autoUpdater.on('update-downloaded', (info) => definir({ estado: 'pronta', versao: info.version, notas: notasTexto(info.releaseNotes) }));
  autoUpdater.on('error', (erro) => {
    const msg = String((erro && erro.message) || erro);
    if (URL_TESTE) console.log('[atualizacao:erro]', msg.slice(0, 400));
    // repositório ainda sem lançamentos: não é erro para o usuário
    if (/404|No published versions|Cannot find latest/i.test(msg)) return definir({ estado: 'atualizado' });
    definir({ estado: 'erro', mensagem: /sha512|checksum/i.test(msg)
      ? 'A atualização baixada não confere com a publicada e foi descartada.'
      : 'Não foi possível baixar a atualização.' });
  });
  atualizador = autoUpdater;
  return atualizador;
}

// ---------- API ----------
async function verificar() {
  if (!ativo()) { definir({ estado: 'indisponivel' }); return atual; }
  if (['verificando', 'baixando', 'pronta'].includes(atual.estado)) return atual;
  if (portatil()) await verificarPortatil();
  else {
    try {
      const updater = obterAtualizador();
      updater.autoDownload = config.interno('atualizacaoAutomatica') !== false;
      await updater.checkForUpdates();
    } catch { /* o evento 'error' já atualizou o estado */ }
  }
  return atual;
}

function instalar() {
  if (atual.estado === 'disponivel' && !portatil() && atualizador) {
    atualizador.downloadUpdate().catch(() => {});
    return { ok: true };
  }
  if (atual.estado === 'pronta' && !portatil() && atualizador) {
    // O popup fica num processo independente enquanto o instalador troca os arquivos do launcher.
    mostrarInstalacao();
    setImmediate(() => atualizador.quitAndInstall(true, true));
    return { ok: true };
  }
  if (atual.estado === 'disponivel' && portatil()) {
    shell.openExternal(PAGINA);
    return { ok: true };
  }
  return { ok: false, mensagem: 'Nenhuma atualização pronta.' };
}

function mostrarInstalacao() {
  const nome = `tessera-atualizacao-${process.pid}`;
  const script = path.join(os.tmpdir(), `${nome}.ps1`);
  const icone = path.join(os.tmpdir(), `${nome}.ico`);
  const origemIcone = path.join(app.getAppPath(), 'assets', 'icon.ico');
  try { fs.copyFileSync(origemIcone, icone); } catch {}
  const conteudo = String.raw`param([int]$OldPid, [string]$ExePath, [string]$IconPath)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form = New-Object Windows.Forms.Form
$form.Text = 'Tessera Launcher'
$form.FormBorderStyle = 'FixedDialog'
$form.StartPosition = 'CenterScreen'
$form.ClientSize = New-Object Drawing.Size(360, 190)
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ControlBox = $false
$form.TopMost = $true
$form.BackColor = [Drawing.Color]::FromArgb(22, 22, 26)
$form.ForeColor = [Drawing.Color]::White
if (Test-Path -LiteralPath $IconPath) { try { $form.Icon = New-Object Drawing.Icon($IconPath) } catch {} }
$logo = New-Object Windows.Forms.PictureBox
$logo.Size = New-Object Drawing.Size(44, 44)
$logo.Location = New-Object Drawing.Point(158, 24)
$logo.SizeMode = 'Zoom'
if (Test-Path -LiteralPath $IconPath) { try { $logo.Image = [Drawing.Icon]::new($IconPath).ToBitmap() } catch {} }
$form.Controls.Add($logo)
$label = New-Object Windows.Forms.Label
$label.Text = 'Instalando atualização'
$label.AutoSize = $false
$label.TextAlign = 'MiddleCenter'
$label.Font = New-Object Drawing.Font('Segoe UI', 14, [Drawing.FontStyle]::Bold)
$label.Location = New-Object Drawing.Point(20, 82)
$label.Size = New-Object Drawing.Size(320, 34)
$form.Controls.Add($label)
$bar = New-Object Windows.Forms.ProgressBar
$bar.Style = 'Marquee'
$bar.MarqueeAnimationSpeed = 24
$bar.Location = New-Object Drawing.Point(54, 137)
$bar.Size = New-Object Drawing.Size(252, 12)
$form.Controls.Add($bar)
$started = Get-Date
$seenNew = $false
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 500
$timer.Add_Tick({
  if (((Get-Date) - $started).TotalSeconds -ge 120) { $form.Close(); return }
  $old = Get-Process -Id $OldPid -ErrorAction SilentlyContinue
  if (-not $old) {
    $exeName = [IO.Path]::GetFileNameWithoutExtension($ExePath)
    $new = Get-Process -Name $exeName -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $ExePath }
    if ($new) { $script:seenNew = $true }
    if ($script:seenNew) { $form.Close() }
  }
})
$timer.Start()
$form.Add_Shown({ $form.Activate() })
[void]$form.ShowDialog()
$timer.Stop()
if ($logo.Image) { $logo.Image.Dispose() }
$form.Dispose()
Remove-Item -LiteralPath $IconPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $PSCommandPath -Force -ErrorAction SilentlyContinue`;
  try {
    fs.writeFileSync(script, `\uFEFF${conteudo}`, 'utf8');
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script, String(process.pid), app.getPath('exe'), icone], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {
      try { fs.unlinkSync(script); } catch {}
      try { fs.unlinkSync(icone); } catch {}
    });
    child.unref();
  } catch {
    try { fs.unlinkSync(script); } catch {}
    try { fs.unlinkSync(icone); } catch {}
  }
}

function iniciar() {
  if (!ativo()) { definir({ estado: 'indisponivel' }); return; }
  if (config.interno('atualizacaoAutomatica') !== false) setTimeout(verificar, URL_TESTE ? 1000 : 8000); // não atrasa a abertura do launcher
  setInterval(() => { if (config.interno('atualizacaoAutomatica') !== false) verificar(); }, INTERVALO).unref();
}

function configuracaoAlterada(antes) {
  const habilitada = config.interno('atualizacaoAutomatica') !== false;
  if (atualizador) atualizador.autoDownload = habilitada;
  if (habilitada && antes === false) verificar();
}

module.exports = { eventos, iniciar, verificar, instalar, configuracaoAlterada, estado: () => atual, maisNova };
