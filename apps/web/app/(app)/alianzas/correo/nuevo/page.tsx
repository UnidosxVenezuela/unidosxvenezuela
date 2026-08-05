import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { emailActivo } from '@/lib/email';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import BotonEnviar from '@/components/BotonEnviar';
import EstadoVacio from '@/components/EstadoVacio';
import Redactor, { type PlantillaCorreo } from '../Redactor';
import { enviarCorreoInstitucional } from '../actions';

export const metadata = { title: 'Redactar correo' };
export const dynamic = 'force-dynamic';

/** Composición de un correo institucional a partir de una plantilla (0217).
 *  `searchParams.oportunidad` permite llegar aquí desde la ficha de una empresa. */
export default async function NuevoCorreoPage({ searchParams }: { searchParams: { oportunidad?: string } }) {
  const { perfil } = await requireUsuario();
  if (!puedeAlianzas(perfil)) redirect('/dashboard');
  const supabase = await createClient();

  // Best-effort: sin la migración 0217 las tres consultas fallan y se degrada a un aviso.
  const [plaRes, oppRes, provRes] = await Promise.all([
    supabase.from('correo_plantillas')
      .select('id, clave, nombre, asunto, cuerpo_html, variables')
      .eq('activa', true).order('nombre'),
    supabase.from('oportunidades').select('id, titulo').order('titulo').limit(300),
    supabase.from('proveedores').select('id, nombre').order('nombre').limit(300),
  ]);

  const plantillas = ((plaRes.data ?? []) as any[]).map((p): PlantillaCorreo => ({
    id: p.id, clave: p.clave, nombre: p.nombre, asunto: p.asunto,
    cuerpo_html: p.cuerpo_html, variables: (p.variables ?? null) as string[] | null,
  }));
  const oportunidades = ((oppRes.data ?? []) as any[]).map((o) => ({ id: o.id as string, etiqueta: String(o.titulo ?? '—') }));
  const proveedores = ((provRes.data ?? []) as any[]).map((p) => ({ id: p.id as string, etiqueta: String(p.nombre ?? '—') }));

  return (
    <AnimarEntrada>
      <Link href="/alianzas/correo" className="muted">← Correo institucional</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="documento" size={24} /> Redactar correo</h1>
          <p className="muted sub">Elige la plantilla, completa los datos y revisa la previsualización antes de enviar. El correo se registra aunque el envío falle.</p>
        </div>
      </div>

      {plantillas.length === 0 ? (
        <EstadoVacio icono="pizarra" titulo="No hay plantillas activas"
          texto={plaRes.error
            ? 'Falta aplicar la migración 0217_correo_institucional.sql en la base de datos.'
            : 'Crea la primera plantilla del departamento para poder escribir con el texto institucional aprobado.'}
          accion={plaRes.error ? undefined : { href: '/alianzas/correo/plantillas', etiqueta: 'Ir a plantillas', icono: 'pizarra' }} />
      ) : (
        <form action={enviarCorreoInstitucional} className="tarjeta">
          <Redactor
            plantillas={plantillas}
            oportunidades={oportunidades}
            proveedores={proveedores}
            oportunidadInicial={searchParams.oportunidad}
            correoActivo={emailActivo()}
          />
          <div className="fila" style={{ gap: 8, marginTop: 14, borderTop: '1px solid var(--borde)', paddingTop: 12 }}>
            <BotonEnviar className="btn btn-primario" cargando="Enviando…"><Icono nombre="cohete" size={16} /> Registrar y enviar</BotonEnviar>
            <Link className="btn" href="/alianzas/correo">Cancelar</Link>
          </div>
        </form>
      )}
    </AnimarEntrada>
  );
}
