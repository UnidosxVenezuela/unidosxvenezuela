'use client';
import { useState, useRef } from 'react';
import Icono from '@/components/Icono';
import Pill from '@/components/Pill';
import BotonEnviar from '@/components/BotonEnviar';
import EditorImagen from './EditorImagen';
import { ETIQUETA_TIPO_LUGAR, ETIQUETA_CONDICION, CONDICIONES_PERSONA } from '@/lib/constantes';
import { guardarListado } from './actions';

type Centro = { id: string; nombre: string; lat: number | null; lng: number | null };
type Fila = { id: string; nombre: string; cedula: string; edad: string; condicion: string; notas: string; confianza: number; incluir: boolean };
type Metodo = 'foto' | 'manual' | 'csv';

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

// ── Preprocesado de la imagen para el OCR (mejora la precisión, todo en el
//    dispositivo). Escala + escala de grises + estiramiento de contraste +
//    binarizado por umbral de Otsu. Solo se usa para reconocer; el documento
//    que se guarda sigue siendo la foto legible.
function cargarImg(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('img')); im.src = url; });
}
function umbralOtsu(hist: number[], total: number): number {
  let suma = 0; for (let i = 0; i < 256; i++) suma += i * (hist[i] ?? 0);
  let sumaB = 0, pesoB = 0, maxVar = 0, thr = 127;
  for (let t = 0; t < 256; t++) {
    const ht = hist[t] ?? 0;
    pesoB += ht; if (pesoB === 0) continue;
    const pesoF = total - pesoB; if (pesoF === 0) break;
    sumaB += t * ht;
    const mediaB = sumaB / pesoB, mediaF = (suma - sumaB) / pesoF;
    const entre = pesoB * pesoF * (mediaB - mediaF) * (mediaB - mediaF);
    if (entre > maxVar) { maxVar = entre; thr = t; }
  }
  return thr;
}
async function preprocesarParaOCR(file: File): Promise<Blob | File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await cargarImg(url);
    let w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return file;
    // Ampliar hasta que el lado menor tenga ~1500px (Tesseract rinde mejor con más resolución),
    // sin pasar de 2400px en el lado mayor (memoria).
    const escala = Math.min(2400 / Math.max(w, h), Math.max(1, 1500 / Math.min(w, h)));
    w = Math.max(1, Math.round(w * escala)); h = Math.max(1, Math.round(h * escala));
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d'); if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    const n = w * h;
    const gris = new Uint8ClampedArray(n);
    let min = 255, max = 0;
    for (let i = 0, p = 0; p < n; i += 4, p++) {
      const g = (d[i]! * 0.299 + d[i + 1]! * 0.587 + d[i + 2]! * 0.114) | 0;
      gris[p] = g; if (g < min) min = g; if (g > max) max = g;
    }
    const rango = Math.max(1, max - min);
    const hist = new Array(256).fill(0);
    for (let p = 0; p < n; p++) { const v = ((gris[p]! - min) * 255 / rango) | 0; gris[p] = v; hist[v]++; }
    const thr = umbralOtsu(hist, n);
    for (let i = 0, p = 0; p < n; i += 4, p++) {
      const v = gris[p]! >= thr ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v; // alfa intacto
    }
    ctx.putImageData(imgData, 0, 0);
    return await new Promise<Blob | File>((res) => canvas.toBlob((b) => res(b || file), 'image/png'));
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Importación por CSV (una persona por fila) ──
const PLANTILLA_CSV = 'data:text/csv;charset=utf-8,' + encodeURIComponent(
  'nombre,cedula,edad,condicion,notas\nJuan Pérez,12345678,34,herido,ingresó el 12/06\nMaría Gómez,,7,refugiado,menor de edad\n',
);
function mapearCondicion(txt: string, tipo: string): string {
  const t = (txt || '').toLowerCase().trim();
  if (!t) return condPorTipo(tipo);
  for (const c of CONDICIONES_PERSONA) if (t === c || t === (ETIQUETA_CONDICION[c] || '').toLowerCase()) return c;
  if (/herid|lesion/.test(t)) return 'herido';
  if (/refugi|damnific|alberg|desplaz/.test(t)) return 'refugiado';
  if (/fallec|muert|deces/.test(t)) return 'fallecido';
  if (/sano|salvo|ileso/.test(t)) return 'sano';
  if (/desconoc/.test(t)) return 'desconocida';
  return condPorTipo(tipo);
}
function parsearCSV(texto: string, tipo: string): Fila[] {
  const limpio = (texto || '').replace(/^﻿/, '');
  const lineas = limpio.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return [];
  const cont = (s: string, ch: string) => s.split(ch).length - 1;
  const c0 = lineas[0] ?? '';
  const delim = cont(c0, '\t') >= cont(c0, ';') && cont(c0, '\t') >= cont(c0, ',') ? '\t' : cont(c0, ';') > cont(c0, ',') ? ';' : ',';
  const parseLinea = (l: string): string[] => {
    const out: string[] = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const primeras = parseLinea(lineas[0] ?? '').map((s) => s.toLowerCase());
  const esEncabezado = primeras.some((c) => /nombre|c[eé]dula|cedula|\bci\b|edad|condici|estado|nota|observ|apellido/.test(c));
  let idx = { nombre: 0, cedula: 1, edad: 2, condicion: 3, notas: 4 };
  if (esEncabezado) {
    const find = (re: RegExp) => primeras.findIndex((c) => re.test(c));
    idx = {
      nombre: Math.max(0, find(/nombre|apellido|persona/)),
      cedula: find(/c[eé]dula|cedula|\bci\b|documento|dni/),
      edad: find(/edad|a[ñn]os/),
      condicion: find(/condici|estado|situaci/),
      notas: find(/nota|observ|coment/),
    };
  }
  const cuerpo = esEncabezado ? lineas.slice(1) : lineas;
  return cuerpo.map((l, i) => {
    const c = parseLinea(l);
    const get = (j: number) => (j >= 0 && j < c.length ? (c[j] ?? '') : '');
    const nombre = get(idx.nombre).replace(/\s+/g, ' ').trim();
    const cedula = get(idx.cedula).replace(/\D/g, '').slice(0, 9);
    const edad = get(idx.edad).replace(/\D/g, '').slice(0, 3);
    const notas = get(idx.notas).trim();
    return { id: 'c' + i + '_' + Date.now(), nombre, cedula, edad, condicion: mapearCondicion(get(idx.condicion), tipo), notas, confianza: 100, incluir: nombre.length > 1 };
  }).filter((f) => f.nombre || f.cedula);
}

export default function AsistenteDigitalizacion({ tiposPermitidos, centros }: { tiposPermitidos: string[]; centros: Centro[] }) {
  const [tipoLugar, setTipoLugar] = useState(tiposPermitidos[0] ?? 'otro');
  const [lugarNombre, setLugarNombre] = useState('');
  const [puntoAcopioId, setPuntoAcopioId] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [notas, setNotas] = useState('');
  const [metodo, setMetodo] = useState<Metodo>('foto');
  const [archivoOriginal, setArchivoOriginal] = useState<File | null>(null);
  const [archivoEditado, setArchivoEditado] = useState<File | null>(null);
  const [pickId, setPickId] = useState(0);
  const [estado, setEstado] = useState<'idle' | 'procesando' | 'listo'>('idle');
  const [progreso, setProgreso] = useState(0);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [csvInfo, setCsvInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const incluidas = filas.filter((f) => f.incluir && f.nombre.trim().length > 1);
  const mostrarTabla = metodo !== 'foto' || estado === 'listo' || filas.length > 0;

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

  // Deja el archivo (editado) dentro del input para que viaje al servidor.
  function escribirEnInput(file: File) {
    if (!fileRef.current) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileRef.current.files = dt.files;
    } catch { /* si el navegador no lo permite, se envía la foto original */ }
  }

  function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setArchivoOriginal(f);
    setArchivoEditado(f);
    setPickId((n) => n + 1);
    setFilas([]); setEstado('idle'); setError(null);
  }

  // Cada recorte/rotación reemplaza la imagen usada para OCR y para el envío.
  function alEditarImagen(file: File) {
    setArchivoEditado(file);
    escribirEnInput(file);
  }

  async function escanear() {
    const f = archivoEditado;
    if (!f) { setError('Primero elige o toma una foto de la lista.'); return; }
    setError(null); setEstado('procesando'); setProgreso(0);
    try {
      const paraOcr = await preprocesarParaOCR(f); // mejora contraste/nitidez (en el dispositivo)
      const Tesseract: any = await import('tesseract.js');
      const worker = await Tesseract.createWorker('spa', 1, {
        logger: (m: any) => { if (m?.status === 'recognizing text') setProgreso(Math.round((m.progress || 0) * 100)); },
      });
      const { data } = await worker.recognize(paraOcr, {}, { blocks: true });
      await worker.terminate();
      const lineas = extraerLineas(data).map((l, i) => parsear(l.texto, tipoLugar, i, l.confianza));
      setFilas(lineas);
      setEstado('listo');
      if (lineas.length === 0) setError('No se reconoció texto. Prueba con una foto más nítida, bien iluminada y de frente, o escribe las filas a mano.');
    } catch {
      setEstado('idle');
      setError('No se pudo procesar la imagen en este dispositivo. Intenta con otra foto o navegador.');
    }
  }

  async function alSubirCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null); setCsvInfo(null);
    try {
      const texto = await f.text();
      const nuevas = parsearCSV(texto, tipoLugar);
      if (nuevas.length === 0) { setError('No se reconocieron filas en el CSV. Revisa el formato o descarga la plantilla.'); }
      else { setFilas((fs) => [...fs, ...nuevas]); setCsvInfo(`${nuevas.length} personas importadas del CSV. Revísalas abajo.`); setEstado('listo'); }
    } catch {
      setError('No se pudo leer el archivo CSV.');
    }
    e.target.value = '';
  }

  function cambiarMetodo(m: Metodo) {
    setMetodo(m); setError(null); setCsvInfo(null);
  }

  const actualizar = (id: string, campo: keyof Fila, valor: any) =>
    setFilas((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  const quitar = (id: string) => setFilas((fs) => fs.filter((f) => f.id !== id));
  const agregar = () => setFilas((fs) => [...fs, { id: 'n' + fs.length + '_' + Date.now(), nombre: '', cedula: '', edad: '', condicion: condPorTipo(tipoLugar), notas: '', confianza: 100, incluir: true }]);

  const METODOS: { k: Metodo; et: string; ic: string }[] = [
    { k: 'foto', et: 'Reconocer una foto', ic: 'imagen' },
    { k: 'manual', et: 'Escribir a mano', ic: 'documento' },
    { k: 'csv', et: 'Importar CSV', ic: 'grupos' },
  ];

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
        <p className="muted" style={{ fontSize: '.8rem', margin: '6px 0 0' }}>La ubicación permite que el punto aparezca en el mapa.</p>
      </div>

      {/* 2) Cómo cargar las personas: foto (OCR) · a mano · CSV */}
      <div className="tarjeta">
        <h3 className="aside-titulo"><Icono nombre="grupos" size={16} /> ¿Cómo quieres cargar las personas?</h3>
        <div className="fila" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }} role="tablist" aria-label="Método de carga">
          {METODOS.map((m) => (
            <button key={m.k} type="button" role="tab" aria-selected={metodo === m.k}
              className={'btn' + (metodo === m.k ? ' btn-primario' : '')} onClick={() => cambiarMetodo(m.k)}>
              <Icono nombre={m.ic} size={15} /> {m.et}
            </button>
          ))}
        </div>

        {metodo === 'foto' && (
          <>
            <input ref={fileRef} type="file" name="documento" accept="image/*" capture="environment" className="input" onChange={alElegirArchivo} />
            {archivoOriginal && <EditorImagen key={pickId} file={archivoOriginal} onCambio={alEditarImagen} />}
            <div className="fila" style={{ gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primario" onClick={escanear} disabled={estado === 'procesando'}>
                {estado === 'procesando' ? `Reconociendo… ${progreso}%` : <><Icono nombre="buscar" size={16} /> Reconocer texto</>}
              </button>
              {estado === 'listo' && filas.length > 0 && <span className="muted" style={{ fontSize: '.85rem' }}>{filas.length} líneas detectadas · revisa y corrige abajo</span>}
            </div>
            <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 0' }}>
              {archivoOriginal && <>Endereza (<strong>girar</strong>) y <strong>recorta</strong> la foto para dejar solo la lista: mejora mucho el reconocimiento. </>}
              El texto se mejora y reconoce <strong>en tu dispositivo</strong>; la imagen no se envía a terceros.
            </p>
          </>
        )}

        {metodo === 'manual' && (
          <>
            <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 8px' }}>
              Escribe las personas una por una en la tabla de abajo. No se sube ninguna imagen.
            </p>
            <button type="button" className="btn btn-primario" onClick={agregar}><Icono nombre="mas" size={16} /> Agregar persona</button>
          </>
        )}

        {metodo === 'csv' && (
          <>
            <p className="muted" style={{ fontSize: '.85rem', margin: '0 0 8px' }}>
              Sube un archivo <strong>CSV</strong> con una persona por fila. Columnas: <code>nombre, cedula, edad, condicion, notas</code> (con o sin encabezado).
            </p>
            <input type="file" accept=".csv,text/csv,text/plain" className="input" onChange={alSubirCsv} />
            <div className="fila" style={{ gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <a className="btn" href={PLANTILLA_CSV} download="plantilla-personas.csv"><Icono nombre="documento" size={15} /> Descargar plantilla</a>
              {csvInfo && <span className="muted" style={{ fontSize: '.85rem' }}>{csvInfo}</span>}
            </div>
            <p className="muted" style={{ fontSize: '.8rem', margin: '8px 0 0' }}>Se lee <strong>en tu dispositivo</strong>; el archivo no se sube. Puedes revisar y corregir cada fila antes de guardar.</p>
          </>
        )}
      </div>

      {/* 3) Revisión persona por persona */}
      {mostrarTabla && (
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
                {filas.length === 0 && <tr><td colSpan={7} className="muted">Sin personas todavía. Usa «Agregar fila» para escribirlas a mano.</td></tr>}
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
