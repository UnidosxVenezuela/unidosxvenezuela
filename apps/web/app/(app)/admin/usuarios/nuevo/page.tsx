import Link from 'next/link';
import { requireCoordinacion, esSuperadmin } from '@/lib/auth';
import { ROLES, ETIQUETA_ROL } from '@/lib/constantes';
import Icono from '@/components/Icono';
import { createClient } from '@/lib/supabase/server';
import { crearUsuario } from '../actions';

export default async function CrearUsuarioPage() {
  const { perfil: yo } = await requireCoordinacion();
  const esSuper = esSuperadmin(yo);
  const supabase = await createClient();
  const { data: grupos } = await supabase.from('grupos').select('id, nombre').order('nombre');
  // "admin" solo lo asigna un superadmin; "aliado" va por doble aprobación (no acá).
  const rolesAsignables = ROLES.filter((r) =>
    r !== 'lider_plataforma_aliada' && (r !== 'admin' || esSuper));

  return (
    <div>
      <Link href="/admin/usuarios" className="muted">← Usuarios</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Crear usuario</h1>
          <p className="muted sub" style={{ maxWidth: 520 }}>
            Crea una cuenta ya verificada y lista para usar, con <strong>correo</strong> o solo
            con <strong>WhatsApp</strong>. Comparte la contraseña temporal por un canal seguro;
            la persona la cambia al entrar.
          </p>
        </div>
        <Link className="btn" href="/admin/usuarios/importar"><Icono nombre="grupos" size={16} /> Importar por lote</Link>
      </div>

      <form action={crearUsuario} className="tarjeta" style={{ maxWidth: 520 }}>
        <div className="campo">
          <label htmlFor="nombre_completo">Nombre completo</label>
          <input id="nombre_completo" name="nombre_completo" className="input" required />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="email">Correo (opcional)</label>
            <input id="email" name="email" type="email" className="input" autoComplete="off" placeholder="correo@ejemplo.com" />
          </div>
          <div className="campo">
            <label htmlFor="whatsapp">WhatsApp (con código de país)</label>
            <input id="whatsapp" name="whatsapp" type="tel" className="input" autoComplete="off" placeholder="+58 412 000 0000" />
          </div>
        </div>
        <p className="muted" style={{ fontSize: '.82rem', marginTop: 0 }}>
          Indica <strong>correo o WhatsApp</strong> (al menos uno). Sin correo, la persona entra con su <strong>número de WhatsApp</strong> y la contraseña temporal.
        </p>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="organizacion">Organización (opcional)</label>
            <input id="organizacion" name="organizacion" className="input" />
          </div>
          <div className="campo">
            <label htmlFor="grupo_id">Grupo (opcional)</label>
            <select id="grupo_id" name="grupo_id" className="input" defaultValue="">
              <option value="">— Ninguno —</option>
              {(grupos ?? []).map((g: { id: string; nombre: string }) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="rol">Rol</label>
            <select id="rol" name="rol" className="input" defaultValue="voluntario">
              {rolesAsignables.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="password">Contraseña temporal</label>
            <input id="password" name="password" type="text" className="input" minLength={8} required
              autoComplete="off" placeholder="mín. 8 caracteres" />
          </div>
        </div>
        {!esSuper && (
          <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>
            🔒 Solo un superadministrador puede crear administradores.
          </p>
        )}
        <p className="muted" style={{ fontSize: '.85rem', marginTop: 0 }}>
          Para un <strong>líder de plataforma aliada</strong>: crea la cuenta con otro rol y proponla en la sección “Aliados” (requiere doble aprobación).
        </p>
        <button className="btn btn-primario" type="submit"><Icono nombre="ok" size={16} /> Crear usuario</button>
      </form>
    </div>
  );
}
