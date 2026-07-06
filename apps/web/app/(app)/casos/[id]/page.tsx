import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerificar, puedeRecopilar, puedeBusqueda, esAdministrador, esAdminVerificacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import DetalleCaso from '../DetalleCaso';

export default async function CasoDetallePage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const accesoBusqueda = puedeBusqueda(perfil);
  const supervisa = esAdminVerificacion(perfil);
  if (!puedeRecopilar(perfil) && !accesoBusqueda && !supervisa) redirect('/dashboard');
  const supabase = await createClient();
  // El Admin de Verificaciones opera su área con la 2ª verificación (identidad) aprobada.
  let puedeOperar = false;
  if (supervisa) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    puedeOperar = (vi as any)?.estado === 'aprobada';
  }
  const verifica = puedeVerificar(perfil) || accesoBusqueda || puedeOperar; // cambia estado / toma (RLS aplica categoría + 2ª verif)
  const id = params.id;

  const { data: adjRaw } = await supabase.from('casos_adjuntos').select('id, url, nombre').eq('caso_id', params.id).order('creado_en');
  const { data: caso } = await supabase.from('casos')
    .select('id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, asignado_a, estado, notas, creado_por, creado_en, actualizado_en')
    .eq('id', id).single() as any;
  if (!caso) return <div className="tarjeta"><h2>Caso no encontrado</h2><Link href="/casos">Volver</Link></div>;

  // Adjuntos de respaldo con URL firmada (misma vista que el panel lateral).
  const { urlFirmada } = await import('@/lib/storage');
  caso.adjuntos = await Promise.all(((adjRaw ?? []) as any[]).map(async (a) => ({
    ...a, href: await urlFirmada(supabase, 'adjuntos', a.url, 3600),
  })));

  const [{ data: perfiles }, { data: historial }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo, avatar_url').order('nombre_completo'),
    supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en')
      .eq('entidad', 'casos').eq('entidad_id', id).order('creado_en', { ascending: false }).limit(50),
  ]);

  return (
    <div style={{ maxWidth: 720 }}>
      <RealtimeRefrescar tabla="casos" filtro={'id=eq.' + id} />
      <Link href="/casos" className="muted">← Casos</Link>
      <div style={{ marginTop: 8 }}>
        <DetalleCaso caso={caso} perfiles={perfiles ?? []} historial={historial ?? []} volver={'/casos/' + id} cerrarHref="/casos" puedeEditar={verifica}
          puedeEditarDatos={esAdministrador(perfil) || (verifica && caso.estado !== 'enviado_redaccion') || (caso.creado_por === user!.id && ['pendiente', 'en_proceso'].includes(caso.estado))}
          esAdmin={esAdministrador(perfil)} puedeTomar={verifica} miId={user!.id} />
      </div>
    </div>
  );
}
