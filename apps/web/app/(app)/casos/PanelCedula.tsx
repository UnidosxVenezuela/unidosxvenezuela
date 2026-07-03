'use client';
import { useState, useTransition } from 'react';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import { consultarCedula } from './actions';
import type { DatosCedula } from '@/lib/cedula-ve';

// Panel del Grupo de Búsqueda: consulta una cédula contra el registro del CNE
// para contrastar el nombre y la ubicación con los datos del caso. Solo por
// cédula. La autorización y la auditoría las impone la Server Action.
export default function PanelCedula({ activa, esAdmin }: { activa: boolean; esAdmin: boolean }) {
  const [nac, setNac] = useState<'V' | 'E'>('V');
  const [cedula, setCedula] = useState('');
  const [datos, setDatos] = useState<DatosCedula | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function consultar(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setDatos(null);
    startTransition(async () => {
      const r = await consultarCedula(nac, cedula);
      if (r.ok) setDatos(r.datos);
      else setError(r.error);
    });
  }

  const Dato = ({ etiqueta, valor }: { etiqueta: string; valor?: string }) =>
    valor ? (
      <div style={{ display: 'grid', gap: 1 }}>
        <span className="muted" style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.03em' }}>{etiqueta}</span>
        <span style={{ fontWeight: 500 }}>{valor}</span>
      </div>
    ) : null;

  // Sin proveedor configurado: mostramos un estado honesto (no un formulario que
  // siempre falla). El host público anterior (api.megacreativo.com) fue dado de baja.
  if (!activa) {
    return (
      <div className="tarjeta" style={{ position: 'sticky', top: 12 }}>
        <h3 className="aside-titulo"><Icono nombre="buscar" size={16} /> Consultar cédula (CNE)</h3>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: '.82rem' }}>
          Esta herramienta contrasta la cédula de un caso con el registro oficial.
        </p>
        <p className="muted" style={{ margin: 0, fontSize: '.8rem', borderLeft: '3px solid var(--aviso, #E6A100)', paddingLeft: 8 }}>
          {esAdmin ? (
            <>Aún no está <strong>configurada</strong>. Define <code>CEDULA_VE_API_URL</code> con un proveedor compatible con CedulaVE (el script auto-hospedado o un espejo vigente) y vuelve a desplegar. El host público anterior fue discontinuado.</>
          ) : (
            <>Aún no está disponible. Pídele a un <strong>administrador</strong> que la configure.</>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="tarjeta" style={{ position: 'sticky', top: 12 }}>
      <h3 className="aside-titulo"><Icono nombre="buscar" size={16} /> Consultar cédula (CNE)</h3>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: '.82rem' }}>
        Contrasta la cédula de un caso con el registro oficial. Búsqueda <strong>solo por cédula</strong>. Cada consulta queda registrada.
      </p>
      <p className="muted" style={{ margin: '0 0 10px', fontSize: '.78rem', borderLeft: '3px solid var(--aviso, #E6A100)', paddingLeft: 8 }}>
        ⚠️ El registro del CNE solo cubre a <strong>mayores de edad</strong>: no encontrará a menores. Que no aparezca no significa que la persona no exista.
      </p>
      <form onSubmit={consultar}>
        <div className="fila" style={{ gap: 6, alignItems: 'flex-end' }}>
          <div className="campo" style={{ margin: 0 }}>
            <label htmlFor="cve-nac">Nac.</label>
            <select id="cve-nac" className="input" value={nac} onChange={(e) => setNac(e.target.value as 'V' | 'E')} style={{ width: 64 }}>
              <option value="V">V</option>
              <option value="E">E</option>
            </select>
          </div>
          <div className="campo crece" style={{ margin: 0 }}>
            <label htmlFor="cve-ced">Cédula</label>
            <input id="cve-ced" className="input" inputMode="numeric" autoComplete="off"
              placeholder="12345678" value={cedula}
              onChange={(e) => setCedula(e.target.value.replace(/\D/g, '').slice(0, 9))} />
          </div>
        </div>
        <button className="btn btn-primario" type="submit" disabled={pendiente || cedula.length < 4} style={{ width: '100%', marginTop: 8 }}>
          {pendiente ? 'Consultando…' : <><Icono nombre="buscar" size={16} /> Consultar</>}
        </button>
      </form>

      {error && <p className="error" style={{ marginTop: 10, marginBottom: 0 }}>{error}</p>}

      {datos && (
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
          <div className="fila" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '1.02rem' }}>{datos.fullname}</strong>
            <Pill tono="ok" punto={false}>{datos.nac}-{datos.dni}</Pill>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <Dato etiqueta="Estado" valor={datos.state} />
            <Dato etiqueta="Municipio" valor={datos.municipality} />
            <Dato etiqueta="Parroquia" valor={datos.parish} />
            <Dato etiqueta="Centro de votación" valor={datos.voting} />
            <Dato etiqueta="Dirección" valor={datos.address} />
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '.76rem' }}>
            Fuente: registro del CNE. Compara estos datos con los del caso antes de concluir.
          </p>
        </div>
      )}
    </div>
  );
}
