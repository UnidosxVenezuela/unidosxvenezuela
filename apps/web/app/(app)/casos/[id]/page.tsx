import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeVerificar, puedeRecopilar } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import DetalleCaso from '../DetalleCaso';

export default async function CasoDetallePage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeRecopilar(perfil?.rol)) redirect('/dashboard');
  const supabase = await createClient();
  const id = params.id;

  const { data: caso } = await supabase.from('casos')
    .select('id, numero, titulo, descripcion, categoria, fuente, fuente_url, fecha_publicacion, asignado_a, estado, notas, creado_en, actualizado_en')
    .eq('id', id).single() as any;
  if (!caso) return <div className="tarjeta"><h2>Caso no encontrado</h2><Link href="/casos">Volver</Link></div>;

  const [{ data: perfiles }, { data: historial }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre_completo').order('nombre_completo'),
    supabase.from('registro_auditoria').select('id, actor_id, accion, metadata, creado_en')
      .eq('entidad', 'casos').eq('entidad_id', id).order('creado_en', { ascending: false }).limit(50),
  ]);

  return (
    <div style={{ maxWidth: 720 }}>
      <RealtimeRefrescar tabla="casos" filtro={'id=eq.' + id} />
      <Link href="/casos" className="muted">← Verificación</Link>
      <div style={{ marginTop: 8 }}>
        <DetalleCaso caso={caso} perfiles={perfiles ?? []} historial={historial ?? []} volver={'/casos/' + id} cerrarHref="/casos" puedeEditar={puedeVerificar(perfil?.rol)} />
      </div>
    </div>
  );
}
