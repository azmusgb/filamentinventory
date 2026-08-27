import type { Config } from '@netlify/functions';
import QRCode from 'qrcode';

declare const Netlify: any;

function response(body: string, status = 200, headers: HeadersInit = {}): Response {
  return new Response(body, { status, headers });
}

function isProduction(): boolean {
  return Netlify.context?.deploy?.context === 'production';
}

export default async (req: Request) => {
  if (!isProduction()) return response('QR labels are available only on the production site.', 403, {'Content-Type':'text/plain; charset=utf-8'});
  if (req.method !== 'GET') return response('Method not allowed.', 405, {'Allow':'GET','Content-Type':'text/plain; charset=utf-8'});

  const url = new URL(req.url);
  const spool = String(url.searchParams.get('spool') || '').trim();
  const profileRaw = String(url.searchParams.get('profile') || '').trim();
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(spool)) return response('Invalid spool ID.', 400, {'Content-Type':'text/plain; charset=utf-8'});
  if (profileRaw && !['Bill','Aimee'].includes(profileRaw)) return response('Invalid profile.', 400, {'Content-Type':'text/plain; charset=utf-8'});

  const target = new URL('/', url.origin);
  target.searchParams.set('spool', spool);
  target.searchParams.set('scan', '1');
  if (profileRaw) target.hash = new URLSearchParams({'filament-user':profileRaw}).toString();

  const svg = await QRCode.toString(target.toString(), {
    type:'svg',
    errorCorrectionLevel:'Q',
    margin:1,
    width:320,
    color:{dark:'#000000', light:'#ffffff'}
  });

  return response(svg, 200, {
    'Content-Type':'image/svg+xml; charset=utf-8',
    'Cache-Control':'public, max-age=86400, stale-while-revalidate=604800',
    'Content-Security-Policy':"default-src 'none'",
    'X-Content-Type-Options':'nosniff'
  });
};

export const config: Config = {
  path:'/qr',
  rateLimit:{windowLimit:240, windowSize:60, aggregateBy:['ip','domain']}
};
