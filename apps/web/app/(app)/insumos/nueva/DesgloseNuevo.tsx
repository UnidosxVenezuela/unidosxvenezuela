'use client';
import { useState } from 'react';
import Icono from '@/components/Icono';
import { TIPOS_INSUMO, ETIQUETA_TIPO_INSUMO, UNIDADES_ITEM } from '@/lib/constantes';

/**
 * Desglose por ÍTEM en el ALTA (0218 + 0223). Es la diferencia entre la solicitud
 * mutilada de antes —«cantidad» como una línea de texto libre— y una solicitud que se
 * puede cubrir a trozos, medir en porcentaje y repartir entre áreas.
 *
 * Cada fila manda cinco campos con el MISMO nombre; el Server Action los recompone con
 * `formData.getAll(...)` posición a posición (el navegador conserva el orden del DOM).
 * Sin JavaScript de por medio para enviar: el botón «Añadir otro ítem» solo agrega una
 * fila en pantalla; si el script no carga, la primera fila sigue funcionando.
 *
 * La cantidad se escribe como texto a propósito: la RPC decide si es un número —y entra
 * en el porcentaje de cumplimiento (0221)— o si es una cantidad no medible («un camión»),
 * que va a `casos_items.cantidad_texto` y el porcentaje no mira.
 */
export default function DesgloseNuevo() {
  const [filas, setFilas] = useState([0]);
  const [siguiente, setSiguiente] = useState(1);

  const anadir = () => { setFilas((f) => [...f, siguiente]); setSiguiente((n) => n + 1); };
  const quitar = (k: number) => setFilas((f) => (f.length > 1 ? f.filter((x) => x !== k) : f));

  return (
    <div className="tarjeta" style={{ background: 'var(--t-teal-bg)', borderColor: 'var(--t-teal-fg)', marginBottom: 12 }}>
      <strong className="fila" style={{ gap: 6 }}><Icono nombre="caja" size={15} /> ¿Qué se necesita? — desglose *</strong>
      <p className="muted" style={{ fontSize: '.82rem', margin: '2px 0 8px' }}>
        Una línea por cada cosa que hace falta, con su cantidad. Así se puede cubrir lo que se consiga,
        medir cuánto falta y repartir el resto entre las áreas. Hace falta al menos un ítem.
      </p>

      {filas.map((k, i) => (
        <div key={k} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--borde)', paddingTop: i === 0 ? 0 : 10, marginTop: i === 0 ? 0 : 10 }}>
          <div className="fila" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="muted" style={{ fontSize: '.8rem' }}>Ítem {i + 1}</span>
            {filas.length > 1 && (
              <button type="button" className="btn" onClick={() => quitar(k)}
                style={{ minHeight: 30, padding: '1px 8px', fontSize: '.8rem', color: 'var(--critica)' }}
                aria-label={'Quitar el ítem ' + (i + 1)}>
                <Icono nombre="basura" size={14} /> Quitar
              </button>
            )}
          </div>
          <div className="grid grid-2">
            <div className="campo">
              <label htmlFor={'item_cantidad_' + k}>Cantidad</label>
              <input id={'item_cantidad_' + k} name="item_cantidad" className="input" maxLength={100}
                inputMode="decimal" placeholder="Ej.: 50 · o «un camión»" />
            </div>
            <div className="campo">
              <label htmlFor={'item_unidad_' + k}>Unidad</label>
              <input id={'item_unidad_' + k} name="item_unidad" className="input" list="unidades-item-alta"
                maxLength={40} placeholder="Ej.: cajas · litros · kits" />
            </div>
          </div>
          <div className="campo">
            <label htmlFor={'item_descripcion_' + k}>¿Qué es?{i === 0 ? ' *' : ''}</label>
            <input id={'item_descripcion_' + k} name="item_descripcion" className="input" maxLength={300}
              required={i === 0} placeholder="Ej.: agua potable en botellones de 5 L" />
          </div>
          <div className="grid grid-2">
            <div className="campo">
              <label htmlFor={'item_tipo_' + k}>Tipo de ayuda</label>
              <select id={'item_tipo_' + k} name="item_tipo" className="input" defaultValue="otro">
                {TIPOS_INSUMO.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_INSUMO[t] ?? t}</option>)}
              </select>
            </div>
            <div className="campo">
              <label htmlFor={'item_notas_' + k}>Nota (opcional)</label>
              <input id={'item_notas_' + k} name="item_notas" className="input" maxLength={500}
                placeholder="Detalle útil para conseguirlo" />
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="btn" onClick={anadir} style={{ marginTop: 8 }}>
        <Icono nombre="mas" size={15} /> Añadir otro ítem
      </button>

      <datalist id="unidades-item-alta">
        {UNIDADES_ITEM.map((u) => <option key={u} value={u} />)}
      </datalist>
    </div>
  );
}
