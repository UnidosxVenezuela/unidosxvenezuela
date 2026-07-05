import Link from 'next/link';
import { fechaHora } from '@/lib/fechas';
import { ETIQUETA_SEXO, ETIQUETA_ESTADO_BUSQUEDA, claseEstadoBusqueda } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill, { tonoDeClase } from '@/components/Pill';
import AnimarEntrada from '@/components/AnimarEntrada';
import EstadoVacio from '@/components/EstadoVacio';
import BotonActualizar from '@/components/BotonActualizar';
import Consejo from '@/components/Consejos';
import { guardEnlace, PanelVerificacion } from '../_guard';

export default async function EnlacePage() {
  const g = await guardEnlace();
  if (!g.identidadOk) {
    return (
      <AnimarEntrada>
        <div className="pagina-cab"><div><h1 className="fila" style={{ gap: 8 }}><Icono nombre="whatsapp" size={24} /> Enlace de contacto</h1></div></div>
        <PanelVerificacion />
      </AnimarEntrada>
    );
  }
  const { supabase } = g;
  const { data } = await supabase.rpc('listar_cola_enlace');
  const cola = (data ?? []) as any[];
  // Por revisar/aprobar (llegó una coincidencia) vs por gestionar (ya aprobada).
  const porRevisar = cola.filter((c) => c.estado_busqueda === 'coincidencia_pendiente');
  const porGestionar = cola.filter((c) => c.estado_busqueda === 'coincidencia_aprobada' || c.estado_busqueda === 'derivado_autoridad');

  const accionDe = (c: any) => {
    if (c.estado_busqueda === 'coincidencia_pendiente') return 'Revisar y aprobar';
    if (c.estado_busqueda === 'coincidencia_aprobada') return c.es_nna ? 'Derivar a la autoridad' : 'Hacer la llamada';
    if (c.estado_busqueda === 'derivado_autoridad') return 'Custodia / reunificar';
    return 'Abrir';
  };

  const Fila = ({ c }: { c: any }) => (
    <Link href={'/busqueda/' + c.caso_id} className="tarjeta" style={{ display: 'block' }}>
      <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <strong className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
            <span className="insignia">{c.codigo}</span> {c.titulo}
            {c.es_nna && <Pill tono="critica" punto={false}>NNA</Pill>}
          </strong>
          <div className="muted" style={{ fontSize: '.85rem', marginTop: 4 }}>
            {c.edad != null ? `${c.edad} años` : 'Edad n/d'}{c.sexo ? ` · ${ETIQUETA_SEXO[c.sexo] ?? c.sexo}` : ''}{c.ultima_ubicacion ? ` · ${c.ultima_ubicacion}` : ''}
          </div>
          {c.aprobado_en && <div className="muted" style={{ fontSize: '.8rem', marginTop: 2 }}>Aprobado {fechaHora(c.aprobado_en)}</div>}
        </div>
        <div className="fila" style={{ gap: 8 }}>
          <Pill tono={tonoDeClase(claseEstadoBusqueda(c.estado_busqueda))} punto={false}>{ETIQUETA_ESTADO_BUSQUEDA[c.estado_busqueda as keyof typeof ETIQUETA_ESTADO_BUSQUEDA] ?? c.estado_busqueda}</Pill>
          <span className="btn btn-sm">{accionDe(c)} →</span>
        </div>
      </div>
    </Link>
  );

  return (
    <AnimarEntrada>
      <Consejo id="busqueda-enlace" titulo="Enlace de contacto">
        Aquí llegan las <strong>coincidencias pendientes</strong>. Abre el caso, <strong>valida el trabajo del buscador</strong> y <strong>aprueba</strong>. Con un <strong>adulto</strong>, haz la <strong>llamada</strong> de confirmación; con un <strong>menor (NNA)</strong>, <strong>deriva a la autoridad</strong> y verifica la custodia. Al finalizar, el caso pasa al <strong>mando</strong> para la <strong>confirmación final</strong>.
      </Consejo>
      <div className="pagina-cab">
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="whatsapp" size={24} /> Enlace de contacto</h1>
          <p className="muted sub">Coincidencias por revisar, aprobar y gestionar.</p>
        </div>
        <div className="fila"><BotonActualizar /></div>
      </div>

      <h2 className="fila" style={{ gap: 6 }}>Por revisar y aprobar <span className={'insignia ' + (porRevisar.length ? 'aviso' : 'ok')}>{porRevisar.length}</span></h2>
      {porRevisar.length === 0 ? (
        <EstadoVacio icono="ok" titulo="Nada por revisar" texto="Cuando un buscador marque una coincidencia pendiente, aparecerá aquí para que la valides y apruebes." />
      ) : porRevisar.map((c) => <Fila key={c.caso_id} c={c} />)}

      {porGestionar.length > 0 && (
        <>
          <h2 className="fila" style={{ gap: 6, marginTop: 20 }}>Aprobadas · por gestionar <span className="insignia">{porGestionar.length}</span></h2>
          {porGestionar.map((c) => <Fila key={c.caso_id} c={c} />)}
        </>
      )}

      <p className="muted" style={{ fontSize: '.8rem', marginTop: 16 }}>
        <Link href="/busqueda/recursos">Ver guiones de la llamada de confirmación →</Link>
      </p>
    </AnimarEntrada>
  );
}
