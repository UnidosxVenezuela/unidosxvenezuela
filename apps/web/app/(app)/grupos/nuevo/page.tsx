import { requireCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { crearGrupo } from '../actions';

export default async function NuevoGrupoPage() {
  await requireCoordinacion();
  const supabase = await createClient();
  const { data: areas } = await supabase.from('areas').select('clave, nombre').order('nombre');

  return (
    <div style={{ maxWidth: 560 }}>
      <div className="pagina-cab">
        <div>
          <h1>Nuevo grupo</h1>
          <p className="muted sub">Asigna un área y un líder; a los miembros los agrega la administración o el líder.</p>
        </div>
      </div>
      <form action={crearGrupo} className="tarjeta" style={{ marginTop: 12 }}>
        <div className="campo">
          <label htmlFor="nombre">Nombre del grupo</label>
          <input id="nombre" name="nombre" className="input" required />
        </div>
        <div className="campo">
          <label htmlFor="area">Área</label>
          <select id="area" name="area" className="input" required defaultValue="">
            <option value="" disabled>Selecciona un área…</option>
            {(areas ?? []).map((a: any) => <option key={a.clave} value={a.clave}>{a.nombre}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="descripcion">Descripción</label>
          <textarea id="descripcion" name="descripcion" className="input" />
        </div>
        <div className="campo">
          <label htmlFor="whatsapp">Enlace de WhatsApp (opcional)</label>
          <input id="whatsapp" name="whatsapp" className="input" type="url"
            placeholder="https://chat.whatsapp.com/..." />
        </div>
        <button className="btn btn-primario" type="submit">Crear grupo</button>
      </form>
    </div>
  );
}
