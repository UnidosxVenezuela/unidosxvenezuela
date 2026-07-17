// Utilidades de exportación a CSV — COMPARTIDAS por las rutas de descarga. Un CSV
// con BOM (para que Excel reconozca UTF-8/acentos), separador coma y saltos \r\n.
import { NextResponse } from 'next/server';

/** Escapa un valor para CSV: entrecomilla si trae coma, comillas, salto o «;». */
export function csv(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** Una columna del export: su encabezado y cómo sacar el valor de cada fila. */
export type Columna<T> = { encabezado: string; valor: (fila: T) => string | number | null | undefined };

/** Arma el cuerpo CSV (con BOM) a partir de columnas + filas. */
export function csvDesde<T>(columnas: Columna<T>[], filas: T[]): string {
  const lineas = [
    columnas.map((c) => c.encabezado),
    ...filas.map((f) => columnas.map((c) => c.valor(f))),
  ];
  // BOM para Excel + saltos \r\n.
  return '﻿' + lineas.map((l) => l.map(csv).join(',')).join('\r\n');
}

/** Slug seguro para el nombre del archivo (sin acentos ni caracteres raros). */
export function slugArchivo(base: string): string {
  return (base || 'export')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'export';
}

/** Respuesta HTTP de descarga (attachment) con el CSV ya armado. */
export function respuestaCsv(nombreBase: string, cuerpo: string): NextResponse {
  return new NextResponse(cuerpo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${slugArchivo(nombreBase)}.csv"`,
    },
  });
}
