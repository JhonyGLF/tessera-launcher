// Contas do jogador: Microsoft (mesmo login do launcher oficial, via msmc) e offline.
// Ficam em %APPDATA%\Tessera Launcher\contas.json; tokens criptografados com o safeStorage (DPAPI).
// Política (igual ao Prism Launcher): conta offline só depois de adicionar uma conta
// Microsoft que tenha o Minecraft: Java Edition.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Auth } = require('msmc');
const config = require('./config');

const auth = new Auth('select_account');

const ERROS = {
  'error.gui.closed': 'Login cancelado.',
  'error.auth.xsts.userNotFound': 'Essa conta Microsoft não tem perfil Xbox. Crie um em xbox.com.',
  'error.auth.xsts.bannedCountry': 'O Xbox Live não está disponível no seu país.',
  'error.auth.xsts.child': 'Conta infantil: um adulto precisa adicioná-la a uma família Microsoft.',
  'error.auth.xsts.child.SK': 'Conta infantil: um adulto precisa adicioná-la a uma família Microsoft.',
  'error.auth.minecraft.profile': 'Essa conta não tem o Minecraft: Java Edition.',
  'error.auth.minecraft.entitlements': 'Essa conta não tem o Minecraft: Java Edition.',
};
const SEM_JOGO = 'Essa conta não tem o Minecraft: Java Edition.';

const codigoErro = (erro) => (typeof erro === 'string' ? erro : erro && (erro.ts || erro.message));

function traduzir(erro) {
  const codigo = codigoErro(erro);
  if (ERROS[codigo]) return ERROS[codigo];
  if (String(codigo).startsWith('error.auth')) return 'Falha no login da Microsoft. Tente de novo.';
  return 'Sem conexão com os servidores da Microsoft.';
}

// Token recusado pela Microsoft (expirado/revogado) ou conta sem o jogo — não adianta tentar de novo.
// Falha de rede ou erro 5xx é passageiro.
function tokenRecusado(erro) {
  const codigo = String(codigoErro(erro) || '');
  if (!codigo.startsWith('error.auth')) return false;
  const status = erro && erro.response && erro.response.status;
  return !status || status < 500;
}

// ---------- Arquivo ----------
const arquivo = () => path.join(app.getPath('userData'), 'contas.json');

function ler() {
  try {
    const dados = JSON.parse(fs.readFileSync(arquivo(), 'utf8'));
    return { ativa: dados.ativa || null, contas: Array.isArray(dados.contas) ? dados.contas : [] };
  } catch {
    return { ativa: null, contas: [] };
  }
}

function gravar(dados) {
  if (dados.ativa && !dados.contas.some((c) => c.id === dados.ativa)) dados.ativa = null;
  if (!dados.ativa && dados.contas.length) dados.ativa = dados.contas[0].id;
  fs.mkdirSync(path.dirname(arquivo()), { recursive: true });
  const tmp = `${arquivo()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2));
  fs.renameSync(tmp, arquivo());
}

const cifrar = (texto) => safeStorage.encryptString(texto).toString('base64');
function decifrar(base64) {
  if (!base64) return null;
  try {
    return safeStorage.decryptString(Buffer.from(base64, 'base64'));
  } catch {
    return null;
  }
}

// ---------- Utilidades ----------
const semHifen = (uuid) => String(uuid || '').replace(/-/g, '').toLowerCase();

// UUID offline igual ao do Java: UUID.nameUUIDFromBytes(("OfflinePlayer:" + nome).getBytes(UTF_8))
function uuidOffline(nome) {
  const h = crypto.createHash('md5').update(`OfflinePlayer:${nome}`, 'utf8').digest();
  h[6] = (h[6] & 0x0f) | 0x30; // versão 3
  h[8] = (h[8] & 0x3f) | 0x80; // variante IETF
  return h.toString('hex');
}

const publicaConta = ({ id, tipo, nome, uuid }) => ({ id, tipo, nome, uuid });

// ---------- Microsoft ----------
// Faz o fluxo Xbox → Minecraft e devolve os dados que guardamos da conta
async function perfilMinecraft(xbox) {
  const mc = await xbox.getMinecraft();
  if (!mc.profile || mc.isDemo()) throw new Error(SEM_JOGO);
  const skin = (mc.profile.skins || []).find((s) => s.state === 'ACTIVE');
  return {
    nome: mc.profile.name,
    uuid: semHifen(mc.profile.id),
    xuid: mc.xuid || '',
    skinUrl: skin ? skin.url : null,
    refresh: xbox.save(),
    acesso: mc.mcToken,
    expira: mc.exp,
  };
}

// Salva (ou atualiza, se o uuid já existir) uma conta Microsoft
function guardarMicrosoft(p, { ativar = true } = {}) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Não foi possível proteger o login neste PC.');
  const dados = ler();
  const id = `msa-${p.uuid}`;
  const conta = {
    id, tipo: 'msa', nome: p.nome, uuid: p.uuid, xuid: p.xuid, skinUrl: p.skinUrl,
    refresh: cifrar(p.refresh), acesso: cifrar(p.acesso), expira: p.expira,
  };
  const i = dados.contas.findIndex((c) => c.id === id || (c.tipo === 'msa' && c.uuid === p.uuid));
  if (i >= 0) dados.contas[i] = conta;
  else dados.contas.push(conta);
  if (ativar) dados.ativa = id;
  gravar(dados);
  // Já existe uma conta Microsoft: o token da versão antiga não é mais necessário
  if (config.interno('conta')) config.definirInterno({ conta: null });
  return conta;
}

async function adicionarMicrosoft() {
  try {
    const xbox = await auth.launch('electron', {
      width: 500, height: 650, title: 'Entrar com a Microsoft', autoHideMenuBar: true,
    });
    const conta = guardarMicrosoft(await perfilMinecraft(xbox));
    return { ok: true, conta: publicaConta(conta), ...listarSync() };
  } catch (erro) {
    return { ok: false, mensagem: erro instanceof Error && erro.message === SEM_JOGO ? SEM_JOGO : traduzir(erro) };
  }
}

// ---------- Migração da versão anterior (uma conta, token em config.json → "conta") ----------
let migracao = null;
function migrar() {
  if (migracao) return migracao;
  migracao = (async () => {
    const antigo = config.interno('conta');
    if (!antigo) return;
    const token = decifrar(antigo);
    if (!token) return config.definirInterno({ conta: null }); // ilegível: descarta
    try {
      guardarMicrosoft(await perfilMinecraft(await auth.refresh(token)), { ativar: !ler().ativa });
      config.definirInterno({ conta: null });
    } catch (erro) {
      if (erro instanceof Error && erro.message === SEM_JOGO) config.definirInterno({ conta: null });
      else if (tokenRecusado(erro)) config.definirInterno({ conta: null });
      // sem rede: mantém para tentar de novo na próxima abertura
    }
  })().catch(() => {});
  return migracao;
}

// ---------- API ----------
function listarSync() {
  const dados = ler();
  return {
    contas: dados.contas.map(publicaConta),
    ativa: dados.ativa,
    podeOffline: dados.contas.some((c) => c.tipo === 'msa'),
  };
}

async function listar() {
  // Espera a migração por no máximo 15 s (sem rede ela continua em segundo plano)
  await Promise.race([migrar(), new Promise((r) => setTimeout(r, 15000))]);
  return listarSync();
}

async function adicionarOffline(nome) {
  await migrar();
  nome = typeof nome === 'string' ? nome.trim() : '';
  if (!listarSync().podeOffline) {
    return { ok: false, mensagem: 'Adicione uma conta Microsoft com o Minecraft antes de criar contas offline.' };
  }
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nome)) {
    return { ok: false, mensagem: 'O nome deve ter de 3 a 16 caracteres: letras, números ou _.' };
  }
  const dados = ler();
  if (dados.contas.some((c) => c.tipo === 'offline' && c.nome.toLowerCase() === nome.toLowerCase())) {
    return { ok: false, mensagem: 'Já existe uma conta offline com esse nome.' };
  }
  const uuid = uuidOffline(nome);
  const conta = { id: `offline-${uuid}`, tipo: 'offline', nome, uuid };
  dados.contas.push(conta);
  dados.ativa = conta.id;
  gravar(dados);
  return { ok: true, conta: publicaConta(conta), ...listarSync() };
}

function remover(id) {
  const dados = ler();
  const antes = dados.contas.length;
  dados.contas = dados.contas.filter((c) => c.id !== id);
  if (dados.contas.length === antes) return { ok: false, mensagem: 'Conta não encontrada.' };
  gravar(dados);
  return { ok: true, ...listarSync() };
}

function selecionar(id) {
  const dados = ler();
  if (!dados.contas.some((c) => c.id === id)) return { ok: false, mensagem: 'Conta não encontrada.' };
  dados.ativa = id;
  gravar(dados);
  return { ok: true, ...listarSync() };
}

// Dados para iniciar o jogo. Contas Microsoft renovam o token se tiver vencido.
async function sessao(id) {
  await migrar();
  const dados = ler();
  const conta = dados.contas.find((c) => c.id === (id || dados.ativa));
  if (!conta) throw new Error(id ? 'Conta não encontrada.' : 'Adicione uma conta para jogar.');

  if (conta.tipo === 'offline') {
    return { tipo: 'offline', nome: conta.nome, uuid: conta.uuid, token: '0', xuid: '' };
  }

  // Token de acesso ainda válido por pelo menos 5 minutos: usa direto
  const acesso = decifrar(conta.acesso);
  if (acesso && conta.expira > Date.now() + 5 * 60000) {
    return { tipo: 'msa', nome: conta.nome, uuid: conta.uuid, token: acesso, xuid: conta.xuid || '' };
  }

  const refresh = decifrar(conta.refresh);
  if (!refresh) throw new Error(`O login de ${conta.nome} expirou. Remova a conta e adicione de novo.`);
  let p;
  try {
    p = await perfilMinecraft(await auth.refresh(refresh));
  } catch (erro) {
    if (erro instanceof Error && erro.message === SEM_JOGO) throw erro;
    if (tokenRecusado(erro)) throw new Error(`O login de ${conta.nome} expirou. Remova a conta e adicione de novo.`);
    throw new Error(traduzir(erro));
  }
  // A Microsoft troca o refresh token a cada uso: guarda o novo (e o nome/skin atualizados)
  guardarMicrosoft(p, { ativar: false });
  skins.delete(conta.uuid);
  return { tipo: 'msa', nome: p.nome, uuid: p.uuid, token: p.acesso, xuid: p.xuid };
}

// ---------- Skin (para desenhar a cabeça na interface) ----------
const skins = new Map(); // uuid → data URL

async function baixarDataUrl(url) {
  const resp = await fetch(url.replace(/^http:/, 'https:'), { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) return null;
  return 'data:image/png;base64,' + Buffer.from(await resp.arrayBuffer()).toString('base64');
}

// Skin atual pelo serviço público da Mojang (sem token); se falhar, usa a do último login
async function urlSkinAtual(uuid) {
  try {
    const resp = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const perfil = await resp.json();
    const prop = (perfil.properties || []).find((p) => p.name === 'textures');
    const texturas = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'));
    return (texturas.textures && texturas.textures.SKIN && texturas.textures.SKIN.url) || null;
  } catch {
    return null;
  }
}

async function skin(id) {
  const conta = ler().contas.find((c) => c.id === id);
  if (!conta || conta.tipo !== 'msa') return null; // offline: a interface desenha a cabeça padrão
  if (skins.has(conta.uuid)) return skins.get(conta.uuid);
  const url = (await urlSkinAtual(conta.uuid)) || conta.skinUrl;
  if (!url || !/^https?:\/\/textures\.minecraft\.net\//.test(url)) return null;
  try {
    const dados = await baixarDataUrl(url);
    if (dados) skins.set(conta.uuid, dados);
    return dados;
  } catch {
    return null;
  }
}

async function alterarSkin(id, base64, variante) {
  const dados = ler();
  const conta = dados.contas.find((c) => c.id === id && c.tipo === 'msa');
  if (!conta) return { ok: false, mensagem: 'Selecione uma conta Microsoft para trocar a skin.' };
  if (typeof base64 !== 'string' || base64.length > 3 * 1024 * 1024 || !['classic', 'slim'].includes(variante)) {
    return { ok: false, mensagem: 'Arquivo de skin inválido.' };
  }
  let imagem;
  try { imagem = Buffer.from(base64, 'base64'); } catch { return { ok: false, mensagem: 'Arquivo de skin inválido.' }; }
  if (imagem.length < 32 || imagem.length > 2 * 1024 * 1024 || !imagem.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { ok: false, mensagem: 'Escolha uma imagem PNG válida de skin.' };
  }
  const largura = imagem.readUInt32BE(16);
  const altura = imagem.readUInt32BE(20);
  if (largura !== 64 || ![32, 64].includes(altura)) {
    return { ok: false, mensagem: 'A skin precisa ter 64×64 ou 64×32 pixels.' };
  }

  const sessaoAtual = await sessao(id);
  const formulario = new FormData();
  formulario.append('variant', variante);
  formulario.append('file', new Blob([imagem], { type: 'image/png' }), 'skin.png');
  const resposta = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sessaoAtual.token}` },
    body: formulario,
    signal: AbortSignal.timeout(30000),
  });
  if (resposta.status === 401) return { ok: false, mensagem: 'A sessão Minecraft expirou. Entre novamente com sua conta Microsoft.' };
  if (resposta.status === 403) return { ok: false, mensagem: 'Esta conta não pode alterar a skin do Minecraft Java.' };
  if (resposta.status === 429) return { ok: false, mensagem: 'Muitas alterações de skin em pouco tempo. Tente novamente mais tarde.' };
  if (!resposta.ok) return { ok: false, mensagem: 'O serviço do Minecraft não aceitou essa skin. Confira o arquivo e tente novamente.' };

  const perfil = await resposta.json().catch(() => null);
  const skinAtiva = perfil && Array.isArray(perfil.skins) && perfil.skins.find((s) => s.state === 'ACTIVE');
  if (skinAtiva && skinAtiva.url) {
    const atualizado = ler();
    const salva = atualizado.contas.find((c) => c.id === id);
    if (salva) { salva.skinUrl = skinAtiva.url; gravar(atualizado); }
  }
  skins.delete(conta.uuid);
  return { ok: true };
}

module.exports = {
  listar, adicionarMicrosoft, adicionarOffline, remover, selecionar, sessao, skin, alterarSkin,
  uuidOffline, traduzir,
};
