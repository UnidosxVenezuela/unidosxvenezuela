import Link from 'next/link';
import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ROLES_ASIGNABLES, GRUPOS_INACTIVOS, ETIQUETA_ROL } from '@/lib/constantes';
import Importador from './Importador';

export default async function ImportarUsuariosPage() {
  await requireCoordinacion();
  const supabase = await createClient();
  const { data: gruposRaw } = await supabase.from('grupos').select('id, nombre, clave').order('nombre');
  const grupos = (gruposRaw ?? []).filter((g: any) => !GRUPOS_INACTIVOS.includes(g.clave));  // ocultar grupos desactivados (0138)
  // No se importan admins ni aliados (van por su propio flujo).
  const roles = ROLES_ASIGNABLES.filter((r) => r !== 'admin');

  return (
    <div>
      <Link href="/admin/usuarios" className="muted">← Usuarios</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Importar por lote</h1>
          <p className="muted sub" style={{ maxWidth: 640 }}>
            Pega una persona por línea (número con código de país y/o correo, y su nombre).
            Se crean cuentas <strong>verificadas</strong> de una vez. A quienes solo tengan
            WhatsApp les compartes la contraseña con el botón <em>Enviar</em> de su fila.
          </p>
        </div>
      </div>
      <Importador
        grupos={(grupos ?? []) as { id: string; nombre: string }[]}
        roles={roles.map((r) => ({ valor: r, etiqueta: ETIQUETA_ROL[r] }))}
      />
    </div>
  );
}
