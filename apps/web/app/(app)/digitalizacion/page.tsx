import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, esAdminDigitalizacion, esVerificadorDigitalizacion, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_LUGAR, ETIQUETA_ESTADO_LUGAR, ETIQUETA_ESTADO_LISTADO, tonoEstadoListado } from '@/lib/constantes';
import { fechaHora } from '@/lib/fechas';
import Icono from '@/components/Icono';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BadgeCategoria from '@/components/BadgeCategoria';
import Pill from '@/components/Pill';
import Consejo from '@/components/Consejos';

export default async function DigitalizacionPage() {
  const { user, perfil } = await requireUsuario();
  const esAdmin = esAdministrador(perfil);
  const roles = rolesDe(perfil);
  const esDig = roles.includes('digitalizador');
  // El Admin de Digitalización opera/supervisa su propia área (0124).
  const supervisa = esAdminDigitalizacion(perfil);
  // El Verificador de Digitalización revisa/corrige los listados (0125).
  const esVerif = esVerificadorDigitalizacion(perfil);
  if (!esAdmin && !esDig && !supervisa && !esVerif) redirect('/dashboard');
  const supabase = await createClient();

  // Todos los roles operativos necesitan la 2ª verificación (identidad) aprobada.
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') {
      return (
        <AnimarEntrada>
          <div className="pagina-cab"><div><h1>Digitalización</h1></div></div>
          <div className="tarjeta" style={{ maxWidth: 560 }}>
            <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre="llave" size={20} /> Completa tu segunda verificación</h2>
            <p className="muted">Para digitalizar o revisar listados de personas necesitas aprobar tu <strong>verificación de identidad</strong>. Es un paso obligatorio para tu rol.</p>
            <Link href="/verificacion" className="btn btn-primario"><Icono nombre="llave" size={16} /> Ir a mi verificación</Link>
          </div>
        </AnimarEntrada>
      );
    }
  }

  // Quien revisa (admin, verificador o admin de Digitalización) ve la cola de pendientes.
  const puedeRevisar = esAdmin || esVerif || supervisa;
  // El verificador puro entra directo a revisar (no captura): la captura es del digitalizador.
  const puedeCapturar = esAdmin || esDig || supervisa;

  const COLS = 'id, tipo_lugar, lugar_nombre, documento_path, lat, lng, creado_en, estado, personas_listado(count), lugares(estado)';
  const [{ data: listadosRaw }, { data: pendientesRaw }] = await Promise.all([
    supabase.from('listados_digitalizados').select(COLS).order('creado_en', { ascending: false }).limit(100),
    puedeRevisar
      ? supabase.from('listados_digitalizados').select(COLS).in('estado', ['por_verificar', 'observado']).order('creado_en', { ascending: true }).limit(200)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const listados = (listadosRaw ?? []) as any[];
  const pendientes = (pendientesRaw ?? []) as any[];
  const conteo = (l: any) => Number(l?.personas_listado?.[0]?.count ?? 0);
  const totalPersonas = listados.reduce((s, l) => s + conteo(l), 0);

  const Tarjeta = ({ l }: { l: any }) => (
    <Link key={l.id} href={'/digitalizacion/' + l.id} className="tarjeta" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <BadgeCategoria>{ETIQUETA_TIPO_LUGAR[l.tipo_lugar] ?? l.tipo_lugar}</BadgeCategoria>
        <span className="fila muted" style={{ gap: 4, fontSize: '.85rem' }}>
          <Icono nombre="grupos" size={15} /> {conteo(l)} personas
        </span>
      </div>
      <h2 style={{ margin: '8px 0 4px' }}>{l.lugar_nombre}</h2>
      <div className="fila muted" style={{ gap: 8, fontSize: '.82rem', flexWrap: 'wrap' }}>
        <span>{fechaHora(l.creado_en)}</span>
        {l.estado && <Pill tono={tonoEstadoListado(l.estado)} punto={false}>{ETIQUETA_ESTADO_LISTADO[l.estado as keyof typeof ETIQUETA_ESTADO_LISTADO] ?? l.estado}</Pill>}
        {l.documento_path && <Pill tono="neutra" punto={false}>con documento</Pill>}
        {(() => { const est = (l as any).lugares?.estado; return est ? <Pill tono={est === 'verificado' ? 'ok' : 'aviso'} punto={false}>{ETIQUETA_ESTADO_LUGAR[est] ?? est}</Pill> : null; })()}
      </div>
    </Link>
  );

  return (
    <AnimarEntrada>
      <Consejo id="digitalizacion" titulo="Digitalizar listados">
        Sube o <strong>fotografía</strong> una lista (hospital, albergue o centro de acopio); el texto se reconoce <strong>en tu propio dispositivo</strong> y tú <strong>confirmas línea por línea</strong>. Luego <strong>Verificación de Digitalización</strong> revisa y corrige antes de que se active el cruce con desaparecidos.
      </Consejo>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="imagen" size={24} /> Digitalización</h1>
          <p className="muted sub">Convierte listas de personas en registros verificados. {totalPersonas > 0 && <>Ya hay <strong>{totalPersonas}</strong> personas digitalizadas.</>}</p>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          {(esAdmin || supervisa) && <Link className="btn" href="/digitalizacion/lugares"><Icono nombre="mapa" /> Moderar lugares</Link>}
          {puedeCapturar && <Link className="btn btn-primario" href="/digitalizacion/nueva"><Icono nombre="mas" /> Nueva digitalización</Link>}
        </div>
      </div>

      {puedeRevisar && (
        <>
          <h2 className="fila" style={{ gap: 8 }}><Icono nombre="ok" size={18} /> Por verificar <span className="insignia aviso">{pendientes.length}</span></h2>
          {pendientes.length === 0 ? (
            <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>No hay listados esperando revisión. ¡Al día!</p></div>
          ) : (
            <div className="grid grid-2" style={{ marginBottom: 20 }}>
              {pendientes.map((l) => <Tarjeta key={l.id} l={l} />)}
            </div>
          )}
        </>
      )}

      {puedeRevisar && listados.length > 0 && <h2>Todos los listados</h2>}
      {listados.length === 0 ? (
        <EstadoVacio icono="imagen" titulo="Aún no hay listados"
          texto="Empieza subiendo una foto o escaneo de una lista de personas. El reconocimiento corre en tu dispositivo y confirmas cada línea antes de guardar." />
      ) : (
        <div className="grid grid-2">
          {listados.map((l) => <Tarjeta key={l.id} l={l} />)}
        </div>
      )}
    </AnimarEntrada>
  );
}
