'use client';
import { useState } from 'react';
import Icono from '@/components/Icono';
import { hrefSeguro, CANALES_DIFUSION, ETIQUETA_CANAL_DIFUSION } from '@/lib/constantes';
import { registrarEventoCaso, marcarCasoPublicado, quitarCasoPublicado } from '../casos/actions';

function textoCaso(c: any): string {
  const L: string[] = [];
  L.push('Caso #' + String(c.numero).padStart(5, '0'));
  if (c.categoria) L.push('Categoría: ' + c.categoria);
  L.push('');
  L.push(c.titulo || '');
  if (c.descripcion) { L.push(''); L.push(c.descripcion); }
  L.push('');
  // Paso 10: solo el contacto AUTORIZADO para difusión (nunca el interno).
  if (c.autoriza_difusion && c.contacto_difusion) L.push('Contacto de difusión: ' + c.contacto_difusion);
  if (c.es_requerimiento) {
    const req = [c.req_tipo, c.req_urgencia, c.req_cantidad].filter(Boolean).join(' · ');
    L.push('Solicitud de ayuda' + (req ? ': ' + req : ''));
    if (c.lat != null && c.lng != null) L.push('Ubicación: ' + c.lat + ', ' + c.lng);
  }
  if (c.fuente || c.fuente_url) L.push('Fuente: ' + [c.fuente, c.fuente_url].filter(Boolean).join(' — '));
  if (c.fecha_publicacion) L.push('Fecha de publicación: ' + c.fecha_publicacion);
  if (c.notas) { L.push(''); L.push('Observaciones de verificación:'); L.push(c.notas); }
  const adj = (c.adjuntos ?? []) as any[];
  if (adj.length) {
    L.push('');
    L.push('Imágenes y adjuntos (' + adj.length + '):');
    for (const a of adj) L.push('- ' + (a.nombre || 'archivo') + (a.href ? ' — ' + a.href : ''));
  }
  return L.join('\n').trim() + '\n';
}

/** Para Redacción: ver, copiar y descargar la información de un caso confirmado
 *  (dejando registro de la actividad), y marcar «Publicada» indicando los CANALES
 *  de difusión (0169). `volver` mantiene abierto el panel lateral tras la acción. */
export default function AccionesRedaccionCaso(
  { caso, puedeMarcar = false, esAdmin = false, volver = '/envio-redaccion' }:
  { caso: any; puedeMarcar?: boolean; esAdmin?: boolean; volver?: string },
) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const texto = textoCaso(caso);
  const hrefPub = hrefSeguro(caso.publicacion_url);
  const canales = (caso.canales_publicacion ?? []) as string[];

  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ }
    try { await registrarEventoCaso(caso.id, 'copia'); } catch { /* el registro es best-effort */ }
  }
  function descargar() {
    const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'caso-' + String(caso.numero).padStart(5, '0') + '.txt';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    registrarEventoCaso(caso.id, 'descarga').catch(() => {});
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn" style={{ minHeight: 32, padding: '2px 10px' }} onClick={() => setAbierto((v) => !v)}>
          <Icono nombre="ojo" size={15} /> {abierto ? 'Ocultar texto' : 'Ver texto'}
        </button>
        <button type="button" className="btn" style={{ minHeight: 32, padding: '2px 10px' }} onClick={copiar}>
          <Icono nombre="documento" size={15} /> {copiado ? 'Copiado ✓' : 'Copiar'}
        </button>
        <button type="button" className="btn" style={{ minHeight: 32, padding: '2px 10px' }} onClick={descargar}>
          <Icono nombre="documento" size={15} /> Descargar
        </button>
      </div>
      {abierto && (
        <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--sup2)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12, marginTop: 8, fontSize: '.86rem', fontFamily: 'inherit' }}>{texto}</pre>
      )}

      {/* Fotos aptas para difusión (0187): solo las que curó Verificación. */}
      {(() => {
        const adj = (caso.adjuntos ?? []) as any[];
        if (!adj.length) return null;
        return (
          <div style={{ marginTop: 8 }}>
            <div className="muted" style={{ fontSize: '.78rem', marginBottom: 4 }}>📷 Fotos para difundir ({adj.length})</div>
            <div className="fila" style={{ gap: 8, flexWrap: 'wrap' }}>
              {adj.map((a) => {
                if (!a.href) return null;
                const esImg = String(a.mime || '').startsWith('image/');
                return (
                  <a key={a.id} href={a.href} target="_blank" rel="noopener noreferrer" className="adjunto-chip"
                     style={esImg ? { padding: 0, overflow: 'hidden', borderRadius: 8 } : undefined} title={a.nombre}>
                    {esImg
                      ? <img src={a.href} alt={a.nombre || 'imagen'} style={{ width: 76, height: 76, objectFit: 'cover', display: 'block', borderRadius: 8 }} />
                      : <><Icono nombre="documento" size={15} /> {a.nombre}</>}
                  </a>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Marca «Publicada» (0166) + canales de difusión (0169). El botón manual solo a Redacción. */}
      {caso.publicado_en ? (
        <div style={{ marginTop: 8 }}>
          <div className="fila" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill pill-ok" style={{ fontWeight: 600 }}>📣 Publicada</span>
            {hrefPub && <a href={hrefPub} target="_blank" rel="noopener noreferrer" style={{ fontSize: '.85rem' }}>ver publicación ↗</a>}
            {esAdmin && (
              <form action={quitarCasoPublicado}>
                <input type="hidden" name="caso_id" value={caso.id} />
                <input type="hidden" name="volver" value={volver} />
                <button className="btn" style={{ minHeight: 30, padding: '2px 8px', fontSize: '.82rem' }}>Deshacer</button>
              </form>
            )}
          </div>
          {canales.length > 0 && (
            <div className="fila" style={{ gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
              {canales.map((c) => <span key={c} className="insignia" style={{ fontSize: '.72rem' }}>{ETIQUETA_CANAL_DIFUSION[c] ?? c}</span>)}
            </div>
          )}
        </div>
      ) : puedeMarcar ? (
        <form action={marcarCasoPublicado} style={{ marginTop: 8 }}>
          <input type="hidden" name="caso_id" value={caso.id} />
          <input type="hidden" name="volver" value={volver} />
          <div className="muted" style={{ fontSize: '.78rem', marginBottom: 4 }}>¿En qué canales se difundió? <span style={{ opacity: .7 }}>(opcional)</span></div>
          <div className="fila" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            {CANALES_DIFUSION.map((c) => (
              <label key={c} className="fila" style={{ gap: 4, cursor: 'pointer', fontWeight: 400, fontSize: '.82rem' }}>
                <input type="checkbox" name="canales" value={c} style={{ width: 'auto', minHeight: 0 }} /> {ETIQUETA_CANAL_DIFUSION[c]}
              </label>
            ))}
          </div>
          <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
            <input name="publicacion_url" className="input" placeholder="Enlace de la publicación (opcional)" inputMode="url" style={{ minHeight: 32, maxWidth: 260, flex: '1 1 200px' }} />
            <button className="btn btn-primario" style={{ minHeight: 32, padding: '2px 10px' }}>📣 Marcar publicada</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
