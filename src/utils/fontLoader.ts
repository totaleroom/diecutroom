interface DetectedFontFile {
  url: string;
  weight: string;
  format: 'woff2' | 'woff';
}

let fontsInitialized = false;

export async function initBrandFonts(): Promise<void> {
  if (fontsInitialized || typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }
  fontsInitialized = true;

  try {
    const res = await fetch('/api/fonts/available', { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { files?: DetectedFontFile[] };
    const files = Array.isArray(data.files) ? data.files : [];
    if (files.length === 0) return;

    const rules = files
      .map(
        (f) => `@font-face {
  font-family: 'Timeless Grotesk';
  src: url('${f.url}') format('${f.format}');
  font-weight: ${f.weight};
  font-style: normal;
  font-display: swap;
}`
      )
      .join('\n');

    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-brand-fonts', 'timeless-grotesk');
    styleEl.textContent = rules;
    document.head.appendChild(styleEl);

    if ('fonts' in document && typeof document.fonts.load === 'function') {
      document.fonts.load('600 16px "Timeless Grotesk"').catch(() => {});
    }
  } catch {
    // Gracefully stay on Neo-Grotesk fallback stack if font API is unavailable
  }
}
