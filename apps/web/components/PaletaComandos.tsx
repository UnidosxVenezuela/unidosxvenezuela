'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icono from './Icono';
import { destinosNav } from '@/lib/nav-destinos';
import type { NavFlags } from '@/lib/nav-flags';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Paleta de comandos (⌘K / Ctrl+K): salta a cualquier sección accesible escribiendo,
 * sin soltar el teclado. Ofrece exactamente los destinos del menú (misma fuente,
 * destinosNav). Accesible: rol dialog + combobox/listbox, foco al abrir, flechas para
 * moverse, Enter para ir, Escape o clic en el fondo para cerrar. Es un acelerador de
 * escritorio; en móvil sigue estando el menú completo.
 */
export default function PaletaComandos({ flags }: { flags: NavFlags }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const destinos = useMemo(() => destinosNav(flags), [flags]);

  const filtrados = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return destinos;
    return destinos.filter((d) => norm(d.etiqueta).includes(t) || norm(d.href).includes(t));
  }, [q, destinos]);

  // Atajo global ⌘K / Ctrl+K (alterna abrir/cerrar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbierto((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Al abrir: limpiar búsqueda, foco al input y bloquear el scroll del fondo.
  useEffect(() => {
    if (!abierto) return;
    setQ(''); setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 20);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { clearTimeout(t); document.body.style.overflow = prev; };
  }, [abierto]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    listaRef.current?.querySelector<HTMLElement>('.paleta-item.sel')?.scrollIntoView({ block: 'nearest' });
  }, [sel, filtrados]);

  const irA = (href: string) => { setAbierto(false); router.push(href); };

  const onKeyLista = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setAbierto(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(filtrados.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const d = filtrados[sel]; if (d) irA(d.href); }
  };

  if (!abierto) return null;
  return (
    <div className="paleta-overlay" role="dialog" aria-modal="true" aria-label="Ir a una sección"
      onClick={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}>
      <div className="paleta-caja" onKeyDown={onKeyLista}>
        <div className="paleta-busca">
          <Icono nombre="filtro" size={17} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ir a… (escribe una sección)"
            aria-label="Buscar sección"
            role="combobox"
            aria-expanded={true}
            aria-controls="paleta-lista"
          />
          <kbd className="paleta-kbd">Esc</kbd>
        </div>
        <ul id="paleta-lista" ref={listaRef} className="paleta-lista" role="listbox" aria-label="Secciones">
          {filtrados.length === 0 ? (
            <li className="paleta-vacio muted">Sin coincidencias.</li>
          ) : filtrados.map((d, i) => (
            <li
              key={d.href + d.etiqueta}
              role="option"
              aria-selected={i === sel}
              className={'paleta-item' + (i === sel ? ' sel' : '')}
              onMouseEnter={() => setSel(i)}
              onClick={() => irA(d.href)}
            >
              <Icono nombre={d.icono} size={17} />
              <span>{d.etiqueta}</span>
              <span className="paleta-ruta muted">{d.href}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
