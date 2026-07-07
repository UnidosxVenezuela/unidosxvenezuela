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

// Marca de Venezuela en forma de CORAZÓN: en vez de un punto, se rellena la silueta de un
// corazón con muchos marcadores pequeños alrededor de la posición de Venezuela. Como cobe
// proyecta cada marcador sobre la esfera, el corazón gira junto con el globo sin cálculos
// extra. Silueta con la curva paramétrica clásica del corazón (muesca arriba, punta abajo),
// rellenada por punto-en-polígono.
function corazonVenezuela(): { location: [number, number]; size: number }[] {
  const ve = COORDS.VE;
  if (!ve) return [];
  const [lat, lng] = ve;
  const escala = 6; // radio aproximado en grados (silueta visible y clara en el globo)
  // Contorno del corazón, normalizado a ~[-1,1] con la punta hacia abajo (sur).
  const poly: [number, number][] = [];
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    poly.push([x / 16, (y + 2.7) / 14.3]);
  }
  const dentro = (px: number, py: number) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i]![0], yi = poly[i]![1], xj = poly[j]![0], yj = poly[j]![1];
      if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const pts: { location: [number, number]; size: number }[] = [];
  for (let ny = 1.05; ny >= -1.05; ny -= 0.14) {
    for (let nx = -1.05; nx <= 1.05; nx += 0.14) {
      // ny hacia el norte (lat), nx hacia el este (lng).
      if (dentro(nx, ny)) pts.push({ location: [lat + ny * escala, lng + nx * escala], size: 0.03 });
    }
  }
  return pts;
}

export default function GloboColaboradores({ paises }: { paises: { pais: string; n: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let width = 0;
    let phi = 0;
    const onResize = () => { width = canvas.offsetWidth; };
    onResize();
    window.addEventListener('resize', onResize);

    const oscuro = typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const maxN = Math.max(1, ...paises.map((p) => p.n));
    // Un punto por país colaborador (Venezuela va como corazón, no como punto).
    const markers = paises
      .filter((p) => p.pais !== 'VE')
      .map((p) => {
        const c = COORDS[p.pais];
        return c ? { location: c, size: 0.03 + 0.055 * (p.n / maxN) } : null;
      })
      .filter(Boolean) as { location: [number, number]; size: number }[];
    // Venezuela siempre presente (el foco) y con forma de corazón 💛💙❤️.
    markers.push(...corazonVenezuela());

    const globe = createGlobe(canvas, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0.28,
      dark: oscuro ? 1 : 0,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: oscuro ? 5.6 : 5,
      baseColor: oscuro ? [0.28, 0.34, 0.46] : [0.82, 0.86, 0.95],
      markerColor: [0.0, 0.28, 0.72], // azul Venezuela
      glowColor: oscuro ? [0.13, 0.2, 0.32] : [0.92, 0.95, 1],
      markers,
      onRender: (state) => {
        state.phi = phi;
        phi += 0.0035;
        state.width = width * 2;
        state.height = width * 2;
      },
    });
    const t = setTimeout(() => setListo(true), 120);
    return () => { globe.destroy(); clearTimeout(t); window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paises]);

  return (
    <div className="globo-wrap">
      <canvas
        ref={ref}
        className={'globo-canvas' + (listo ? ' listo' : '')}
        role="img"
        aria-label="Globo terráqueo con puntos en los países desde donde se colabora"
      />
    </div>
  );
}
