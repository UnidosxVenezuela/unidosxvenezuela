'use client';
import { useEffect } from 'react';

/**
 * Rol y grupo van vinculados: al elegir un rol funcional en el select #rol,
 * selecciona automáticamente su grupo en #grupo_id (el trigger de la BD hará
 * lo mismo al guardar; esto lo hace visible al asignar).
 */
export default function RolGrupoSync({ mapa }: { mapa: Record<string, string> }) {
  useEffect(() => {
    const rol = document.getElementById('rol') as HTMLSelectElement | null;
    const grupo = document.getElementById('grupo_id') as HTMLSelectElement | null;
    if (!rol || !grupo) return;
    const sync = () => { const g = mapa[rol.value]; if (g) grupo.value = g; };
    rol.addEventListener('change', sync);
    sync();
    return () => rol.removeEventListener('change', sync);
  }, [mapa]);
  return null;
}
