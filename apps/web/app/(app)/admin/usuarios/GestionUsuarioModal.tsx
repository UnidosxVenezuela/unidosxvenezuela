'use client';
import { useState } from 'react';
import Modal from '@/components/Modal';
import BotonEnviar from '@/components/BotonEnviar';
import Icono from '@/components/Icono';
import { ETIQUETA_ROL, ROLES_SEGUNDA_VERIFICACION } from '@/lib/constantes';
import type { Rol } from '@unidos/types';
import { cambiarRol, guardarRolesExtra, agregarAGrupo } from './actions';

// Roles que van a cargo de UN grupo concreto: al elegirlos se indica también el grupo.
const REQUIERE_GRUPO = ['lider_grupo', 'coordinador'];

type GrupoOpc = { id: string; nombre: string; liderId?: string | null; liderNombre?: string | null };
type Cargo = { id: string; nombre: string } | null;

export default function GestionUsuarioModal({
  perfilId, nombre, rolActual, rolesPrincipales, rolesExtra, rolesExtraAsignables,
  grupos, gruposTodos, lideraActual, coordinaActual, etiquetaBoton = 'Gestionar', className = 'btn',
}: {
  perfilId: string; nombre: string; rolActual: string;
  rolesPrincipales: string[]; rolesExtra: string[]; rolesExtraAsignables: string[];
  grupos: GrupoOpc[]; gruposTodos: { id: string; nombre: string }[];
  lideraActual: Cargo; coordinaActual: Cargo; etiquetaBoton?: string; className?: string;
}) {
  const [rol, setRol] = useState(rolActual);
  const [grupoId, setGrupoId] = useState('');
  const requiereGrupo = REQUIERE_GRUPO.includes(rol);
  const sinGrupos = requiereGrupo && grupos.length === 0;
  const etiquetaGrupo = rol === 'coordinador' ? '¿Qué grupo coordina?' : '¿Qué grupo dirige?';
  const persona = nombre || 'esta persona';
  const necesita2a = ROLES_SEGUNDA_VERIFICACION.includes(rol as Rol);

  const aCargoAhora = rol === 'coordinador' ? coordinaActual : rol === 'lider_grupo' ? lideraActual : null;
  const destino = grupos.find((g) => g.id === grupoId);

  // Aviso de traspaso, mostrado dentro del modal (no en un confirm aparte).
  const avisos: string[] = [];
  if (aCargoAhora && destino && aCargoAhora.id !== destino.id) {
    avisos.push(rol === 'coordinador'
      ? `Ya coordina «${aCargoAhora.nombre}»; dejará de coordinarlo.`
      : `Ya dirige «${aCargoAhora.nombre}», que quedará sin líder.`);
  }
  if (rol === 'lider_grupo' && destino?.liderId && destino.liderId !== perfilId) {
    avisos.push(`«${destino.nombre}» ya tiene líder (${destino.liderNombre || 'otra persona'}); será reemplazado. Un grupo tiene un solo líder.`);
  }

  return (
    <Modal etiqueta={etiquetaBoton} titulo={`Gestionar: ${persona}`} tituloIcono="usuario" className={className} icono="puntos" ancho={460}>
      {/* Rol principal + grupo a cargo */}
      <div className="modal-seccion">
        <h4 className="fila" style={{ gap: 6 }}><Icono nombre="llave" size={15} /> Rol principal</h4>
        <form action={cambiarRol}>
          <input type="hidden" name="perfil_id" value={perfilId} />
          <select name="rol" className="input" value={rol} onChange={(e) => { setRol(e.target.value); setGrupoId(''); }}>
            {rolesPrincipales.map((r) => <option key={r} value={r}>{ETIQUETA_ROL[r as Rol] ?? r}</option>)}
          </select>
          {requiereGrupo && !sinGrupos && (
            <select name="grupo_id" className="input" required value={grupoId} onChange={(e) => setGrupoId(e.target.value)} aria-label={etiquetaGrupo} style={{ marginTop: 8 }}>
              <option value="" disabled>{etiquetaGrupo}</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          )}
          {avisos.length > 0 && (
            <div style={{ marginTop: 8, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
              {avisos.map((a, i) => <p key={i} className="fila" style={{ gap: 6, margin: '2px 0', fontSize: '.85rem' }}><Icono nombre="avisos" size={14} /> {a}</p>)}
            </div>
          )}
          {necesita2a && (
            <p className="muted fila" style={{ gap: 6, margin: '8px 0 0', fontSize: '.82rem' }}>
              <Icono nombre="llave" size={14} /> Este rol requiere <strong>segunda verificación</strong> de identidad; la persona no podrá operar hasta completarla.
            </p>
          )}
          {sinGrupos ? (
            <p className="muted" style={{ fontSize: '.82rem', marginTop: 8 }}>Crea un grupo primero para asignar este rol.</p>
          ) : (
            <BotonEnviar className="btn btn-primario" style={{ marginTop: 10 }} disabled={requiereGrupo && !grupoId}><Icono nombre="ok" size={15} /> Guardar rol</BotonEnviar>
          )}
        </form>
      </div>

      {/* Roles adicionales */}
      {rolesExtraAsignables.length > 0 && (
        <div className="modal-seccion">
          <h4 className="fila" style={{ gap: 6 }}><Icono nombre="grupos" size={15} /> Roles adicionales</h4>
          <form action={guardarRolesExtra}>
            <input type="hidden" name="perfil_id" value={perfilId} />
            <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
              {rolesExtraAsignables.map((r) => (
                <label key={r} className="fila" style={{ gap: 6, fontWeight: 500 }}>
                  <input type="checkbox" name="roles" value={r} defaultChecked={rolesExtra.includes(r)} style={{ width: 'auto', minHeight: 0 }} />
                  {ETIQUETA_ROL[r as Rol] ?? r}
                  {ROLES_SEGUNDA_VERIFICACION.includes(r as Rol) && <span className="muted" style={{ fontSize: '.72rem' }}>· 2ª verif.</span>}
                </label>
              ))}
            </div>
            <BotonEnviar className="btn" style={{ marginTop: 10 }}>Guardar roles adicionales</BotonEnviar>
          </form>
        </div>
      )}

      {/* Agregar a un grupo */}
      {gruposTodos.length > 0 && (
        <div className="modal-seccion">
          <h4 className="fila" style={{ gap: 6 }}><Icono nombre="mas" size={15} /> Agregar a un grupo</h4>
          <form action={agregarAGrupo} className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
            <input type="hidden" name="perfil_id" value={perfilId} />
            <select name="grupo_id" className="input" required defaultValue="" style={{ width: 'auto', flex: 1 }}>
              <option value="" disabled>Elige un grupo…</option>
              {gruposTodos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
            <BotonEnviar className="btn">Agregar</BotonEnviar>
          </form>
          <p className="muted" style={{ fontSize: '.78rem', marginTop: 6 }}>Sumar a alguien a un grupo del sistema le otorga el rol de ese grupo.</p>
        </div>
      )}
    </Modal>
  );
}
