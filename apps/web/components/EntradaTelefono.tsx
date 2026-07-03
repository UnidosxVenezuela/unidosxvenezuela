'use client';
import { useState } from 'react';

// Selector de código de país + número, para WhatsApp/teléfono. Solo acepta
// dígitos y limita a la cantidad esperada por país (evita números mal escritos).
// Guarda el número completo en un input oculto `name` (formato +<código><número>).
type Pais = { code: string; nombre: string; dial: string; min: number; max: number };
const PAISES: Pais[] = [
  { code: 'VE', nombre: 'Venezuela', dial: '58', min: 10, max: 10 },
  { code: 'CO', nombre: 'Colombia', dial: '57', min: 10, max: 10 },
  { code: 'PE', nombre: 'Perú', dial: '51', min: 9, max: 9 },
  { code: 'CL', nombre: 'Chile', dial: '56', min: 9, max: 9 },
  { code: 'EC', nombre: 'Ecuador', dial: '593', min: 9, max: 9 },
  { code: 'AR', nombre: 'Argentina', dial: '54', min: 10, max: 11 },
  { code: 'BR', nombre: 'Brasil', dial: '55', min: 10, max: 11 },
  { code: 'MX', nombre: 'México', dial: '52', min: 10, max: 10 },
  { code: 'PA', nombre: 'Panamá', dial: '507', min: 8, max: 8 },
  { code: 'US', nombre: 'EE. UU. / Canadá', dial: '1', min: 10, max: 10 },
  { code: 'ES', nombre: 'España', dial: '34', min: 9, max: 9 },
  { code: 'OT', nombre: 'Otro país', dial: '', min: 6, max: 15 },
];

/** Descompone un número guardado (+<código><nacional>) en país + nacional. */
function parsear(full: string, fallbackDial: string): { dial: string; nac: string; otro: string } {
  const s = (full ?? '').replace(/[^\d+]/g, '');
  if (s.startsWith('+')) {
    const d = s.slice(1);
    const dials = PAISES.filter((p) => p.dial).map((p) => p.dial).sort((a, b) => b.length - a.length);
    for (const dc of dials) if (d.startsWith(dc)) return { dial: dc, nac: d.slice(dc.length), otro: '' };
    return { dial: '', nac: '', otro: '' }; // no coincide: queda vacío para reingresar
  }
  return s ? { dial: fallbackDial, nac: s.replace(/\D/g, ''), otro: '' } : { dial: fallbackDial, nac: '', otro: '' };
}

export default function EntradaTelefono({ name, requerido = false, defaultDial = '58', defaultValue = '', onChange }: {
  name: string; requerido?: boolean; defaultDial?: string; defaultValue?: string; onChange?: (full: string) => void;
}) {
  const inicial = parsear(defaultValue, defaultDial);
  const [dial, setDial] = useState(inicial.dial || defaultDial);
  const [nac, setNac] = useState(inicial.nac);
  const [otro, setOtro] = useState(inicial.otro); // código manual cuando es "Otro país"
  const pais = PAISES.find((p) => p.dial === dial) ?? PAISES[PAISES.length - 1]!;
  const esOtro = pais.code === 'OT';
  const codigo = esOtro ? otro.replace(/\D/g, '').slice(0, 4) : pais.dial;
  const full = nac && codigo ? '+' + codigo + nac : '';
  const okLen = nac.length === 0 || (nac.length >= pais.min && nac.length <= pais.max);

  function emitir(next: { d?: string; n?: string; o?: string }) {
    const d = next.d ?? dial; const n = next.n ?? nac; const o = next.o ?? otro;
    const cod = (PAISES.find((p) => p.dial === d)?.code === 'OT') ? o.replace(/\D/g, '').slice(0, 4) : d;
    onChange?.(n && cod ? '+' + cod + n : '');
  }
  function setNacDigits(v: string) { const d = v.replace(/\D/g, '').slice(0, pais.max); setNac(d); emitir({ n: d }); }

  return (
    <div>
      <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
        <select className="input" style={{ maxWidth: 190 }} value={dial}
          onChange={(e) => { setDial(e.target.value); emitir({ d: e.target.value }); }}>
          {PAISES.map((p) => <option key={p.code} value={p.dial}>{p.nombre}{p.dial ? ' +' + p.dial : ''}</option>)}
        </select>
        {esOtro && (
          <input className="input" style={{ maxWidth: 90 }} type="tel" inputMode="numeric" placeholder="+código"
            value={otro} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setOtro(v); emitir({ o: v }); }} />
        )}
        <input className="input" style={{ flex: 1, minWidth: 140 }} type="tel" inputMode="numeric" autoComplete="tel-national"
          placeholder="número de WhatsApp" value={nac} onChange={(e) => setNacDigits(e.target.value)} required={requerido} />
      </div>
      <input type="hidden" name={name} value={full} />
      {nac.length > 0 && !okLen && (
        <p className="muted" style={{ fontSize: '.78rem', margin: '4px 0 0', color: 'var(--critica)' }}>
          {nac.length < pais.min ? `Faltan ${pais.min - nac.length} dígito(s)` : 'Demasiados dígitos'}
          {' '}· se esperan {pais.min === pais.max ? pais.min : `${pais.min}–${pais.max}`}.
        </p>
      )}
    </div>
  );
}
