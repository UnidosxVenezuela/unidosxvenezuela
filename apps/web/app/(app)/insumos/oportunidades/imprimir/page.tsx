// Versión imprimible (→ PDF) del tablero Donación-Ofrecimiento. Reaplica el mismo
// acceso que la vista y REGISTRA la apertura vía `registrar_auditoria`.
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerOportunidades } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import VistaImprimible from '@/components/VistaImprimible';
import { consultarOfrecimientos, COLUMNAS_OFRECIMIENTOS } from '@/lib/export/ofrecimientos';

type SP = { q?: string; verif?: string; clase?: string };
export const dynamic = 'force-dynamic';

export default async function ImprimirOfrecimientosPage({ searchParams }: { searchParams: SP }) {
  const { perfil } = await requireUsuario();
  if (!puedeVerOportunidades(perfil)) redirect('/dashboard');

  const supabase = await createClient();
  const sp = { q: searchParams.q, verif: searchParams.verif, clase: searchParams.clase };
  const filas = await consultarOfrecimientos(supabase, sp);
  await supabase.rpc('registrar_auditoria', {
    p_accion: 'exportar_pdf', p_entidad: 'oportunidades_donacion', p_entidad_id: null,
    p_metadata: { listado: 'ofrecimientos', filas: filas.length, via: 'vista_imprimible', filtros: sp },
  });

  const qs = new URLSearchParams();
  if (searchParams.q) qs.set('q', searchParams.q);
  if (searchParams.verif) qs.set('verif', searchParams.verif);
  if (searchParams.clase) qs.set('clase', searchParams.clase);
  const cola = qs.toString() ? '?' + qs.toString() : '';

  return (
    <VistaImprimible
      titulo="Donación-Ofrecimiento" subtitulo="Tablero exportado"
      volverHref={'/insumos/oportunidades' + cola} csvHref={'/insumos/oportunidades/export' + cola}
      columnas={COLUMNAS_OFRECIMIENTOS} filas={filas}
    />
  );
}
