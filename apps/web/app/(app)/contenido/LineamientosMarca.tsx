import Icono from '@/components/Icono';
import { guardarLineamientos } from './marca-actions';

/** Lineamientos de marca (logo, colores, tipografía) para alinear a todos.
 *  El admin puede editarlos; el resto solo los ve. */
export default function LineamientosMarca({ m, esAdmin }: { m: any; esAdmin: boolean }) {
  const colores = String(m?.paleta ?? '').split(',').map((c: string) => c.trim()).filter(Boolean);
  return (
    <div className="tarjeta">
      <h3 className="aside-titulo" style={{ marginTop: 0 }}><Icono nombre="pizarra" size={16} /> Lineamientos de marca</h3>
      <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>Para que todo el contenido salga alineado.</p>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <div>
          <div className="muted" style={{ fontSize: '.78rem' }}>Logo</div>
          {m?.logo_url ? <img src={m.logo_url} alt="Logo" style={{ maxWidth: 160, maxHeight: 80, objectFit: 'contain' }} /> : <span className="muted">—</span>}
        </div>
        <div>
          <div className="muted" style={{ fontSize: '.78rem' }}>Tipografía</div>
          <div>{m?.tipografia || <span className="muted">—</span>}</div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div className="muted" style={{ fontSize: '.78rem' }}>Colores</div>
          {colores.length ? (
            <div className="fila" style={{ gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              {colores.map((c: string) => (
                <span key={c} className="fila" style={{ gap: 6 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 4, background: c, border: '1px solid var(--borde)', display: 'inline-block' }} />
                  <code style={{ fontSize: '.8rem' }}>{c}</code>
                </span>
              ))}
            </div>
          ) : <span className="muted">—</span>}
        </div>
        {m?.notas && <div style={{ gridColumn: '1 / -1', whiteSpace: 'pre-wrap' }}>{m.notas}</div>}
      </div>

      {esAdmin && (
        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Editar lineamientos</summary>
          <form action={guardarLineamientos} style={{ marginTop: 10 }}>
            <div className="campo"><label>URL del logo</label><input name="logo_url" className="input" defaultValue={m?.logo_url ?? ''} placeholder="https://…" /></div>
            <div className="campo"><label>Colores (separados por coma)</label><input name="paleta" className="input" defaultValue={m?.paleta ?? ''} placeholder="#0033A0, #FFCC00, #CE1126" /></div>
            <div className="campo"><label>Tipografía</label><input name="tipografia" className="input" defaultValue={m?.tipografia ?? ''} placeholder="Inter (títulos) · Roboto (texto)" /></div>
            <div className="campo"><label>Notas / guía de estilo</label><textarea name="notas" className="input" rows={4} defaultValue={m?.notas ?? ''} placeholder="Tono de voz, do's & don'ts, tamaños de pieza…" /></div>
            <button className="btn btn-primario" type="submit">Guardar lineamientos</button>
          </form>
        </details>
      )}
    </div>
  );
}
