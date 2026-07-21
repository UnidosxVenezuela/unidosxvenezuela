'use client';
import { useState } from 'react';
import Icono from '@/components/Icono';
import { hrefSeguro, CANALES_DIFUSION, ETIQUETA_CANAL_DIFUSION, TIPOS_DIFUSION, ETIQUETA_TIPO_DIFUSION } from '@/lib/constantes';
import { linkWaMeTexto } from '@/lib/whatsapp';
import { registrarEventoCaso, quitarCasoPublicado, setDifusionMeta, registrarPublicacionCanal, quitarPublicacionCanal } from '../casos/actions';

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
  // Repost (0189): el link de la publicación ORIGINAL va en el mensaje (solo repost).
  if (c.tipo_difusion === 'repost' && c.url_original) { L.push(''); L.push('🔗 Repostear esta publicación: ' + c.url_original); }
  const adj = (c.adjuntos ?? []) as any[];
  if (adj.length) {
    L.push('');
    L.push('Imágenes y adjuntos (' + adj.length + '):');
    for (const a of adj) L.push('- ' + (a.nombre || 'archivo') + (a.href ? ' — ' + a.href : ''));
  }
  return L.join('\n').trim() + '\n';
}

/** Para Redacción: ver/copiar/descargar/ENVIAR-A-WHATSAPP la información de un caso, fijar
 *  el tipo de difusión (rediseño/repost, 0189) y registrar la publicación POR CANAL (0190).
 *  `whatsappGrupo` = link del grupo (lo configura un admin en Ajustes, 0188). */
export default function AccionesRedaccionCaso(
  { caso, puedeMarcar = false, esAdmin = false, volver = '/envio-redaccion', whatsappGrupo = null, publicaciones = [] }:
  { caso: any; puedeMarcar?: boolean; esAdmin?: boolean; volver?: string; whatsappGrupo?: string | null; publicaciones?: any[] },
) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const texto = textoCaso(caso);
  const grupoWa = hrefSeguro(whatsappGrupo);
  const esRepost = caso.tipo_difusion === 'repost';

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
  // Enviar a WhatsApp: copia el texto (con el link original si es repost) y abre el
  // grupo. Los links de grupo NO admiten texto prellenado, por eso es «copiar + abrir».
  async function enviarWhatsapp() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2000); } catch { /* sin portapapeles */ }
    try { await registrarEventoCaso(caso.id, 'copia'); } catch { /* best-effort */ }
    if (grupoWa) window.open(grupoWa, '_blank', 'noopener,noreferrer');
  }
  // Compartir…: wa.me con el texto prellenado, deja elegir cualquier chat.
  function compartir() {
    window.open(linkWaMeTexto(texto), '_blank', 'noopener,noreferrer');
    registrarEventoCaso(caso.id, 'copia').catch(() => {});
  }

  const btn = { minHeight: 32, padding: '2px 10px' } as const;

  return (
    <div style={{ marginTop: 8 }}>
      <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
        <button type="button" className="btn" style={btn} onClick={() => setAbierto((v) => !v)}>
          <Icono nombre="ojo" size={15} /> {abierto ? 'Ocultar texto' : 'Ver texto'}
        </button>
        <button type="button" className="btn" style={btn} onClick={copiar}>
          <Icono nombre="documento" size={15} /> {copiado ? 'Copiado ✓' : 'Copiar'}
        </button>
        <button type="button" className="btn" style={btn} onClick={descargar}>
          <Icono nombre="documento" size={15} /> Descargar
        </button>
      </div>

      {/* Enviar a WhatsApp (0188/0189): compone Nº/categoría/info (+ link original si es
          repost), lo copia y abre el grupo que configuró el admin en Ajustes. */}
      <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
        <button type="button" className="btn btn-primario" style={btn} onClick={enviarWhatsapp}>
          📲 Enviar a WhatsApp{esRepost ? ' (con link)' : ''}
        </button>
        <button type="button" className="btn" style={btn} onClick={compartir} title="Abrir WhatsApp y elegir el chat">Compartir…</button>
      </div>
      {grupoWa
        ? <p className="muted" style={{ fontSize: '.75rem', marginTop: 4, marginBottom: 0 }}>Copia el texto y abre el grupo — pégalo y envía.{esRepost ? ' Incluye el link de la publicación original.' : ''}</p>
        : (puedeMarcar && <p className="muted" style={{ fontSize: '.75rem', marginTop: 4, marginBottom: 0 }}>El texto se copia; para abrir el grupo, un admin debe cargar su link en <strong>Ajustes</strong>.</p>)}

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

      {/* Tipo de difusión (0189): rediseñar y publicar vs solo repostear (con link). */}
      {puedeMarcar && (
        <form action={setDifusionMeta} style={{ marginTop: 10 }}>
          <input type="hidden" name="caso_id" value={caso.id} />
          <input type="hidden" name="volver" value={volver} />
          <div className="muted" style={{ fontSize: '.78rem', marginBottom: 4 }}>¿Cómo se difunde este caso?</div>
          <div className="fila" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select name="tipo_difusion" defaultValue={caso.tipo_difusion ?? ''} className="input" style={{ minHeight: 32, maxWidth: 190 }}>
              <option value="">— Sin definir —</option>
              {TIPOS_DIFUSION.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_DIFUSION[t]}</option>)}
            </select>
            <input name="url_original" defaultValue={caso.url_original ?? ''} className="input" placeholder="Link de la publicación original (si es repost)" inputMode="url" style={{ minHeight: 32, flex: '1 1 220px' }} />
            <button className="btn" style={btn}>Guardar</button>
          </div>
        </form>
      )}

      {/* Publicación por canal (0190): «en IG sí, en X pendiente». El estado global
          «Publicada» se sincroniza solo (publicado al primer canal). */}
      <div style={{ marginTop: 10, borderTop: '1px solid var(--borde)', paddingTop: 8 }}>
        <div className="fila" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {caso.publicado_en
            ? <span className="pill pill-ok" style={{ fontWeight: 600 }}>📣 Publicada</span>
            : <span className="muted" style={{ fontSize: '.82rem' }}>Aún sin publicar</span>}
          {esAdmin && caso.publicado_en && (
            <form action={quitarCasoPublicado}>
              <input type="hidden" name="caso_id" value={caso.id} />
              <input type="hidden" name="volver" value={volver} />
              <button className="btn" style={{ minHeight: 28, padding: '1px 8px', fontSize: '.8rem' }}>Deshacer todo</button>
            </form>
          )}
        </div>

        {publicaciones.length > 0 && (
          <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
            {publicaciones.map((p) => {
              const href = hrefSeguro(p.url);
              return (
                <div key={p.id} className="fila" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: '.85rem' }}>
                  <span className="insignia" style={{ fontSize: '.72rem' }}>{ETIQUETA_CANAL_DIFUSION[p.canal] ?? p.canal}</span>
                  {href ? <a href={href} target="_blank" rel="noopener noreferrer">ver ↗</a> : <span className="muted">sin enlace</span>}
                  {puedeMarcar && (
                    <form action={quitarPublicacionCanal}>
                      <input type="hidden" name="caso_id" value={caso.id} />
                      <input type="hidden" name="canal" value={p.canal} />
                      <input type="hidden" name="volver" value={volver} />
                      <button className="btn" style={{ minHeight: 26, padding: '0 7px', fontSize: '.75rem' }} title="Quitar este canal">✕</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {puedeMarcar && (
          <form action={registrarPublicacionCanal} style={{ marginTop: 6 }}>
            <input type="hidden" name="caso_id" value={caso.id} />
            <input type="hidden" name="volver" value={volver} />
            <div className="fila" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <select name="canal" defaultValue="" required className="input" style={{ minHeight: 32, maxWidth: 150 }}>
                <option value="" disabled>Canal…</option>
                {CANALES_DIFUSION.map((c) => <option key={c} value={c}>{ETIQUETA_CANAL_DIFUSION[c]}</option>)}
              </select>
              <input name="url" className="input" placeholder="Enlace en esa red (opcional)" inputMode="url" style={{ minHeight: 32, flex: '1 1 200px' }} />
              <button className="btn btn-primario" style={btn}>📣 Registrar canal</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
