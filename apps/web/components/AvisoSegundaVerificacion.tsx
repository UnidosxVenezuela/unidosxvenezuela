import Link from 'next/link';
import Icono from './Icono';
import Modal from './Modal';

/**
 * Aviso reutilizable de «segunda verificación (identidad) requerida». Se muestra a
 * quien tiene un rol que la exige y aún no la aprobó: en el panel (dashboard) como
 * recordatorio, y como compuerta de las páginas que la requieren (Casos, Búsqueda,
 * Coincidencias, Digitalización). Incluye una ventana flotante que explica el porqué,
 * para que se entienda que debe hacerla antes de tener acceso.
 */
export default function AvisoSegundaVerificacion({ titulo = 'Necesitas tu segunda verificación' }: { titulo?: string }) {
  return (
    <div className="tarjeta" style={{ borderColor: '#fde68a', background: '#fffbeb', maxWidth: 620 }}>
      <div className="fila" style={{ gap: 10, alignItems: 'flex-start' }}>
        <span className="flujo-chip" style={{ background: '#fef3c7', color: '#a16207' }}><Icono nombre="llave" size={18} /></span>
        <div>
          <strong style={{ fontSize: '1.02rem' }}>{titulo}</strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Tu rol trabaja con <strong>datos sensibles</strong> (casos, personas desaparecidas, listados).
            Para proteger esa información, primero debes <strong>verificar tu identidad</strong> — se hace una sola vez.
            Hasta completarla no tendrás acceso a esas herramientas.
          </p>
        </div>
      </div>
      <div className="fila" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <Link href="/verificacion" className="btn btn-primario"><Icono nombre="llave" size={16} /> Verificar mi identidad</Link>
        <Modal etiqueta="¿Por qué me lo piden?" titulo="Segunda verificación de identidad" tituloIcono="llave" className="btn" ancho={460}>
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0 }}>
              La <strong>segunda verificación</strong> confirma que eres quien dices ser. Es obligatoria para los
              roles que manejan información delicada (recopilación, búsqueda de desaparecidos y digitalización),
              porque esos datos pueden poner en riesgo a personas —especialmente <strong>menores (NNA)</strong>.
            </p>
            <div>
              <strong className="fila" style={{ gap: 6 }}><Icono nombre="ok" size={15} /> Qué necesitas</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>Una foto tipo selfie.</li>
                <li>Una foto de tu documento de identidad.</li>
                <li>Aceptar el consentimiento. Es un trámite de una sola vez.</li>
              </ul>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '.9rem' }}>
              Cuando la administración apruebe tu verificación, se te habilitarán automáticamente las secciones
              de tu rol. Mientras tanto, verás este aviso.
            </p>
            <Link href="/verificacion" className="btn btn-primario"><Icono nombre="llave" size={16} /> Empezar ahora</Link>
          </div>
        </Modal>
      </div>
    </div>
  );
}
