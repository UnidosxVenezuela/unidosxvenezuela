import { redirect } from 'next/navigation';

/** Redirige agregando un mensaje de éxito que el <Toast/> muestra y limpia. */
export function redirigirOk(path: string, mensaje: string): never {
  const sep = path.includes('?') ? '&' : '?';
  redirect(path + sep + 'ok=' + encodeURIComponent(mensaje));
}
