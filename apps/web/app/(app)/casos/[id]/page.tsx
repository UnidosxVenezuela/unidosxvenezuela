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

  // Desglose por ítem (0218) best-effort: si la tabla aún no existe, la consulta vuelve
  // vacía y el bloque degrada mostrando el texto libre de `req_cantidad`.
  const { data: items } = await supabase.from('casos_items')
    .select('id, orden, tipo, descripcion, cantidad, unidad, cantidad_texto, notas, estado')
    .eq('caso_id', id).order('orden');
  // Quién puede editar el desglose lo decide la BD (`puede_gestionar_items_caso`, 0218):
  // incluye Logística y los mandos, más ancho que los gates de esta página. Si la
  // función aún no existe, rpc devuelve error → false (no rompe).
  const { data: gestionaItems } = await supabase.rpc('puede_gestionar_items_caso');

  // Historial de cambios de esos ítems (0219) best-effort: quién cambió qué y cuándo.
  // Se consulta por los ids ya cargados; sin ítems no se consulta nada.
  const idsItems = ((items ?? []) as any[]).map((i) => i.id);
  let cambiosItems: any[] = [];
  let aportesItems: any[] = [];
  if (idsItems.length > 0) {
    const { data: ci } = await supabase.from('casos_items_historial')
      .select('id, item_id, campo, valor_anterior, valor_nuevo, actor_id, creado_en')
      .in('item_id', idsItems).order('creado_en', { ascending: false });
    cambiosItems = (ci ?? []) as any[];
    // Cumplimiento por ítem (0221) best-effort: cuánto se cubrió y quién lo puso. Por la
    // RPC curada, que resuelve el nombre del tercero/proveedor/afiliado/centro.
    const { data: ap } = await supabase.rpc('aportes_de_caso', { p_caso: id });
    aportesItems = (ap as any[]) ?? [];
  }

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
  // Qué ítems del desglose se envió a cada área (puente 0222) best-effort: sin la tabla,
  // la consulta vuelve vacía y cada derivación se lee como «la solicitud completa».
  let derivacionItems: any[] = [];
  {
    const idsDeriv = ((derivaciones ?? []) as any[]).map((d) => d.id);
    if (idsDeriv.length > 0) {
      const { data: dit } = await supabase.from('casos_derivacion_items')
        .select('derivacion_id, item_id').in('derivacion_id', idsDeriv);
      derivacionItems = (dit ?? []) as any[];
    }
  }

  // Áreas de destino que este usuario puede tomar/avanzar/cerrar (espejo de la RPC).
  const areasOperables = areasOperablesDe(rolesDe(perfil));

  return (
    <div style={{ maxWidth: 720 }}>
      <RealtimeRefrescar tabla="casos" filtro={'id=eq.' + id} />
      <RealtimeRefrescar tabla="casos_items" filtro={'caso_id=eq.' + id} />
      {/* Un aporte parcial no cambia `casos_items` (0221): sin esto, «4 de 5» no llegaría en vivo. */}
      <RealtimeRefrescar tabla="casos_item_aportes" />
      <Link href="/casos" className="muted">← Solicitudes</Link>
      <div style={{ marginTop: 8 }}>
        <DetalleCaso caso={caso} perfiles={perfiles ?? []} historial={historial ?? []} volver={'/casos/' + id} cerrarHref="/casos" puedeEditar={verifica}
          puedeEditarDatos={esAdministrador(perfil) || (verifica && caso.estado !== 'enviado_redaccion') || (caso.creado_por === user!.id && ['pendiente', 'en_proceso'].includes(caso.estado))}
          esAdmin={esAdministrador(perfil)} esMandoVerif={esMandoVerif} puedeTomar={verifica} miId={user!.id} solicitud={sol}
          derivaciones={derivaciones ?? []} areasOperables={areasOperables} correcciones={correcciones ?? []}
          items={(items ?? []) as any[]} puedeGestionarItems={gestionaItems === true} cambiosItems={cambiosItems as any[]}
          aportesItems={aportesItems as any[]} derivacionItems={derivacionItems as any[]} />
      </div>
    </div>
  );
}
