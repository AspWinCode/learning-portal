import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontFamily } from '@tiptap/extension-font-family';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  GlobalStyles,
  IconButton,
  InputLabel,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Popover,
  Select,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import HighlightIcon from '@mui/icons-material/Highlight';
import FormatColorTextIcon from '@mui/icons-material/FormatColorText';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustifyIcon from '@mui/icons-material/FormatAlignJustify';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import FormatIndentIncreaseIcon from '@mui/icons-material/FormatIndentIncrease';
import FormatIndentDecreaseIcon from '@mui/icons-material/FormatIndentDecrease';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import CodeIcon from '@mui/icons-material/Code';
import IntegrationInstructionsIcon from '@mui/icons-material/IntegrationInstructions';
import LinkIcon from '@mui/icons-material/Link';
import ImageIcon from '@mui/icons-material/Image';
import TableChartIcon from '@mui/icons-material/TableChart';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import LooksOneIcon from '@mui/icons-material/LooksOne';
import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import Looks3Icon from '@mui/icons-material/Looks3';

// ─── Custom FontSize extension (no official v2 package) ──────────────────────
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: { fontSize: { default: null, parseHTML: (el) => el.style.fontSize || null, renderHTML: (attrs) => attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {} } } }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: any) => chain().setMark('textStyle', { fontSize: size }).run(),
    } as any;
  },
});

// ─── Slash command items ───────────────────────────────────────────────────────
interface SlashItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
  keywords: string[];
}

const SLASH_ITEMS: SlashItem[] = [
  { title: 'Текст', description: 'Обычный абзац', icon: <TextFieldsIcon fontSize="small" />, command: (e) => e.chain().focus().setParagraph().run(), keywords: ['текст', 'text', 'p'] },
  { title: 'Заголовок 1', description: 'Крупный заголовок', icon: <LooksOneIcon fontSize="small" />, command: (e) => e.chain().focus().setHeading({ level: 1 }).run(), keywords: ['заголовок', 'heading', 'h1'] },
  { title: 'Заголовок 2', description: 'Средний заголовок', icon: <LooksTwoIcon fontSize="small" />, command: (e) => e.chain().focus().setHeading({ level: 2 }).run(), keywords: ['заголовок', 'heading', 'h2'] },
  { title: 'Заголовок 3', description: 'Малый заголовок', icon: <Looks3Icon fontSize="small" />, command: (e) => e.chain().focus().setHeading({ level: 3 }).run(), keywords: ['заголовок', 'heading', 'h3'] },
  { title: 'Список', description: 'Маркированный список', icon: <FormatListBulletedIcon fontSize="small" />, command: (e) => e.chain().focus().toggleBulletList().run(), keywords: ['список', 'bullet', 'ul'] },
  { title: 'Нумерованный список', description: 'Список с номерами', icon: <FormatListNumberedIcon fontSize="small" />, command: (e) => e.chain().focus().toggleOrderedList().run(), keywords: ['нумерованный', 'numbered', 'ol'] },
  { title: 'Задача', description: 'Список с чекбоксами', icon: <CheckBoxOutlineBlankIcon fontSize="small" />, command: (e) => e.chain().focus().toggleTaskList().run(), keywords: ['задача', 'todo', 'task'] },
  { title: 'Цитата', description: 'Блок цитаты', icon: <FormatQuoteIcon fontSize="small" />, command: (e) => e.chain().focus().toggleBlockquote().run(), keywords: ['цитата', 'quote'] },
  { title: 'Код', description: 'Блок кода', icon: <CodeIcon fontSize="small" />, command: (e) => e.chain().focus().toggleCodeBlock().run(), keywords: ['код', 'code'] },
  { title: 'Таблица', description: 'Вставить таблицу', icon: <TableChartIcon fontSize="small" />, command: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), keywords: ['таблица', 'table'] },
];

// ─── Colors ───────────────────────────────────────────────────────────────────
const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#cccccc', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff',
  '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3',
  '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
];

// ─── Editor styles ─────────────────────────────────────────────────────────────
const EDITOR_STYLES = {
  '.notes-editor .ProseMirror': { outline: 'none', padding: '4px 2px', fontSize: '1rem', lineHeight: 1.75, minHeight: 300 },
  '.notes-editor .ProseMirror p.is-editor-empty:first-child::before': { content: 'attr(data-placeholder)', float: 'left', color: '#aaa', pointerEvents: 'none', height: 0 },
  '.notes-editor .ProseMirror h1': { fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.3, margin: '1rem 0 0.5rem' },
  '.notes-editor .ProseMirror h2': { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3, margin: '0.875rem 0 0.4rem' },
  '.notes-editor .ProseMirror h3': { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3, margin: '0.75rem 0 0.3rem' },
  '.notes-editor .ProseMirror ul, .notes-editor .ProseMirror ol': { paddingLeft: '1.5rem', margin: '0.25rem 0' },
  '.notes-editor .ProseMirror li': { marginBottom: '0.2rem' },
  '.notes-editor .ProseMirror blockquote': { borderLeft: '3px solid #9e9e9e', margin: '0.5rem 0', paddingLeft: '1rem', color: '#757575', fontStyle: 'italic' },
  '.notes-editor .ProseMirror pre': { background: '#f5f5f5', borderRadius: '6px', padding: '12px 16px', fontFamily: 'monospace', fontSize: '0.875rem', overflowX: 'auto', margin: '0.5rem 0' },
  '.notes-editor .ProseMirror code': { background: '#f0f0f0', borderRadius: '3px', padding: '1px 5px', fontFamily: 'monospace', fontSize: '0.875em' },
  '.notes-editor .ProseMirror pre code': { background: 'none', padding: 0 },
  '.notes-editor .ProseMirror mark': { background: '#fff176', borderRadius: '2px', padding: '0 2px' },
  '.notes-editor .ProseMirror a': { color: '#7c3aed', textDecoration: 'underline', cursor: 'pointer' },
  '.notes-editor .ProseMirror hr': { border: 'none', borderTop: '2px solid #e0e0e0', margin: '1rem 0' },
  '.notes-editor .ProseMirror img': { maxWidth: '100%', height: 'auto', borderRadius: '4px', cursor: 'pointer' },
  '.notes-editor .ProseMirror table': { borderCollapse: 'collapse', width: '100%', margin: '0.5rem 0' },
  '.notes-editor .ProseMirror td, .notes-editor .ProseMirror th': { border: '1px solid #e0e0e0', padding: '6px 10px', minWidth: 60 },
  '.notes-editor .ProseMirror th': { background: '#f5f5f5', fontWeight: 600 },
  '.notes-editor .ProseMirror ul[data-type="taskList"]': { listStyle: 'none', paddingLeft: '0.25rem' },
  '.notes-editor .ProseMirror ul[data-type="taskList"] > li': { display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.25rem' },
  '.notes-editor .ProseMirror ul[data-type="taskList"] > li > label': { paddingTop: '3px', flexShrink: 0 },
  '.notes-editor .ProseMirror ul[data-type="taskList"] > li > label input[type="checkbox"]': { width: 16, height: 16, cursor: 'pointer', accentColor: '#7c3aed' },
  '.notes-editor .ProseMirror ul[data-type="taskList"] > li[data-checked="true"] > div': { opacity: 0.55, textDecoration: 'line-through' },
} as const;

interface SlashMenuState { top: number; left: number; query: string; deleteFrom: number; deleteTo: number; }

export interface NotesEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onUploadImage?: (file: File) => Promise<string>;
}

// Small helper: toolbar icon button
const TB = ({ title, active, onMouseDown, children }: { title: string; active?: boolean; onMouseDown: (e: React.MouseEvent) => void; children: React.ReactNode }) => (
  <Tooltip title={title}>
    <IconButton size="small" onMouseDown={onMouseDown} color={active ? 'primary' : 'default'} sx={{ width: 28, height: 28 }}>
      {children}
    </IconButton>
  </Tooltip>
);

const NotesEditor: React.FC<NotesEditorProps> = ({
  value,
  onChange,
  placeholder = 'Начните писать или введите / для вставки блока…',
  onUploadImage,
}) => {
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const isInternalChange = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Color picker
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);

  // Link dialog
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  // Image dialog (URL)
  const [imageOpen, setImageOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  // Table dialog
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  const filteredItems = useMemo(() => {
    if (!slashMenu) return [];
    const q = slashMenu.query.toLowerCase();
    if (!q) return SLASH_ITEMS;
    return SLASH_ITEMS.filter((item) => item.title.toLowerCase().includes(q) || item.keywords.some((k) => k.includes(q)));
  }, [slashMenu]);

  const stateRef = useRef({ menu: slashMenu, items: filteredItems, idx: slashIdx });
  stateRef.current = { menu: slashMenu, items: filteredItems, idx: slashIdx };

  const executeItem = useCallback((item: SlashItem, ed: Editor, menu: SlashMenuState) => {
    ed.chain().focus().deleteRange({ from: menu.deleteFrom, to: menu.deleteTo }).run();
    item.command(ed);
    setSlashMenu(null);
  }, []);

  const executeItemRef = useRef(executeItem);
  executeItemRef.current = executeItem;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
      Highlight,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Image.configure({ inline: false, allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    onUpdate: ({ editor: ed }) => {
      isInternalChange.current = true;
      onChange(ed.getHTML());
      const { from } = ed.state.selection;
      const blockStart = ed.state.selection.$from.start();
      const textBefore = ed.state.doc.textBetween(blockStart, from);
      if (textBefore.startsWith('/')) {
        const coords = ed.view.coordsAtPos(from);
        setSlashMenu({ top: coords.bottom + 4, left: coords.left, query: textBefore.slice(1), deleteFrom: blockStart, deleteTo: from });
        setSlashIdx(0);
      } else {
        setSlashMenu(null);
      }
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        const { menu, items, idx } = stateRef.current;
        if (!menu || items.length === 0) return false;
        if (event.key === 'ArrowDown') { event.preventDefault(); setSlashIdx((i) => Math.min(i + 1, items.length - 1)); return true; }
        if (event.key === 'ArrowUp') { event.preventDefault(); setSlashIdx((i) => Math.max(i - 1, 0)); return true; }
        if (event.key === 'Enter') {
          const item = items[idx];
          const ed = editorRef.current;
          if (item && ed) executeItemRef.current(item, ed, menu);
          event.preventDefault();
          return true;
        }
        if (event.key === 'Escape') { setSlashMenu(null); return true; }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (files.length === 0 || !onUploadImage) return false;
        event.preventDefault();
        // Последовательно, не параллельно — иначе несколько картинок из одной
        // вставки будут спорить за одно и то же место курсора (chain() всегда
        // читает актуальное состояние редактора на момент вызова).
        files.reduce((chain, file) => chain.then(() =>
          onUploadImage(file).then((url) => { editorRef.current?.chain().focus().setImage({ src: url }).run(); })
        ), Promise.resolve()).catch(() => {});
        return true;
      },
      handleDrop: (_view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (files.length === 0 || !onUploadImage) return false;
        event.preventDefault();
        files.reduce((chain, file) => chain.then(() =>
          onUploadImage(file).then((url) => { editorRef.current?.chain().focus().setImage({ src: url }).run(); })
        ), Promise.resolve()).catch(() => {});
        return true;
      },
    },
  });

  useEffect(() => { editorRef.current = editor; }, [editor]);

  useEffect(() => {
    if (!editor) return;
    if (isInternalChange.current) { isInternalChange.current = false; return; }
    if (editor.getHTML() !== (value || '')) editor.commands.setContent(value || '');
  }, [value, editor]);

  const handleInsertLink = () => {
    if (!editor) return;
    const existing = editor.getAttributes('link').href;
    setLinkUrl(existing || 'https://');
    setLinkOpen(true);
  };

  const handleLinkConfirm = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (url && url !== 'https://') {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setLinkOpen(false);
  };

  const handleInsertImage = () => {
    if (!editor || !imageUrl.trim()) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    setImageUrl('');
    setImageOpen(false);
  };

  const handleImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onUploadImage) return;
    try {
      const url = await onUploadImage(file);
      editor?.chain().focus().setImage({ src: url }).run();
    } catch (_) {}
  };

  const handleInsertTable = () => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true }).run();
    setTableOpen(false);
  };

  if (!editor) return null;

  const btn = (title: string, active: boolean, fn: () => void, icon: React.ReactNode) => (
    <TB key={title} title={title} active={active} onMouseDown={(e) => { e.preventDefault(); fn(); }}>
      {icon}
    </TB>
  );

  return (
    <>
      <GlobalStyles styles={EDITOR_STYLES} />

      {/* ── Bubble menu on selection ── */}
      <BubbleMenu editor={editor} tippyOptions={{ duration: 100 }} shouldShow={(props: any) => { const { from, to } = props.state.selection; return from !== to; }}>
        <Paper elevation={4} sx={{ display: 'flex', alignItems: 'center', px: 0.5, py: 0.25, borderRadius: 1.5, gap: 0.25 }}>
          {btn('Жирный', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <FormatBoldIcon fontSize="small" />)}
          {btn('Курсив', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <FormatItalicIcon fontSize="small" />)}
          {btn('Подчёркнутый', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <FormatUnderlinedIcon fontSize="small" />)}
          {btn('Маркер', editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight().run(), <HighlightIcon fontSize="small" />)}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          {btn('Код', editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), <CodeIcon fontSize="small" />)}
          {btn('Цитата', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), <FormatQuoteIcon fontSize="small" />)}
          {btn('Ссылка', editor.isActive('link'), handleInsertLink, <LinkIcon fontSize="small" />)}
        </Paper>
      </BubbleMenu>

      {/* ── Slash command popup ── */}
      {slashMenu && filteredItems.length > 0 && (
        <Paper elevation={6} sx={{ position: 'fixed', top: slashMenu.top, left: slashMenu.left, zIndex: 9999, minWidth: 240, maxHeight: 320, overflow: 'auto', borderRadius: 2 }}>
          <List dense sx={{ py: 0.5 }}>
            {filteredItems.map((item, index) => (
              <ListItemButton key={item.title} selected={index === slashIdx} onMouseDown={(e) => { e.preventDefault(); executeItem(item, editor, slashMenu); }} sx={{ borderRadius: 1, mx: 0.5, py: 0.75 }}>
                <ListItemIcon sx={{ minWidth: 36, color: 'primary.main' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.title} secondary={item.description} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }} secondaryTypographyProps={{ fontSize: '0.75rem' }} />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {/* ── Fixed toolbar ── */}
      <Paper variant="outlined" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.25, px: 0.75, py: 0.5, mb: 1, borderRadius: 1.5 }}>

        {/* Text style */}
        <Stack direction="row" alignItems="center">
          {btn('Жирный · Ctrl+B', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <FormatBoldIcon fontSize="small" />)}
          {btn('Курсив · Ctrl+I', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <FormatItalicIcon fontSize="small" />)}
          {btn('Подчёркнутый · Ctrl+U', editor.isActive('underline'), () => editor.chain().focus().toggleUnderline().run(), <FormatUnderlinedIcon fontSize="small" />)}
          {btn('Зачёркнутый', editor.isActive('strike'), () => editor.chain().focus().toggleStrike().run(), <FormatStrikethroughIcon fontSize="small" />)}
          {btn('Маркер', editor.isActive('highlight'), () => editor.chain().focus().toggleHighlight().run(), <HighlightIcon fontSize="small" />)}
          <Tooltip title="Цвет текста">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); setColorAnchor(e.currentTarget); }} sx={{ width: 28, height: 28 }}>
              <FormatColorTextIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Alignment */}
        <Stack direction="row" alignItems="center">
          {btn('По левому краю', editor.isActive({ textAlign: 'left' }), () => editor.chain().focus().setTextAlign('left').run(), <FormatAlignLeftIcon fontSize="small" />)}
          {btn('По центру', editor.isActive({ textAlign: 'center' }), () => editor.chain().focus().setTextAlign('center').run(), <FormatAlignCenterIcon fontSize="small" />)}
          {btn('По правому краю', editor.isActive({ textAlign: 'right' }), () => editor.chain().focus().setTextAlign('right').run(), <FormatAlignRightIcon fontSize="small" />)}
          {btn('По ширине', editor.isActive({ textAlign: 'justify' }), () => editor.chain().focus().setTextAlign('justify').run(), <FormatAlignJustifyIcon fontSize="small" />)}
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Headings */}
        <Stack direction="row" alignItems="center">
          {btn('Заголовок 1', editor.isActive('heading', { level: 1 }), () => editor.chain().focus().toggleHeading({ level: 1 }).run(), <LooksOneIcon fontSize="small" />)}
          {btn('Заголовок 2', editor.isActive('heading', { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <LooksTwoIcon fontSize="small" />)}
          {btn('Заголовок 3', editor.isActive('heading', { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Looks3Icon fontSize="small" />)}
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Lists */}
        <Stack direction="row" alignItems="center">
          {btn('Маркированный список', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <FormatListBulletedIcon fontSize="small" />)}
          {btn('Нумерованный список', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <FormatListNumberedIcon fontSize="small" />)}
          {btn('Список задач', editor.isActive('taskList'), () => editor.chain().focus().toggleTaskList().run(), <CheckBoxOutlineBlankIcon fontSize="small" />)}
          {btn('Уменьшить отступ', false, () => editor.chain().focus().liftListItem('listItem').run(), <FormatIndentDecreaseIcon fontSize="small" />)}
          {btn('Увеличить отступ', false, () => editor.chain().focus().sinkListItem('listItem').run(), <FormatIndentIncreaseIcon fontSize="small" />)}
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Blocks */}
        <Stack direction="row" alignItems="center">
          {btn('Цитата', editor.isActive('blockquote'), () => editor.chain().focus().toggleBlockquote().run(), <FormatQuoteIcon fontSize="small" />)}
          {btn('Инлайн-код', editor.isActive('code'), () => editor.chain().focus().toggleCode().run(), <CodeIcon fontSize="small" />)}
          {btn('Блок кода', editor.isActive('codeBlock'), () => editor.chain().focus().toggleCodeBlock().run(), <IntegrationInstructionsIcon fontSize="small" />)}
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Insert */}
        <Stack direction="row" alignItems="center">
          {btn('Вставить ссылку', editor.isActive('link'), handleInsertLink, <LinkIcon fontSize="small" />)}
          {btn('Вставить изображение', false, () => setImageOpen(true), <ImageIcon fontSize="small" />)}
          {btn('Вставить таблицу', false, () => setTableOpen(true), <TableChartIcon fontSize="small" />)}
          {onUploadImage && (
            <>
              <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageFile} />
              {btn('Загрузить изображение', false, () => imageInputRef.current?.click(), <ImageIcon fontSize="small" />)}
            </>
          )}
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Font family */}
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>Шрифт</InputLabel>
          <Select
            label="Шрифт"
            value=""
            onChange={(e) => { const v = e.target.value as string; if (v) editor.chain().focus().setFontFamily(v).run(); }}
            onMouseDown={(e) => e.preventDefault()}
            sx={{ fontSize: '0.8rem', height: 28 }}
          >
            <MenuItem value="inherit">По умолчанию</MenuItem>
            <MenuItem value="Arial">Arial</MenuItem>
            <MenuItem value="Georgia">Georgia</MenuItem>
            <MenuItem value="'Courier New', monospace">Моноширинный</MenuItem>
            <MenuItem value="'Times New Roman', serif">Times New Roman</MenuItem>
          </Select>
        </FormControl>

        {/* Font size */}
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel sx={{ fontSize: '0.75rem' }}>Размер</InputLabel>
          <Select
            label="Размер"
            value=""
            onChange={(e) => { const v = e.target.value as string; if (v) (editor.chain().focus() as any).setFontSize(v).run(); /* custom FontSize ext */ }}
            onMouseDown={(e) => e.preventDefault()}
            sx={{ fontSize: '0.8rem', height: 28 }}
          >
            <MenuItem value="0.75rem">Маленький</MenuItem>
            <MenuItem value="1rem">Обычный</MenuItem>
            <MenuItem value="1.125rem">Средний</MenuItem>
            <MenuItem value="1.25rem">Большой</MenuItem>
            <MenuItem value="1.5rem">Очень большой</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      {/* ── Color picker popover ── */}
      <Popover open={Boolean(colorAnchor)} anchorEl={colorAnchor} onClose={() => setColorAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 200 }}>
          {TEXT_COLORS.map((c) => (
            <Box
              key={c}
              onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().setColor(c).run(); setColorAnchor(null); }}
              sx={{ width: 20, height: 20, bgcolor: c, border: '1px solid', borderColor: 'divider', borderRadius: 0.5, cursor: 'pointer', '&:hover': { transform: 'scale(1.2)' } }}
            />
          ))}
          <Box onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().unsetColor().run(); setColorAnchor(null); }} sx={{ width: 20, height: 20, border: '1px solid', borderColor: 'divider', borderRadius: 0.5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'text.secondary' }}>✕</Box>
        </Box>
      </Popover>

      {/* ── Link dialog ── */}
      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Вставить ссылку</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLinkConfirm()} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          {editor.isActive('link') && <Button color="error" onClick={() => { editor.chain().focus().unsetLink().run(); setLinkOpen(false); }}>Удалить ссылку</Button>}
          <Button onClick={() => setLinkOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleLinkConfirm}>Вставить</Button>
        </DialogActions>
      </Dialog>

      {/* ── Image URL dialog ── */}
      <Dialog open={imageOpen} onClose={() => setImageOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Вставить изображение</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth label="URL изображения" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleInsertImage()} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImageOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleInsertImage}>Вставить</Button>
        </DialogActions>
      </Dialog>

      {/* ── Table dialog ── */}
      <Dialog open={tableOpen} onClose={() => setTableOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Вставить таблицу</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <TextField type="number" label="Строк" value={tableRows} onChange={(e) => setTableRows(parseInt(e.target.value, 10) || 1)} inputProps={{ min: 1, max: 20 }} size="small" />
            <TextField type="number" label="Столбцов" value={tableCols} onChange={(e) => setTableCols(parseInt(e.target.value, 10) || 1)} inputProps={{ min: 1, max: 10 }} size="small" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTableOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleInsertTable}>Вставить</Button>
        </DialogActions>
      </Dialog>

      {/* ── Editor ── */}
      <Box className="notes-editor">
        <EditorContent editor={editor} />
      </Box>
    </>
  );
};

export default NotesEditor;
