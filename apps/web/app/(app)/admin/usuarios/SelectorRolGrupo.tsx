'use client';
import { useState } from 'react';
import BotonConfirmar from '@/components/BotonConfirmar';
import { ETIQUETA_ROL } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import { cambiarRol } from './actions';

// Roles que van a cargo de UN grupo concreto: al elegirlos, el admin indica
// también qué grupo dirige/coordina, en el mismo paso. (Los roles del área
// psicosocial tienen su propia gestión y no usan este selector.)
const REQUIERE_GRUPO = ['lider_grupo', 'coordinador'];

type GrupoOpc = { id: string; nombre: string; liderId?: string | null; liderNombre?: string | null };
type Cargo = { id: string; nombre: string } | null;

export default function SelectorRolGrupo({ perfilId, nombre, rolActual, roles, grupos, lideraActual, coordinaActual }: {
  perfilId: string; nombre: string; rolActual: string; roles: string[];
  grupos: GrupoOpc[]; lideraActual: Cargo; coordinaActual: Cargo;
}) {
  const [rol, setRol] = useState(rolActual);
  const [grupoId, setGrupoId] = useState('');
  const requiereGrupo = REQUIERE_GRUPO.includes(rol);
  const sinGrupos = requiereGrupo && grupos.length === 0;
  const etiquetaGrupo = rol === 'coordinador' ? '¿Qué grupo coordina?' : '¿Qué grupo dirige?';
  const persona = nombre || 'esta persona';

  // Grupo del que YA está a cargo con este rol (para avisar del traspaso).
  const aCargoAhora = rol === 'coordinador' ? coordinaActual : rol === 'lider_grupo' ? lideraActual : null;
  const destino = grupos.find((g) => g.id === grupoId);

  // El mensaje de confirmación avisa del traspaso: si la persona ya está a cargo
  // de otro grupo (queda libre) y si el grupo destino ya tiene líder (se reemplaza).
  function mensajeConfirmar(): string {
    if (!requiereGrupo) return `¿Cambiar el rol de ${persona}?`;
    if (!destino) return `¿Cambiar el rol de ${persona}? Elige primero un grupo.`;
    const verbo = rol === 'coordinador' ? 'coordine' : 'dirija';
    let m = `¿Poner a ${persona} a cargo de «${destino.nombre}» (que lo ${verbo})?`;
    if (aCargoAhora && aCargoAhora.id !== destino.id) {
      m += rol === 'coordinador'
        ? ` Ya coordina «${aCargoAhora.nombre}»; dejará de coordinarlo.`
        : ` Ya dirige «${aCargoAhora.nombre}», que quedará sin líder.`;
    }
    if (rol === 'lider_grupo' && destino.liderId && destino.liderId !== perfilId) {
      m += ` «${destino.nombre}» ya tiene líder (${destino.liderNombre || 'otra persona'}); será reemplazado.`;
    }
    return m;
  }

  return (
    <form action={cambiarRol} className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
      <input type="hidden" name="perfil_id" value={perfilId} />
      <select name="rol" className="input" value={rol} onChange={(e) => { setRol(e.target.value); setGrupoId(''); }} style={{ minHeight: 34, width: 'auto' }}>
        {roles.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r as Rol] ?? r}</option>)}
      </select>
      {requiereGrupo && !sinGrupos && (
        <select name="grupo_id" className="input" required value={grupoId} onChange={(e) => setGrupoId(e.target.value)} style={{ minHeight: 34, width: 'auto' }} aria-label={etiquetaGrupo}>
          <option value="" disabled>{etiquetaGrupo}</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
      )}
      {sinGrupos ? (
        <span className="muted" style={{ fontSize: '.8rem' }}>Crea un grupo primero para asignar este rol.</span>
      ) : (
        <BotonConfirmar
          mensaje={mensajeConfirmar()}
          disabled={requiereGrupo && !grupoId}
          className="btn" style={{ minHeight: 34, padding: '4px 10px' }}>Guardar</BotonConfirmar>
      )}
    </form>
  );
}
