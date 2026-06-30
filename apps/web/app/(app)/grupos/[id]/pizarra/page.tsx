import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUsuario, esCoordinacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import PizarraGrupo from './PizarraGrupo';

export default async function PizarraPage({ params }: { params: { id: string } }) {
  const { user, perfil } = await requireUsuario();
  const supabase = await createClient();
  const grupoId = params.id;

  const { data: grupo } = await supabase.from('grupos').select('id, nombre').eq('id', grupoId).single();
  if (!grupo) redirect('/grupos');

  // Solo miembros del grupo o coordinación.
  const { data: miembro } = await supabase.from('miembros_grupo')
    .select('perfil_id').eq('grupo_id', grupoId).eq('perfil_id', user!.id).maybeSingle();
  if (!esCoordinacion(perfil) && !miembro) redirect('/grupos/' + grupoId);

  const { data: piz } = await supabase.from('pizarra_grupo')
    .select('escena').eq('grupo_id', grupoId).maybeSingle();

  return (
    <div>
      <Link href={'/grupos/' + grupoId} className="muted">← {grupo.nombre}</Link>
      <h1 style={{ marginBottom: 0 }}>Pizarra · {grupo.nombre}</h1>
      <p className="muted">Lluvia de ideas colaborativa. Se guarda solo; los cambios de otros aparecen en vivo.</p>
      <PizarraGrupo grupoId={grupoId} escenaInicial={(piz?.escena as any) ?? null} miId={user!.id} />
    </div>
  );
}
