// Versión imprimible (→ PDF) de la referencia de Captación. Reaplica el mismo acceso
// que la vista (Logística) y REGISTRA la apertura vía `registrar_auditoria`.
import { redirect } from 'next/navigation';
import { requireUsuario, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import VistaImprimible from '@/components/VistaImprimible';
import { consultarCaptacion, COLUMNAS_CAPTACION } from '@/lib/export/captacion';

type SP = { q?: string; cat?: string };
export const dynamic = 'force-dynamic';

export default async function ImprimirCaptacionPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  if (!puedeLogistica(perfil)) redirect('/dashboard');

  const supabase = await createClient();
  const sp = { q: searchParams.q, cat: searchParams.cat };
  const filas = await consultarCaptacion(supabase, sp);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_pdf', p_entidad: 'oportunidades', p_entidad_id: null,
    p_metadata: { listado: 'captacion', filas: filas.length, via: 'vista_imprimible', filtros: sp },
  });

  const qs = new URLSearchParams();
  if (searchParams.q) qs.set('q', searchParams.q);
  if (searchParams.cat) qs.set('cat', searchParams.cat);
  const cola = qs.toString() ? '?' + qs.toString() : '';

  return (
    <VistaImprimible
      titulo="Captación — referencia" subtitulo="Entidades enviadas"
      volverHref={'/insumos/captacion' + cola} csvHref={'/insumos/captacion/export' + cola}
      columnas={COLUMNAS_CAPTACION} filas={filas}
    />
  );
}
