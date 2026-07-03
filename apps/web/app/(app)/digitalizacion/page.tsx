import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUsuario, esAdministrador, rolesDe } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_LUGAR, ETIQUETA_ESTADO_LUGAR } from '@/lib/constantes';
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
  if (!esAdmin && !esDig) redirect('/dashboard');
  const supabase = await createClient();

  // El rol digitalizador necesita la 2ª verificación (identidad) aprobada.
  if (!esAdmin) {
    const { data: vi } = await supabase.from('verificaciones_identidad').select('estado').eq('perfil_id', user!.id).maybeSingle();
    if ((vi as any)?.estado !== 'aprobada') {
      return (
        <AnimarEntrada>
          <div className="pagina-cab"><div><h1>Digitalización</h1></div></div>
          <div className="tarjeta" style={{ maxWidth: 560 }}>
            <h2 className="fila" style={{ gap: 8, marginTop: 0 }}><Icono nombre="llave" size={20} /> Completa tu segunda verificación</h2>
            <p className="muted">Para digitalizar listados de personas necesitas aprobar tu <strong>verificación de identidad</strong>. Es un paso obligatorio para tu rol.</p>
            <Link href="/verificacion" className="btn btn-primario"><Icono nombre="llave" size={16} /> Ir a mi verificación</Link>
          </div>
        </AnimarEntrada>
      );
    }
  }

  const { data: listadosRaw } = await supabase.from('listados_digitalizados')
    .select('id, tipo_lugar, lugar_nombre, documento_path, lat, lng, creado_en, personas_listado(count), lugares(estado)')
    .order('creado_en', { ascending: false }).limit(100);
  const listados = (listadosRaw ?? []) as any[];
  const conteo = (l: any) => Number(l?.personas_listado?.[0]?.count ?? 0);
  const totalPersonas = listados.reduce((s, l) => s + conteo(l), 0);

  return (
    <AnimarEntrada>
      <Consejo id="digitalizacion" titulo="Digitalizar listados">
        Sube o <strong>fotografía</strong> una lista (hospital, albergue o centro de acopio); el texto se reconoce <strong>en tu propio dispositivo</strong> y tú <strong>confirmas línea por línea</strong> antes de guardar. Así la data correcta queda en la base de datos.
      </Consejo>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="imagen" size={24} /> Digitalización</h1>
          <p className="muted sub">Convierte listas de personas en registros verificados. {totalPersonas > 0 && <>Ya hay <strong>{totalPersonas}</strong> personas digitalizadas.</>}</p>
        </div>
        <div className="fila" style={{ gap: 8 }}>
          {esAdmin && <Link className="btn" href="/digitalizacion/lugares"><Icono nombre="mapa" /> Moderar lugares</Link>}
          <Link className="btn btn-primario" href="/digitalizacion/nueva"><Icono nombre="mas" /> Nueva digitalización</Link>
        </div>
      </div>

      {listados.length === 0 ? (
        <EstadoVacio icono="imagen" titulo="Aún no hay listados"
          texto="Empieza subiendo una foto o escaneo de una lista de personas. El reconocimiento corre en tu dispositivo y confirmas cada línea antes de guardar." />
      ) : (
        <div className="grid grid-2">
          {listados.map((l) => (
            <div key={l.id} className="tarjeta">
              <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <BadgeCategoria>{ETIQUETA_TIPO_LUGAR[l.tipo_lugar] ?? l.tipo_lugar}</BadgeCategoria>
                <span className="fila muted" style={{ gap: 4, fontSize: '.85rem' }}>
                  <Icono nombre="grupos" size={15} /> {conteo(l)} personas
                </span>
              </div>
              <h2 style={{ margin: '8px 0 4px' }}>{l.lugar_nombre}</h2>
              <div className="fila muted" style={{ gap: 8, fontSize: '.82rem', flexWrap: 'wrap' }}>
                <span>{fechaHora(l.creado_en)}</span>
                {l.documento_path && <Pill tono="neutra" punto={false}>con documento</Pill>}
                {(() => { const est = (l as any).lugares?.estado; return est ? <Pill tono={est === 'verificado' ? 'ok' : 'aviso'} punto={false}>{ETIQUETA_ESTADO_LUGAR[est] ?? est}</Pill> : null; })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </AnimarEntrada>
  );
}
