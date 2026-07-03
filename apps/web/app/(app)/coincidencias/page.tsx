import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_LUGAR, ETIQUETA_CONDICION } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import Consejo from '@/components/Consejos';
import { confirmarCoincidencia, descartarCoincidencia } from './actions';

const TONO: Record<string, 'ok' | 'aviso' | 'critica' | 'neutra'> = { nueva: 'aviso', confirmada: 'ok', descartada: 'neutra' };
const ETIQ_ESTADO: Record<string, string> = { nueva: 'Nueva', confirmada: 'Confirmada', descartada: 'Descartada' };

export default async function CoincidenciasPage() {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const esBusq = rolesDe(perfil).includes('busqueda');
  if (!esAdmin && !esBusq) redirect('/dashboard');
  const supabase = await createClient();

  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') {
      return (
        <AnimarEntrada>
          <div className="pagina-cab"><div><h1>Coincidencias</h1></div></div>
          <div className="tarjeta" style={{ maxWidth: 560 }}>
            <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre="llave" size={20} /> Completa tu segunda verificación</h2>
            <p className="muted">Para revisar coincidencias con desaparecidos necesitas tu <strong>verificación de identidad</strong> aprobada.</p>
            <Link href="/verificacion" className="btn btn-primario"><Icono nombre="llave" size={16} /> Ir a mi verificación</Link>
          </div>
        </AnimarEntrada>
      );
    }
  }

  const { data: filasRaw } = await supabase.rpc('listar_coincidencias');
  const filas = (filasRaw ?? []) as any[];
  const nuevas = filas.filter((c) => c.estado === 'nueva').length;

  return (
    <AnimarEntrada>
      <Consejo id="coincidencias" titulo="Coincidencias con desaparecidos">
        Cuando una <strong>persona digitalizada</strong> (en un hospital, albergue o acopio) coincide con un caso de <strong>desaparecidos</strong>, aparece aquí. Revisa cada una y <strong>confírmala o descártala</strong>. Presta especial atención a los <strong>menores</strong>.
      </Consejo>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="enlace" size={24} /> Coincidencias</h1>
          <p className="muted sub">Posibles reunificaciones entre personas halladas y desaparecidos. {nuevas > 0 && <><strong>{nuevas}</strong> por revisar.</>}</p>
        </div>
      </div>

      {filas.length === 0 ? (
        <EstadoVacio icono="enlace" titulo="Sin coincidencias por ahora"
          texto="Cuando se digitalicen listas de personas, el sistema las comparará con los desaparecidos y las coincidencias aparecerán aquí." />
      ) : filas.map((c) => (
        <div key={c.id} className="tarjeta">
          <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Pill tono={TONO[c.estado] ?? 'neutra'} punto={false}>{ETIQ_ESTADO[c.estado] ?? c.estado}</Pill>
              <Pill tono="neutra" punto={false}>{c.motivo === 'cedula' ? 'Coincide por cédula' : 'Coincide por nombre'}</Pill>
              {c.es_menor && <Pill tono="critica" punto={false}>Menor de edad</Pill>}
            </span>
            <span className="muted" style={{ fontSize: '.82rem' }}>{fechaHora(c.creado_en)}</span>
          </div>

          <div className="grid grid-2" style={{ marginTop: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>Persona hallada</div>
              <div style={{ fontWeight: 600 }}>{c.persona_nombre}</div>
              <div className="muted" style={{ fontSize: '.85rem' }}>
                {c.persona_cedula ? `C.I. ${c.persona_cedula} · ` : ''}
                {c.persona_edad != null ? `${c.persona_edad} años · ` : ''}
                {ETIQUETA_CONDICION[c.persona_condicion] ?? c.persona_condicion}
              </div>
              {c.lugar_nombre && <div className="muted" style={{ fontSize: '.85rem' }}><Icono nombre="ubicacion" size={13} /> {ETIQUETA_TIPO_LUGAR[c.lugar_tipo] ?? c.lugar_tipo}: {c.lugar_nombre}</div>}
            </div>
            <div>
              <div className="muted" style={{ fontSize: '.75rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>Caso de desaparecido</div>
              <div style={{ fontWeight: 600 }}>#{String(c.caso_numero).padStart(5, '0')}</div>
              <div className="muted" style={{ fontSize: '.85rem' }}>{c.caso_titulo}</div>
              <Link href={'/casos?caso=' + c.caso_id} className="muted" style={{ fontSize: '.85rem' }}>Abrir el caso →</Link>
            </div>
          </div>

          {c.estado === 'nueva' && (
            <div className="fila" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <form action={confirmarCoincidencia}>
                <input type="hidden" name="id" value={c.id} />
                <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Confirmar coincidencia</BotonEnviar>
              </form>
              <form action={descartarCoincidencia}>
                <input type="hidden" name="id" value={c.id} />
                <BotonEnviar className="btn"><Icono nombre="cerrar" size={16} /> Descartar</BotonEnviar>
              </form>
            </div>
          )}
        </div>
      ))}
    </AnimarEntrada>
  );
}
