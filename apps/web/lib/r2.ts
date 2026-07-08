// Firma de subidas directas a Cloudflare R2 (S3 SigV4) — SOLO SERVIDOR.
// Lee las credenciales de entorno (nunca expuestas al cliente: no llevan prefijo
// NEXT_PUBLIC_). Si faltan, `r2Configurado()` devuelve false y la app cae al flujo
// de subida por Supabase (Server Action) sin romper nada.
import { AwsClient } from 'aws4fetch';

function env(k: string): string | undefined {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
}

export function r2Configurado(): boolean {
  return !!(
    env('R2_ACCESS_KEY_ID') &&
    env('R2_SECRET_ACCESS_KEY') &&
    env('R2_BUCKET') &&
    env('R2_ENDPOINT') &&
    env('NEXT_PUBLIC_R2_PUBLIC_BASE_URL')
  );
}

let _cliente: AwsClient | null = null;
function cliente(): AwsClient {
  if (!_cliente) {
    _cliente = new AwsClient({
      accessKeyId: env('R2_ACCESS_KEY_ID')!,
      secretAccessKey: env('R2_SECRET_ACCESS_KEY')!,
      region: 'auto',
      service: 's3',
    });
  }
  return _cliente;
}

/** URL PUT firmada (presigned) para subir un objeto a R2. Expira en `segundos`
 *  (1 h por defecto: margen para videos grandes en conexiones lentas). */
export async function firmarPut(key: string, segundos = 3600): Promise<string> {
  const endpoint = env('R2_ENDPOINT')!.replace(/\/+$/, '');
  const bucket = env('R2_BUCKET')!;
  const ruta = key.split('/').map(encodeURIComponent).join('/');
  const u = new URL(`${endpoint}/${bucket}/${ruta}`);
  u.searchParams.set('X-Amz-Expires', String(segundos));
  const firmado = await cliente().sign(u.toString(), { method: 'PUT', aws: { signQuery: true } });
  return firmado.url;
}
