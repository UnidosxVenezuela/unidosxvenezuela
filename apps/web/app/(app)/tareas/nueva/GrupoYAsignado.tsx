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
        <label htmlFor="asignado_a">Asignar a</label>
        {/* key={grupo}: al cambiar de grupo se reinicia la selección para no enviar a alguien de otro grupo */}
        <select id="asignado_a" name="asignado_a" className="input" defaultValue="" key={grupo}>
          <option value="">Sin asignar (queda abierta)</option>
          {miembros.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {!grupo
          ? <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>{esAdmin ? 'Elige un grupo para asignar a uno de sus miembros.' : 'Elige tu grupo para ver a sus miembros.'}</p>
          : miembros.length === 0 && <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>Este grupo aún no tiene miembros; la tarea quedará abierta.</p>}
      </div>
    </>
  );
}
