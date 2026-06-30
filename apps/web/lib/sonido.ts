'use client';

/**
 * Sonidos sutiles de interfaz (clic, éxito, error) generados con la Web Audio
 * API: sin archivos de audio, muy livianos. Respeta la preferencia del usuario
 * guardada en localStorage ('ux-sonido' = 'off' para silenciar).
 *
 * El AudioContext se crea/reanuda dentro del gesto del usuario (un clic), como
 * exige el navegador, así que el primer clic ya suena.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function sonidosActivos(): boolean {
  try {
    return typeof localStorage === 'undefined' || localStorage.getItem('ux-sonido') !== 'off';
  } catch {
    return true;
  }
}

export function setSonidos(activos: boolean): void {
  try {
    localStorage.setItem('ux-sonido', activos ? 'on' : 'off');
  } catch {
    /* sin localStorage: no pasa nada */
  }
}

/** Un tono breve con envolvente suave (ataque rápido, caída exponencial). */
function tono(freq: number, dur: number, tipo: OscillatorType, volumen: number, retraso = 0): void {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + retraso;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(volumen, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Clic suave al presionar un botón. */
export function clic(): void {
  if (!sonidosActivos()) return;
  tono(430, 0.06, 'triangle', 0.035);
}

/** Dos notas ascendentes: acción completada con éxito. */
export function exito(): void {
  if (!sonidosActivos()) return;
  tono(660, 0.12, 'sine', 0.05);
  tono(880, 0.16, 'sine', 0.045, 0.1);
}

/** Dos notas graves: algo salió mal. */
export function error(): void {
  if (!sonidosActivos()) return;
  tono(320, 0.16, 'sawtooth', 0.04);
  tono(232, 0.22, 'sawtooth', 0.038, 0.1);
}
