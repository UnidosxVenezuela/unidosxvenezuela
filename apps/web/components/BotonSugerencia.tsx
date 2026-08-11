'use client';
// Botón flotante pequeño para reportar un problema o proponer una idea (0234).
//
// Va a la IZQUIERDA del acceso al chat, en la misma línea, y es deliberadamente MÁS
// PEQUEÑO: es una acción ocasional y no debe competir con la conversación, que sí es
// diaria. Comparten carril, así que `--fab-hueco` sigue valiendo para los dos.
//
// El formulario es un <form action={serverAction}> normal: funciona sin JavaScript.
// La ruta actual viaja en un campo oculto — es la mitad del trabajo de reproducir un
// fallo, y pedírsela a la persona sería pedirle que haga de informática.
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Icono from './Icono';
import { enviarSugerencia } from '@/app/(app)/sugerencias/actions';

export default function BotonSugerencia() {
  const pathname = usePathname() || '/dashboard';
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<'problema' | 'idea'>('problema');
  const panelRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  // Escape cierra; al abrir, el foco va al texto (que es lo único que hay que hacer).
  useEffect(() => {
    if (!abierto) return;
    areaRef.current?.focus();
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    const alClic = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('keydown', alTecla);
    // En el siguiente tick: si no, el propio clic que abre el panel lo cerraría.
    const t = setTimeout(() => document.addEventListener('mousedown', alClic), 0);
    return () => {
      document.removeEventListener('keydown', alTecla);
      document.removeEventListener('mousedown', alClic);
      clearTimeout(t);
    };
  }, [abierto]);

  // En la propia sección del buzón sobra.
  if (pathname.startsWith('/sugerencias') || pathname.startsWith('/admin/sugerencias')) return null;

  return (
    <>
      <button
        type="button"
        className="fab-sug"
        aria-label="Reportar un problema o proponer una idea"
        aria-expanded={abierto}
        title="Reportar un problema o proponer una idea"
        onClick={() => setAbierto((v) => !v)}
      >
        <Icono nombre={abierto ? 'cerrar' : 'ayuda'} size={17} />
      </button>

      {abierto && (
        <div ref={panelRef} className="sug-panel" role="dialog" aria-label="Reportar o proponer">
          <form action={enviarSugerencia}>
            <input type="hidden" name="ruta" value={pathname} />
            <input type="hidden" name="volver" value={pathname} />
            <input type="hidden" name="tipo" value={tipo} />

            <div className="sug-tipos" role="group" aria-label="Tipo">
              <button type="button"
                className={'sug-tipo' + (tipo === 'problema' ? ' sug-tipo-on' : '')}
                aria-pressed={tipo === 'problema'}
                onClick={() => setTipo('problema')}>
                <Icono nombre="avisos" size={14} /> Algo falla
              </button>
              <button type="button"
                className={'sug-tipo' + (tipo === 'idea' ? ' sug-tipo-on' : '')}
                aria-pressed={tipo === 'idea'}
                onClick={() => setTipo('idea')}>
                <Icono nombre="cohete" size={14} /> Tengo una idea
              </button>
            </div>

            <div className="campo" style={{ marginTop: 10 }}>
              <label htmlFor="sug-mensaje" className="sr-solo">
                {tipo === 'problema' ? 'Qué pasó' : 'Qué se te ocurre'}
              </label>
              <textarea
                id="sug-mensaje" ref={areaRef} name="mensaje" className="input" rows={4}
                maxLength={2000} required
                placeholder={tipo === 'problema'
                  ? 'Qué hacías y qué pasó. Si sale un mensaje de error, cópialo tal cual.'
                  : 'Qué te haría el trabajo más fácil.'}
              />
            </div>

            <p className="muted" style={{ fontSize: '.78rem', margin: '0 0 10px' }}>
              Se envía con la página en la que estás. Lo lee coordinación, y verás su
              respuesta en <strong>Mis reportes</strong>.
            </p>

            <div className="fila" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setAbierto(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primario">Enviar</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
