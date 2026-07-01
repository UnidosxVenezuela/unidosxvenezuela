// Documentos legales para renderizar en la app (páginas /legal/*). El texto vive
// en legal-contenido.ts (generado desde docs/legal/*.md). Este módulo aporta el
// índice y un conversor de markdown a HTML seguro (contenido propio).
import { TERMINOS, PRIVACIDAD, DESCARGO } from './legal-contenido';
import { LEGAL_VERSION } from './legal-version';

export { LEGAL_VERSION };

export type DocLegal = { slug: string; titulo: string; md: string };

export const DOCS_LEGALES: Record<string, DocLegal> = {
  terminos: { slug: 'terminos', titulo: 'Términos y Condiciones de Uso', md: TERMINOS },
  privacidad: { slug: 'privacidad', titulo: 'Aviso de Privacidad y Protección de Datos', md: PRIVACIDAD },
  descargo: { slug: 'descargo', titulo: 'Descargo de Responsabilidad', md: DESCARGO },
};
export const LISTA_LEGAL: DocLegal[] = Object.values(DOCS_LEGALES);

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function inline(s: string) {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Convierte el markdown de los documentos legales (contenido propio) a HTML. */
export function renderLegalHtml(md: string): string {
  const lines = md.split('\n');
  let html = '';
  let para: string[] = [], list: string[] = [], quote: string[] = [];
  const fP = () => { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } };
  const fL = () => { if (list.length) { html += '<ul>' + list.map((li) => '<li>' + inline(li) + '</li>').join('') + '</ul>'; list = []; } };
  const fQ = () => { if (quote.length) { html += '<blockquote>' + inline(quote.join(' ')) + '</blockquote>'; quote = []; } };
  const fAll = () => { fP(); fL(); fQ(); };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (/^>\s?/.test(line)) { fP(); fL(); quote.push(line.replace(/^>\s?/, '')); continue; }
    fQ();
    if (line.trim() === '') { fAll(); continue; }
    if (/^###\s+/.test(line)) { fAll(); html += '<h3>' + inline(line.replace(/^###\s+/, '')) + '</h3>'; continue; }
    if (/^##\s+/.test(line)) { fAll(); html += '<h2>' + inline(line.replace(/^##\s+/, '')) + '</h2>'; continue; }
    if (/^#\s+/.test(line)) { fAll(); html += '<h1>' + inline(line.replace(/^#\s+/, '')) + '</h1>'; continue; }
    if (/^---+\s*$/.test(line)) { fAll(); html += '<hr>'; continue; }
    if (/^[-*]\s+/.test(line)) { fP(); list.push(line.replace(/^[-*]\s+/, '')); continue; }
    if (list.length && /^\s+\S/.test(raw)) { list[list.length - 1] += ' ' + line.trim(); continue; }
    fL();
    para.push(line);
  }
  fAll();
  return html;
}
