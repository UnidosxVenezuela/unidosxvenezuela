import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerificar, puedeRecopilar, puedeBusqueda, esAdministrador, esAdminVerificacion, rolesDe } from '@/lib/auth';
import { areasOperablesDe } from '@/lib/constantes';
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
  // Los líderes/coordinadores del grupo de Verificación pueden revertir una solicitud
  // finalizada (migración 0147). Si la función aún no existe, rpc devuelve error → false.
  const { data: mandoVerif } = await supabase.rpc('es_mando_verificacion');
  const esMandoVerif = mandoVerif === true;
  const id = params.id;

  // `*` incluye apto_difusion (0187) sin romper si la migración aún no se aplicó.
  const { data: adjRaw } = await supabase.from('casos_adjuntos').select('*').eq('caso_id', params.id).order('creado_en');
  // `*` incluye los campos estructurados nuevos (0173: referente_rol, fuente_tipo,
  // ubicación administrativa, vigencia) sin romper si la migración aún no se aplicó
  // (las columnas ausentes simplemente no vienen). La RLS acota qué filas se ven.
  const { data: caso } = await supabase.from('casos').select('*').eq('id', id).single() as any;
  if (!caso) return <div className="tarjeta"><h2>Solicitud no encontrada</h2><Link href="/casos">Volver</Link></div>;

  // Adjuntos de respaldo con URL firmada (misma vista que el panel lateral).
  const { urlFirmada } = await import('@/lib/storage');
  caso.adjuntos = await Promise.all(((adjRaw ?? []) as any[]).map(async (a) => ({
    ...a, href: await urlFirmada(supabase, 'adjuntos', a.url, 3600),
  })));

  // Verificación por campo (0172) best-effort: si la tabla aún no existe, se omite.
  const { data: vcampos } = await supabase.from('casos_verificacion_campo')
    .select('campo, estado, nota, verificado_por, verificado_en').eq('caso_id', id);
  const mapaVC: Record<string, any> = {};
  for (const r of ((vcampos ?? []) as any[])) mapaVC[r.campo] = r;
  caso.verif_campos = mapaVC;

  const [{ data: perfiles }, { data: historial }, { data: sol }, { data: derivaciones }, { data: correcciones }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo, avatar_url').order('nombre_completo'),
    supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en')
      .eq('entidad', 'casos').eq('entidad_id', id).order('creado_en', { ascending: false }).limit(50),
    // Solicitud de insumo enlazada, si el caso ya fue derivado a Logística (Fase 2).
    supabase.from('solicitudes_insumo').select('id, estado').eq('caso_id', id).maybeSingle(),
    // Derivaciones multi-área (0177) best-effort: si la tabla aún no existe, se omite.
    supabase.from('casos_derivaciones').select('*').eq('caso_id', id).order('derivado_en', { ascending: true }),
    // Historial de correcciones (0178, Paso 12) best-effort: si la tabla no existe, se omite.
    supabase.from('casos_historial_cambios').select('*').eq('caso_id', id).order('creado_en', { ascending: false }),
  ]);
  // Áreas de destino que este usuario puede tomar/avanzar/cerrar (espejo de la RPC).
  const areasOperables = areasOperablesDe(rolesDe(perfil));

  return (
    <div style={{ maxWidth: 720 }}>
      <RealtimeRefrescar tabla="casos" filtro={'id=eq.' + id} />
      <Link href="/casos" className="muted">← Solicitudes</Link>
      <div style={{ marginTop: 8 }}>
        <DetalleCaso caso={caso} perfiles={perfiles ?? []} historial={historial ?? []} volver={'/casos/' + id} cerrarHref="/casos" puedeEditar={verifica}
          puedeEditarDatos={esAdministrador(perfil) || (verifica && caso.estado !== 'enviado_redaccion') || (caso.creado_por === user!.id && ['pendiente', 'en_proceso'].includes(caso.estado))}
          esAdmin={esAdministrador(perfil)} esMandoVerif={esMandoVerif} puedeTomar={verifica} miId={user!.id} solicitud={sol}
          derivaciones={derivaciones ?? []} areasOperables={areasOperables} correcciones={correcciones ?? []} />
      </div>
    </div>
  );
}
