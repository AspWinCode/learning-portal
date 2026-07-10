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
import type { Editor } from '@tiptap/core';
import {
  Box,
  Divider,
  GlobalStyles,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Tooltip,
} from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import FormatStrikethroughIcon from '@mui/icons-material/FormatStrikethrough';
import CodeIcon from '@mui/icons-material/Code';
import CodeOffIcon from '@mui/icons-material/IntegrationInstructions';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import HighlightIcon from '@mui/icons-material/Highlight';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import LooksOneIcon from '@mui/icons-material/LooksOne';
import LooksTwoIcon from '@mui/icons-material/LooksTwo';
import Looks3Icon from '@mui/icons-material/Looks3';

interface SlashItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (editor: Editor) => void;
  keywords: string[];
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Текст',
    description: 'Обычный абзац',
    icon: <TextFieldsIcon fontSize="small" />,
    command: (e) => e.chain().focus().setParagraph().run(),
    keywords: ['текст', 'paragraph', 'text', 'p'],
  },
  {
    title: 'Заголовок 1',
    description: 'Крупный заголовок',
    icon: <LooksOneIcon fontSize="small" />,
    command: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
    keywords: ['заголовок', 'heading', 'h1'],
  },
  {
    title: 'Заголовок 2',
    description: 'Средний заголовок',
    icon: <LooksTwoIcon fontSize="small" />,
    command: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
    keywords: ['заголовок', 'heading', 'h2'],
  },
  {
    title: 'Заголовок 3',
    description: 'Малый заголовок',
    icon: <Looks3Icon fontSize="small" />,
    command: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
    keywords: ['заголовок', 'heading', 'h3'],
  },
  {
    title: 'Список',
    description: 'Маркированный список',
    icon: <FormatListBulletedIcon fontSize="small" />,
    command: (e) => e.chain().focus().toggleBulletList().run(),
    keywords: ['список', 'bullet', 'list', 'ul'],
  },
  {
    title: 'Нумерованный список',
    description: 'Список с номерами',
    icon: <FormatListNumberedIcon fontSize="small" />,
    command: (e) => e.chain().focus().toggleOrderedList().run(),
    keywords: ['нумерованный', 'numbered', 'ol', 'список'],
  },
  {
    title: 'Задача',
    description: 'Список с чекбоксами',
    icon: <CheckBoxOutlineBlankIcon fontSize="small" />,
    command: (e) => e.chain().focus().toggleTaskList().run(),
    keywords: ['задача', 'todo', 'task', 'check', 'чекбокс'],
  },
  {
    title: 'Цитата',
    description: 'Блок цитаты',
    icon: <FormatQuoteIcon fontSize="small" />,
    command: (e) => e.chain().focus().toggleBlockquote().run(),
    keywords: ['цитата', 'quote', 'blockquote'],
  },
  {
    title: 'Код',
    description: 'Блок кода',
    icon: <CodeIcon fontSize="small" />,
    command: (e) => e.chain().focus().toggleCodeBlock().run(),
    keywords: ['код', 'code', 'codeblock'],
  },
];

const EDITOR_STYLES = {
  '.notes-editor .ProseMirror': {
    outline: 'none',
    padding: '4px 2px',
    fontSize: '1rem',
    lineHeight: 1.75,
    minHeight: 300,
  },
  '.notes-editor .ProseMirror p.is-editor-empty:first-child::before': {
    content: 'attr(data-placeholder)',
    float: 'left',
    color: '#aaa',
    pointerEvents: 'none',
    height: 0,
  },
  '.notes-editor .ProseMirror h1': { fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.3, margin: '1rem 0 0.5rem' },
  '.notes-editor .ProseMirror h2': { fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.3, margin: '0.875rem 0 0.4rem' },
  '.notes-editor .ProseMirror h3': { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.3, margin: '0.75rem 0 0.3rem' },
  '.notes-editor .ProseMirror ul, .notes-editor .ProseMirror ol': { paddingLeft: '1.5rem', margin: '0.25rem 0' },
  '.notes-editor .ProseMirror li': { marginBottom: '0.2rem' },
  '.notes-editor .ProseMirror blockquote': {
    borderLeft: '3px solid #9e9e9e',
    margin: '0.5rem 0',
    paddingLeft: '1rem',
    color: '#757575',
    fontStyle: 'italic',
  },
  '.notes-editor .ProseMirror pre': {
    background: '#f5f5f5',
    borderRadius: '6px',
    padding: '12px 16px',
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    overflowX: 'auto',
    margin: '0.5rem 0',
  },
  '.notes-editor .ProseMirror code': {
    background: '#f0f0f0',
    borderRadius: '3px',
    padding: '1px 5px',
    fontFamily: 'monospace',
    fontSize: '0.875em',
  },
  '.notes-editor .ProseMirror pre code': { background: 'none', padding: 0 },
  '.notes-editor .ProseMirror mark': { background: '#fff176', borderRadius: '2px', padding: '0 2px' },
  '.notes-editor .ProseMirror a': { color: '#7c3aed', textDecoration: 'underline', cursor: 'pointer' },
  '.notes-editor .ProseMirror hr': { border: 'none', borderTop: '2px solid #e0e0e0', margin: '1rem 0' },
  // Task list
  '.notes-editor .ProseMirror ul[data-type="taskList"]': { listStyle: 'none', paddingLeft: '0.25rem' },
  '.notes-editor .ProseMirror ul[data-type="taskList"] > li': {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    marginBottom: '0.25rem',
  },
  '.notes-editor .ProseMirror ul[data-type="taskList"] > li > label': { paddingTop: '3px', flexShrink: 0 },
  '.notes-editor .ProseMirror ul[data-type="taskList"] > li > label input[type="checkbox"]': {
    width: 16,
    height: 16,
    cursor: 'pointer',
    accentColor: '#7c3aed',
  },
  '.notes-editor .ProseMirror ul[data-type="taskList"] > li[data-checked="true"] > div': {
    opacity: 0.55,
    textDecoration: 'line-through',
  },
} as const;

interface SlashMenuState {
  top: number;
  left: number;
  query: string;
  deleteFrom: number;
  deleteTo: number;
}

export interface NotesEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

const NotesEditor: React.FC<NotesEditorProps> = ({
  value,
  onChange,
  placeholder = 'Начните писать или введите / для вставки блока…',
}) => {
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const isInternalChange = useRef(false);
  const editorRef = useRef<Editor | null>(null);

  const filteredItems = useMemo(() => {
    if (!slashMenu) return [];
    const q = slashMenu.query.toLowerCase();
    if (!q) return SLASH_ITEMS;
    return SLASH_ITEMS.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q)),
    );
  }, [slashMenu]);

  // Ref snapshot — always current even in stale closures (editorProps.handleKeyDown)
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
        setSlashMenu({
          top: coords.bottom + 4,
          left: coords.left,
          query: textBefore.slice(1),
          deleteFrom: blockStart,
          deleteTo: from,
        });
        setSlashIdx(0);
      } else {
        setSlashMenu(null);
      }
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        const { menu, items, idx } = stateRef.current;
        if (!menu || items.length === 0) return false;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setSlashIdx((i) => Math.min(i + 1, items.length - 1));
          return true;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setSlashIdx((i) => Math.max(i - 1, 0));
          return true;
        }
        if (event.key === 'Enter') {
          const item = items[idx];
          const ed = editorRef.current;
          if (item && ed) executeItemRef.current(item, ed, menu);
          event.preventDefault();
          return true;
        }
        if (event.key === 'Escape') {
          setSlashMenu(null);
          return true;
        }
        return false;
      },
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync external value (e.g. switching notes)
  useEffect(() => {
    if (!editor) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (editor.getHTML() !== (value || '')) {
      editor.commands.setContent(value || '');
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <>
      <GlobalStyles styles={EDITOR_STYLES} />

      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100 }}
        shouldShow={(props: any) => {
          const { from, to } = props.state.selection;
          return from !== to;
        }}
      >
        <Paper
          elevation={4}
          sx={{ display: 'flex', alignItems: 'center', px: 0.5, py: 0.25, borderRadius: 1.5, gap: 0.25 }}
        >
          <Tooltip title="Жирный · Ctrl+B">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleBold().run()}
              color={editor.isActive('bold') ? 'primary' : 'default'}
              sx={{ width: 28, height: 28 }}
            >
              <FormatBoldIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Курсив · Ctrl+I">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              color={editor.isActive('italic') ? 'primary' : 'default'}
              sx={{ width: 28, height: 28 }}
            >
              <FormatItalicIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Подчёркнутый · Ctrl+U">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              color={editor.isActive('underline') ? 'primary' : 'default'}
              sx={{ width: 28, height: 28 }}
            >
              <FormatUnderlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Маркер">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              color={editor.isActive('highlight') ? 'primary' : 'default'}
              sx={{ width: 28, height: 28 }}
            >
              <HighlightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
          <Tooltip title="Инлайн-код">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleCode().run()}
              color={editor.isActive('code') ? 'primary' : 'default'}
              sx={{ width: 28, height: 28 }}
            >
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Цитата">
            <IconButton
              size="small"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              color={editor.isActive('blockquote') ? 'primary' : 'default'}
              sx={{ width: 28, height: 28 }}
            >
              <FormatQuoteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Paper>
      </BubbleMenu>

      {/* Slash command popup */}
      {slashMenu && filteredItems.length > 0 && (
        <Paper
          elevation={6}
          sx={{
            position: 'fixed',
            top: slashMenu.top,
            left: slashMenu.left,
            zIndex: 9999,
            minWidth: 240,
            maxHeight: 320,
            overflow: 'auto',
            borderRadius: 2,
          }}
        >
          <List dense sx={{ py: 0.5 }}>
            {filteredItems.map((item, index) => (
              <ListItemButton
                key={item.title}
                selected={index === slashIdx}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep editor focused
                  executeItem(item, editor, slashMenu);
                }}
                sx={{ borderRadius: 1, mx: 0.5, py: 0.75 }}
              >
                <ListItemIcon sx={{ minWidth: 36, color: 'primary.main' }}>{item.icon}</ListItemIcon>
                <ListItemText
                  primary={item.title}
                  secondary={item.description}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500 }}
                  secondaryTypographyProps={{ fontSize: '0.75rem' }}
                />
              </ListItemButton>
            ))}
          </List>
        </Paper>
      )}

      {/* Fixed toolbar */}
      <Paper
        variant="outlined"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 0.25,
          px: 0.75,
          py: 0.5,
          mb: 1,
          borderRadius: 1.5,
          bgcolor: 'background.paper',
        }}
      >
        {/* Text formatting */}
        <Stack direction="row" alignItems="center" spacing={0}>
          <Tooltip title="Жирный · Ctrl+B">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} color={editor.isActive('bold') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <FormatBoldIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Курсив · Ctrl+I">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} color={editor.isActive('italic') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <FormatItalicIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Подчёркнутый · Ctrl+U">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} color={editor.isActive('underline') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <FormatUnderlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Зачёркнутый">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleStrike().run(); }} color={editor.isActive('strike') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <FormatStrikethroughIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Маркер">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHighlight().run(); }} color={editor.isActive('highlight') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <HighlightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Headings */}
        <Stack direction="row" alignItems="center" spacing={0}>
          <Tooltip title="Заголовок 1">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run(); }} color={editor.isActive('heading', { level: 1 }) ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <LooksOneIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Заголовок 2">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }} color={editor.isActive('heading', { level: 2 }) ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <LooksTwoIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Заголовок 3">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run(); }} color={editor.isActive('heading', { level: 3 }) ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <Looks3Icon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Lists */}
        <Stack direction="row" alignItems="center" spacing={0}>
          <Tooltip title="Маркированный список">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} color={editor.isActive('bulletList') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <FormatListBulletedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Нумерованный список">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }} color={editor.isActive('orderedList') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <FormatListNumberedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Список задач">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleTaskList().run(); }} color={editor.isActive('taskList') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <CheckBoxOutlineBlankIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* Blocks */}
        <Stack direction="row" alignItems="center" spacing={0}>
          <Tooltip title="Цитата">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBlockquote().run(); }} color={editor.isActive('blockquote') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <FormatQuoteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Инлайн-код">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCode().run(); }} color={editor.isActive('code') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Блок кода">
            <IconButton size="small" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleCodeBlock().run(); }} color={editor.isActive('codeBlock') ? 'primary' : 'default'} sx={{ width: 30, height: 30 }}>
              <CodeOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Paper>

      <Box className="notes-editor">
        <EditorContent editor={editor} />
      </Box>
    </>
  );
};

export default NotesEditor;
