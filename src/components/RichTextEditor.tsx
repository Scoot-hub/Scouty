import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import { cn } from '@/lib/utils';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  Heading1, Heading2, Heading3, List, ListOrdered, AlignLeft, AlignCenter,
  AlignRight, Link as LinkIcon, Image as ImageIcon, Quote, Undo, Redo,
  Highlighter, Type, Palette,
} from 'lucide-react';

const FONTS = [
  { label: 'Par défaut', value: 'inherit' },
  { label: 'Inter', value: 'Inter, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Courier', value: '"Courier New", monospace' },
  { label: 'Arial', value: 'Arial, sans-serif' },
];

const COLORS = [
  '#000000', '#374151', '#6B7280', '#EF4444', '#F97316',
  '#EAB308', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899',
  '#ffffff',
];

const HIGHLIGHTS = [
  '#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa',
];

function ToolBtn({
  onClick, active, title, children, disabled,
}: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center w-7 h-7 rounded-md text-xs transition-colors shrink-0',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        disabled && 'opacity-30 pointer-events-none',
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border/60 mx-0.5 shrink-0" />;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export default function RichTextEditor({ value, onChange, placeholder = 'Rédigez votre article...', minHeight = '400px' }: RichTextEditorProps) {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);
  const hlRef = useRef<HTMLDivElement>(null);
  const fontRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline cursor-pointer' } }),
      Image.configure({ HTMLAttributes: { class: 'max-w-full rounded-xl my-4' } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontFamily,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: { class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3', style: `min-height: ${minHeight}` },
    },
  });

  // Sync external value changes (e.g. on load)
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, false);
    }
  }, [value, editor]);

  // Close pickers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) setShowColorPicker(false);
      if (hlRef.current && !hlRef.current.contains(e.target as Node)) setShowHighlightPicker(false);
      if (fontRef.current && !fontRef.current.contains(e.target as Node)) setShowFontPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addLink = () => {
    const url = window.prompt('URL du lien :', editor?.getAttributes('link').href ?? 'https://');
    if (url === null) return;
    if (url === '') { editor?.chain().focus().unsetLink().run(); return; }
    editor?.chain().focus().setLink({ href: url, target: '_blank' }).run();
  };

  const addImage = () => {
    const url = window.prompt('URL de l\'image :');
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  };

  if (!editor) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
        {/* Undo / Redo */}
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Annuler" disabled={!editor.can().undo()}>
          <Undo className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Rétablir" disabled={!editor.can().redo()}>
          <Redo className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />

        {/* Headings */}
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title="Titre 1">
          <Heading1 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title="Titre 2">
          <Heading2 className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })} title="Titre 3">
          <Heading3 className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />

        {/* Text style */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras">
          <Bold className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique">
          <Italic className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Souligné">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barré">
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive('code')} title="Code">
          <Code className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />

        {/* Color */}
        <div className="relative" ref={colorRef}>
          <ToolBtn onClick={() => { setShowColorPicker(v => !v); setShowHighlightPicker(false); setShowFontPicker(false); }} title="Couleur du texte">
            <Palette className="w-3.5 h-3.5" />
          </ToolBtn>
          {showColorPicker && (
            <div className="absolute top-8 left-0 z-50 bg-card border border-border rounded-xl shadow-xl p-2 flex flex-wrap gap-1.5 w-[140px]">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { editor.chain().focus().setColor(c).run(); setShowColorPicker(false); }}
                  className="w-6 h-6 rounded-md border border-border/60 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
              <button type="button" onClick={() => { editor.chain().focus().unsetColor().run(); setShowColorPicker(false); }} className="w-full text-[10px] text-muted-foreground hover:text-foreground mt-1">Réinitialiser</button>
            </div>
          )}
        </div>

        {/* Highlight */}
        <div className="relative" ref={hlRef}>
          <ToolBtn onClick={() => { setShowHighlightPicker(v => !v); setShowColorPicker(false); setShowFontPicker(false); }} active={editor.isActive('highlight')} title="Surlignage">
            <Highlighter className="w-3.5 h-3.5" />
          </ToolBtn>
          {showHighlightPicker && (
            <div className="absolute top-8 left-0 z-50 bg-card border border-border rounded-xl shadow-xl p-2 flex flex-wrap gap-1.5 w-[120px]">
              {HIGHLIGHTS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { editor.chain().focus().toggleHighlight({ color: c }).run(); setShowHighlightPicker(false); }}
                  className="w-7 h-7 rounded-md border border-border/60 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
              <button type="button" onClick={() => { editor.chain().focus().unsetHighlight().run(); setShowHighlightPicker(false); }} className="w-full text-[10px] text-muted-foreground hover:text-foreground mt-1">Retirer</button>
            </div>
          )}
        </div>

        {/* Font family */}
        <div className="relative" ref={fontRef}>
          <ToolBtn onClick={() => { setShowFontPicker(v => !v); setShowColorPicker(false); setShowHighlightPicker(false); }} title="Police">
            <Type className="w-3.5 h-3.5" />
          </ToolBtn>
          {showFontPicker && (
            <div className="absolute top-8 left-0 z-50 bg-card border border-border rounded-xl shadow-xl py-1 min-w-[150px]">
              {FONTS.map(f => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => {
                    if (f.value === 'inherit') editor.chain().focus().unsetFontFamily().run();
                    else editor.chain().focus().setFontFamily(f.value).run();
                    setShowFontPicker(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted transition-colors"
                  style={{ fontFamily: f.value }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <Divider />

        {/* Lists */}
        <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste à puces">
          <List className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numérotée">
          <ListOrdered className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Citation">
          <Quote className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />

        {/* Alignment */}
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({ textAlign: 'left' })} title="Aligner à gauche">
          <AlignLeft className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({ textAlign: 'center' })} title="Centrer">
          <AlignCenter className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({ textAlign: 'right' })} title="Aligner à droite">
          <AlignRight className="w-3.5 h-3.5" />
        </ToolBtn>
        <Divider />

        {/* Link & Image */}
        <ToolBtn onClick={addLink} active={editor.isActive('link')} title="Lien">
          <LinkIcon className="w-3.5 h-3.5" />
        </ToolBtn>
        <ToolBtn onClick={addImage} title="Insérer une image">
          <ImageIcon className="w-3.5 h-3.5" />
        </ToolBtn>
      </div>

      {/* Editor area */}
      <div className="relative min-h-[200px]" onClick={() => editor.commands.focus()}>
        {editor.isEmpty && (
          <p className="absolute top-3 left-4 text-muted-foreground/50 text-sm pointer-events-none select-none">{placeholder}</p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
