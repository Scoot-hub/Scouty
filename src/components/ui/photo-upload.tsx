import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Link as LinkIcon, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PhotoUploadProps {
  currentUrl?: string;
  onPhotoChange: (url: string) => void;
  label?: string;
  className?: string;
}

export function PhotoUpload({ currentUrl, onPhotoChange, label = 'Photo', className }: PhotoUploadProps) {
  const [mode, setMode] = useState<'upload' | 'url'>(currentUrl?.startsWith('http') ? 'url' : 'upload');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentUrl ?? '');
  const [urlInput, setUrlInput] = useState(currentUrl ?? '');
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync preview when currentUrl changes externally (e.g. player picked from list)
  useEffect(() => {
    setPreview(currentUrl ?? '');
    setUrlInput(currentUrl ?? '');
    if (currentUrl?.startsWith('http')) setMode('url');
  }, [currentUrl]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from('player-photos')
        .upload(fileName, file, { upsert: true });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('player-photos')
        .getPublicUrl(fileName);

      setPreview(publicUrl);
      onPhotoChange(publicUrl);
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Erreur lors de l\'upload');
      setPreview('');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      setPreview(urlInput.trim());
      onPhotoChange(urlInput.trim());
    }
  };

  const clearPhoto = () => {
    setPreview('');
    setUrlInput('');
    onPhotoChange('');
  };

  return (
    <div className={cn('space-y-3', className)}>
      <Label>{label}</Label>

      {/* Preview */}
      {preview && (
        <div className="relative inline-block">
          <img src={preview} alt="Preview" className="w-24 h-24 rounded-xl object-cover" />
          <button onClick={clearPhoto} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Show upload controls only when no photo */}
      {!preview && (
        <>
          <div className="flex gap-1 p-0.5 rounded-lg bg-muted w-fit">
            <button
              onClick={() => setMode('upload')}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', mode === 'upload' ? 'bg-card shadow-sm' : 'text-muted-foreground')}
            >
              <Upload className="w-3 h-3 inline mr-1" />Fichier
            </button>
            <button
              onClick={() => setMode('url')}
              className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors', mode === 'url' ? 'bg-card shadow-sm' : 'text-muted-foreground')}
            >
              <LinkIcon className="w-3 h-3 inline mr-1" />URL
            </button>
          </div>

          {mode === 'upload' ? (
            <div>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="rounded-xl">
                {uploading ? 'Upload en cours...' : 'Choisir un fichier'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://..."
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleUrlSubmit} className="rounded-xl">OK</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
