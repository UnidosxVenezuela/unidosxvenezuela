import Link from 'next/link';
import { requireUsuario, puedePsicosocial, esCoordPsicosocial } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hrefSeguro } from '@/lib/constantes';
import Icono from '@/components/Icono';
import BotonConfirmar from '@/components/BotonConfirmar';
import { crearRecurso, eliminarRecurso } from '../actions';

export default async function RecursosPsicoPage() {
  const { perfil } = await requireUsuario();
  if (!puedePsicosocial(perfil)) redirect('/dashboard');
  const coord = esCoordPsicosocial(perfil);
  const supabase = await createClient();
  const { data } = await supabase.from('recursos_psicosocial').select('*').order('orden').order('creado_en');
  const recursos = (data ?? []) as any[];

  return (
    <div>
      <Link href="/psicosocial" className="muted">← Apoyo Psicosocial</Link>
      <div className="pagina-cab" style={{ marginTop: 8 }}>
        <div>
          <h1 className="fila" style={{ gap: 8 }}><Icono nombre="ayuda" size={22} /> Recursos y líneas de crisis</h1>
          <p className="muted sub" style={{ maxWidth: 560 }}>
            Contactos y guías para actuar ante una crisis. Ante riesgo vital, activa emergencias
            y no dejes sola a la persona.
          </p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div>
          {recursos.length === 0 ? (
            <div className="tarjeta vacio"><p className="muted" style={{ marginBottom: 0 }}>Aún no hay recursos cargados.</p></div>
          ) : recursos.map((r) => {
            const url = hrefSeguro(r.url);
            return (
              <div key={r.id} className="tarjeta">
                <div className="fila" style={{ justifyContent: 'space-between', gap: 8 }}>
                  <strong>{r.titulo}</strong>
                  {coord && (
                    <form action={eliminarRecurso}>
                      <input type="hidden" name="id" value={r.id} />
                      <BotonConfirmar mensaje={'¿Eliminar «' + r.titulo + '»?'} className="btn btn-peligro" style={{ minHeight: 30, padding: '2px 8px' }}><Icono nombre="basura" size={14} /></BotonConfirmar>
                    </form>
                  )}
                </div>
                {r.descripcion && <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{r.descripcion}</p>}
                <div className="fila" style={{ gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  {r.telefono && <a className="btn" href={'tel:' + r.telefono}><Icono nombre="avisos" size={15} /> {r.telefono}</a>}
                  {url && <a className="btn" href={url} target="_blank" rel="noopener noreferrer"><Icono nombre="enlace" size={15} /> Abrir enlace</a>}
                </div>
              </div>
            );
          })}
        </div>

        {coord && (
          <aside>
            <div className="tarjeta">
              <h3 className="aside-titulo"><Icono nombre="mas" size={16} /> Agregar recurso</h3>
              <form action={crearRecurso}>
                <div className="campo"><label htmlFor="titulo">Título</label>
                  <input id="titulo" name="titulo" className="input" required placeholder="Ej: Línea de apoyo emocional" />
                </div>
                <div className="campo"><label htmlFor="descripcion">Descripción</label>
                  <textarea id="descripcion" name="descripcion" className="input" rows={3} placeholder="Cuándo y cómo usarlo, horario, notas…" />
                </div>
                <div className="campo"><label htmlFor="telefono">Teléfono</label>
                  <input id="telefono" name="telefono" className="input" placeholder="Ej: 911" />
                </div>
                <div className="campo"><label htmlFor="url">Enlace (https)</label>
                  <input id="url" name="url" className="input" type="url" placeholder="https://…" />
                </div>
                <button className="btn btn-primario" type="submit"><Icono nombre="ok" size={16} /> Agregar</button>
              </form>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
