'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Icono from '@/components/Icono';
import { importarUsuarios } from '../actions';
import { IMPORT_INICIAL, type EstadoImport, type FilaImport } from '../tipos';
import { PAISES, banderaPais, etiquetaPais } from '@/lib/constantes';

function BotonEnviar() {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primario" type="submit" disabled={pending}>
      <Icono nombre="mas" size={16} /> {pending ? 'Creando cuentas…' : 'Crear cuentas'}
    </button>
  );
}

const TONO: Record<string, string> = { creado: 'ok', duplicado: 'aviso', error: 'critica', omitido: '' };

export default function Importador({
  grupos, roles,
}: {
  grupos: { id: string; nombre: string }[];
  roles: { valor: string; etiqueta: string }[];
}) {
  const [estado, formAction] = useFormState<EstadoImport, FormData>(importarUsuarios, IMPORT_INICIAL);

  return (
    <>
      <form action={formAction} className="tarjeta" style={{ maxWidth: 720 }}>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="rol">Rol para toda la lista</label>
            <select id="rol" name="rol" className="input" defaultValue="voluntario">
              {roles.map((r) => <option key={r.valor} value={r.valor}>{r.etiqueta}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="grupo_id">Sumar al grupo (opcional)</label>
            <select id="grupo_id" name="grupo_id" className="input" defaultValue="">
              <option value="">— Ninguno —</option>
              {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="organizacion">Organización (opcional, para todos)</label>
            <input id="organizacion" name="organizacion" className="input" />
          </div>
          <div className="campo">
            <label htmlFor="pais">País por defecto (opcional)</label>
            <select id="pais" name="pais" className="input" defaultValue="">
              <option value="">— Sin indicar —</option>
              {PAISES.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
            </select>
            <p className="muted" style={{ fontSize: '.78rem', marginTop: 4 }}>Se usa solo en las líneas que no traen su propio país.</p>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="lista">Pega la lista (una persona por línea)</label>
          <textarea id="lista" name="lista" className="input" rows={9} required
            placeholder={'+58 412-7585420 - Raquel Gámez - correo@ejemplo.com - Venezuela\n+57 316 0406992 - Yaneska Crespo - Colombia\n+34 600 123 456 - Jeimmy - ES'} />
          <p className="muted" style={{ fontSize: '.82rem', marginTop: 4 }}>
            Reconocemos el número, el correo (si lo hay), el nombre y —si lo agregas como un campo más— el <strong>país</strong>:
            su nombre o su código (p. ej. «Venezuela» o «VE»). Así una misma lista admite orígenes distintos; si una línea no
            trae país, se usa el «País por defecto». Las líneas sin número ni correo se omiten.
          </p>
        </div>
        <BotonEnviar />
      </form>

      {estado.mensaje && (
        <p className={estado.ok ? 'exito' : 'error'} style={{ marginTop: 12 }}>{estado.mensaje}</p>
      )}

      {estado.filas.length > 0 && (
        <div className="tarjeta" style={{ maxWidth: 920 }}>
          <p className="muted" style={{ marginTop: 0, fontSize: '.85rem' }}>
            Comparte cada acceso por un canal seguro. La persona debe <strong>cambiar la clave</strong> al entrar.
          </p>
          <div className="tabla-scroll"><table>
            <thead><tr><th>Nombre</th><th>Contacto</th><th>País</th><th>Estado</th><th>Acceso</th></tr></thead>
            <tbody>
              {estado.filas.map((f, i) => (
                <tr key={i}>
                  <td>{f.nombre}</td>
                  <td className="muted" style={{ fontSize: '.85rem' }}>
                    {f.whatsapp ? '+' + f.whatsapp : ''}{f.whatsapp && f.email ? ' · ' : ''}{f.email ?? ''}
                  </td>
                  <td style={{ fontSize: '.85rem' }}>{f.pais ? banderaPais(f.pais) + ' ' + etiquetaPais(f.pais) : ''}</td>
                  <td>
                    <span className={'insignia ' + (TONO[f.estado] ?? '')}>{f.estado}</span>
                    {f.detalle && <div className="muted" style={{ fontSize: '.78rem' }}>{f.detalle}</div>}
                  </td>
                  <td>{f.estado === 'creado' ? <FilaAcceso fila={f} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </>
  );
}

function FilaAcceso({ fila }: { fila: FilaImport }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="fila" style={{ gap: 6 }}>
      {fila.password && (
        <button type="button" className="btn" style={{ minHeight: 30, padding: '2px 8px' }}
          onClick={() => {
            navigator.clipboard?.writeText(fila.password!);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1500);
          }}>
          {copiado ? '¡Copiada!' : 'Copiar clave'}
        </button>
      )}
      {fila.waLink && (
        <a className="btn btn-acento" style={{ minHeight: 30, padding: '2px 8px' }}
          href={fila.waLink} target="_blank" rel="noopener noreferrer">
          <Icono nombre="whatsapp" size={14} /> Enviar
        </a>
      )}
    </div>
  );
}
