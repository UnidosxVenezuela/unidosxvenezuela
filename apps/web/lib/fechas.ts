// Formato de fecha consistente dd/mm/aaaa (y con hora), determinístico y sin
// depender de que el runtime tenga el locale es-VE (en algunos entornos cae a
// en-US y muestra mm/dd/aaaa). Usa los getters locales de Date, así que en el
// navegador respeta la zona horaria del usuario.

function d2(n: number): string { return String(n).padStart(2, '0'); }

/** dd/mm/aaaa */
export function fechaCorta(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${d2(d.getDate())}/${d2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** dd/mm/aaaa HH:mm */
export function fechaHora(v: string | number | Date | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return '';
  return `${fechaCorta(d)} ${d2(d.getHours())}:${d2(d.getMinutes())}`;
}
