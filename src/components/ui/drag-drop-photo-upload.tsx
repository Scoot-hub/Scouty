import { useState, useRef, useCallback } from 'react';
import { Upload, X, ImageIcon, Loader2, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const ACCEPTED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB

interface DragDropPhotoUploadProps {
  currentUrl?: string;
  onPhotoChange: (url: string) => void;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  rounded?: 'rounded' | 'circle';
}

async function uploadToServer(file: File): Promise<string> {
  const form = new FormData();
  form.append('photo', file);
  const res = await fetch('/api/upload-image', {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.photo_url as string;
}

export function DragDropPhotoUpload({
  currentUrl,
  onPhotoChange,
  label,
  size = 'md',
  className,
  rounded = 'rounded',
}: DragDropPhotoUploadProps) {
  const [preview, setPreview] = useState(currentUrl ?? '');
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      toast.error('Format non supporté — utilisez JPG, PNG ou WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('La photo ne doit pas dépasser 4 Mo.');
      return;
    }

    // Instant local preview
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const url = await uploadToServer(file);
      setPreview(url);
      onPhotoChange(url);
      toast.success('Photo enregistrée');
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de l\'upload');
      setPreview(currentUrl ?? '');
    } finally {
      setUploading(false);
    }
  }, [currentUrl, onPhotoChange]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };
  const clear = () => { setPreview(''); onPhotoChange(''); };

  const previewSize = size === 'lg' ? 'w-32 h-32' : size === 'sm' ? 'w-16 h-16' : 'w-24 h-24';
  const roundedCls = rounded === 'circle' ? 'rounded-full' : 'rounded-xl';

  return (
    <div className={cn('space-y-3', className)}>
      {label && <p className="text-sm font-medium">{label}</p>}

      {preview ? (
        /* ── Preview state ── */
        <div className="flex items-center gap-4">
          <div className="relative shrink-0 group">
            <img
              src={preview}
              alt="Photo de profil"
              className={cn(previewSize, roundedCls, 'object-cover border-2 border-border shadow-sm')}
            />
            {/* Hover overlay — change photo */}
            <button
              onClick={() => fileRef.current?.click()}
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-1',
                roundedCls,
                'bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer',
              )}
            >
              <Camera className="w-5 h-5 text-white" />
              <span className="text-[10px] text-white font-medium">Changer</span>
            </button>
            {/* Remove button */}
            <button
              onClick={clear}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-destructive text-white flex items-center justify-center shadow-sm hover:scale-110 transition-transform z-10"
              title="Supprimer la photo"
            >
              <X className="w-3 h-3" />
            </button>
            {uploading && (
              <div className={cn('absolute inset-0 flex items-center justify-center bg-background/80', roundedCls)}>
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <button
              onClick={() => fileRef.current?.click()}
              className="text-sm text-primary hover:text-primary/80 font-medium underline underline-offset-2 hover:no-underline transition-colors"
            >
              Changer la photo
            </button>
            <p className="text-xs text-muted-foreground mt-0.5">JPG, PNG ou WebP · Max 4 Mo</p>
          </div>
        </div>
      ) : (
        /* ── Drop zone state ── */
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !uploading && fileRef.current?.click()}
          className={cn(
            'relative flex flex-col items-center justify-center gap-3 cursor-pointer select-none',
            'border-2 border-dashed rounded-xl transition-all duration-200',
            'py-10 px-6 text-center',
            dragging
              ? 'border-primary bg-primary/8 scale-[1.01] shadow-lg shadow-primary/10'
              : 'border-border hover:border-primary/50 hover:bg-muted/40',
            uploading && 'pointer-events-none',
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-sm font-medium text-muted-foreground">Upload en cours…</p>
            </>
          ) : dragging ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <p className="text-sm font-semibold text-primary">Déposez la photo ici</p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <ImageIcon className="w-7 h-7 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  <span className="text-primary">Cliquez pour parcourir</span>
                  {' '}ou glissez-déposez
                </p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG ou WebP · Maximum 4 Mo</p>
              </div>
            </>
          )}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  );
}
