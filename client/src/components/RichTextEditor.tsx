import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Heading3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useLanguage } from '@/contexts/LanguageContext';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

const SAFE_LINK_PROTOCOLS = /^(https?:|mailto:|tel:)/i;
const ACTIVE_BUTTON_CLASS = 'bg-neutral-200 dark:bg-neutral-800';

function isSafeLink(url: string) {
  return SAFE_LINK_PROTOCOLS.test(url.trim());
}

export default function RichTextEditor({ content, onChange, placeholder }: RichTextEditorProps) {
  const { toast } = useToast();
  const { language } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const toolbarLabels = {
    bold: language === 'no' ? 'Fet' : 'Bold',
    italic: language === 'no' ? 'Kursiv' : 'Italic',
    underline: language === 'no' ? 'Understrek' : 'Underline',
    strike: language === 'no' ? 'Gjennomstrek' : 'Strikethrough',
    heading1: language === 'no' ? 'Overskrift 1' : 'Heading 1',
    heading2: language === 'no' ? 'Overskrift 2' : 'Heading 2',
    heading3: language === 'no' ? 'Overskrift 3' : 'Heading 3',
    bulletList: language === 'no' ? 'Punktliste' : 'Bullet list',
    orderedList: language === 'no' ? 'Nummerert liste' : 'Numbered list',
    alignLeft: language === 'no' ? 'Venstrejuster' : 'Align left',
    alignCenter: language === 'no' ? 'Midtstill' : 'Align center',
    alignRight: language === 'no' ? 'Høyrejuster' : 'Align right',
    quote: language === 'no' ? 'Sitat' : 'Quote',
    codeBlock: language === 'no' ? 'Kodeblokk' : 'Code block',
    link: language === 'no' ? 'Lenke' : 'Link',
    image: language === 'no' ? 'Bilde' : 'Image',
    undo: language === 'no' ? 'Angre' : 'Undo',
    redo: language === 'no' ? 'Gjør om' : 'Redo',
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
        protocols: ['http', 'https', 'mailto', 'tel'],
        validate: href => isSafeLink(href),
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[150px] max-h-[200px] sm:max-h-none sm:min-h-[250px] overflow-y-auto p-4 dark:text-neutral-200',
      },
    },
  });

  const setLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes('link').href;
    setLinkUrl(previousUrl || "");
    setLinkDialogOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;

    const trimmedUrl = linkUrl.trim();
    if (trimmedUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setLinkDialogOpen(false);
      return;
    }

    if (!isSafeLink(trimmedUrl)) {
      toast({
        variant: 'destructive',
        title: 'Ugyldig lenke',
        description: language === 'no'
          ? 'Lenker må starte med http, https, mailto eller tel.'
          : 'Links must start with http, https, mailto or tel.',
      });
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmedUrl }).run();
    setLinkDialogOpen(false);
  }, [editor, language, linkUrl, toast]);

  const handleImageUpload = async (file: File) => {
    try {
      const title = file.name.replace(/\.[^/.]+$/, '') || file.name;

      // 1. Ask the server for a Cloudinary signature scoped to our cloud.
      const signRes = await apiRequest('POST', '/api/upload?action=sign', {
        action: 'sign',
        filename: file.name,
        mimeType: file.type,
        size: file.size,
      });
      const sig = await signRes.json();

      // 2. Upload directly to Cloudinary using that signature.
      // Only forward parameters that were part of the signed canonical;
      // sending an extra one (e.g. max_file_size) triggers "Invalid Signature".
      const cloudForm = new globalThis.FormData();
      cloudForm.append('file', file);
      cloudForm.append('api_key', sig.apiKey);
      cloudForm.append('timestamp', String(sig.timestamp));
      cloudForm.append('signature', sig.signature);
      cloudForm.append('folder', sig.folder);
      cloudForm.append('public_id', sig.publicId);
      cloudForm.append('allowed_formats', sig.allowedFormats);

      const cloudRes = await fetch(sig.uploadUrl, { method: 'POST', body: cloudForm });
      if (!cloudRes.ok) {
        // Cloudinary returns JSON with { error: { message } } on failure.
        let cloudErrorMessage = `Cloudinary returned ${cloudRes.status}`;
        try {
          const errJson = await cloudRes.json();
          cloudErrorMessage = errJson?.error?.message || cloudErrorMessage;
        } catch {
          // body wasn't JSON
        }
        throw new Error(cloudErrorMessage);
      }
      const uploadResult = await cloudRes.json();

      // 3. Persist the document metadata server-side (verifies cloud_name).
      const metaRes = await apiRequest('POST', '/api/upload', {
        title,
        category: 'editor-image',
        description: '',
        uploadedBy: 'Rich text editor',
        filename: file.name,
        fileUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        fileSize: uploadResult.bytes || file.size,
        mimeType: file.type,
      });
      const data = await metaRes.json();
      return data.fileUrl || data.document?.cloudinary_url || null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Image upload failed:', error);
      toast({
        variant: 'destructive',
        title: language === 'no' ? 'Opplasting feilet' : 'Upload failed',
        description: message || (language === 'no' ? 'Kunne ikke laste opp bilde' : 'Could not upload image'),
      });
      return null;
    }
  };

  const addImage = useCallback(async () => {
    if (!editor) return;

    const input = fileInputRef.current;
    if (!input) return;

    input.click();
  }, [editor]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    // Check if file is an image
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Invalid file',
        description: 'Please select an image file',
      });
      return;
    }

    const url = await handleImageUpload(file);
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }

    // Reset input
    e.target.value = '';
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="border border-neutral-300 dark:border-neutral-800 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex gap-1 p-2 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-x-auto sm:flex-wrap" style={{ scrollbarWidth: 'none' }}>
        {/* Text formatting */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          aria-label={toolbarLabels.bold}
          aria-pressed={editor.isActive('bold')}
          className={editor.isActive('bold') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          aria-label={toolbarLabels.italic}
          aria-pressed={editor.isActive('italic')}
          className={editor.isActive('italic') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          aria-label={toolbarLabels.underline}
          aria-pressed={editor.isActive('underline')}
          className={editor.isActive('underline') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          aria-label={toolbarLabels.strike}
          aria-pressed={editor.isActive('strike')}
          className={editor.isActive('strike') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-neutral-300 dark:bg-neutral-700 mx-1" />

        {/* Headings */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          aria-label={toolbarLabels.heading1}
          aria-pressed={editor.isActive('heading', { level: 1 })}
          className={editor.isActive('heading', { level: 1 }) ? ACTIVE_BUTTON_CLASS : ''}
        >
          <Heading1 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label={toolbarLabels.heading2}
          aria-pressed={editor.isActive('heading', { level: 2 })}
          className={editor.isActive('heading', { level: 2 }) ? ACTIVE_BUTTON_CLASS : ''}
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          aria-label={toolbarLabels.heading3}
          aria-pressed={editor.isActive('heading', { level: 3 })}
          className={editor.isActive('heading', { level: 3 }) ? ACTIVE_BUTTON_CLASS : ''}
        >
          <Heading3 className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-neutral-300 dark:bg-neutral-700 mx-1" />

        {/* Lists */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          aria-label={toolbarLabels.bulletList}
          aria-pressed={editor.isActive('bulletList')}
          className={editor.isActive('bulletList') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label={toolbarLabels.orderedList}
          aria-pressed={editor.isActive('orderedList')}
          className={editor.isActive('orderedList') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-neutral-300 dark:bg-neutral-700 mx-1" />

        {/* Alignment */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          aria-label={toolbarLabels.alignLeft}
          aria-pressed={editor.isActive({ textAlign: 'left' })}
          className={editor.isActive({ textAlign: 'left' }) ? ACTIVE_BUTTON_CLASS : ''}
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          aria-label={toolbarLabels.alignCenter}
          aria-pressed={editor.isActive({ textAlign: 'center' })}
          className={editor.isActive({ textAlign: 'center' }) ? ACTIVE_BUTTON_CLASS : ''}
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          aria-label={toolbarLabels.alignRight}
          aria-pressed={editor.isActive({ textAlign: 'right' })}
          className={editor.isActive({ textAlign: 'right' }) ? ACTIVE_BUTTON_CLASS : ''}
        >
          <AlignRight className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-neutral-300 dark:bg-neutral-700 mx-1" />

        {/* Quote and code */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label={toolbarLabels.quote}
          aria-pressed={editor.isActive('blockquote')}
          className={editor.isActive('blockquote') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <Quote className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          aria-label={toolbarLabels.codeBlock}
          aria-pressed={editor.isActive('codeBlock')}
          className={editor.isActive('codeBlock') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <Code className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-neutral-300 dark:bg-neutral-700 mx-1" />

        {/* Link and Image */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={setLink}
          aria-label={toolbarLabels.link}
          aria-pressed={editor.isActive('link')}
          className={editor.isActive('link') ? ACTIVE_BUTTON_CLASS : ''}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addImage}
          aria-label={toolbarLabels.image}
        >
          <ImageIcon className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-neutral-300 dark:bg-neutral-700 mx-1" />

        {/* Undo/Redo */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          aria-label={toolbarLabels.undo}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          aria-label={toolbarLabels.redo}
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === 'no' ? 'Legg til lenke' : 'Add link'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rich-text-link-url">
              {language === 'no' ? 'URL' : 'URL'}
            </Label>
            <Input
              id="rich-text-link-url"
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://example.com"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyLink();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setLinkDialogOpen(false)}>
              {language === 'no' ? 'Avbryt' : 'Cancel'}
            </Button>
            <Button type="button" onClick={applyLink}>
              {linkUrl.trim()
                ? (language === 'no' ? 'Lagre lenke' : 'Save link')
                : (language === 'no' ? 'Fjern lenke' : 'Remove link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
