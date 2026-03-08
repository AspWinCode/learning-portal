import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  IconButton,
  Popover,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Tooltip,
} from '@mui/material';
import FormatBold from '@mui/icons-material/FormatBold';
import FormatItalic from '@mui/icons-material/FormatItalic';
import FormatUnderlined from '@mui/icons-material/FormatUnderlined';
import FormatAlignLeft from '@mui/icons-material/FormatAlignLeft';
import FormatAlignCenter from '@mui/icons-material/FormatAlignCenter';
import FormatAlignRight from '@mui/icons-material/FormatAlignRight';
import FormatAlignJustify from '@mui/icons-material/FormatAlignJustify';
import FormatListBulleted from '@mui/icons-material/FormatListBulleted';
import FormatListNumbered from '@mui/icons-material/FormatListNumbered';
import FormatIndentIncrease from '@mui/icons-material/FormatIndentIncrease';
import FormatIndentDecrease from '@mui/icons-material/FormatIndentDecrease';
import Link from '@mui/icons-material/Link';
import Image from '@mui/icons-material/Image';
import TableChart from '@mui/icons-material/TableChart';
import FormatColorText from '@mui/icons-material/FormatColorText';

const BLOCK_OPTIONS: { value: string; label: string }[] = [
  { value: 'p', label: 'Абзац' },
  { value: 'h2', label: 'Заголовок 2' },
  { value: 'h3', label: 'Заголовок 3' },
];

const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: 'default', label: 'По умолчанию' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'monospace', label: 'Моноширинный' },
];

const FONT_SIZE_OPTIONS: { value: string; label: string }[] = [
  { value: '3', label: 'Маленький' },
  { value: '4', label: 'Обычный' },
  { value: '5', label: 'Большой' },
];

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
];

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  onPasteImage?: (file: File) => Promise<string>;
  minHeight?: number;
  placeholder?: string;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  onPasteImage,
  minHeight = 200,
  placeholder = 'Введите текст…',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const colorSelectionRef = useRef<Range | null>(null);
  const isInternalChange = useRef(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const html = value || '';
    if (el.innerHTML !== html) {
      el.innerHTML = html || '';
    }
  }, [value]);

  const syncContent = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    isInternalChange.current = true;
    onChange(el.innerHTML);
  }, [onChange]);

  const handleInput = useCallback(() => {
    syncContent();
  }, [syncContent]);

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || !onPasteImage) return;
      const arr = Array.from(items);
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file?.type.startsWith('image/')) {
            e.preventDefault();
            try {
              const url = await onPasteImage(file);
              insertHtml(`<p><img src="${url}" alt="" style="max-width:100%;height:auto;" /></p>`);
              syncContent();
            } catch (_) {}
            return;
          }
        }
      }
    },
    [onPasteImage, syncContent]
  );

  const insertHtml = useCallback(
    (html: string) => {
      document.execCommand('insertHTML', false, html);
      editorRef.current?.focus();
      syncContent();
    },
    [syncContent]
  );

  const exec = useCallback(
    (cmd: string, value?: string) => {
      document.execCommand(cmd, false, value ?? '');
      editorRef.current?.focus();
      syncContent();
    },
    [syncContent]
  );

  const openColorPopover = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      colorSelectionRef.current = sel.getRangeAt(0).cloneRange();
    } else {
      colorSelectionRef.current = null;
    }
  }, []);

  const handleColorSelect = useCallback(
    (color: string) => {
      editorRef.current?.focus();
      const sel = window.getSelection();
      if (sel && colorSelectionRef.current) {
        sel.removeAllRanges();
        sel.addRange(colorSelectionRef.current);
      }
      colorSelectionRef.current = null;
      try {
        document.execCommand('styleWithCSS', false, 'true');
      } catch (_) {}
      document.execCommand('foreColor', false, color);
      syncContent();
      setColorAnchor(null);
    },
    [syncContent]
  );

  const handleInsertLink = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    else savedSelectionRef.current = null;
    setLinkUrl('https://');
    setLinkOpen(true);
  }, []);

  const handleLinkConfirm = useCallback(() => {
    const url = linkUrl.trim();
    if (url && url !== 'https://') {
      const sel = window.getSelection();
      if (sel && savedSelectionRef.current) {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRef.current);
      }
      document.execCommand('createLink', false, url);
      syncContent();
    }
    savedSelectionRef.current = null;
    setLinkOpen(false);
  }, [linkUrl, syncContent]);

  const handleInsertTable = useCallback(() => {
    const r = Math.max(1, Math.min(20, tableRows));
    const c = Math.max(1, Math.min(10, tableCols));
    let html = '<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;"><tbody>';
    for (let i = 0; i < r; i++) {
      html += '<tr>';
      for (let j = 0; j < c; j++) html += '<td></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';
    insertHtml(html);
    setTableOpen(false);
  }, [tableRows, tableCols, insertHtml]);

  const handleImageClick = useCallback(() => {
    if (onPasteImage) imageInputRef.current?.click();
  }, [onPasteImage]);

  const handleImageFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !onPasteImage || !file.type.startsWith('image/')) return;
      try {
        const url = await onPasteImage(file);
        insertHtml(`<p><img src="${url}" alt="" style="max-width:100%;height:auto;" /></p>`);
      } catch (_) {}
    },
    [onPasteImage, insertHtml]
  );

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack direction="row" flexWrap="wrap" alignItems="center" sx={{ p: 0.5, bgcolor: 'grey.100', gap: 0.5 }}>
        <ToggleButtonGroup size="small">
          <ToggleButton value="bold" onClick={() => exec('bold')} aria-label="Жирный">
            <FormatBold />
          </ToggleButton>
          <ToggleButton value="italic" onClick={() => exec('italic')} aria-label="Курсив">
            <FormatItalic />
          </ToggleButton>
          <ToggleButton value="underline" onClick={() => exec('underline')} aria-label="Подчёркнутый">
            <FormatUnderlined />
          </ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title="Цвет текста (сначала выделите текст)">
          <IconButton
            size="small"
            onClick={(e) => {
              openColorPopover();
              setColorAnchor(e.currentTarget);
            }}
            aria-label="Цвет текста"
          >
            <FormatColorText />
          </IconButton>
        </Tooltip>
        <Popover
          open={Boolean(colorAnchor)}
          anchorEl={colorAnchor}
          onClose={() => setColorAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        >
          <Box sx={{ p: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5, maxWidth: 200 }}>
            {TEXT_COLORS.map((c) => (
              <Box
                key={c}
                onClick={() => handleColorSelect(c)}
                sx={{
                  width: 20,
                  height: 20,
                  bgcolor: c,
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 0.5,
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.8 },
                }}
              />
            ))}
          </Box>
        </Popover>

        <Box sx={{ width: 8 }} />
        <ToggleButtonGroup size="small">
          <ToggleButton value="left" onClick={() => exec('justifyLeft')} aria-label="По левому краю">
            <FormatAlignLeft />
          </ToggleButton>
          <ToggleButton value="center" onClick={() => exec('justifyCenter')} aria-label="По центру">
            <FormatAlignCenter />
          </ToggleButton>
          <ToggleButton value="right" onClick={() => exec('justifyRight')} aria-label="По правому краю">
            <FormatAlignRight />
          </ToggleButton>
          <ToggleButton value="justify" onClick={() => exec('justifyFull')} aria-label="По ширине">
            <FormatAlignJustify />
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup size="small">
          <ToggleButton value="ul" onClick={() => exec('insertUnorderedList')} aria-label="Маркированный список">
            <FormatListBulleted />
          </ToggleButton>
          <ToggleButton value="ol" onClick={() => exec('insertOrderedList')} aria-label="Нумерованный список">
            <FormatListNumbered />
          </ToggleButton>
        </ToggleButtonGroup>

        <ToggleButtonGroup size="small">
          <ToggleButton value="outdent" onClick={() => exec('outdent')} aria-label="Уменьшить отступ">
            <FormatIndentDecrease />
          </ToggleButton>
          <ToggleButton value="indent" onClick={() => exec('indent')} aria-label="Увеличить отступ">
            <FormatIndentIncrease />
          </ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title="Вставить ссылку">
          <IconButton size="small" onClick={handleInsertLink} aria-label="Вставить ссылку">
            <Link />
          </IconButton>
        </Tooltip>
        {onPasteImage && (
          <>
            <Tooltip title="Вставить изображение">
              <IconButton size="small" onClick={handleImageClick} aria-label="Вставить изображение">
                <Image />
              </IconButton>
            </Tooltip>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleImageFile}
            />
          </>
        )}
        <Tooltip title="Вставить таблицу">
          <IconButton size="small" onClick={() => setTableOpen(true)} aria-label="Вставить таблицу">
            <TableChart />
          </IconButton>
        </Tooltip>

        <FormControl size="small" sx={{ minWidth: 100, ml: 0.5 }}>
          <InputLabel>Стиль</InputLabel>
          <Select
            label="Стиль"
            value=""
            onChange={(e) => exec('formatBlock', e.target.value)}
            onMouseDown={(e) => e.preventDefault()}
          >
            {BLOCK_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel>Размер</InputLabel>
          <Select
            label="Размер"
            value=""
            onChange={(e) => exec('fontSize', e.target.value)}
            onMouseDown={(e) => e.preventDefault()}
          >
            {FONT_SIZE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Шрифт</InputLabel>
          <Select
            label="Шрифт"
            value=""
            onChange={(e) => exec('fontName', e.target.value === 'default' ? 'inherit' : e.target.value)}
            onMouseDown={(e) => e.preventDefault()}
          >
            {FONT_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value === 'default' ? 'inherit' : o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Box
        ref={editorRef}
        component="div"
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        suppressContentEditableWarning
        sx={{
          minHeight,
          p: 2,
          outline: 'none',
          '&:empty::before': { content: `"${placeholder}"`, color: 'text.disabled' },
          '& img': { maxWidth: '100%', height: 'auto' },
          '& table': { borderCollapse: 'collapse', width: '100%' },
          '& td, & th': { border: '1px solid', borderColor: 'divider', p: 1 },
        }}
      />

      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Вставить ссылку</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="URL"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLinkConfirm()}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleLinkConfirm}>
            Вставить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={tableOpen} onClose={() => setTableOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Вставить таблицу</DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            <TextField
              type="number"
              label="Строк"
              value={tableRows}
              onChange={(e) => setTableRows(parseInt(e.target.value, 10) || 1)}
              inputProps={{ min: 1, max: 20 }}
              size="small"
            />
            <TextField
              type="number"
              label="Столбцов"
              value={tableCols}
              onChange={(e) => setTableCols(parseInt(e.target.value, 10) || 1)}
              inputProps={{ min: 1, max: 10 }}
              size="small"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTableOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={handleInsertTable}>
            Вставить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RichTextEditor;
