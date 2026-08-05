// Utilidades de TEXTO compartidas (cliente y servidor). Funciones PURAS, sin
// dependencias de servidor: se pueden importar desde componentes cliente.
//
// `escaparHtml` vivía privada dentro de `lib/telegram.ts`. Al aparecer un segundo
// consumidor —el correo institucional (0217), que interpola variables dentro de un
// cuerpo HTML— se extrajo aquí en vez de duplicarla: dos copias de un escapador son
// dos sitios donde olvidar un carácter.

/**
 * Escapa el texto para insertarlo como CONTENIDO de un nodo HTML (o en un mensaje
 * de Telegram con `parse_mode: 'HTML'`, que solo reconoce estas tres entidades).
 *
 * OJO: no sirve para valores de ATRIBUTO (`href="…"`, `title="…"`), donde además
 * hay que escapar comillas. En este repositorio nunca se interpola en atributos:
 * las plantillas de correo sustituyen variables solo en el cuerpo del texto.
 */
export function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
