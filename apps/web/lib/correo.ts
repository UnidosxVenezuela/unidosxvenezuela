// Plantillas de correo institucional (0217): variables, render y saneado.
// Funciones PURAS (sin dependencias de servidor): las usa tanto la previsualización
// en cliente como la Server Action que envía. Un solo sitio donde vive la regla, para
// que lo que se ve en la previsualización sea EXACTAMENTE lo que sale.
import { escaparHtml } from './texto';

/** Variables de plantilla: `{{nombre}}`, `{{organizacion}}`… */
const VARIABLE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Nombres de variable presentes en los textos dados, sin repetir y en orden de aparición. */
export function extraerVariables(...textos: (string | null | undefined)[]): string[] {
  const vistas = new Set<string>();
  for (const t of textos) {
    for (const m of String(t ?? '').matchAll(VARIABLE)) {
      const v = m[1];
      if (v) vistas.add(v);
    }
  }
  return Array.from(vistas);
}

/** Etiqueta legible de una variable (`fecha_limite` → «Fecha limite»). */
export function etiquetaVariable(v: string): string {
  const s = v.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sustituye las variables en TEXTO PLANO (el asunto). Lo que falte queda vacío. */
export function renderizarTexto(plantilla: string, valores: Record<string, string>): string {
  return String(plantilla ?? '').replace(VARIABLE, (_, k: string) => (valores[k] ?? '').trim());
}

/** Sustituye las variables dentro de un cuerpo HTML, ESCAPANDO cada valor: lo que
 *  escribe la persona es texto, nunca marcado. */
export function renderizarHtml(cuerpoHtml: string, valores: Record<string, string>): string {
  return String(cuerpoHtml ?? '').replace(VARIABLE, (_, k: string) => escaparHtml((valores[k] ?? '').trim()));
}

/** Variables declaradas por la plantilla que quedaron sin llenar. Un correo
 *  institucional con «Estimado/a :» es peor que un error, así que se bloquea. */
export function variablesFaltantes(variables: string[], valores: Record<string, string>): string[] {
  return (variables ?? []).filter((v) => !String(valores[v] ?? '').trim());
}

/**
 * Saneado del HTML de una plantilla antes de mostrarlo o enviarlo. Las plantillas las
 * escribe gente del departamento (o administración) con HTML libre; esto evita que un
 * cuerpo con `<script>` o `onerror=` se ejecute en la previsualización de otra persona
 * o llegue al buzón del destinatario. Lista negra deliberadamente estrecha: se recorta
 * lo ejecutable, no el formato.
 */
export function sanearHtmlCorreo(html: string): string {
  return String(html ?? '')
    // Elementos ejecutables o que cargan recursos externos, con y sin cierre.
    .replace(/<\s*(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|style|iframe|object|embed|form|link|meta|base)\b[^>]*>/gi, '')
    // Manejadores de evento en cualquier etiqueta (onclick=, onerror=…).
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
    // Esquemas peligrosos en enlaces e imágenes.
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, '$1=$2#$2');
}

/** Cuerpo final del correo: variables sustituidas y HTML saneado. */
export function cuerpoFinal(cuerpoHtml: string, valores: Record<string, string>): string {
  return sanearHtmlCorreo(renderizarHtml(cuerpoHtml, valores));
}

/** Vista previa en TEXTO de un cuerpo HTML (para listados y tarjetas compactas). */
export function resumenTexto(html: string, tope = 160): string {
  const plano = String(html ?? '')
    .replace(/<\s*\/?(p|br|div|li|tr|h[1-6])\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return plano.length > tope ? plano.slice(0, tope - 1) + '…' : plano;
}
