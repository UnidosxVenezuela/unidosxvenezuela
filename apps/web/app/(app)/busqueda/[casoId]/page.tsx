import Link from 'next/link';
import { fechaHora, fechaCorta } from '@/lib/fechas';
import { nombreMostrado } from '@/lib/nombre';
import {
  ETIQUETA_ESTADO_BUSQUEDA, ESTADOS_BUSQUEDA_CIERRE, claseEstadoBusqueda,
  ETIQUETA_SEXO, SEXOS,
} from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import { guardBusqueda, PanelVerificacion } from '../_guard';
import { tomarCasoBusqueda, cambiarEstadoBusqueda, editarFichaBusqueda } from '../actions';

const SELECT =
  '*, caso:casos!busqueda_casos_caso_id_fkey(id, numero, titulo, descripcion, estado, asignado_a, creado_en, ' +
  'asignado:perfiles!casos_asignado_a_fkey(nombre_completo))';

// Transiciones operativas disponibles en Fase 1 (las de cierre/mando llegan en Fase 3).
const OPERATIVOS: { estado: string; etiqueta: string; icono: string }[] = [
  { estado: 'en_revision', etiqueta: 'Marcar en revisión', icono: 'ojo' },
  { estado: 'coincidencia_pendiente', etiqueta: 'Marcar coincidencia pendiente', icono: 'enlace' },
  { estado: 'activo', etiqueta: 'Volver a activo', icono: 'refrescar' },
];

export default async function BusquedaDetallePage({ params }: { params: { casoId: string } }) {
  const g = await guardBusqueda();
  if (!g.identidadOk) return <PanelVerificacion />;
  const { supabase, user, esAdmin } = g;
  const casoId = params.casoId;

  const { data: fData } = await supabase.from('busqueda_casos').select(SELECT).eq('caso_id', casoId).single();
  const f: any = fData;
  if (!f) return (
    <div className="tarjeta"><h2>Caso no encontrado</h2>
      <p className="muted">No existe o no tienes acceso a este caso de búsqueda.</p>
      <Link href="/busqueda">← Desaparecidos</Link></div>
  );

  const cerrado = ESTADOS_BUSQUEDA_CIERRE.includes(f.estado_busqueda);
  const asignadoAmi = f.caso?.asignado_a === user.id;
  const nombre = f.caso?.titulo ?? '—';

  return (
    <div>
      <RealtimeRefrescar tabla="busqueda_casos" filtro={'caso_id=eq.' + casoId} />
      <Link href="/busqueda" className="muted">← Desaparecidos</Link>
      <div className="fila" style={{ justifyContent: 'space-between', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ margin: 0, gap: 8, flexWrap: 'wrap' }} className="fila">
          <span className="insignia">{f.codigo}</span> {nombre}
          {f.es_nna && <Pill tono="critica" punto={false}>NNA</Pill>}
        </h1>
        <Pill tono={tonoDeClase(claseEstadoBusqueda(f.estado_busqueda))}>{ETIQUETA_ESTADO_BUSQUEDA[f.estado_busqueda as keyof typeof ETIQUETA_ESTADO_BUSQUEDA]}</Pill>
      </div>

      {f.es_nna && (
        <div className="tarjeta fila" style={{ gap: 10, alignItems: 'flex-start', marginTop: 12, background: '#fef2f2', borderColor: '#fecaca' }}>
          <Icono nombre="avisos" size={18} />
          <p className="muted" style={{ margin: 0 }}>
            <strong>Menor de edad.</strong> La coincidencia nunca se confirma directo a quien pregunta:
            se deriva a la autoridad y se verifica la custodia. Extrema la protección de sus datos.
          </p>
        </div>
      )}

      <div className="grupo-grid" style={{ marginTop: 16 }}>
        <div className="grupo-main">
          <div className="tarjeta">
            <div className="grid grid-2">
              <Dato etq="Edad" val={f.edad != null ? `${f.edad} años` : '—'} />
              <Dato etq="Sexo" val={f.sexo ? (ETIQUETA_SEXO[f.sexo] ?? f.sexo) : '—'} />
              <Dato etq="Última ubicación" val={f.ultima_ubicacion || '—'} />
              <Dato etq="Fuente que verificó" val={f.fuente_verifico || '—'} />
            </div>
            {f.caso?.descripcion && <p style={{ whiteSpace: 'pre-wrap', marginTop: 12 }}>{f.caso.descripcion}</p>}
            <div className="muted" style={{ fontSize: '.85rem', marginTop: 10 }}>
              Caso #{String(f.caso?.numero ?? '').padStart(5, '0')} · Registrado {fechaCorta(f.creado_en)}
              {f.caso?.asignado?.nombre_completo && <> · Trabaja: <strong style={{ color: 'var(--texto)' }}>{nombreMostrado(f.caso.asignado.nombre_completo, esAdmin)}</strong></>}
            </div>
          </div>

          {(f.reporta_nombre || f.reporta_telefono) && (
            <div className="tarjeta">
              <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="usuario" size={16} /> Quién reporta</h3>
              <div className="grid grid-2">
                <Dato etq="Nombre" val={f.reporta_nombre || '—'} />
                <Dato etq="Contacto" val={f.reporta_telefono || '—'} />
              </div>
            </div>
          )}

          {/* Editar los datos de la ficha */}
          <details className="tarjeta">
            <summary className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}><Icono nombre="documento" size={16} /> Editar datos de la ficha</summary>
            <form action={editarFichaBusqueda} style={{ marginTop: 12 }}>
              <input type="hidden" name="caso_id" value={casoId} />
              <div className="grid grid-2">
                <div className="campo">
                  <label htmlFor="edad">Edad</label>
                  <input id="edad" name="edad" type="number" min={0} max={130} className="input" defaultValue={f.edad ?? ''} />
                </div>
                <div className="campo">
                  <label htmlFor="sexo">Sexo</label>
                  <select id="sexo" name="sexo" className="input" defaultValue={f.sexo ?? ''}>
                    <option value="">Sin especificar</option>
                    {SEXOS.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
                  </select>
                </div>
              </div>
              <div className="campo">
                <label htmlFor="ultima_ubicacion">Última ubicación</label>
                <input id="ultima_ubicacion" name="ultima_ubicacion" className="input" defaultValue={f.ultima_ubicacion ?? ''} maxLength={200} />
              </div>
              <div className="grid grid-2">
                <div className="campo">
                  <label htmlFor="reporta_nombre">Reporta (nombre)</label>
                  <input id="reporta_nombre" name="reporta_nombre" className="input" defaultValue={f.reporta_nombre ?? ''} maxLength={160} />
                </div>
                <div className="campo">
                  <label htmlFor="reporta_telefono">Reporta (contacto)</label>
                  <input id="reporta_telefono" name="reporta_telefono" className="input" defaultValue={f.reporta_telefono ?? ''} maxLength={40} />
                </div>
              </div>
              <div className="campo">
                <label htmlFor="fuente_verifico">Fuente que verificó</label>
                <input id="fuente_verifico" name="fuente_verifico" className="input" defaultValue={f.fuente_verifico ?? ''} maxLength={160} placeholder="Plataforma donde se verificó" />
              </div>
              <label className="fila" style={{ gap: 8, alignItems: 'center', margin: '4px 0 12px', cursor: 'pointer' }}>
                <input type="checkbox" name="es_nna" defaultChecked={f.es_nna} />
                <span>Es menor de edad (NNA)</span>
              </label>
              <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Guardar datos</BotonEnviar>
            </form>
          </details>
        </div>

        <aside className="grupo-aside">
          {/* Asignación */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="usuario" size={16} /> Asignación</h3>
            {f.caso?.asignado_a ? (
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
                {asignadoAmi ? 'Estás trabajando este caso.' : <>Lo trabaja <strong>{nombreMostrado(f.caso?.asignado?.nombre_completo, esAdmin)}</strong>.</>}
              </p>
            ) : (
              <form action={tomarCasoBusqueda}>
                <input type="hidden" name="caso_id" value={casoId} />
                <BotonEnviar className="btn btn-primario" style={{ width: '100%' }}><Icono nombre="ok" size={16} /> Tomar este caso</BotonEnviar>
              </form>
            )}
          </div>

          {/* Estado operativo */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="flecha" size={16} /> Estado</h3>
            {cerrado ? (
              <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>Caso cerrado: «{ETIQUETA_ESTADO_BUSQUEDA[f.estado_busqueda as keyof typeof ETIQUETA_ESTADO_BUSQUEDA]}».</p>
            ) : (
              <div className="fila" style={{ flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                {OPERATIVOS.filter((o) => o.estado !== f.estado_busqueda).map((o) => (
                  <form key={o.estado} action={cambiarEstadoBusqueda}>
                    <input type="hidden" name="caso_id" value={casoId} />
                    <input type="hidden" name="estado_busqueda" value={o.estado} />
                    <BotonEnviar className="btn" style={{ width: '100%' }}><Icono nombre={o.icono} size={15} /> {o.etiqueta}</BotonEnviar>
                  </form>
                ))}
                <p className="muted" style={{ margin: '4px 0 0', fontSize: '.78rem' }}>
                  La aprobación de coincidencias, la reunificación y el cierre los realiza el <strong>mando</strong> del grupo.
                </p>
              </div>
            )}
          </div>

          {/* Enlace a Coincidencias */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="enlace" size={16} /> Coincidencias</h3>
            <p className="muted" style={{ margin: '0 0 8px', fontSize: '.85rem' }}>Personas halladas que podrían corresponder a este caso.</p>
            <Link href="/coincidencias" className="btn" style={{ width: '100%' }}><Icono nombre="enlace" size={15} /> Ver coincidencias</Link>
          </div>

          {/* Próxima revisión (SLA de seguimiento) */}
          <div className="tarjeta">
            <h3 className="aside-titulo"><Icono nombre="reloj" size={16} /> Seguimiento</h3>
            <p className="muted" style={{ margin: 0, fontSize: '.85rem' }}>
              Próxima revisión: {f.proxima_revision ? fechaHora(f.proxima_revision) : '—'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Dato({ etq, val }: { etq: string; val: string }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>{etq}</div>
      <div style={{ fontWeight: 600 }}>{val}</div>
    </div>
  );
}
