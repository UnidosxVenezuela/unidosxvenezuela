import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUsuario, puedeLogistica, puedeAlianzas } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_INSUMO, ESTADOS_INSUMO, clasePrioridad, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import { resumenItems, resumenCobertura, type AporteItem } from '@/lib/flujo';
import { BarraCobertura, pctTerceros } from '@/components/AportesItem';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import PillPais from '@/components/PillPais';
import Kpi from '@/components/Kpi';
import FlujoProgreso from '@/components/FlujoProgreso';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import ResaltarNuevos from '@/components/ResaltarNuevos';

export default async function InsumosPage() {
  const { perfil } = await requireUsuario();
  // Gates con los HELPERS, nunca con rolesDe().includes(): `puedeLogistica` incluye al
  // MANDO del grupo de Logística (líder/coordinador sin rol operativo, 0214), que la RLS
  // sí reconoce; escribirlo a mano lo dejaba fuera de su propia área.
  const esLog = puedeLogistica(perfil);
  // Alianzas Estratégicas entra en modo CONSULTA (0163): revisa las solicitudes y deja en
  // su bitácora referencias de empresas y aliados; no gestiona ni avanza nada (eso es de
  // Logística). Mismo criterio que /insumos/[id] (0216: un solo rol de departamento).
  const esCapt = !esLog && puedeAlianzas(perfil);
  if (!esLog && !esCapt) redirect('/dashboard');

  const supabase = await createClient();
  // El PAÍS (0230) sale del caso, no de la solicitud: `solicitudes_insumo` no lo guarda y
  // no hace falta que lo guarde —desde 0223 toda solicitud nace con su caso detrás, y ese
  // caso ya lo tiene—. Se pide en el join que esta página ya hacía para el número.
  const COLS_BASE = 'id, titulo, tipo, cantidad, urgencia, estado, creado_en, actualizado_en, caso_id, puntos_acopio(nombre), proveedores(nombre)';
  const consulta = (cols: string) => supabase.from('solicitudes_insumo').select(cols).order('creado_en', { ascending: false });
  const [solRes, { count: oportCount }] = await Promise.all([
    consulta(COLS_BASE + ', casos(numero, pais)'),
    supabase.from('oportunidades_donacion').select('*', { count: 'exact', head: true }).neq('estado', 'descartada'),
  ]);
  // Sin 0230 aplicada, `casos(numero, pais)` tumbaría la consulta ENTERA y el tablero
  // quedaría vacío. Se reintenta con el join de siempre: mejor sin bandera que sin tablero.
  let data = solRes.data as any;
  if (solRes.error) ({ data } = await consulta(COLS_BASE + ', casos(numero)') as any);
  const solicitudes = (data ?? []) as any[];
  const activas = solicitudes.filter((s) => s.estado !== 'cancelado');
  const entregadas = solicitudes.filter((s) => s.estado === 'entregado').length;
  const porEstado = (e: string) => activas.filter((s) => s.estado === e);
  // Cobertura de hoy: cuántas solicitudes ya salieron de «solicitado» (en gestión, en ruta o entregadas).
  const enCurso = activas.filter((s) => s.estado !== 'solicitado').length;
  const pctCobertura = activas.length ? Math.round((enCurso / activas.length) * 100) : 0;

  // Desglose por ítem (0218) de las solicitudes derivadas de un caso: en la tarjeta, además
  // del estado agregado, se ve CUÁNTO del desglose está cubierto (0220). Una sola consulta
  // para todo el tablero; la lectura la concede `citems_select` (es_verificado). Best-effort:
  // sin la migración vuelve vacío y las tarjetas quedan como estaban.
  const casoIds = Array.from(new Set(solicitudes.map((s) => s.caso_id).filter(Boolean))) as string[];
  const itemsPorCaso = new Map<string, { id: string; estado?: string | null; cantidad?: number | null }[]>();
  const aportesPorCaso = new Map<string, AporteItem[]>();
  if (casoIds.length > 0) {
    const { data: its } = await supabase.from('casos_items').select('id, caso_id, estado, cantidad').in('caso_id', casoIds);
    // Derivación selectiva (0222): si Verificación repartió el desglose, este tablero solo
    // debe contar LO QUE SE LE DERIVÓ A LOGÍSTICA — si no, la barra diría que faltan tres
    // ítems que en realidad son de Alianzas. Sin puente (o sin la migración) se cuentan
    // todos, exactamente como antes.
    const soloLogistica = new Map<string, Set<string>>();
    {
      const { data: dls } = await supabase.from('casos_derivaciones')
        .select('id, caso_id').in('caso_id', casoIds).eq('area', 'logistica');
      const casoDeDeriv = new Map<string, string>(((dls ?? []) as any[]).map((d) => [d.id, d.caso_id]));
      if (casoDeDeriv.size > 0) {
        const { data: puente } = await supabase.from('casos_derivacion_items')
          .select('derivacion_id, item_id').in('derivacion_id', Array.from(casoDeDeriv.keys()));
        for (const r of ((puente ?? []) as any[])) {
          const caso = casoDeDeriv.get(r.derivacion_id);
          if (!caso) continue;
          const s = soloLogistica.get(caso) ?? new Set<string>();
          s.add(r.item_id);
          soloLogistica.set(caso, s);
        }
      }
    }
    const casoDeItem = new Map<string, string>();
    for (const it of ((its ?? []) as any[])) {
      const permitidos = soloLogistica.get(it.caso_id);
      if (permitidos && !permitidos.has(it.id)) continue;   // ese ítem se derivó a otra área
      const arr = itemsPorCaso.get(it.caso_id) ?? [];
      arr.push({ id: it.id, estado: it.estado, cantidad: it.cantidad });
      itemsPorCaso.set(it.caso_id, arr);
      casoDeItem.set(it.id, it.caso_id);
    }
    // Cuánto se cubrió y qué parte la pusieron terceros (0221). Una sola consulta para
    // todo el tablero; la lectura la concede `citem_aportes_select` (es_verificado).
    if (casoDeItem.size > 0) {
      const { data: aps } = await supabase.from('casos_item_aportes')
        .select('id, item_id, cantidad, origen').in('item_id', Array.from(casoDeItem.keys()));
      for (const a of ((aps ?? []) as any[])) {
        const caso = casoDeItem.get(a.item_id);
        if (!caso) continue;
        const arr = aportesPorCaso.get(caso) ?? [];
        arr.push(a as AporteItem);
        aportesPorCaso.set(caso, arr);
      }
    }
  }

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="solicitudes_insumo" />
      {/* El avance por ítem también llega en vivo: lo mueve Logística, pero el desglose lo
          editan además Recopilación y Verificación (0218). */}
      <RealtimeRefrescar tabla="casos_items" />
      {/* Y el cumplimiento (0221): un aporte parcial no cambia `casos_items`. */}
      <RealtimeRefrescar tabla="casos_item_aportes" />
      <div className="pagina-cab">
        <div>
          <h1>Logística</h1>
          <p className="muted sub">Conecta las dos caras de la ayuda: las solicitudes de los centros de acopio y las ofertas de quienes quieren donar, hasta la entrega.</p>
        </div>
        <div className="fila">
          <BotonActualizar />
          <Link className="btn" href="/insumos/oportunidades"><Icono nombre="corazon" size={16} /> Donación-Ofrecimiento</Link>
          <Link className="btn" href="/insumos/servicios"><Icono nombre="reloj" size={16} /> Servicios</Link>
          {esLog && (
            <>
              <Link className="btn" href="/insumos/captacion"><Icono nombre="enlace" size={16} /> Captación</Link>
              <Link className="btn" href="/insumos/transportistas"><Icono nombre="camion" size={16} /> Transportistas</Link>
              <Link className="btn btn-primario" href="/insumos/nueva"><Icono nombre="mas" /> Nueva solicitud</Link>
            </>
          )}
        </div>
      </div>

      {esCapt && (
        <p className="muted fila" style={{ gap: 6, fontSize: '.88rem', marginTop: 4 }}>
          <Icono nombre="ojo" size={15} /> Vista de <strong>consulta para Alianzas Estratégicas</strong>: abre una solicitud y deja en su <strong>bitácora</strong> las empresas o alianzas que puedan ayudar a completarla. La gestión y el avance son de Logística.
        </p>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Solicitudes activas" valor={activas.length} sub="Pedidos en curso" color="var(--azul)" icono="camion" tinte="#eef2ff" />
        <Kpi etiqueta="En ruta" valor={porEstado('en_ruta').length} sub="En camino a destino" color="#a16207" icono="camion" tinte="#fef9c3" />
        <Kpi etiqueta="Entregadas" valor={entregadas} sub="Ciclo cerrado" color="#16a34a" icono="ok" tinte="#d1fae5" />
        <Kpi etiqueta="Donación-Ofrecimiento" valor={oportCount ?? 0} sub="Ofrecimientos activos" color="#0f766e" icono="corazon" tinte="#f0fdfa" href="/insumos/oportunidades" />
      </div>

      {activas.length > 0 && (
        <div className="cobertura">
          <span className="cobertura-et">Cobertura de hoy</span>
          <div className="cobertura-barra" role="progressbar" aria-valuenow={pctCobertura} aria-valuemin={0} aria-valuemax={100} aria-label="Cobertura de solicitudes de hoy">
            <div className="cobertura-fill" style={{ width: pctCobertura + '%' }} />
          </div>
          <span className="muted" style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{enCurso} de {activas.length} en curso o cubiertas</span>
        </div>
      )}

      {activas.length === 0 ? (
        <EstadoVacio
          icono="camion"
          titulo="Aún no hay solicitudes"
          texto="Crea la primera solicitud de insumos para empezar a organizar la ayuda."
          accion={esLog ? { href: '/insumos/nueva', etiqueta: 'Nueva solicitud' } : undefined}
        />
      ) : (
        <ResaltarNuevos>
        <div className="tablero-insumos">
          {ESTADOS_INSUMO.map((e) => (
            <div key={e} className="tablero-col">
              <h3 className="fila" style={{ gap: 6, justifyContent: 'space-between' }}>
                <span>{ETIQUETA_ESTADO_INSUMO[e] ?? e}</span>
                <span className="insignia">{porEstado(e).length}</span>
              </h3>
              {porEstado(e).length === 0 && <p className="muted" style={{ fontSize: '.85rem', margin: '0 4px' }}>—</p>}
              {porEstado(e).map((s) => (
                <Link key={s.id} data-fila href={'/insumos/' + s.id} className="tarjeta insumo-card">
                  <div className="fila" style={{ justifyContent: 'space-between', gap: 6 }}>
                    <span className="insignia">{ETIQUETA_TIPO_INSUMO[s.tipo] ?? s.tipo}</span>
                    <Pill tono={tonoDeClase(clasePrioridad(s.urgencia))} punto={false}>
                      {ETIQUETA_PRIORIDAD[s.urgencia as keyof typeof ETIQUETA_PRIORIDAD] ?? s.urgencia}
                    </Pill>
                  </div>
                  {/* País (0230) antes que el número y la fecha: con dos respuestas a la
                      vez, saber si la entrega es de Venezuela o de Colombia decide el
                      centro de acopio, el transportista y si hay frontera de por medio.
                      Va en pastilla y no en texto gris porque tiene que verse de un
                      vistazo, sin abrir la solicitud.

                      Se pinta SOLO cuando de verdad se sabe. El país vive en el caso, y
                      hay una situación en la que este tablero no puede leerlo: que la RLS
                      no conceda ese caso a quien mira (Alianzas entra en consulta y no
                      tiene rama en `casos_select`; Logística la pierde si el caso vuelve a
                      verificación). Ahí no hay pastilla: caer al DEFAULT «Venezuela» sería
                      afirmar algo que nadie registró, y es justo el error que 0230 quiso
                      evitar. Una solicitud SIN caso detrás sí la lleva: son anteriores a
                      0223, de cuando la plataforma solo atendía Venezuela. */}
                  <div className="fila" style={{ gap: 6, marginTop: 5 }}>
                    {(s.casos || !s.caso_id) && <PillPais pais={s.casos?.pais} />}
                    {(s.casos?.numero != null || s.actualizado_en) && (
                      <span className="muted" style={{ fontSize: '.75rem' }}>
                        {s.casos?.numero != null && <strong style={{ color: 'var(--texto)' }}>#{String(s.casos.numero).padStart(5, '0')}</strong>}
                        {s.casos?.numero != null && s.actualizado_en ? ' · ' : ''}
                        {s.actualizado_en && <>Act. {fechaHora(s.actualizado_en)}</>}
                      </span>
                    )}
                  </div>
                  <strong style={{ display: 'block', margin: '6px 0 2px' }}>{s.titulo}</strong>
                  {s.cantidad && <div className="muted" style={{ fontSize: '.85rem' }}>{s.cantidad}</div>}
                  {s.caso_id && <div className="fila" style={{ gap: 4, fontSize: '.78rem', marginTop: 4, color: 'var(--t-teal-fg)' }}><Icono nombre="ubicacion" size={13} /> Solicitud de ayuda (caso derivado)</div>}
                  {s.puntos_acopio?.nombre && <div className="muted fila" style={{ gap: 4, fontSize: '.8rem', marginTop: 4 }}><Icono nombre="ubicacion" size={13} /> {s.puntos_acopio.nombre}</div>}
                  {s.proveedores?.nombre && <div className="muted fila" style={{ gap: 4, fontSize: '.8rem' }}><Icono nombre="usuario" size={13} /> {s.proveedores.nombre}</div>}
                  {(() => {
                    const paso = ESTADOS_INSUMO.indexOf(s.estado) + 1;
                    const completo = s.estado === 'entregado';
                    // Avance del DESGLOSE (0220): una solicitud «en gestión» puede tener 3
                    // de 5 ítems ya cubiertos, y eso es lo que de verdad dice cuánto falta.
                    const its = s.caso_id ? itemsPorCaso.get(s.caso_id) : undefined;
                    const r = its && its.length > 0 ? resumenItems(its) : null;
                    // Y CUÁNTO de lo pedido se cubrió (0221): «3 de 5 ítems» no dice lo
                    // mismo que «80 % de lo pedido», y la parte en teal es la que puso un
                    // tercero —no cuenta como capacidad nuestra—.
                    const cob = its && its.length > 0 ? resumenCobertura(its, (s.caso_id ? aportesPorCaso.get(s.caso_id) : undefined) ?? []) : null;
                    const pctTer = cob ? pctTerceros(cob.cubiertoTercero, cob.pedido) : 0;
                    return (
                      <div style={{ borderTop: '1px solid var(--borde)', marginTop: 10, paddingTop: 8 }}>
                        <FlujoProgreso paso={paso} total={ESTADOS_INSUMO.length} completo={completo}
                          etiqueta={completo ? 'Flujo completo · Entregado ✓' : `Paso ${paso} de ${ESTADOS_INSUMO.length} · ${ETIQUETA_ESTADO_INSUMO[s.estado] ?? s.estado}`} />
                        {/* `r.total` deja fuera los ítems cancelados (espejo de
                            public.cobertura_items_caso): con el desglose entero cancelado
                            no hay barra que pintar. */}
                        {r && r.total > 0 && (
                          <div style={{ marginTop: 6 }}>
                            <FlujoProgreso paso={r.cumplidos} total={r.total} completo={r.completo} etiqueta={r.etiqueta} />
                          </div>
                        )}
                        {cob && cob.pct !== null && (
                          <BarraCobertura pct={cob.pct} pctTercero={pctTer}
                            etiqueta={`${cob.pct}% cubierto${cob.conTercero > 0 ? ` · ${cob.conTercero} por terceros` : ''}`}
                            aria="Cobertura del desglose por cantidad" />
                        )}
                      </div>
                    );
                  })()}
                </Link>
              ))}
            </div>
          ))}
        </div>
        </ResaltarNuevos>
      )}
    </AnimarEntrada>
  );
}
