import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { requireUsuario, puedeAfiliacion } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_AFILIADO } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import CamposAfiliado from '../CamposAfiliado';
import { editarAfiliado, cambiarEstadoAfiliado, eliminarAfiliado } from '../actions';

export const metadata = { title: 'Afiliado' };
export const dynamic = 'force-dynamic';

export default async function AfiliadoDetallePage({ params }: { params: { id: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeAfiliacion(perfil)) redirect('/dashboard');
  const supabase = await createClient();
  const { data: a } = await supabase.from('afiliados').select('*').eq('id', params.id).maybeSingle();
  if (!a) notFound();

  return (
    <AnimarEntrada>
      <Link href={'/afiliacion?tipo=' + a.tipo} className="muted">← Afiliación</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="usuario" size={22} /> {a.nombre}</h1>
          <p className="muted sub">
            {ETIQUETA_TIPO_AFILIADO[a.tipo as 'profesional' | 'voluntario']}
            {a.cargo ? ' · ' + a.cargo : ''}{a.estado === 'inactivo' ? ' · Inactivo' : ''}
          </p>
        </div>
        <form action={cambiarEstadoAfiliado}>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="estado" value={a.estado === 'activo' ? 'inactivo' : 'activo'} />
          <BotonEnviar className="btn btn-sm">{a.estado === 'activo' ? 'Marcar inactivo' : 'Reactivar'}</BotonEnviar>
        </form>
      </div>

      <form action={editarAfiliado} className="tarjeta">
        <input type="hidden" name="id" value={a.id} />
        <CamposAfiliado a={a} />
        <div style={{ marginTop: 12 }}>
          <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Guardar cambios</BotonEnviar>
        </div>
      </form>

      <div className="fila" style={{ marginTop: 12, justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p className="muted" style={{ fontSize: '.8rem', margin: 0 }}>Registrado {fechaHora(a.creado_en)}.</p>
        <form action={eliminarAfiliado}>
          <input type="hidden" name="id" value={a.id} />
          <BotonConfirmar mensaje="¿Eliminar este afiliado?" className="btn btn-peligro btn-sm">Eliminar afiliado</BotonConfirmar>
        </form>
      </div>
    </AnimarEntrada>
  );
}
