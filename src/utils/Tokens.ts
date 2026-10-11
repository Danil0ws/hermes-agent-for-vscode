/**
 * Heurística ÚNICA de estimativa de tokens (chars/4).
 *
 * Não é medição: o Hermes é quem mede. Aqui só se estima o que ainda não foi enviado
 * (chips, arquivos, instruções) e o detalhamento por categoria, sempre rotulado "estimado"
 * na UI. O total da janela e o usado vêm de `usage_update`.
 */
import { readFileSync } from 'node:fs';

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateFileTokens(path: string): number {
  try { return estimateTokens(readFileSync(path, 'utf8')); } catch { return 0; }
}

/** Limiares do medidor (tokens de tema, nunca cores literais). */
export function meterLevel(used: number, size: number): 'ok' | 'warn' | 'critical' {
  if (size <= 0) return 'ok';
  const pct = (used / size) * 100;
  if (pct > 90) return 'critical';
  if (pct >= 70) return 'warn';
  return 'ok';
}

export function percent(used: number, size: number): number {
  return size > 0 ? Math.round((used / size) * 100) : 0;
}
