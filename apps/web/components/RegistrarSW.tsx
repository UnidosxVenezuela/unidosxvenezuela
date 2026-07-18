'use client';
import { useEffect } from 'react';

/**
 * Registra el service worker (/sw.js — solo push, sin caché) al cargar la app.
 * Además de habilitar los avisos push, esto hace que el navegador reconozca la
 * app como INSTALABLE (PWA) y ofrezca su aviso de instalación en el móvil.
 * El registro es idempotente: si ya existe, el navegador devuelve el actual.
 */
export default function RegistrarSW() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
