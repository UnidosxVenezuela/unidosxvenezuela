import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUsuario, puedeLogistica } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { ETIQUETA_TIPO_INSUMO, ETIQUETA_ESTADO_INSUMO, ESTADOS_INSUMO, clasePrioridad, ETIQUETA_PRIORIDAD } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import Kpi from '@/components/Kpi';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import RealtimeRefrescar from '@/components/RealtimeRefrescar';
import ResaltarNuevos from '@/components/ResaltarNuevos';

export default async function InsumosPage() {
  const { perfil } = await requireUsuario();
  const rolesG = [perfil?.rol, ...((perfil?.roles_extra as string[] | null) ?? [])];
  if (!rolesG.includes('admin') && !rolesG.includes('logistica') && !rolesG.includes('admin_logistica')) redirect('/dashboard');

  const supabase = await createClient();
  const [{ data }, { count: oportCount }] = await Promise.all([
    supabase.from('solicitudes_insumo')
      .select('id, titulo, tipo, cantidad, urgencia, estado, creado_en, caso_id, puntos_acopio(nombre), proveedores(nombre)')
      .order('creado_en', { ascending: false }),
    supabase.from('oportunidades_donacion').select('*', { count: 'exact', head: true }).neq('estado', 'descartada'),
  ]);
  const solicitudes = (data ?? []) as any[];
  const activas = solicitudes.filter((s) => s.estado !== 'cancelado');
  const entregadas = solicitudes.filter((s) => s.estado === 'entregado').length;
  const porEstado = (e: string) => activas.filter((s) => s.estado === e);

  return (
    <AnimarEntrada>
      <RealtimeRefrescar tabla="solicitudes_insumo" />
      <div className="pagina-cab">
        <div>
          <h1>Logística</h1>
          <p className="muted sub">Conecta las dos caras de la ayuda: las solicitudes de los centros de acopio y las ofertas de quienes quieren donar, hasta la entrega.</p>
        </div>
        <div className="fila">
          <BotonActualizar />
          <Link className="btn" href="/insumos/oportunidades"><Icono nombre="corazon" size={16} /> Donación-Ofrecimiento</Link>
          <Link className="btn" href="/insumos/proveedores"><Icono nombre="usuario" size={16} /> Proveedores</Link>
          <Link className="btn btn-primario" href="/insumos/nueva"><Icono nombre="mas" /> Nueva solicitud</Link>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', margin: '16px 0' }}>
        <Kpi etiqueta="Solicitudes activas" valor={activas.length} sub="Pedidos en curso" color="var(--azul)" icono="camion" tinte="#eef2ff" />
        <Kpi etiqueta="En ruta" valor={porEstado('en_ruta').length} sub="En camino a destino" color="#a16207" icono="camion" tinte="#fef9c3" />
        <Kpi etiqueta="Entregadas" valor={entregadas} sub="Ciclo cerrado" color="#16a34a" icono="ok" tinte="#d1fae5" />
        <Kpi etiqueta="Donación-Ofrecimiento" valor={oportCount ?? 0} sub="Ofrecimientos activos" color="#0f766e" icono="corazon" tinte="#f0fdfa" href="/insumos/oportunidades" />
      </div>

      {activas.length === 0 ? (
        <EstadoVacio
          icono="camion"
          titulo="Aún no hay solicitudes"
          texto="Crea la primera solicitud de insumos para empezar a organizar la ayuda."
          accion={{ href: '/insumos/nueva', etiqueta: 'Nueva solicitud' }}
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
                  <strong style={{ display: 'block', margin: '6px 0 2px' }}>{s.titulo}</strong>
                  {s.cantidad && <div className="muted" style={{ fontSize: '.85rem' }}>{s.cantidad}</div>}
                  {s.caso_id && <div className="fila" style={{ gap: 4, fontSize: '.78rem', marginTop: 4, color: '#0f766e' }}><Icono nombre="ubicacion" size={13} /> Solicitud de ayuda (caso derivado)</div>}
                  {s.puntos_acopio?.nombre && <div className="muted fila" style={{ gap: 4, fontSize: '.8rem', marginTop: 4 }}><Icono nombre="ubicacion" size={13} /> {s.puntos_acopio.nombre}</div>}
                  {s.proveedores?.nombre && <div className="muted fila" style={{ gap: 4, fontSize: '.8rem' }}><Icono nombre="usuario" size={13} /> {s.proveedores.nombre}</div>}
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
