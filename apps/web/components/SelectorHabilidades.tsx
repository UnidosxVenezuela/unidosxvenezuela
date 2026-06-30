'use client';
import { useState } from 'react';

/**
 * Editor de habilidades: el usuario marca de una lista sugerida o escribe la
 * suya. Va dentro del formulario de perfil; envía las seleccionadas como inputs
 * ocultos (name="habilidades") para que la Server Action las reciba.
 */
export default function SelectorHabilidades({ iniciales, sugeridas }: { iniciales: string[]; sugeridas: string[] }) {
  const [sel, setSel] = useState<string[]>(iniciales ?? []);
  const [texto, setTexto] = useState('');

  const toggle = (h: string) => setSel((s) => (s.includes(h) ? s.filter((x) => x !== h) : [...s, h]));
  function agregar() {
    const t = texto.trim();
    if (t && !sel.some((x) => x.toLowerCase() === t.toLowerCase())) setSel((s) => [...s, t]);
    setTexto('');
  }
  const noElegidas = sugeridas.filter((h) => !sel.includes(h));

  return (
    <div className="campo">
      <label>Mis habilidades</label>
      <p className="muted" style={{ marginTop: -2, marginBottom: 8, fontSize: '.85rem' }}>
        Marca tus fortalezas o escribe la que falte. Así coordinación sabe en qué puedes ayudar más.
      </p>

      {sel.length > 0 && (
        <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {sel.map((h) => (
            <button type="button" key={h} className="chip-hab chip-hab-on" onClick={() => toggle(h)} aria-label={'Quitar ' + h}>
              {h} <span aria-hidden="true">✕</span>
            </button>
          ))}
        </div>
      )}

      {noElegidas.length > 0 && (
        <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
          {noElegidas.map((h) => (
            <button type="button" key={h} className="chip-hab" onClick={() => toggle(h)}>+ {h}</button>
          ))}
        </div>
      )}

      <div className="fila" style={{ gap: 8, marginTop: 10 }}>
        <input className="input" placeholder="Otra habilidad…" value={texto} style={{ maxWidth: 260 }}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} />
        <button type="button" className="btn" onClick={agregar}>Agregar</button>
      </div>

      {sel.map((h) => <input key={h} type="hidden" name="habilidades" value={h} />)}
    </div>
  );
}
