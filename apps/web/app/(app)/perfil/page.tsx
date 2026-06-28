import { requireUsuario } from '@/lib/auth';
import { ETIQUETA_ROL } from '@/lib/constantes';
import { actualizarPerfil } from './actions';
import CambiarContrasena from '@/components/CambiarContrasena';

export default async function PerfilPage({
  searchParams,
}: { searchParams: { guardado?: string } }) {
  const { user, perfil } = await requireUsuario();

  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Mi perfil</h1>
      <div className="fila" style={{ marginBottom: 12 }}>
        <span className="insignia">{ETIQUETA_ROL[perfil?.rol ?? 'voluntario']}</span>
        <span className={'insignia ' + (perfil?.verificado ? 'ok' : 'aviso')}>
          {perfil?.verificado ? 'Verificado' : 'Sin verificar'}
        </span>
      </div>
      {searchParams?.guardado && (
        <p className="insignia ok" style={{ marginBottom: 12 }}>Cambios guardados</p>
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
        <button className="btn btn-primario" type="submit">Guardar cambios</button>
      </form>

      <CambiarContrasena />
    </div>
  );
}
