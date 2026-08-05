import { redirect } from 'next/navigation';
import { PARAM_CELEBRACION, type EventoCelebracion } from './celebraciones';

/**
 * Redirige agregando un mensaje de éxito que el <Toast/> muestra y limpia.
 *
 * `celebrar` (opcional) pide además una CELEBRACIÓN: añade `?celebrar=<evento>`,
 * que `CelebracionProveedor` lee para sacar una animación de la baraja. Es el
 * único canal servidor→cliente que hay (esta función es `never`: hace
 * `redirect()`), así que la señal viaja por la URL. Ponlo SOLO en los hitos de
 * verdad —completar, entregar, verificar, publicar—, nunca en un guardado
 * cualquiera: si se celebra todo, no se celebra nada.
 *
 * El mensaje del toast dice EL HECHO («Solicitud entregada.»); la celebración
 * pone el reconocimiento a la persona. No los hagas decir lo mismo.
 */
export function redirigirOk(path: string, mensaje: string, celebrar?: EventoCelebracion): never {
  const sep = path.includes('?') ? '&' : '?';
  const fiesta = celebrar ? '&' + PARAM_CELEBRACION + '=' + encodeURIComponent(celebrar) : '';
  redirect(path + sep + 'ok=' + encodeURIComponent(mensaje) + fiesta);
}

/** Redirige con un mensaje de ERROR (toast rojo) en vez de lanzar una excepción,
 *  para no crashear a la página de error ante fallos previsibles (p. ej. duplicados). */
export function redirigirError(path: string, mensaje: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(path + sep + 'err=' + encodeURIComponent(mensaje));
}

/** Redirige mostrando una contraseña temporal en un modal PERSISTENTE (con «Copiar»),
 *  no en un toast que se cierra solo: así no se pierde la única copia. */
export function redirigirClave(path: string, nombre: string, clave: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(path + sep + 'clave=' + encodeURIComponent(clave) + '&clave_para=' + encodeURIComponent(nombre || ''));
}
