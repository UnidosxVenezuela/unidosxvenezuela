import { requireCoordinacion } from '@/lib/auth';
import { AREAS, ETIQUETA_AREA } from '@/lib/constantes';
import { crearGrupo } from '../actions';

export default async function NuevoGrupoPage() {
  await requireCoordinacion();
  return (
    <div style={{ maxWidth: 560 }}>
      <h1>Nuevo grupo</h1>
      <form action={crearGrupo} className="tarjeta">
        <div className="campo">
          <label htmlFor="nombre">Nombre del grupo</label>
          <input id="nombre" name="nombre" className="input" required />
        </div>
        <div className="campo">
          <label htmlFor="area">Área</label>
          <select id="area" name="area" className="input" required defaultValue="">
            <option value="" disabled>Selecciona un área…</option>
            {AREAS.map((a) => <option key={a} value={a}>{ETIQUETA_AREA[a]}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="descripcion">Descripción</label>
          <textarea id="descripcion" name="descripcion" className="input" />
        </div>
        <button className="btn btn-primario" type="submit">Crear grupo</button>
      </form>
    </div>
  );
}
