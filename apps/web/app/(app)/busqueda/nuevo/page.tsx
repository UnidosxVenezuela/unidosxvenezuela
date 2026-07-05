import Link from 'next/link';
import { SEXOS } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonEnviar from '@/components/BotonEnviar';
import { guardBusqueda, PanelVerificacion } from '../_guard';
import { crearCasoBusqueda } from '../actions';

export default async function NuevoCasoBusquedaPage() {
  const g = await guardBusqueda();
  if (!g.identidadOk) return <PanelVerificacion />;

  // Tipo de caso según el rol: el Buscador NNA registra SOLO menores; el buscador
  // general SOLO adultos; el admin/mando (o roles mixtos) elige. La RLS/RPC lo exige.
  const soloNna = g.esBuscadorNna && !g.esBuscadorGeneral && !g.esAdmin;
  const soloAdulto = g.esBuscadorGeneral && !g.esBuscadorNna && !g.esAdmin;
  const eligeTipo = !soloNna && !soloAdulto;

  return (
    <div>
      <Link href="/busqueda" className="muted">← Desaparecidos</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1>{soloNna ? 'Nuevo caso de menor (NNA)' : 'Nuevo caso de persona desaparecida'}</h1>
          <p className="muted sub" style={{ maxWidth: 560 }}>
            Registra los datos del intake. El caso entra como <strong>Desaparecido</strong> y arranca
            en estado <strong>Activo</strong> para trabajarlo.
            {soloNna && <> Se registra como <strong>menor de edad (NNA)</strong>, con reglas especiales de protección.</>}
            {eligeTipo && <> Marca <strong>NNA</strong> si es menor de edad.</>}
          </p>
        </div>
      </div>

      <form action={crearCasoBusqueda} className="tarjeta" style={{ maxWidth: 640 }}>
        <div className="campo">
          <label htmlFor="titulo">Nombre de la persona</label>
          <input id="titulo" name="titulo" className="input" required maxLength={160} placeholder="Nombre y apellido de quien se busca" />
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="edad">Edad (aprox.)</label>
            <input id="edad" name="edad" type="number" min={0} max={130} className="input" placeholder="Ej: 34" />
          </div>
          <div className="campo">
            <label htmlFor="sexo">Sexo</label>
            <select id="sexo" name="sexo" className="input" defaultValue="">
              <option value="">Sin especificar</option>
              {SEXOS.map((s) => <option key={s.valor} value={s.valor}>{s.etiqueta}</option>)}
            </select>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="ultima_ubicacion">Última ubicación conocida</label>
          <input id="ultima_ubicacion" name="ultima_ubicacion" className="input" maxLength={200} placeholder="Dónde y cuándo se le vio por última vez" />
        </div>
        <div className="campo">
          <label htmlFor="descripcion">Descripción / señas</label>
          <textarea id="descripcion" name="descripcion" className="input" rows={4} placeholder="Vestimenta, contextura, circunstancias de la desaparición, datos que ayuden a identificarla…" />
        </div>

        {soloNna && <input type="hidden" name="es_nna" value="on" />}
        {eligeTipo && (
          <label className="fila" style={{ gap: 8, alignItems: 'center', margin: '4px 0 12px', cursor: 'pointer' }}>
            <input type="checkbox" name="es_nna" />
            <span><strong>Es menor de edad (NNA)</strong> — lo atiende el equipo NNA y se aplican reglas especiales de protección.</span>
          </label>
        )}
        {soloNna && (
          <p className="fila" style={{ gap: 8, alignItems: 'center', margin: '4px 0 12px', fontSize: '.85rem' }}>
            <Icono nombre="usuario" size={16} /> <span>Este caso se registra como <strong>menor de edad (NNA)</strong>.</span>
          </p>
        )}
        {soloAdulto && (
          <p className="muted" style={{ margin: '4px 0 12px', fontSize: '.85rem' }}>
            Los casos de <strong>menores (NNA)</strong> los registra el equipo de Buscador NNA.
          </p>
        )}

        <h3 className="aside-titulo" style={{ marginTop: 4 }}><Icono nombre="usuario" size={16} /> Quién reporta</h3>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="reporta_nombre">Nombre de quien reporta</label>
            <input id="reporta_nombre" name="reporta_nombre" className="input" maxLength={160} placeholder="Familiar o allegado" />
          </div>
          <div className="campo">
            <label htmlFor="reporta_telefono">Teléfono / WhatsApp</label>
            <input id="reporta_telefono" name="reporta_telefono" className="input" maxLength={40} placeholder="Contacto para dar seguimiento" />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="fuente">Fuente del reporte</label>
          <input id="fuente" name="fuente" className="input" maxLength={160} placeholder="De dónde viene el reporte (plataforma, contacto directo…)" />
        </div>

        <p className="muted" style={{ fontSize: '.8rem', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <Icono nombre="admin" size={16} /> Datos sensibles: solo los verá el Grupo de Búsqueda con 2ª verificación. Con menores, extrema la prudencia.
        </p>
        <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Registrar caso</BotonEnviar>
      </form>
    </div>
  );
}
