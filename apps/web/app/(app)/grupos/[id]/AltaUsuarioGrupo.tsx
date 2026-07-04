'use client';
import Modal from '@/components/Modal';
import Icono from '@/components/Icono';
import BotonEnviar from '@/components/BotonEnviar';
import { altaUsuarioEnGrupo } from '../actions';

/**
 * Botón + ventana flotante para que un líder/coordinador dé de alta un usuario con
 * el rol del grupo. Un líder lo crea directo; un coordinador envía una solicitud
 * que el líder confirma (requiereConfirmacion).
 */
export default function AltaUsuarioGrupo({ grupoId, rolEtiqueta, requiereConfirmacion, requiere2a }: {
  grupoId: string; rolEtiqueta: string; requiereConfirmacion: boolean; requiere2a: boolean;
}) {
  return (
    <Modal etiqueta="Agregar integrante" titulo="Agregar integrante al grupo" tituloIcono="mas" icono="mas" className="btn btn-primario" ancho={480}>
      <p className="muted" style={{ marginTop: 0, fontSize: '.88rem' }}>
        Se dará de alta una cuenta con el rol <strong>{rolEtiqueta}</strong>.{' '}
        {requiereConfirmacion
          ? 'Como coordinador, tu alta la confirmará el líder del grupo antes de crearse la cuenta.'
          : 'La cuenta queda lista y verificada; se te mostrará una contraseña temporal para compartir.'}
      </p>
      <form action={altaUsuarioEnGrupo}>
        <input type="hidden" name="grupo_id" value={grupoId} />
        <div className="campo">
          <label htmlFor="au_nombre">Nombre completo</label>
          <input id="au_nombre" name="nombre_completo" className="input" required maxLength={160} />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="au_wa">WhatsApp (código + número)</label>
            <input id="au_wa" name="whatsapp" className="input" placeholder="584120000000" inputMode="numeric" />
          </div>
          <div className="campo">
            <label htmlFor="au_email">Correo (opcional)</label>
            <input id="au_email" name="email" className="input" type="email" />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="au_org">Organización (opcional)</label>
          <input id="au_org" name="organizacion" className="input" maxLength={120} />
        </div>
        {requiereConfirmacion && (
          <div className="campo">
            <label htmlFor="au_motivo">Nota para el líder (opcional)</label>
            <input id="au_motivo" name="motivo" className="input" maxLength={200} />
          </div>
        )}
        <p className="muted" style={{ fontSize: '.78rem' }}>
          Indica al menos un WhatsApp o un correo.{requiere2a && ' Este rol requiere segunda verificación de identidad: la persona deberá completarla antes de operar.'}
        </p>
        <BotonEnviar className="btn btn-primario">
          <Icono nombre="ok" size={16} /> {requiereConfirmacion ? 'Enviar a confirmación' : 'Crear cuenta'}
        </BotonEnviar>
      </form>
    </Modal>
  );
}
