import { toJpeg, toPng } from 'html-to-image';
import playerPlaceholder from '@/assets/player-placeholder.png';

export type ExportFormat = 'png' | 'jpeg';

export interface ExportOptions {
  /** Output image format. */
  format: ExportFormat;
  /** Base file name (sanitized internally — no extension needed). */
  fileName: string;
  /** Device pixel ratio for the rendered image. Defaults to 2 (retina-quality). */
  pixelRatio?: number;
}

export interface ExportResult {
  ok: boolean;
  error?: unknown;
}

/** Keep filenames filesystem-safe across OSes. */
function sanitize(name: string): string {
  return (name || 'scouty')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'scouty';
}

/**
 * JPEG has no alpha channel, so a transparent capture renders black.
 * Walk up the DOM to find the first opaque background color and use it.
 */
function resolveBackground(node: HTMLElement): string {
  let el: HTMLElement | null = node;
  while (el) {
    const bg = getComputedStyle(el).backgroundColor;
    // skip transparent / rgba(...,0)
    if (bg && bg !== 'transparent' && !/,\s*0\s*\)$/.test(bg)) return bg;
    el = el.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor || '#ffffff';
}

/** Exclude the download UI and any un-loadable (CORS-tainted) images from the capture. */
function exportFilter(node: HTMLElement): boolean {
  if (node?.dataset && 'exportIgnore' in node.dataset) return false;
  if (node.tagName === 'IMG' && (node as HTMLImageElement).naturalWidth === 0) return false;
  return true;
}

/**
 * Cross-origin images (e.g. external player photos from Transfermarkt/TheSportsDB)
 * taint the canvas and make toPng/toJpeg throw a SecurityError. Swap them for the
 * bundled (same-origin) player placeholder during capture, then restore the originals.
 */
function neutralizeForeignImages(node: HTMLElement): () => void {
  const origin = window.location.origin;
  const changed: Array<[HTMLImageElement, string]> = [];
  node.querySelectorAll('img').forEach((img) => {
    const raw = img.getAttribute('src') || '';
    if (!raw) return;
    let foreign = false;
    try {
      const u = new URL(raw, window.location.href);
      foreign = u.protocol !== 'data:' && u.protocol !== 'blob:' && u.origin !== origin;
    } catch {
      foreign = true;
    }
    if (foreign) {
      changed.push([img, raw]);
      img.src = playerPlaceholder;
    }
  });
  return () => changed.forEach(([img, raw]) => img.setAttribute('src', raw));
}

/** Last-resort: hide every image so a tainted resource can't block the export. */
function stripAllImages(node: HTMLElement): () => void {
  const changed: Array<[HTMLImageElement, string]> = [];
  node.querySelectorAll('img').forEach((img) => {
    changed.push([img, img.getAttribute('src') || '']);
    img.src =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  });
  return () => changed.forEach(([img, raw]) => { if (raw) img.setAttribute('src', raw); });
}

/** Force eager loading + crossorigin and wait for every image inside the node to settle. */
async function preloadImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll('img'));
  imgs.forEach((img) => {
    img.loading = 'eager';
    img.setAttribute('crossorigin', 'anonymous');
  });
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  );
}

function triggerDownload(dataUrl: string, fileName: string, format: ExportFormat): void {
  const link = document.createElement('a');
  link.download = `${sanitize(fileName)}.${format === 'jpeg' ? 'jpg' : 'png'}`;
  link.href = dataUrl;
  link.click();
}

/**
 * Render a DOM node to a PNG/JPEG and trigger a download.
 *
 * Robustness: cross-origin images are swapped for a same-origin placeholder before
 * capture (they would otherwise taint the canvas and throw), fonts are skipped, and
 * the download button is excluded via `[data-export-ignore]`. JPEG gets a resolved
 * opaque background so light/dark themes both render correctly. If a capture still
 * fails, it retries once with all images stripped. Never throws — returns `{ ok, error }`.
 */
export async function exportNodeToImage(
  node: HTMLElement | null,
  { format, fileName, pixelRatio = 2 }: ExportOptions,
): Promise<ExportResult> {
  if (!node) return { ok: false, error: 'no-node' };

  const restoreForeign = neutralizeForeignImages(node);
  try {
    await preloadImages(node);

    const render = async (): Promise<string> => {
      const common = {
        pixelRatio,
        cacheBust: true,
        skipFonts: true,
        filter: exportFilter as (node: HTMLElement) => boolean,
      };
      let dataUrl = '';
      // Two passes: the first warms async resources, the second produces a stable frame.
      for (let i = 0; i < 2; i++) {
        dataUrl =
          format === 'jpeg'
            ? await toJpeg(node, { ...common, quality: 0.95, backgroundColor: resolveBackground(node) })
            : await toPng(node, common);
      }
      return dataUrl;
    };

    let dataUrl = '';
    try {
      dataUrl = await render();
    } catch (firstErr) {
      // A resource still tainted the canvas — retry without any images.
      console.warn('export-image: retrying without images', firstErr);
      const restoreAll = stripAllImages(node);
      try {
        dataUrl = await render();
      } finally {
        restoreAll();
      }
    }

    triggerDownload(dataUrl, fileName, format);
    return { ok: true };
  } catch (error) {
    console.error('export-image error', error);
    return { ok: false, error };
  } finally {
    restoreForeign();
  }
}
