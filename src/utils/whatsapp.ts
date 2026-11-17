import { ClientAccessMetadata } from '../types';

export const WHATSAPP_ADMIN_PHONE = (
  import.meta.env.VITE_WHATSAPP_ADMIN || '6282125086328'
).replace(/[^\d]/g, '');

export type WhatsAppRequestContext =
  | 'new-access'
  | 'pending-approval'
  | 'forgot-password'
  | 'account-disabled';

function detectBrowserAndOs(ua: string): string {
  let os = 'Unknown OS';
  if (/Windows NT/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Browser';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';

  const platformType = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';
  return `${os} · ${browser} (${platformType})`;
}

export function collectAccessMetadata(): ClientAccessMetadata {
  if (typeof window === 'undefined') {
    return {
      origin: 'server',
      hostname: 'server',
      path: '/',
      fullUrl: '/',
      referrer: '-',
      deviceSummary: 'Unknown',
      screenInfo: '-',
      displayMode: 'Web Browser',
      timezone: 'UTC',
      timestamp: new Date().toISOString(),
    };
  }

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  let referrer = 'Direct / Bookmark';
  if (document.referrer) {
    referrer = document.referrer;
  } else if (window.self !== window.top) {
    referrer = 'Embedded Iframe Context';
  }

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  const localTime = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());

  return {
    origin: window.location.origin,
    hostname: window.location.hostname,
    path: `${window.location.pathname}${window.location.search}`,
    fullUrl: window.location.href,
    referrer,
    deviceSummary: detectBrowserAndOs(navigator.userAgent || ''),
    screenInfo: `${window.screen.width}x${window.screen.height} (VP ${window.innerWidth}x${window.innerHeight})`,
    displayMode: isStandalone ? 'Standalone PWA' : 'Web Browser',
    timezone: tz,
    timestamp: localTime,
  };
}

export function buildAdminWhatsAppUrl(params: {
  context: WhatsAppRequestContext;
  name?: string;
  email?: string;
  company?: string;
}): string {
  const meta = collectAccessMetadata();

  const subjectMap: Record<WhatsAppRequestContext, string> = {
    'new-access':
      'Halo Admin, saya ingin akses DieCut.Room dan memohon persetujuan aktivasi akun.',
    'pending-approval':
      'Halo Admin, saya ingin akses DieCut.Room. Akun saya sudah didaftarkan dan menunggu aktivasi (Pending).',
    'forgot-password':
      'Halo Admin, saya ingin akses DieCut.Room namun lupa password akun saya. Mohon bantuan untuk set password baru.',
    'account-disabled':
      'Halo Admin, saya ingin akses DieCut.Room namun akun saya berstatus Nonaktif. Mohon tinjauan aktivasi kembali.',
  };

  const lines = [
    subjectMap[params.context],
    '',
    '--- Data Pengguna ---',
    `Nama: ${params.name?.trim() || '(Belum diisi)'}`,
    `Email: ${params.email?.trim() || '(Belum diisi)'}`,
  ];

  if (params.company?.trim()) {
    lines.push(`Tim / Perusahaan: ${params.company.trim()}`);
  }

  lines.push(
    '',
    '--- Metadata Asal Akses ---',
    `Subdomain / Host: ${meta.hostname}`,
    `URL Akses: ${meta.fullUrl}`,
    `Referrer: ${meta.referrer}`,
    `Mode App: ${meta.displayMode}`,
    `Perangkat: ${meta.deviceSummary}`,
    `Resolusi: ${meta.screenInfo}`,
    `Waktu (${meta.timezone}): ${meta.timestamp}`
  );

  return `https://wa.me/${WHATSAPP_ADMIN_PHONE}?text=${encodeURIComponent(lines.join('\n'))}`;
}
