import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminVerificacion, rolesDe } from '@/lib/auth';
import { MENSAJE_RECEPCION_CASO } from '@/lib/constantes';
import { createClient } from '@/lib/supabase/server';
import { crearCaso } from '../actions';
import TituloConDuplicados from './TituloConDuplicados';
import CamposCaso from './CamposCaso';
import Consejo from '@/components/Consejos';
import Icono from '@/components/Icono';
import BotonEnviar from '@/components/BotonEnviar';

export default async function NuevoCasoPage() {
  const { user, perfil } = await requireUsuario();
  if (!esAdministrador(perfil) && !rolesDe(perfil).includes('recopilacion') && !esAdminVerificacion(perfil)) redirect('/casos');

  // Reportar casos exige la 2ª verificación de identidad aprobada (salvo admin): la RLS
  // lo impone. Mostramos un aviso claro en vez de dejar que el guardado falle con un
  // error críptico de la base de datos.
  if (!esAdministrador(perfil)) {
    const supabase = await createClient();
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') {
      const enRevision = (vi as any)?.estado === 'pendiente';
      return (
        <div style={{ maxWidth: 640 }}>
          <Link href="/casos" className="muted">← Solicitudes</Link>
          <div className="tarjeta" style={{ marginTop: 8 }}>
            <h1 className="fila" style={{ gap: 8 }}><Icono nombre="llave" size={22} /> Completa tu verificación de identidad</h1>
            <p className="muted" style={{ marginTop: 4 }}>
              Para <strong>reportar solicitudes</strong> necesitas tu <strong>verificación de identidad</strong> aprobada (una sola vez: selfie + documento).
              {enRevision ? ' Tu verificación está en revisión; en cuanto la aprueben podrás crear solicitudes.' : ' Cuando la administración la apruebe, podrás crear solicitudes.'}
            </p>
            {!enRevision && <Link className="btn btn-primario" href="/verificacion"><Icono nombre="ok" size={16} /> Ir a mi verificación</Link>}
          </div>
        </div>
      );
    }
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <Link href="/casos" className="muted">← Solicitudes</Link>
      <Consejo id="caso-nuevo" titulo="Reportar bien una solicitud">
        Da un <strong>título claro</strong> y marca la <strong>ubicación en el mapa</strong>. El formulario va <strong>por bloques</strong>: completa la fuente, el <strong>referente</strong> y el <strong>doble contacto</strong> (WhatsApp e Instagram) y qué se necesita. Adjunta capturas de respaldo. Si aparece un aviso de <strong>posible duplicado</strong>, revísalo antes de crear.
      </Consejo>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>Nueva solicitud</h1>
          <p className="muted sub">Cada información que llega es una solicitud con ubicación. Responde: qué es, dónde, cuándo, quién es la fuente, quién es el responsable y qué se necesita.</p>
        </div>
      </div>
      <form action={crearCaso} className="tarjeta" style={{ marginTop: 12 }}>
        <TituloConDuplicados esAdmin={esAdministrador(perfil)} />
        <div className="campo">
          <label htmlFor="descripcion">¿Qué se necesita? *</label>
          <textarea id="descripcion" name="descripcion" className="input" rows={3} required placeholder="Descripción concreta, clara y actualizada de la ayuda solicitada." />
        </div>
        <CamposCaso />
        <div className="campo">
          <label htmlFor="archivos">Adjuntar archivos (opcional)</label>
          <input id="archivos" name="archivos" className="input" type="file" multiple
                 accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" />
          <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 0' }}>Capturas, fotos o documentos que respalden la solicitud (hasta 10 MB cada uno).</p>
        </div>
        <p className="muted" style={{ fontSize: '.8rem', margin: '0 0 8px' }}>{MENSAJE_RECEPCION_CASO}</p>
        <BotonEnviar cargando="Creando…">Crear solicitud</BotonEnviar>
      </form>
    </div>
  );
}
