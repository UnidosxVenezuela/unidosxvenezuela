'use client';
import { useState } from 'react';
import Icono from '@/components/Icono';
import { PAISES_ATENDIDOS, paisAtendido, divisionesDe, nombreDivision, banderaPais } from '@/lib/constantes';

type Defaults = {
  pais?: string | null;
  estado?: string | null; municipio?: string | null; parroquia?: string | null;
  sector?: string | null; direccion?: string | null;
};

/**
 * Ubicación administrativa separada (requerimiento Paso 4.2): país / estado o departamento /
 * municipio / parroquia / comunidad-sector / dirección. Complementa el pin del mapa
 * (coordenadas) con la dirección textual que Logística necesita para llegar, y que sirve
 * aunque el mapa no cargue. Reutilizable en alta y edición. Todos los campos son opcionales
 * en la capa de datos; Verificación confirma la ubicación con su semáforo.
 *
 * El PAÍS entra con la respuesta al terremoto de Colombia (0230). Cambiarlo cambia el
 * desplegable de debajo y —esto es lo que importa— cómo se llama: en Venezuela la primera
 * división es el «Estado» y en Colombia el «Departamento». Usar la palabra del país no es
 * cosmético: es lo que hace que quien reporta reconozca el campo a la primera.
 *
 * Al cambiar de país se BORRA la división elegida, a propósito: «Bolívar» existe en los dos
 * países y son sitios distintos: dejarlo puesto guardaría una solicitud de Cúcuta con el
 * estado venezolano y la mandaría al equipo equivocado.
 *
 * El campo oculto `_datos_estructurados` marca que este formulario trae los datos
 * estructurados nuevos (0173): así `editarCaso` solo los actualiza cuando están
 * presentes, sin borrar lo ya cargado al editar desde formularios reducidos.
 */
export default function BloqueUbicacion({ defaults = {}, exigir = false, onPaisChange }: {
  defaults?: Defaults; exigir?: boolean;
  /** Avisa al formulario del país elegido, para que el mapa abra sobre el país correcto.
   *  Opcional: donde no se pasa, el bloque sigue funcionando solo. */
  onPaisChange?: (pais: 'VE' | 'CO') => void;
}) {
  const paisInicial = paisAtendido(defaults.pais).codigo;
  const [pais, setPais] = useState<'VE' | 'CO'>(paisInicial);

  // Si un caso viejo trae un valor de texto libre fuera de la lista, se conserva como
  // opción «(actual)» para no perderlo al editar. Solo mientras no se cambie de país.
  const estadoActual = defaults.estado ?? '';
  const divisiones = divisionesDe(pais);
  const conservaLegado = pais === paisInicial && estadoActual && !divisiones.includes(estadoActual);
  const etiqueta = nombreDivision(pais);

  return (
    <div className="tarjeta" style={{ marginBottom: 12 }}>
      <input type="hidden" name="_datos_estructurados" value="1" />
      <strong className="fila" style={{ gap: 6 }}><Icono nombre="ubicacion" size={15} /> Ubicación (dirección)</strong>
      <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 8px' }}>
        Datos para ubicar la solicitud. Ayudan a Logística a llegar aunque el mapa no cargue.
      </p>
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="pais">País *</label>
          <select id="pais" name="pais" className="input" required value={pais}
            onChange={(e) => {
              const v = e.target.value as 'VE' | 'CO';
              setPais(v); onPaisChange?.(v);
            }}>
            {PAISES_ATENDIDOS.map((p) => (
              <option key={p.codigo} value={p.codigo}>{banderaPais(p.codigo)} {p.nombre}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="ubicacion_estado">{etiqueta}{exigir ? ' *' : ''}</label>
          {/* `key` fuerza a React a rehacer el select al cambiar de país: si no, el
              navegador conserva el valor anterior y quedaría un departamento colombiano
              guardado como estado venezolano. */}
          <select key={pais} id="ubicacion_estado" name="ubicacion_estado" className="input" required={exigir}
            defaultValue={conservaLegado || divisiones.includes(estadoActual) ? estadoActual : ''}>
            <option value="">— Selecciona {etiqueta === 'Estado' ? 'el estado' : 'el departamento'} —</option>
            {divisiones.map((n) => <option key={n} value={n}>{n}</option>)}
            {conservaLegado && <option value={estadoActual}>{estadoActual} (actual)</option>}
          </select>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="ubicacion_municipio">Municipio</label>
          <input id="ubicacion_municipio" name="ubicacion_municipio" className="input" maxLength={80}
            defaultValue={defaults.municipio ?? ''} />
        </div>
        <div className="campo">
          <label htmlFor="ubicacion_parroquia">{pais === 'CO' ? 'Corregimiento / localidad' : 'Parroquia'}</label>
          <input id="ubicacion_parroquia" name="ubicacion_parroquia" className="input" maxLength={80}
            defaultValue={defaults.parroquia ?? ''} />
        </div>
      </div>
      <div className="grid grid-2">
        <div className="campo">
          <label htmlFor="ubicacion_sector">{pais === 'CO' ? 'Barrio / vereda' : 'Comunidad / sector'}</label>
          <input id="ubicacion_sector" name="ubicacion_sector" className="input" maxLength={120}
            defaultValue={defaults.sector ?? ''} />
        </div>
        <div className="campo">
          <label htmlFor="ubicacion_direccion">Dirección o referencia</label>
          <input id="ubicacion_direccion" name="ubicacion_direccion" className="input" maxLength={200}
            defaultValue={defaults.direccion ?? ''} placeholder="Calle, casa, punto de referencia" />
        </div>
      </div>
    </div>
  );
}
