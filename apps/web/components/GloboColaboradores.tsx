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

const PHI_VE = 0.45; // giro con el que Venezuela queda de frente al cargar

export default function GloboColaboradores({ paises }: { paises: { pais: string; n: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let width = 0;
    let phi = PHI_VE;
    const onResize = () => { width = canvas.offsetWidth; };
    onResize();
    window.addEventListener('resize', onResize);

    const maxN = Math.max(1, ...paises.map((p) => p.n));
    // Un punto por país colaborador. Venezuela va siempre y como el punto MÁS grande,
    // para que resalte sobre los demás (cobe usa un solo color para todos los marcadores).
    const markers = paises
      .filter((p) => p.pais !== 'VE')
      .map((p) => {
        const c = COORDS[p.pais];
        return c ? { location: c, size: 0.028 + 0.05 * (p.n / maxN) } : null;
      })
      .filter(Boolean) as { location: [number, number]; size: number }[];
    const ve = COORDS.VE;
    if (ve) markers.push({ location: ve, size: 0.12 });

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: PHI_VE,
      theta: 0.2,
      dark: 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 5,
      baseColor: [0.82, 0.86, 0.95],
      markerColor: [1, 0.82, 0.08], // amarillo de la bandera venezolana
      glowColor: [0.92, 0.95, 1],
      markers,
      onRender: (state) => {
        state.phi = phi;
        phi += 0.004; // giro lento y continuo
        state.width = width * 2;
        state.height = width * 2;
      },
    });
    const timer = setTimeout(() => setListo(true), 120);
    return () => { globe.destroy(); clearTimeout(timer); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paises]);

  return (
    <div className="globo-wrap">
      <canvas
        ref={ref}
        className={'globo-canvas' + (listo ? ' listo' : '')}
        role="img"
        aria-label="Globo terráqueo con los países desde donde se colabora; Venezuela resaltada"
      />
    </div>
  );
}
