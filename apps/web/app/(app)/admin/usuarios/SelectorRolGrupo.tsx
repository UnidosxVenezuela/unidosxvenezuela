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

export default function SelectorRolGrupo({ perfilId, nombre, rolActual, roles, grupos }: {
  perfilId: string; nombre: string; rolActual: string; roles: string[]; grupos: { id: string; nombre: string }[];
}) {
  const [rol, setRol] = useState(rolActual);
  const requiereGrupo = REQUIERE_GRUPO.includes(rol) && grupos.length > 0;
  const etiquetaGrupo = rol === 'coordinador' ? '¿Qué grupo coordina?' : '¿Qué grupo dirige?';

  return (
    <form action={cambiarRol} className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
      <input type="hidden" name="perfil_id" value={perfilId} />
      <select name="rol" className="input" value={rol} onChange={(e) => setRol(e.target.value)} style={{ minHeight: 34, width: 'auto' }}>
        {roles.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r as Rol] ?? r}</option>)}
      </select>
      {requiereGrupo && (
        <select name="grupo_id" className="input" required defaultValue="" style={{ minHeight: 34, width: 'auto' }} aria-label={etiquetaGrupo}>
          <option value="" disabled>{etiquetaGrupo}</option>
          {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
        </select>
      )}
      <BotonConfirmar
        mensaje={requiereGrupo
          ? '¿Cambiar el rol de ' + (nombre || 'esta persona') + ' y ponerlo a cargo del grupo elegido?'
          : '¿Cambiar el rol de ' + (nombre || 'esta persona') + '?'}
        className="btn" style={{ minHeight: 34, padding: '4px 10px' }}>Guardar</BotonConfirmar>
    </form>
  );
}
