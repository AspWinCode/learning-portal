import readXlsxFile from 'read-excel-file/browser';

import { FinanceOperation } from '../types/personalFinance';

export interface ParseXlsxResult {
  operations: Array<Omit<FinanceOperation, 'id' | 'createdAt'>>;
  errors: string[];
}

const RU_MONTHS: Record<string, number> = {
  январ: 0, янв: 0, января: 0,
  феврал: 1, фев: 1, февраля: 1,
  март: 2, марта: 2, мар: 2,
  апрел: 3, апр: 3, апреля: 3,
  май: 4, мая: 4,
  июн: 5, июня: 5, июнь: 5,
  июл: 6, июля: 6, июль: 6,
  август: 7, авг: 7, августа: 7,
  сентябр: 8, сен: 8, сентября: 8,
  октябр: 9, окт: 9, октября: 9,
  ноябр: 10, ноя: 10, ноября: 10,
  декабр: 11, дек: 11, декабря: 11,
};

function normalizeString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s/g, '').replace(',', '.');
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeDate(value: unknown, today: Date = new Date()): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }
  if (typeof value === 'number') {
    if (value > 100000) {
      const excelDate = new Date((value - 25569) * 86400 * 1000);
      return formatDate(excelDate);
    }
    return null;
  }
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower === 'сегодня') return formatDate(today);
  if (lower === 'вчера') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return formatDate(yesterday);
  }

  const native = new Date(trimmed);
  if (!Number.isNaN(native.getTime())) {
    return formatDate(native);
  }

  const dotMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (dotMatch) {
    const [, day, month, year] = dotMatch;
    const normalizedYear = year ? (year.length === 2 ? `20${year}` : year) : String(today.getFullYear());
    return `${normalizedYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const monthMatch = lower.match(
    /^(\d{1,2})\s*(январ|янв|января|феврал|фев|февраля|март|марта|мар|апрел|апр|апреля|май|мая|июн|июня|июнь|июл|июля|июль|август|авг|августа|сентябр|сен|сентября|октябр|окт|октября|ноябр|ноя|ноября|декабр|дек|декабря)$/,
  );
  if (monthMatch) {
    const day = Number.parseInt(monthMatch[1], 10);
    const month = RU_MONTHS[monthMatch[2]];
    if (Number.isInteger(day) && month !== undefined) {
      return formatDate(new Date(today.getFullYear(), month, day));
    }
  }

  return null;
}

function findColumnIndex(headers: string[], keys: string[]): number {
  const normalizedHeaders = headers.map((header) => header.toLowerCase().replace(/\s/g, ''));
  for (const key of keys) {
    const normalizedKey = key.toLowerCase().replace(/\s/g, '');
    const index = normalizedHeaders.findIndex(
      (header) => header.includes(normalizedKey) || normalizedKey.includes(header),
    );
    if (index >= 0) return index;
  }
  return -1;
}

function isDateLabel(cell: unknown): boolean {
  const value = normalizeString(cell).toLowerCase().replace(/\s/g, '');
  return value === 'date' || value.includes('дата');
}

function isAmountLabel(cell: unknown): boolean {
  const value = normalizeString(cell).toLowerCase().replace(/\s/g, '');
  return value === 'amount' || value.includes('сумм');
}

function isDescLabel(cell: unknown): boolean {
  const value = normalizeString(cell).toLowerCase().replace(/\s/g, '');
  return (
    value === 'description'
    || value.includes('описан')
    || value.includes('назначен')
    || value.includes('comment')
    || value.includes('примечан')
  );
}

function parseVertical(
  rows: unknown[][],
  operations: Array<Omit<FinanceOperation, 'id' | 'createdAt'>>,
): void {
  let dateValue: string | null = null;
  let amountValue: number | null = null;
  let description = '';

  const flush = () => {
    if (dateValue && amountValue !== null && amountValue !== 0) {
      operations.push({
        date: dateValue,
        amount: amountValue,
        description: description || 'Без описания',
        target: 'personal',
        articleId: null,
        raw: {},
      });
    }
    dateValue = null;
    amountValue = null;
    description = '';
  };

  for (const row of rows) {
    const label = row[0];
    const value = row[1];
    if (isDateLabel(label)) {
      const normalized = normalizeDate(value);
      if (normalized) {
        flush();
        dateValue = normalized;
      }
    } else if (isAmountLabel(label)) {
      const normalized = normalizeAmount(value);
      if (normalized !== null) {
        amountValue = normalized;
      }
    } else if (isDescLabel(label)) {
      description = normalizeString(value);
    }
  }

  flush();
}

function getFirstNonEmptyCell(row: unknown[]): string {
  for (const value of row) {
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }
  return '';
}

function flattenStatementRows(rows: unknown[][]): unknown[][] {
  const flattened: unknown[][] = [];
  for (const row of rows) {
    const firstCell = getFirstNonEmptyCell(row);
    if (!firstCell) continue;
    const parts = firstCell.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) {
        flattened.push([part]);
      }
    } else {
      flattened.push(row);
    }
  }
  return flattened;
}

function parseStatementDateHeader(text: string, today: Date): string | null {
  return normalizeDate(text, today);
}

function isStatementTypeLine(text: string): boolean {
  const normalized = text.toLowerCase();
  return normalized.includes('оплата') || normalized.includes('входящ') || normalized.includes('перевод');
}

function parseAmountFromStatement(text: string): number | null {
  const raw = text.trim();
  const hasPlus = raw.includes('+');
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[₽руб]/gi, '')
    .replace(/\u2212/g, '-')
    .replace(/^\+/, '');
  const match = cleaned.match(/-?\d+\.?\d*/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  if (!Number.isFinite(parsed)) return null;
  return hasPlus ? Math.abs(parsed) : -Math.abs(parsed);
}

function parseBankStatement(
  rows: unknown[][],
  operations: Array<Omit<FinanceOperation, 'id' | 'createdAt'>>,
  today: Date,
): void {
  let currentDate: string | null = null;
  let pendingAmount: number | null = null;
  let lastDescription = '';

  for (let index = 0; index < rows.length; index += 1) {
    const cell = getFirstNonEmptyCell(rows[index]);
    if (!cell) continue;

    const dateHeader = parseStatementDateHeader(cell, today);
    if (dateHeader) {
      if (pendingAmount !== null && currentDate) {
        operations.push({
          date: currentDate,
          amount: pendingAmount,
          description: lastDescription || 'Без описания',
          target: 'personal',
          articleId: null,
          raw: {},
        });
      }
      currentDate = dateHeader;
      pendingAmount = null;
      lastDescription = '';
      continue;
    }

    const amount = parseAmountFromStatement(cell);
    if (amount !== null && currentDate) {
      if (pendingAmount !== null) {
        operations.push({
          date: currentDate,
          amount: pendingAmount,
          description: lastDescription || 'Без описания',
          target: 'personal',
          articleId: null,
          raw: { row: index + 1 },
        });
      }
      pendingAmount = amount;
      lastDescription = '';
      continue;
    }

    if (!isStatementTypeLine(cell)) {
      if (pendingAmount !== null && currentDate) {
        operations.push({
          date: currentDate,
          amount: pendingAmount,
          description: cell,
          target: 'personal',
          articleId: null,
          raw: {},
        });
        pendingAmount = null;
      } else {
        lastDescription = cell;
      }
    }
  }

  if (pendingAmount !== null && currentDate) {
    operations.push({
      date: currentDate,
      amount: pendingAmount,
      description: lastDescription || 'Без описания',
      target: 'personal',
      articleId: null,
      raw: {},
    });
  }
}

async function readWorksheetRows(file: File): Promise<unknown[][]> {
  const rows = await readXlsxFile(file);
  return rows as unknown as unknown[][];
}

export async function parseFinanceXlsx(file: File): Promise<ParseXlsxResult> {
  const rows = await readWorksheetRows(file);
  if (rows.length === 0) {
    return { operations: [], errors: ['Нет листов в файле'] };
  }
  if (rows.length < 2) {
    return { operations: [], errors: ['Нужна хотя бы строка заголовков и одна строка данных'] };
  }

  const headers = rows[0].map((cell) => normalizeString(cell));
  const dateCol = findColumnIndex(headers, ['дата', 'date', 'дата операции']);
  const amountCol = findColumnIndex(headers, ['сумма', 'amount', 'сумм']);
  const counterpartyCol = findColumnIndex(headers, ['контрагент', 'counterparty']);
  const descCol = findColumnIndex(headers, ['описание', 'description', 'назначение', 'комментарий', 'примечание']);
  const categoryCol = findColumnIndex(headers, ['статья', 'категория', 'доход', 'расход', 'category']);

  const useDateCol = dateCol >= 0 ? dateCol : 0;
  const useAmountCol = amountCol >= 0 ? amountCol : 1;
  const useDescCol = counterpartyCol >= 0 ? counterpartyCol : (descCol >= 0 ? descCol : 2);
  const useCategoryCol = categoryCol >= 0 ? categoryCol : -1;

  const operations: Array<Omit<FinanceOperation, 'id' | 'createdAt'>> = [];
  const errors: string[] = [];
  const today = new Date();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const dateValue = normalizeDate(row[useDateCol], today);
    let amountValue = normalizeAmount(row[useAmountCol]);
    const counterparty = normalizeString(row[useDescCol] ?? '');
    const typeDescription = descCol >= 0 && descCol !== counterpartyCol
      ? normalizeString(row[descCol] ?? '')
      : '';

    if (!dateValue) {
      errors.push(`Строка ${rowIndex + 1}: не удалось определить дату`);
      continue;
    }
    if (amountValue === null || amountValue === 0) {
      errors.push(`Строка ${rowIndex + 1}: неверная сумма`);
      continue;
    }

    if (useCategoryCol >= 0) {
      const category = normalizeString(row[useCategoryCol]).toLowerCase();
      if (category === 'доход' && amountValue < 0) amountValue = Math.abs(amountValue);
      if (category === 'расход' && amountValue > 0) amountValue = -Math.abs(amountValue);
    }

    operations.push({
      date: dateValue,
      amount: amountValue,
      description: counterparty || 'Без описания',
      typeDescription: typeDescription || undefined,
      target: 'personal',
      articleId: null,
      raw: { row: rowIndex + 1, rawRow: row },
    });
  }

  if (operations.length === 0) {
    parseVertical(rows, operations);
  }
  if (operations.length === 0) {
    parseBankStatement(flattenStatementRows(rows), operations, new Date());
  }

  return { operations, errors };
}
