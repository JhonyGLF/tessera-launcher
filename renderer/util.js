// Utilidades da interface: formatação em pt-BR e um hook para carregar dados.
import { useCallback, useEffect, useRef, useState } from './vendor/preact-htm.js';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

// 37 h 12 min · 45 min · menos de 1 min
export function formatarTempo(ms) {
  if (!ms || ms < MIN) return ms ? 'menos de 1 min' : '0 min';
  const h = Math.floor(ms / HORA);
  const m = Math.floor((ms % HORA) / MIN);
  if (!h) return `${m} min`;
  return m && h < 100 ? `${h} h ${m} min` : `${h} h`;
}

// agora mesmo · há 5 min · há 2 h · ontem · há 3 dias · 12 de set.
export function tempoRelativo(quando) {
  if (!quando) return 'nunca';
  const t = typeof quando === 'number' ? quando : Date.parse(quando);
  if (Number.isNaN(t)) return '';
  const d = Date.now() - t;
  if (d < MIN) return 'agora mesmo';
  if (d < HORA) return `há ${Math.floor(d / MIN)} min`;
  if (d < DIA) return `há ${Math.floor(d / HORA)} h`;
  if (d < 2 * DIA) return 'ontem';
  if (d < 30 * DIA) return `há ${Math.floor(d / DIA)} dias`;
  return formatarData(t);
}

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' });
export function formatarData(quando) {
  const t = typeof quando === 'number' ? quando : Date.parse(quando);
  return Number.isNaN(t) ? '' : fmtData.format(t).replace(/\./g, '');
}

const fmtCompacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fmtNumero = new Intl.NumberFormat('pt-BR');
export const numeroCompacto = (n) => fmtCompacto.format(n || 0);
export const numero = (n) => fmtNumero.format(n || 0);

export function formatarBytes(b) {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  const u = ['KB', 'MB', 'GB', 'TB'];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${u[i]}`;
}

// 4096 → "4 GB", 4608 → "4,5 GB"
export const formatarRam = (mb) => `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`;

export const NOMES_LOADER = { vanilla: 'Vanilla', fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };
export const nomeLoader = (tipo) => NOMES_LOADER[tipo] || tipo || 'Vanilla';

// "1.21.11 · Fabric 0.17.2"
export function textoVersao(inst) {
  if (!inst) return '';
  const l = inst.loader || { tipo: 'vanilla' };
  if (!l.tipo || l.tipo === 'vanilla') return `${inst.mc} · Vanilla`;
  return `${inst.mc} · ${nomeLoader(l.tipo)}${l.versao ? ` ${l.versao}` : ''}`;
}

// Junta classes ignorando falsos: cls('a', x && 'b')
export const cls = (...c) => c.filter(Boolean).join(' ');

// Garante um array vindo da API (aceita lista direta ou { ok, [chave]: [...] })
export function lista(r, chave) {
  if (Array.isArray(r)) return r;
  if (r && chave && Array.isArray(r[chave])) return r[chave];
  return [];
}

// Hook para carregar dados assíncronos: const { dados, carregando, erro, recarregar } = useCarregar(() => api.x(), [dep])
// Se a função devolver { ok:false, mensagem }, vira erro.
export function useCarregar(fn, deps = []) {
  const [estado, setEstado] = useState({ dados: null, carregando: true, erro: null });
  const versao = useRef(0);
  const carregar = useCallback(async () => {
    const minha = ++versao.current;
    setEstado((e) => ({ ...e, carregando: true, erro: null }));
    try {
      const r = await fn();
      if (minha !== versao.current) return;
      if (r && r.ok === false) setEstado({ dados: null, carregando: false, erro: r.mensagem || 'Algo deu errado.' });
      else setEstado({ dados: r, carregando: false, erro: null });
    } catch (e) {
      if (minha === versao.current) setEstado({ dados: null, carregando: false, erro: (e && e.message) || String(e) });
    }
  }, deps);
  useEffect(() => { carregar(); }, [carregar]);
  return { ...estado, recarregar: carregar };
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
