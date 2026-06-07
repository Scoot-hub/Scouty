import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileImage, Image as ImageIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { exportNodeToImage, type ExportFormat } from '@/lib/export-image';
import logo from '@/assets/logo.png';

interface ExportableCardProps {
  /** Headline shown in the brand header and used as the captured title. */
  title: string;
  /** Optional secondary context line under the title. */
  subtitle?: string;
  /** Base file name for the downloaded image (sanitized internally). */
  fileName: string;
  /** Optional contextual content (e.g. a count badge) shown in the header and captured. */
  headerRight?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Faint, repeated diagonal "scouty.app" — present everywhere so the brand can't be cropped out. */
function Watermark() {
  const rows = Array.from({ length: 9 });
  const cols = Array.from({ length: 9 });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      style={{ opacity: 0.06 }}
    >
      <div
        className="absolute flex flex-col gap-12"
        style={{ top: '-50%', left: '-50%', width: '200%', height: '200%', transform: 'rotate(-24deg)' }}
      >
        {rows.map((_, i) => (
          <div key={i} className="flex justify-around whitespace-nowrap text-foreground font-extrabold text-base tracking-[0.3em]">
            {cols.map((__, j) => (
              <span key={j}>scouty.app</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Wraps a data visualization in an always-visible, brand-framed card (logo + title
 * header, logo + scouty.app footer with a magenta→amber accent, and a crop-proof
 * diagonal watermark) and offers a PNG/JPEG download of the whole frame. The export
 * follows the current app theme.
 */
export function ExportableCard({
  title,
  subtitle,
  fileName,
  headerRight,
  className,
  children,
}: ExportableCardProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    setBusy(true);
    const res = await exportNodeToImage(ref.current, { format, fileName });
    setBusy(false);
    if (res.ok) toast.success(t('data.download_success', 'Image téléchargée !'));
    else toast.error(t('data.download_error', "Échec du téléchargement de l'image."));
  };

  return (
    <Card ref={ref} className={cn('card-warm overflow-hidden', className)}>
      {/* Brand header */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-3 border-b border-border/50">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent p-px shrink-0 shadow-sm">
          <div className="w-full h-full rounded-[11px] bg-card flex items-center justify-center overflow-hidden">
            <img src={logo} alt="Scouty" className="w-7 h-7 object-contain" crossOrigin="anonymous" />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-tight truncate">{title}</p>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {headerRight}
        <div data-export-ignore="">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={busy}
                className="h-8 px-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border text-[11px] font-semibold hover:bg-muted transition-colors disabled:opacity-50"
                aria-label={t('data.download', 'Télécharger')}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{t('data.download', 'Télécharger')}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('png')}>
                <ImageIcon className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                {t('data.download_png', 'Image PNG')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('jpeg')}>
                <FileImage className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                {t('data.download_jpeg', 'Image JPEG')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Visualization + crop-proof watermark */}
      <div className="relative p-4">
        <div className="relative z-0">{children}</div>
        <Watermark />
      </div>

      {/* Brand footer */}
      <div>
        <div className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary" />
        <div className="flex items-center gap-1.5 px-4 py-2.5 bg-muted/30">
          <img src={logo} alt="" className="w-4 h-4 object-contain shrink-0" crossOrigin="anonymous" />
          <span className="text-xs font-bold tracking-tight">Scouty</span>
          <span className="text-[11px] text-muted-foreground">· scouty.app</span>
          <span className="ml-auto text-[9px] text-muted-foreground uppercase tracking-[0.15em]">
            {t('data.scouting_report', 'Rapport de scouting')}
          </span>
        </div>
      </div>
    </Card>
  );
}

export default ExportableCard;
