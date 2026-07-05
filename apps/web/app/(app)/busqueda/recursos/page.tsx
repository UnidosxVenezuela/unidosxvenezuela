import Link from 'next/link';
import { hrefSeguro } from '@/lib/constantes';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import BotonConfirmar from '@/components/BotonConfirmar';
import { guardBusqueda, PanelVerificacion } from '../_guard';
import { crearFuente, eliminarFuente } from '../actions';

// Guiones y reglas del manual del Grupo de Búsqueda.
const GUIONES: { titulo: string; icono: string; puntos: string[] }[] = [
  {
    titulo: 'Primer contacto con quien reporta (buscador)', icono: 'whatsapp',
    puntos: [
      'Preséntate con calma y confirma que eres del equipo de búsqueda.',
      'Aclara de inmediato que AÚN NO tienes información sobre el paradero ni la salud de la persona (Regla de Oro): evita que se interprete como un hallazgo.',
      'Pide datos concretos: nombre completo, cédula, edad, última ubicación y hora, vestimenta y señas.',
      'No prometas resultados ni des información sin verificar. Anota todo en la bitácora.',
    ],
  },
  {
    titulo: 'Verificación cruzada (buscador)', icono: 'ok',
    puntos: [
      'Verifica el caso contra al menos 3 fuentes antes de escalar.',
      'Registra cada consulta en la bitácora (fuente + resultado).',
      'Si hallas una coincidencia sólida, márcala PENDIENTE. No contactes a la familia.',
    ],
  },
  {
    titulo: 'Aprobación y llamada (Enlace de contacto)', icono: 'llave',
    puntos: [
      'Revisa la coincidencia pendiente y valida el trabajo del buscador (bitácora y fuentes).',
      'Si procede, APRUEBA la coincidencia. Adulto → haz la llamada de confirmación. Menor → deriva a la autoridad.',
      'En la llamada aplica el protocolo SPIKES (abajo) y la Regla de Oro. Registra el resultado.',
      'Al finalizar, el caso pasa al MANDO para la confirmación final del cierre.',
    ],
  },
  {
    titulo: 'Menores (NNA)', icono: 'avisos',
    puntos: [
      'La coincidencia de un menor NUNCA se confirma directo a quien pregunta.',
      'Se deriva a la autoridad y se verifica la custodia antes de cualquier reunificación.',
      'Extrema el cuidado de sus datos: no los compartas fuera del equipo.',
    ],
  },
];

const ERRORES = [
  'Informar a la familia antes de que el Enlace apruebe y confirme la coincidencia.',
  'Escalar con una sola fuente sin verificación cruzada (≥3 fuentes).',
  'Confirmar la identidad de un menor sin derivar a la autoridad.',
  'Dar por hecho un hallazgo o generar falsas esperanzas en la llamada.',
  'No registrar las gestiones en la bitácora (se pierde la trazabilidad).',
];

// Material del Enlace de contacto: principios de comunicación + protocolo SPIKES.
const PRINCIPIOS_ENLACE: { t: string; d: string }[] = [
  { t: 'Precisión técnica', d: 'Identifica los vacíos críticos (cédula, rasgos físicos, vestimenta) y verifica la identidad cruzando fuentes. Transforma reportes preliminares en datos exactos y verificados.' },
  { t: 'Manejo de expectativas — Regla de Oro', d: 'Aclara de entrada que NO posees información sobre el paradero o la salud de la persona buscada. Así la llamada no se interpreta como una notificación de hallazgo y proteges la estabilidad emocional de la familia.' },
  { t: 'Ética y empatía', d: 'Equilibra la agilidad con un trato humano: evita la revictimización y las falsas esperanzas, y actúa siempre con el consentimiento explícito del familiar.' },
];

const SPIKES: { s: string; t: string; hacer: string; no: string }[] = [
  { s: 'S', t: 'Sitio', hacer: 'Un momento tranquilo y sin interrupciones. Pregunta si desea estar acompañado y mantén el contacto (visual o de voz).', no: 'Interrumpir.' },
  { s: 'P', t: 'Percepción', hacer: 'Con preguntas abiertas, averigua qué sabe y qué espera. Corrige expectativas poco realistas.', no: 'Asumir lo que ya sabe.' },
  { s: 'I', t: 'Invitación', hacer: 'Invítalo a decir cuánta información desea recibir. Si no quiere detalles, ofrécete a responder dudas.', no: 'Informar sin preguntar.' },
  { s: 'K', t: 'Conocimiento', hacer: 'Da la información con una frase introductoria («Lamento tener que decirle…»); usa sus propias palabras.', no: 'Usar tecnicismos.' },
  { s: 'E', t: 'Emociones', hacer: 'Permite y acompaña las emociones (tristeza, enojo, negación). Responde con empatía y tolera los silencios.', no: 'Destruir la esperanza.' },
  { s: 'S', t: 'Sintetizar', hacer: 'Resume lo importante, acuerda los próximos pasos, responde dudas y agenda el próximo contacto.', no: 'Ignorar o cortar en seco.' },
];

export default async function RecursosBusquedaPage() {
  const g = await guardBusqueda();
  if (!g.identidadOk) return <PanelVerificacion />;
  const { supabase } = g;

  const { data: esMandoData } = await supabase.rpc('es_mando_busqueda');
  const esMando = esMandoData === true;
  const { data } = await supabase.from('fuentes_verificacion').select('id, nombre, descripcion, url, categoria, para_nna, orden, activo').order('orden');
  const fuentes = (data ?? []) as any[];

  return (
    <div>
      <Link href="/busqueda" className="muted">← Desaparecidos</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="ayuda" size={24} /> Recursos del Grupo de Búsqueda</h1>
          <p className="muted sub">Guiones, fuentes de verificación y errores a evitar.</p>
        </div>
      </div>

      <h2 className="fila" style={{ gap: 6 }}><Icono nombre="enlace" size={20} /> Fuentes de verificación</h2>
      <p className="muted" style={{ fontSize: '.85rem', marginTop: -6 }}>Verifica cada caso contra al menos 3 de estas fuentes.</p>
      <div className="grid grid-2">
        {fuentes.map((s) => {
          const href = hrefSeguro(s.url);
          return (
            <div key={s.id} className="tarjeta" style={{ opacity: s.activo ? 1 : 0.55 }}>
              <div className="fila" style={{ justifyContent: 'space-between', gap: 8 }}>
                <strong className="fila" style={{ gap: 6 }}>{s.nombre} {s.para_nna && <Pill tono="critica" punto={false}>NNA</Pill>}</strong>
                {esMando && (
                  <form action={eliminarFuente}>
                    <input type="hidden" name="id" value={s.id} />
                    <BotonConfirmar mensaje={'¿Eliminar la fuente «' + s.nombre + '»?'} className="btn btn-peligro" style={{ minHeight: 28, padding: '2px 8px' }}><Icono nombre="basura" size={13} /></BotonConfirmar>
                  </form>
                )}
              </div>
              {s.descripcion && <p className="muted" style={{ fontSize: '.85rem', margin: '6px 0' }}>{s.descripcion}</p>}
              {href && <a className="btn btn-sm" href={href} target="_blank" rel="noopener noreferrer nofollow"><Icono nombre="enlace" size={13} /> Abrir fuente</a>}
            </div>
          );
        })}
      </div>

      {esMando && (
        <details className="tarjeta" style={{ marginTop: 12 }}>
          <summary className="fila" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}><Icono nombre="mas" size={16} /> Agregar una fuente</summary>
          <form action={crearFuente} style={{ marginTop: 12 }}>
            <div className="grid grid-2">
              <div className="campo"><label htmlFor="nombre">Nombre</label><input id="nombre" name="nombre" className="input" required maxLength={120} /></div>
              <div className="campo"><label htmlFor="categoria">Categoría</label><input id="categoria" name="categoria" className="input" placeholder="nodo / hospital / facial…" maxLength={40} /></div>
            </div>
            <div className="campo"><label htmlFor="descripcion">Descripción</label><input id="descripcion" name="descripcion" className="input" maxLength={200} /></div>
            <div className="grid grid-2">
              <div className="campo"><label htmlFor="url">Enlace (https)</label><input id="url" name="url" className="input" placeholder="https://…" /></div>
              <div className="campo"><label htmlFor="orden">Orden</label><input id="orden" name="orden" type="number" className="input" defaultValue={fuentes.length} /></div>
            </div>
            <label className="fila" style={{ gap: 8, alignItems: 'center', margin: '4px 0 12px', cursor: 'pointer' }}>
              <input type="checkbox" name="para_nna" /> <span>Es una fuente para menores (NNA)</span>
            </label>
            <BotonEnviar className="btn btn-primario"><Icono nombre="ok" size={16} /> Agregar fuente</BotonEnviar>
          </form>
        </details>
      )}

      <h2 className="fila" style={{ gap: 6, marginTop: 20 }}><Icono nombre="documento" size={20} /> Guiones</h2>
      <div className="grid grid-2">
        {GUIONES.map((gu) => (
          <div key={gu.titulo} className="tarjeta">
            <strong className="fila" style={{ gap: 6 }}><Icono nombre={gu.icono} size={16} /> {gu.titulo}</strong>
            <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
              {gu.puntos.map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
            </ul>
          </div>
        ))}
      </div>

      <div className="tarjeta" style={{ marginTop: 16, background: '#fef2f2', borderColor: '#fecaca' }}>
        <strong className="fila" style={{ gap: 6 }}><Icono nombre="avisos" size={18} /> Errores comunes a evitar</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {ERRORES.map((e, i) => <li key={i} style={{ marginBottom: 4 }}>{e}</li>)}
        </ul>
      </div>

      <h2 className="fila" style={{ gap: 6, marginTop: 24 }}><Icono nombre="llave" size={20} /> Enlace de contacto: comunicar con la familia</h2>
      <p className="muted" style={{ fontSize: '.85rem', marginTop: -6 }}>
        Protocolo de la llamada de confirmación. El Enlace transforma reportes en datos verificados y comunica con precisión, cuidando la estabilidad emocional de la familia.
      </p>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        {PRINCIPIOS_ENLACE.map((p) => (
          <div key={p.t} className="tarjeta">
            <strong>{p.t}</strong>
            <p className="muted" style={{ fontSize: '.85rem', margin: '6px 0 0' }}>{p.d}</p>
          </div>
        ))}
      </div>

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <strong className="fila" style={{ gap: 6 }}><Icono nombre="whatsapp" size={18} /> Protocolo SPIKES para comunicar malas noticias</strong>
        <p className="muted" style={{ fontSize: '.8rem', margin: '4px 0 10px' }}>
          Seis pasos para dar noticias difíciles con empatía. Aplícalo junto a la Regla de Oro.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {SPIKES.map((k, i) => (
            <div key={i} className="fila" style={{ gap: 10, alignItems: 'flex-start' }}>
              <span aria-hidden style={{ flex: '0 0 auto', width: 30, height: 30, borderRadius: 8, background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, display: 'grid', placeItems: 'center' }}>{k.s}</span>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: '.9rem' }}>{k.t}</strong>
                <p style={{ fontSize: '.85rem', margin: '2px 0 0' }}>{k.hacer}</p>
                <p className="muted" style={{ fontSize: '.8rem', margin: '2px 0 0' }}><strong>Evita:</strong> {k.no}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
