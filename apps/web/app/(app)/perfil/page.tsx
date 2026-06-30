import { requireUsuario } from '@/lib/auth';
import { ETIQUETA_ROL, HABILIDADES_SUGERIDAS } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import { actualizarPerfil } from './actions';
import CambiarContrasena from '@/components/CambiarContrasena';
import SubirAvatar from '@/components/SubirAvatar';
import SelectorHabilidades from '@/components/SelectorHabilidades';
import Pill from '@/components/Pill';

export default async function PerfilPage({
  searchParams,
}: { searchParams: { guardado?: string } }) {
  const { user, perfil } = await requireUsuario();
  const avatarUrl = perfil?.avatar_url ?? null;

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="pagina-cab">
        <div>
          <h1>Mi perfil</h1>
          <div className="fila" style={{ marginTop: 4, flexWrap: 'wrap' }}>
            {[perfil?.rol ?? 'voluntario', ...(perfil?.roles_extra ?? [])].map((r) => (
              <Pill key={r} tono="neutra" punto={false}>{ETIQUETA_ROL[r as Rol] ?? r}</Pill>
            ))}
            <Pill tono={perfil?.verificado ? 'ok' : 'aviso'}>{perfil?.verificado ? 'Verificado' : 'Sin verificar'}</Pill>
          </div>
        </div>
      </div>

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <SubirAvatar nombre={perfil?.nombre_completo} urlActual={avatarUrl} />
      </div>

      {searchParams?.guardado && (
        <p className="exito" style={{ marginBottom: 12 }}>✓ Cambios guardados</p>
      )}

      <form action={actualizarPerfil} className="tarjeta">
        <div className="campo">
          <label htmlFor="nombre">Nombre completo</label>
          <input id="nombre" name="nombre" className="input" defaultValue={perfil?.nombre_completo ?? ''} required />
        </div>
        <div className="campo">
          <label htmlFor="telefono">Teléfono</label>
          <input id="telefono" name="telefono" className="input" type="tel" defaultValue={perfil?.telefono ?? ''} />
        </div>
        <div className="campo">
          <label htmlFor="organizacion">Organización</label>
          <input id="organizacion" name="organizacion" className="input" defaultValue={perfil?.organizacion ?? ''} />
        </div>
        <div className="campo">
          <label>Correo</label>
          <input className="input" value={user?.email ?? ''} disabled />
        </div>
        <SelectorHabilidades iniciales={perfil?.habilidades ?? []} sugeridas={HABILIDADES_SUGERIDAS} />
        <button className="btn btn-primario" type="submit">Guardar cambios</button>
      </form>

      <CambiarContrasena />
    </div>
  );
}
