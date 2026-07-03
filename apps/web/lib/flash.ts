import { redirect } from 'next/navigation';

/** Redirige agregando un mensaje de éxito que el <Toast/> muestra y limpia. */
export function redirigirOk(path: string, mensaje: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(path + sep + 'ok=' + encodeURIComponent(mensaje));
}

/** Redirige con un mensaje de ERROR (toast rojo) en vez de lanzar una excepción,
 *  para no crashear a la página de error ante fallos previsibles (p. ej. duplicados). */
export function redirigirError(path: string, mensaje: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(path + sep + 'err=' + encodeURIComponent(mensaje));
}
