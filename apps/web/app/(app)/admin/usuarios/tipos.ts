// Tipos compartidos entre la Server Action de importación y la UI cliente.
// (Van aparte porque un archivo 'use server' solo puede exportar funciones async.)

export type EstadoFila = 'creado' | 'duplicado' | 'error' | 'omitido';

export type FilaImport = {
  nombre: string;
  whatsapp: string | null;
  email: string | null;      // correo REAL de la persona (null si solo WhatsApp)
  estado: EstadoFila;
  detalle?: string;
  password?: string;         // temporal a compartir (para cuentas por WhatsApp)
  waLink?: string;           // enlace wa.me con el mensaje de acceso listo
};

export type EstadoImport = { ok: boolean; mensaje?: string; filas: FilaImport[] };

export const IMPORT_INICIAL: EstadoImport = { ok: false, filas: [] };
