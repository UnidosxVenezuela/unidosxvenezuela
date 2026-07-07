'use client';
import { useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';

// Coordenadas aproximadas (lat, lng) por país del catálogo, para ubicar el punto en el
// globo. Solo se usan para el mapa; no son datos de nadie.
const COORDS: Record<string, [number, number]> = {
  VE: [6.42, -66.58], DE: [51.2, 10.4], AR: [-38.4, -63.6], AU: [-25.3, 133.8], BE: [50.5, 4.5],
  BO: [-16.3, -63.6], BR: [-14.2, -51.9], CA: [56.1, -106.3], CL: [-35.7, -71.5], CN: [35.9, 104.2],
  CO: [4.6, -74.3], CR: [9.7, -83.8], CU: [21.5, -77.8], EC: [-1.8, -78.2], SV: [13.8, -88.9],
  AE: [23.4, 53.8], ES: [40.4, -3.7], US: [37.1, -95.7], FR: [46.2, 2.2], GT: [15.8, -90.2],
  HT: [19.0, -72.3], HN: [15.2, -86.2], IE: [53.4, -8.2], IT: [41.9, 12.6], JP: [36.2, 138.3],
  MX: [23.6, -102.6], NI: [12.9, -85.2], NO: [60.5, 8.5], PA: [8.5, -80.8], PY: [-23.4, -58.4],
  NL: [52.1, 5.3], PE: [-9.2, -75.0], PT: [39.4, -8.2], PR: [18.2, -66.6], GB: [55.4, -3.4],
  DO: [18.7, -70.2], SE: [60.1, 18.6], CH: [46.8, 8.2], TR: [39.0, 35.2], TT: [10.7, -61.2],
  UY: [-32.5, -55.8],
};

const THETA = 0.2; // inclinación del globo (debe coincidir con la opción `theta`)
const PHI_VE = 0.45; // giro con el que Venezuela queda de frente (derivado de la proyección de cobe)

// Posición 3D del marcador según la MISMA fórmula que usa cobe internamente.
function mundo(lat: number, lng: number): [number, number, number] {
  const a = (lat * Math.PI) / 180;
  const o = (lng * Math.PI) / 180 - Math.PI;
  return [-Math.cos(a) * Math.cos(o), Math.sin(a), Math.cos(a) * Math.sin(o)];
}
const VE_MUNDO = mundo(6.42, -66.58);

export default function GloboColaboradores({ paises }: { paises: { pais: string; n: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const corazonRef = useRef<HTMLSpanElement>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let width = 0;
    const onResize = () => { width = canvas.offsetWidth; };
    onResize();
    window.addEventListener('resize', onResize);

    const oscuro = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const maxN = Math.max(1, ...paises.map((p) => p.n));
    // Un punto por país colaborador (Venezuela se marca con el corazón, no con punto).
    const markers = paises
      .filter((p) => p.pais !== 'VE')
      .map((p) => {
        const c = COORDS[p.pais];
        return c ? { location: c, size: 0.03 + 0.055 * (p.n / maxN) } : null;
      })
      .filter(Boolean) as { location: [number, number]; size: number }[];

    let t = 0; // vaivén suave alrededor de Venezuela: el corazón queda siempre visible

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: PHI_VE,
      theta: THETA,
      dark: oscuro ? 1 : 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: oscuro ? 5.6 : 5,
      baseColor: oscuro ? [0.28, 0.34, 0.46] : [0.82, 0.86, 0.95],
      markerColor: [1, 0.82, 0.08], // amarillo de la bandera venezolana
      glowColor: oscuro ? [0.13, 0.2, 0.32] : [0.92, 0.95, 1],
      markers,
      onRender: (state) => {
        t += 0.005;
        const phi = PHI_VE + 0.85 * Math.sin(t);
        state.phi = phi;
        state.width = width * 2;
        state.height = width * 2;
        // Coloca el corazón sobre Venezuela proyectando su posición como hace cobe.
        const el = corazonRef.current;
        if (el) {
          const cp = Math.cos(phi), sp = Math.sin(phi), ct = Math.cos(THETA), st = Math.sin(THETA);
          const [gx, gy, gz] = VE_MUNDO;
          const fx = cp * gx + sp * st * gy - sp * ct * gz;
          const fy = ct * gy + st * gz;
          const fz = sp * gx - cp * st * gy + cp * ct * gz;
          const cssW = canvas.offsetWidth || 1, cssH = canvas.offsetHeight || 1;
          const sx = (0.8 * fx + 1) / 2, sy = (1 - 0.8 * fy) / 2;
          const vis = Math.max(0, Math.min(1, (fz - 0.02) / 0.18));
          const escala = 0.7 + 0.45 * Math.max(0, fz);
          el.style.left = (sx * cssW).toFixed(1) + 'px';
          el.style.top = (sy * cssH).toFixed(1) + 'px';
          el.style.opacity = String(vis);
          el.style.transform = `translate(-50%,-50%) scale(${escala.toFixed(3)})`;
        }
      },
    });
    const timer = setTimeout(() => setListo(true), 120);
    return () => { globe.destroy(); clearTimeout(timer); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paises]);

  return (
    <div className="globo-wrap">
      <div className="globo-lienzo">
        <canvas
          ref={ref}
          className={'globo-canvas' + (listo ? ' listo' : '')}
          role="img"
          aria-label="Globo terráqueo con los países desde donde se colabora; Venezuela marcada con un corazón"
        />
        <span ref={corazonRef} className="globo-corazon" aria-hidden style={{ opacity: 0 }}>
          <svg viewBox="0 0 32 29.6" width="30" height="28">
            <path
              d="M23.6,0c-3.4,0-6.3,2.7-7.6,5.6C14.7,2.7,11.8,0,8.4,0C3.8,0,0,3.8,0,8.4c0,9.4,9.5,11.9,16,21.2c6.1-9.3,16-12.1,16-21.2C32,3.8,28.2,0,23.6,0z"
              fill="#FCD116"
              stroke="#b8860b"
              strokeWidth="1.4"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
