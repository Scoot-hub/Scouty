import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ImportedSheet {
  name: string;
  headers: string[];
  rows: Record<string, unknown>[];
}

export default function DataImport() {
  const { t } = useTranslation();
  const [sheets, setSheets] = useState<ImportedSheet[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const processFile = (file: File) => {
    setError('');
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError(t('data_import.error_format'));
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const parsed: ImportedSheet[] = workbook.SheetNames.map((name) => {
          const ws = workbook.Sheets[name];
          const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          const headers = jsonRows.length > 0 ? Object.keys(jsonRows[0]) : [];
          return { name, headers, rows: jsonRows };
        });
        setSheets(parsed);
        setActiveSheet(0);
      } catch {
        setError(t('data_import.error_parse'));
      }
    };
    reader.readAsBinaryString(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = '';
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, []);

  const reset = () => {
    setSheets([]);
    setFileName('');
    setError('');
  };

  const current = sheets[activeSheet];

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t('data_import.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('data_import.subtitle')}</p>
        </div>
      </div>

      {sheets.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <label
              htmlFor="excel-upload"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-xl p-12 cursor-pointer transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50 hover:bg-muted/30'
              )}
            >
              <Upload className="w-10 h-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">{t('data_import.drop_label')}</p>
                <p className="text-sm text-muted-foreground mt-1">{t('data_import.drop_hint')}</p>
              </div>
              <Button type="button" variant="outline" size="sm" asChild>
                <span>{t('data_import.browse')}</span>
              </Button>
              <input id="excel-upload" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
            </label>
            {error && (
              <div className="flex items-center gap-2 mt-4 text-destructive text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* File info + reset */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="font-medium">{fileName}</span>
              <Badge variant="secondary">{sheets.length} {t('data_import.sheet', { count: sheets.length })}</Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <X className="w-4 h-4 mr-1" />
              {t('data_import.change_file')}
            </Button>
          </div>

          {/* Sheet tabs */}
          {sheets.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {sheets.map((s, i) => (
                <button
                  key={s.name}
                  onClick={() => setActiveSheet(i)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                    i === activeSheet
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* Preview table */}
          {current && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('data_import.preview_title')}</CardTitle>
                <CardDescription>
                  {current.rows.length} {t('data_import.rows')} · {current.headers.length} {t('data_import.columns')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto max-h-[480px] rounded-lg border">
                  <table className="text-xs w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        {current.headers.map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-medium whitespace-nowrap border-b">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {current.rows.slice(0, 100).map((row, ri) => (
                        <tr key={ri} className="border-b last:border-0 hover:bg-muted/30">
                          {current.headers.map((h) => (
                            <td key={h} className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                              {String(row[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {current.rows.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {t('data_import.truncated', { count: current.rows.length - 100 })}
                    </p>
                  )}
                </div>

                {/* Mapping placeholder */}
                <div className="mt-6 p-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 text-center text-sm text-muted-foreground">
                  {t('data_import.mapping_placeholder')}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
