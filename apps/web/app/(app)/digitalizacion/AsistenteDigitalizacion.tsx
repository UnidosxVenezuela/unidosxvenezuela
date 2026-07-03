'use client';
import { useState, useRef } from 'react';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import { ETIQUETA_TIPO_LUGAR, ETIQUETA_CONDICION, CONDICIONES_PERSONA } from '@/lib/constantes';
import { guardarListado } from './actions';

type Centro = { id: string; nombre: string; lat: number | null; lng: number | null };
type Fila = { id: string; nombre: string; cedula: string; edad: string; condicion: string; notas: string; confianza: number; incluir: boolean };

const condPorTipo = (tipo: string) => (tipo === 'hospital' ? 'herido' : tipo === 'acopio' || tipo === 'albergue' ? 'refugiado' : 'otro');

// Extrae líneas de texto (con su confianza) del resultado de Tesseract.
function extraerLineas(data: any): { texto: string; confianza: number }[] {
  const bloques = data?.blocks;
  if (Array.isArray(bloques) && bloques.length) {
    return bloques
      .flatMap((b: any) => b?.paragraphs ?? [])
      .flatMap((p: any) => p?.lines ?? [])
      .map((l: any) => ({ texto: String(l?.text ?? '').trim(), confianza: Number(l?.confidence) || 0 }))
      .filter((l: any) => l.texto.length > 0);
  }
  return String(data?.text ?? '').split('\n').map((t) => ({ texto: t.trim(), confianza: 0 })).filter((l) => l.texto.length > 0);
}

// De una línea cruda intenta separar cédula (6–9 dígitos) y nombre.
function parsear(texto: string, tipo: string, i: number, confianza: number): Fila {
  const ced = texto.match(/\b\d{6,9}\b/);
  const cedula = ced ? ced[0] : '';
  const nombre = texto.replace(/\d[\d.\-]*/g, ' ').replace(/[|_>*]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { id: 'f' + i + '_' + Math.round(confianza), nombre, cedula, edad: '', condicion: condPorTipo(tipo), notas: '', confianza, incluir: nombre.length > 1 };
}

export default function AsistenteDigitalizacion({ tiposPermitidos, centros }: { tiposPermitidos: string[]; centros: Centro[] }) {
  const [tipoLugar, setTipoLugar] = useState(tiposPermitidos[0] ?? 'otro');
  const [lugarNombre, setLugarNombre] = useState('');
  const [puntoAcopioId, setPuntoAcopioId] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [notas, setNotas] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [estado, setEstado] = useState<'idle' | 'procesando' | 'listo'>('idle');
  const [progreso, setProgreso] = useState(0);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const incluidas = filas.filter((f) => f.incluir && f.nombre.trim().length > 1);

  function elegirCentro(id: string) {
    setPuntoAcopioId(id);
    const c = centros.find((x) => x.id === id);
    if (c?.lat && c?.lng) { setLat(String(c.lat)); setLng(String(c.lng)); if (!lugarNombre) setLugarNombre(c.nombre); }
  }

  function ubicarme() {
    if (!navigator.geolocation) { setError('Tu dispositivo no permite ubicación automática. Escribe las coordenadas a mano.'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude.toFixed(6)); setLng(pos.coords.longitude.toFixed(6)); },
      () => setError('No se pudo obtener tu ubicación. Escríbela a mano si la conoces.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPreview(f ? URL.createObjectURL(f) : null);
    setFilas([]); setEstado('idle'); setError(null);
  }

  async function escanear() {
    const f = fileRef.current?.files?.[0];
    if (!f) { setError('Primero elige o toma una foto de la lista.'); return; }
    setError(null); setEstado('procesando'); setProgreso(0);
    try {
      const Tesseract: any = await import('tesseract.js');
      const worker = await Tesseract.createWorker('spa', 1, {
        logger: (m: any) => { if (m?.status === 'recognizing text') setProgreso(Math.round((m.progress || 0) * 100)); },
      });
      const { data } = await worker.recognize(f, {}, { blocks: true });
      await worker.terminate();
      const lineas = extraerLineas(data).map((l, i) => parsear(l.texto, tipoLugar, i, l.confianza));
      setFilas(lineas);
      setEstado('listo');
      if (lineas.length === 0) setError('No se reconoció texto. Prueba con una foto más nítida, bien iluminada y de frente.');
    } catch {
      setEstado('idle');
      setError('No se pudo procesar la imagen en este dispositivo. Intenta con otra foto o navegador.');
    }
  }

  const actualizar = (id: string, campo: keyof Fila, valor: any) =>
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  const quitar = (id: string) => setFilas((fs) => fs.filter((f) => f.id !== id));
  const agregar = () => setFilas((fs) => [...fs, { id: 'n' + fs.length + '_' + Date.now(), nombre: '', cedula: '', edad: '', condicion: condPorTipo(tipoLugar), notas: '', confianza: 100, incluir: true }]);

  return (
    <form action={guardarListado}>
      {/* Campos ocultos que viajan al servidor */}
      <input type="hidden" name="tipo_lugar" value={tipoLugar} />
      <input type="hidden" name="lat" value={lat} />
      <input type="hidden" name="lng" value={lng} />
      <input type="hidden" name="punto_acopio_id" value={puntoAcopioId} />
      <input type="hidden" name="personas" value={JSON.stringify(incluidas.map((f) => ({ nombre: f.nombre, cedula: f.cedula, edad: f.edad, condicion: f.condicion, notas: f.notas, confianza: f.confianza })))} />

      {/* 1) Lugar */}
      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="ubicacion" size={16} /> ¿De dónde es la lista?</h3>
        <div className="grid grid-2">
          <div className="campo">
            <label htmlFor="tipo">Tipo de lugar</label>
            <select id="tipo" className="input" value={tipoLugar} onChange={(e) => { setTipoLugar(e.target.value); setFilas((fs) => fs.map((f) => ({ ...f, condicion: condPorTipo(e.target.value) }))); }}>
              {tiposPermitidos.map((t) => <option key={t} value={t}>{ETIQUETA_TIPO_LUGAR[t] ?? t}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="lugar">Nombre del lugar</label>
            <input id="lugar" name="lugar_nombre" className="input" required value={lugarNombre} onChange={(e) => setLugarNombre(e.target.value)} placeholder="Hospital Central, Albergue Sur…" />
          </div>
        </div>
        {tipoLugar === 'acopio' && centros.length > 0 && (
          <div className="campo">
            <label htmlFor="centro">Centro de acopio (opcional)</label>
            <select id="centro" className="input" value={puntoAcopioId} onChange={(e) => elegirCentro(e.target.value)}>
              <option value="">— Elegir un centro existente —</option>
              {centros.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}
        <div className="fila" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="campo" style={{ margin: 0 }}><label>Latitud</label><input className="input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="10.48" style={{ width: 120 }} /></div>
          <div className="campo" style={{ margin: 0 }}><label>Longitud</label><input className="input" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-66.9" style={{ width: 120 }} /></div>
          <button type="button" className="btn" onClick={ubicarme}><Icono nombre="ubicacion" size={16} /> Usar mi ubicación</button>
        </div>
        <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>La ubicación permite que el punto aparezca en el mapa (próximamente).</p>
      </div>

      {/* 2) Documento + OCR */}
      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="imagen" size={16} /> Foto o escaneo de la lista</h3>
        <input ref={fileRef} type="file" name="documento" accept="image/*" capture="environment" className="input" onChange={alElegirArchivo} />
        {preview && <img src={preview} alt="Vista previa" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, marginTop: 10, display: 'block' }} />}
        <div className="fila" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primario" onClick={escanear} disabled={estado === 'procesando'}>
            {estado === 'procesando' ? `Reconociendo… ${progreso}%` : <><Icono nombre="buscar" size={16} /> Reconocer texto</>}
          </button>
          {estado === 'listo' && <span className="muted" style={{ fontSize: '.85rem' }}>{filas.length} líneas detectadas · revisa y corrige abajo</span>}
        </div>
        <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 0' }}>El reconocimiento ocurre <strong>en tu dispositivo</strong>; la imagen no se envía a terceros.</p>
      </div>

      {/* 3) Revisión línea por línea */}
      {(estado === 'listo' || filas.length > 0) && (
        <div className="tarjeta">
          <div className="fila" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <h3 className="aside-titulo" style={{ margin: 0 }}><Icono nombre="ok" size={16} /> Confirma cada persona ({incluidas.length})</h3>
            <button type="button" className="btn" onClick={agregar}><Icono nombre="mas" size={15} /> Agregar fila</button>
          </div>
          <p className="muted" style={{ fontSize: '.82rem', margin: '4px 0 10px' }}>
            Las líneas con <Pill tono="critica" punto={false}>baja confianza</Pill> pueden tener errores: revísalas con cuidado. Desmarca las que no sean personas.
          </p>
          <div className="tabla-scroll">
            <table>
              <thead><tr><th></th><th>Nombre completo</th><th>Cédula</th><th>Edad</th><th>Condición</th><th>Notas</th><th></th></tr></thead>
              <tbody>
                {filas.map((f) => {
                  const baja = f.confianza > 0 && f.confianza < 60;
                  return (
                    <tr key={f.id} style={baja ? { background: 'rgba(207,20,43,.06)' } : undefined}>
                      <td><input type="checkbox" checked={f.incluir} onChange={(e) => actualizar(f.id, 'incluir', e.target.checked)} aria-label="Incluir" style={{ width: 'auto', minHeight: 0 }} /></td>
                      <td><input className="input" value={f.nombre} onChange={(e) => actualizar(f.id, 'nombre', e.target.value)} style={{ minWidth: 160 }} />{baja && <div style={{ marginTop: 2 }}><Pill tono="critica" punto={false}>revisar</Pill></div>}</td>
                      <td><input className="input" inputMode="numeric" value={f.cedula} onChange={(e) => actualizar(f.id, 'cedula', e.target.value.replace(/\D/g, '').slice(0, 9))} style={{ width: 96 }} /></td>
                      <td><input className="input" inputMode="numeric" value={f.edad} onChange={(e) => actualizar(f.id, 'edad', e.target.value.replace(/\D/g, '').slice(0, 3))} style={{ width: 56 }} /></td>
                      <td>
                        <select className="input" value={f.condicion} onChange={(e) => actualizar(f.id, 'condicion', e.target.value)} style={{ width: 130 }}>
                          {CONDICIONES_PERSONA.map((c) => <option key={c} value={c}>{ETIQUETA_CONDICION[c]}</option>)}
                        </select>
                      </td>
                      <td><input className="input" value={f.notas} onChange={(e) => actualizar(f.id, 'notas', e.target.value)} style={{ minWidth: 120 }} /></td>
                      <td><button type="button" className="icono-btn" onClick={() => quitar(f.id)} aria-label="Quitar fila"><Icono nombre="basura" size={16} /></button></td>
                    </tr>
                  );
                })}
                {filas.length === 0 && <tr><td colSpan={7} className="muted">Sin líneas. Usa «Agregar fila» para escribirlas a mano.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      <div className="fila" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <div className="campo crece" style={{ margin: 0 }}>
          <input name="notas" className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nota del listado (opcional): fecha, quién lo entregó…" />
        </div>
        <BotonEnviar disabled={incluidas.length === 0 || !lugarNombre.trim()}>
          <Icono nombre="ok" size={16} /> Guardar {incluidas.length} personas
        </BotonEnviar>
      </div>
    </form>
  );
}
