'use client';
import { useState } from 'react';
import { CATEGORIAS_CASO } from '@/lib/constantes';

// Selector de categoría del caso. Cuando es «Desaparecidos» ofrece marcar si la
// persona es menor de edad (NNA): esa pista viaja con el caso y hace que la ficha
// del Grupo de Búsqueda nazca clasificada como NNA (va al equipo Buscador NNA),
// protegiendo los datos del menor desde el primer momento (migración 0098).
export default function CategoriaConNna({ defecto = CATEGORIAS_CASO[1] }: { defecto?: string }) {
  const [cat, setCat] = useState(defecto);
  const esDesaparecido = cat === 'Desaparecidos';
  return (
    <div className="campo">
      <label htmlFor="categoria">Categoría</label>
      <select id="categoria" name="categoria" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
        {CATEGORIAS_CASO.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {esDesaparecido && (
        <label className="fila" style={{ gap: 8, alignItems: 'flex-start', marginTop: 8, cursor: 'pointer' }}>
          <input type="checkbox" name="es_nna" style={{ marginTop: 3 }} />
          <span>
            La persona es <strong>menor de edad (NNA)</strong>
            <span className="muted" style={{ display: 'block', fontSize: '.8rem' }}>
              El caso irá al equipo especializado de menores y no será visible para el buscador general.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}
