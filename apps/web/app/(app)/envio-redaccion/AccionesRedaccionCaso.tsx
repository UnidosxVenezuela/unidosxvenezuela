'use client';
import { useState } from 'react';
import Icono from '@/components/Icono';
import { registrarEventoCaso } from '../casos/actions';

function textoCaso(c: any): string {
  const L: string[] = [];
  L.push('Caso #' + String(c.numero).padStart(5, '0'));
  if (c.categoria) L.push('Categoría: ' + c.categoria);
  L.push('');
  L.push(c.titulo || '');
  if (c.descripcion) { L.push(''); L.push(c.descripcion); }
  L.push('');
  if (c.fuente || c.fuente_url) L.push('Fuente: ' + [c.fuente, c.fuente_url].filter(Boolean).join(' — '));
  if (c.fecha_publicacion) L.push('Fecha de publicación: ' + c.fecha_publicacion);
  return L.join('\n').trim() + '\n';
}

/** Para Redacción: ver, copiar y descargar la información de un caso confirmado,
 *  dejando registro de la actividad (monitoreo) vía registrar_evento_caso. */
export default function AccionesRedaccionCaso({ caso }: { caso: any }) {
  const [abierto, setAbierto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const texto = textoCaso(caso);

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
          <Icono nombre="ojo" size={15} /> {abierto ? 'Ocultar' : 'Ver'}
        </button>
        <button type="button" className="btn" style={{ minHeight: 32, padding: '2px 10px' }} onClick={copiar}>
          <Icono nombre="documento" size={15} /> {copiado ? 'Copiado ✓' : 'Copiar'}
        </button>
        <button type="button" className="btn" style={{ minHeight: 32, padding: '2px 10px' }} onClick={descargar}>
          <Icono nombre="documento" size={15} /> Descargar
        </button>
      </div>
      {abierto && (
        <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--fondo-2, #f8fafc)', border: '1px solid var(--borde)', borderRadius: 10, padding: 12, marginTop: 8, fontSize: '.86rem', fontFamily: 'inherit' }}>{texto}</pre>
      )}
    </div>
  );
}
