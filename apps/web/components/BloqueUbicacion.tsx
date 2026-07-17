'use client';
import Icono from '@/components/Icono';

type Defaults = {
  estado?: string | null; municipio?: string | null; parroquia?: string | null;
  sector?: string | null; direccion?: string | null;
};

/**
 * Ubicación administrativa separada (requerimiento Paso 4.2): estado / municipio /
 * parroquia / comunidad-sector / dirección. Complementa el pin del mapa (coordenadas)
 * con la dirección textual que Logística necesita para llegar, y que sirve aunque el
 * mapa no cargue. Reutilizable en alta y edición. Todos los campos son opcionales en
 * la capa de datos; Verificación confirma la ubicación con su semáforo.
 *
 * El campo oculto `_datos_estructurados` marca que este formulario trae los datos
 * estructurados nuevos (0173): así `editarCaso` solo los actualiza cuando están
 * presentes, sin borrar lo ya cargado al editar desde formularios reducidos.
 */
export default function BloqueUbicacion({ defaults = {} }: { defaults?: Defaults }) {
  return (
    <div className="tarjeta" style={{ marginBottom: 12 }}>
      <input type="hidden" name="_datos_estructurados" value="1" />
      <strong className="fila" style={{ gap: 6 }}><Icono nombre="ubicacion" size={15} /> Ubicación (dirección)</strong>
      <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 8px' }}>
        Datos para ubicar la solicitud. Ayudan a Logística a llegar aunque el mapa no cargue.
      </p>
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="ubicacion_estado">Estado</label>
          <input id="ubicacion_estado" name="ubicacion_estado" className="input" maxLength={80}
            defaultValue={defaults.estado ?? ''} placeholder="La Guaira, Carabobo…" />
        </div>
        <div className="campo">
          <label htmlFor="ubicacion_municipio">Municipio</label>
          <input id="ubicacion_municipio" name="ubicacion_municipio" className="input" maxLength={80}
            defaultValue={defaults.municipio ?? ''} />
        </div>
      </div>
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="ubicacion_parroquia">Parroquia</label>
          <input id="ubicacion_parroquia" name="ubicacion_parroquia" className="input" maxLength={80}
            defaultValue={defaults.parroquia ?? ''} />
        </div>
        <div className="campo">
          <label htmlFor="ubicacion_sector">Comunidad / sector</label>
          <input id="ubicacion_sector" name="ubicacion_sector" className="input" maxLength={120}
            defaultValue={defaults.sector ?? ''} />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="ubicacion_direccion">Dirección o referencia</label>
        <input id="ubicacion_direccion" name="ubicacion_direccion" className="input" maxLength={200}
          defaultValue={defaults.direccion ?? ''} placeholder="Calle, casa, punto de referencia" />
      </div>
    </div>
  );
}
