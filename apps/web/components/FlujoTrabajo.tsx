import { Fragment } from 'react';
import Link from 'next/link';
import Icono from './Icono';

export type PasoFlujo = {
  etiqueta: string;
  valor?: number | string;
  icono: string;
  color?: string;
  tinte?: string;
  href?: string;
};

/**
 * Tira horizontal del flujo de trabajo: pasos conectados con flechas y conteo en
 * vivo, para entender de un vistazo cómo avanza la información hasta publicarse.
 * Cada paso puede enlazar a su vista. Solo presentación.
 */
export default function FlujoTrabajo({ pasos }: { pasos: PasoFlujo[] }) {
  return (
    <div className="flujo">
      {pasos.map((p, i) => {
        const Cont: any = p.href ? Link : 'div';
        return (
          <Fragment key={p.etiqueta}>
            <Cont {...(p.href ? { href: p.href } : {})} className="flujo-paso">
              <span className="flujo-ico" style={{ background: p.tinte ?? '#eef2f7', color: p.color ?? 'var(--texto)' }}>
                <Icono nombre={p.icono} size={18} />
              </span>
              <span className="flujo-txt">
                <span className="flujo-num" style={{ color: p.color ?? 'var(--texto)' }}>{p.valor ?? ''}</span>
                <span className="flujo-et">{p.etiqueta}</span>
              </span>
            </Cont>
            {i < pasos.length - 1 && <span className="flujo-flecha" aria-hidden="true"><Icono nombre="flecha" size={16} /></span>}
          </Fragment>
        );
      })}
    </div>
  );
}
