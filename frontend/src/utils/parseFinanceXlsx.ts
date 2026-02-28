/**
 * Парсинг XLSX для импорта операций.
 * Ожидаемые колонки (по возможности): дата, сумма, описание.
 * Поддерживаются варианты: первая строка — заголовки, данные со 2-й строки.
 */

import * as XLSX from 'xlsx';
import { FinanceOperation } from '../types/personalFinance';

function normalizeDate(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
    const match = trimmed.match(/(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
    if (match) {
      const [, day, month, year] = match;
      const y = year.length === 2 ? `20${year}` : year;
      return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    return null;
  }
  if (typeof value === 'number') {
    if (value > 100000) {
      const d = new Date((value - 25569) * 86400 * 1000);
      return d.toISOString().slice(0, 10);
    }
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeAmount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/\s/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function normalizeString(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
}

/** Поиск индекса колонки по заголовку (регистронезависимо, с пробелами) */
function findColumnIndex(headers: string[], keys: string[]): number {
  const lower = headers.map((h) => h.toLowerCase().replace(/\s/g, ''));
  for (const key of keys) {
    const k = key.toLowerCase().replace(/\s/g, '');
    const idx = lower.findIndex((h) => h.includes(k) || k.includes(h));
    if (idx >= 0) return idx;
  }
  return -1;
}

export interface ParseXlsxResult {
  operations: Array<Omit<FinanceOperation, 'id' | 'createdAt'>>;
  errors: string[];
}

export function parseFinanceXlsx(file: File): Promise<ParseXlsxResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data || typeof data !== 'object') {
          resolve({ operations: [], errors: ['Файл пуст или не удалось прочитать'] });
          return;
        }
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) {
          resolve({ operations: [], errors: ['Нет листов в файле'] });
          return;
        }
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
          header: 1,
          defval: '',
        }) as unknown[][];

        if (rows.length < 2) {
          resolve({ operations: [], errors: ['Нужна хотя бы строка заголовков и одна строка данных'] });
          return;
        }

        const headers = rows[0].map((c) => normalizeString(c));
        const dateCol = findColumnIndex(headers, ['дата', 'date', 'дата операции']);
        const amountCol = findColumnIndex(headers, ['сумма', 'amount', 'сумм']);
        const descCol = findColumnIndex(headers, ['описание', 'description', 'назначение', 'комментарий', 'примечание']);

        const useDateCol = dateCol >= 0 ? dateCol : 0;
        const useAmountCol = amountCol >= 0 ? amountCol : 1;
        const useDescCol = descCol >= 0 ? descCol : 2;

        const operations: Array<Omit<FinanceOperation, 'id' | 'createdAt'>> = [];
        const errors: string[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const dateVal = normalizeDate(row[useDateCol]);
          const amountVal = normalizeAmount(row[useAmountCol]);
          const desc = normalizeString(row[useDescCol] ?? '');

          if (!dateVal) {
            errors.push(`Строка ${i + 1}: не удалось определить дату`);
            continue;
          }
          if (amountVal === null || amountVal === 0) {
            errors.push(`Строка ${i + 1}: неверная сумма`);
            continue;
          }

          operations.push({
            date: dateVal,
            amount: amountVal,
            description: desc || 'Без описания',
            target: 'personal',
            articleId: null,
            raw: { row: i + 1, rawRow: row },
          });
        }

        resolve({ operations, errors });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsArrayBuffer(file);
  });
}
