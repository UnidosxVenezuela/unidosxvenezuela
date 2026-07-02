import { requireUsuario } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import VerificacionWizard from './VerificacionWizard';

/** Segunda verificación de identidad de la propia persona (wizard con cámara).
 *  Por ahora es opcional/operativa; más adelante se exigirá a algún rol o paso. */
export default async function VerificacionPage() {
  const { user } = await requireUsuario();
  const supabase = await createClient();
  const { data: vi } = await supabase.from('verificaciones_identidad')
    .select('estado, revisado_en, nota_revision').eq('perfil_id', user!.id).maybeSingle();
  const estado = (vi as any)?.estado as string | undefined;

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="pagina-cab"><div>
        <h1 className="fila" style={{ gap: 8 }}><Icono nombre="llave" size={24} /> Segunda verificación</h1>
        <p className="muted sub">Confirma tu identidad con una foto en vivo y tu documento. La revisa un administrador.</p>
      </div></div>

      {estado === 'aprobada' ? (
        <div className="tarjeta">
          <Pill tono="ok">Verificada</Pill>
          <p className="muted" style={{ marginBottom: 0 }}>Tu identidad fue verificada. ¡Gracias por ayudarnos a cuidar la comunidad! 💛💙❤️</p>
        </div>
      ) : estado === 'pendiente' ? (
        <div className="tarjeta">
          <Pill tono="aviso">En revisión</Pill>
          <p className="muted">Enviaste tu verificación; un administrador la revisará pronto. Si necesitas corregir algo, puedes volver a enviarla.</p>
          <VerificacionWizard reenviar />
        </div>
      ) : (
        <>
          {estado === 'rechazada' && (
            <div className="tarjeta" style={{ borderColor: '#fecaca' }}>
              <Pill tono="critica">Rechazada</Pill>
              <p className="muted" style={{ marginBottom: 0 }}>{(vi as any)?.nota_revision || 'Tu verificación fue rechazada. Vuelve a intentarlo con fotos claras donde se vean bien tu rostro y tu documento.'}</p>
            </div>
          )}
          <VerificacionWizard />
        </>
      )}
    </div>
  );
}
