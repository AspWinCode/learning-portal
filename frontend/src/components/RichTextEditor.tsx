import React, { useCallback, useEffect, useRef } from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
} from '@mui/material';
import FormatBold from '@mui/icons-material/FormatBold';
import FormatItalic from '@mui/icons-material/FormatItalic';
import FormatUnderlined from '@mui/icons-material/FormatUnderlined';
import FormatSize from '@mui/icons-material/FormatSize';
import Title from '@mui/icons-material/Title';

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
  const isInternalChange = useRef(false);

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
      if (!items || !onPasteImage) {
        return;
      }
      const arr = Array.from(items);
      for (let i = 0; i < arr.length; i++) {
        const item = arr[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file?.type.startsWith('image/')) {
            e.preventDefault();
            try {
              const url = await onPasteImage(file);
              const imgHtml = `<img src="${url}" alt="" style="max-width:100%;height:auto;" />`;
              document.execCommand('insertHTML', false, imgHtml);
              syncContent();
            } catch (_) {
              // allow default paste if upload fails
            }
            return;
          }
        }
      }
    },
    [onPasteImage, syncContent]
  );

  const exec = useCallback(
    (cmd: string, value?: string) => {
      document.execCommand(cmd, false, value ?? '');
      editorRef.current?.focus();
      syncContent();
    },
    [syncContent]
  );

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
      <Stack direction="row" flexWrap="wrap" alignItems="center" sx={{ p: 0.5, bgcolor: 'grey.100', gap: 0.5 }}>
        <ToggleButtonGroup size="small" sx={{ flexWrap: 'wrap' }}>
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
        <FormControl size="small" sx={{ minWidth: 130 }}>
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
        <FormControl size="small" sx={{ minWidth: 120 }}>
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
        <FormControl size="small" sx={{ minWidth: 140 }}>
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
        }}
      />
    </Box>
  );
};

export default RichTextEditor;
