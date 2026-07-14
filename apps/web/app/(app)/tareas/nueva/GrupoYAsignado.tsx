'use client';
import { useState } from 'react';

type Persona = { id: string; nombre: string };
type Grupo = { id: string; nombre: string };

// Selector de grupo + «Asignar a». La lista de personas se limita a los MIEMBROS del
// grupo elegido, para que las asignaciones sean siempre del propio grupo (el trigger
// 0101 lo blinda en la base de datos). Para el admin sin grupo, puede asignar a nadie.
export default function GrupoYAsignado({ grupos, miembrosPorGrupo, esAdmin, grupoInicial }: {
  grupos: Grupo[];
  miembrosPorGrupo: Record<string, Persona[]>;
  esAdmin: boolean;
  grupoInicial?: string;
}) {
  const inicial = grupoInicial && grupos.some((g) => g.id === grupoInicial) ? grupoInicial : '';
  const [grupo, setGrupo] = useState(inicial);
  const miembros = grupo ? (miembrosPorGrupo[grupo] ?? []) : [];
  return (
    <>
      <div className="campo">
        <label htmlFor="grupo_id">Grupo</label>
        <select id="grupo_id" name="grupo_id" className="input" value={grupo} onChange={(e) => setGrupo(e.target.value)} required={!esAdmin}>
          {esAdmin ? <option value="">Sin grupo (tarea general)</option> : <option value="" disabled>Elige tu grupo…</option>}
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
        {grupos.length === 0 && <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>No lideras ni coordinas ningún grupo, así que no puedes crear tareas de grupo.</p>}
      </div>
      <div className="campo">
        <label htmlFor="asignado_a">Asignar a <span className="muted" style={{ fontWeight: 400 }}>(puedes elegir varias personas)</span></label>
        {!grupo ? (
          <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>{esAdmin ? 'Elige un grupo para asignar a sus miembros.' : 'Elige tu grupo para ver a sus miembros.'}</p>
        ) : miembros.length === 0 ? (
          <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>Este grupo aún no tiene miembros; la tarea quedará abierta.</p>
        ) : (
          // key={grupo}: al cambiar de grupo se reinicia la selección para no enviar a alguien de otro grupo.
          <div key={grupo} style={{ display: 'grid', gap: 2, maxHeight: 240, overflowY: 'auto', border: '1px solid var(--borde)', borderRadius: 8, padding: 6 }}>
            {miembros.map((p) => (
              <label key={p.id} className="fila" style={{ gap: 8, alignItems: 'center', padding: '6px 6px', cursor: 'pointer', minHeight: 40, borderRadius: 6 }}>
                <input type="checkbox" name="asignado_a" value={p.id} style={{ width: 18, height: 18, flexShrink: 0 }} />
                <span>{p.nombre}</span>
              </label>
            ))}
          </div>
        )}
        <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>Marca a una o varias personas. Si no marcas a nadie, la tarea queda <strong>abierta</strong> para que se sumen.</p>
      </div>
    </>
  );
}
