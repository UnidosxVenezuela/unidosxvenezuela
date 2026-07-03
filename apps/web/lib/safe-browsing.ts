// Verificación de enlaces con la Google Safe Browsing Lookup API v4
// (threatMatches:find). SOLO SERVIDOR: la API key es secreta y jamás debe
// importarse desde un componente cliente. Se apoya en el análisis heurístico
// local de `lib/validaciones.ts` como primera línea; esto es la segunda.
//
// FAIL-OPEN: si no hay clave configurada o la API falla (red/límite), NO bloquea
// la acción — solo se omite la comprobación de Google. Nunca detiene el operativo
// por un problema de infraestructura de terceros.
//
// Configuración: define GOOGLE_SAFE_BROWSING_API_KEY (variable de entorno del
// servidor, sin NEXT_PUBLIC_). Ver .env.example.

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';
const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'];
const TIMEOUT_MS = 5000;

export type ResultadoSafeBrowsing =
  | { revisado: false; motivo: 'sin_clave' | 'error' | 'vacio' }
  | { revisado: true; seguro: true }
  | { revisado: true; seguro: false; amenaza: string };

/** ¿Está configurada la verificación de Google? (para pistas en la UI). */
export function safeBrowsingActivo(): boolean {
  return !!process.env.GOOGLE_SAFE_BROWSING_API_KEY;
}

/** Consulta un enlace contra Google Safe Browsing. Fail-open (ver arriba). */
export async function revisarSafeBrowsing(url: string | null | undefined): Promise<ResultadoSafeBrowsing> {
  const u = (url ?? '').trim();
  if (!u) return { revisado: false, motivo: 'vacio' };
  const key = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!key) return { revisado: false, motivo: 'sin_clave' };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
      body: JSON.stringify({
        client: { clientId: 'apoyo-por-venezuela', clientVersion: '1.0.0' },
        threatInfo: {
          threatTypes: THREAT_TYPES,
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url: u }],
        },
      }),
    });
    if (!resp.ok) return { revisado: false, motivo: 'error' };
    // Respuesta vacía ({}) = enlace seguro; con `matches` = amenaza encontrada.
    const data = (await resp.json().catch(() => null)) as { matches?: Array<{ threatType?: string }> } | null;
    const match = data?.matches?.[0];
    if (match) return { revisado: true, seguro: false, amenaza: etiquetaAmenaza(match.threatType) };
    return { revisado: true, seguro: true };
  } catch {
    return { revisado: false, motivo: 'error' }; // timeout, red, etc. → fail-open
  } finally {
    clearTimeout(t);
  }
}

function etiquetaAmenaza(t?: string): string {
  switch (t) {
    case 'SOCIAL_ENGINEERING': return 'phishing / ingeniería social';
    case 'MALWARE': return 'malware';
    case 'UNWANTED_SOFTWARE': return 'software no deseado';
    case 'POTENTIALLY_HARMFUL_APPLICATION': return 'aplicación potencialmente dañina';
    default: return 'amenaza de seguridad';
  }
}
