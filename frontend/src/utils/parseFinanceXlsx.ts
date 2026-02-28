/**
 * Парсинг XLSX для импорта операций.
 *
 * Поддерживаются три формата:
 *
 * 1) Горизонтальный (таблица): первая строка — заголовки (Дата, Сумма, Описание),
 *    каждая следующая строка — одна операция.
 *
 * 2) Вертикальный A/B: в столбце A — подписи (Дата, Сумма, Описание), в B — значения.
 *
 * 3) Выписка (одна колонка): заголовки дат («Сегодня», «Вчера», «27 феврал» и т.д.),
 *    под каждым — блоки: сумма с ₽ (например +4 900 ₽ или 499,62 ₽), контрагент (AZS KRAISI,
 *    Наталья Ю), тип («Оплата то», «Входящий», «Перевод»). Одна операция = сумма + контрагент
 *    (строка перед или после суммы, не являющаяся датой и не типом).
 */

import * as XLSX from 'xlsx';
import { FinanceOperation } from '../types/personalFinance';

function normalizeDate(value: unknown, today: Date = new Date()): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === 'сегодня') return today.toISOString().slice(0, 10);
    if (lower === 'вчера') {
      const d = new Date(today); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
    }
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

/** Проверка, что строка похожа на подпись "дата" */
function isDateLabel(cell: unknown): boolean {
  const s = normalizeString(cell).toLowerCase().replace(/\s/g, '');
  return /^(дата|date|дата\s*операции)$/.test(s) || s.includes('дата') || s === 'date';
}

/** Проверка, что строка похожа на подпись "сумма" */
function isAmountLabel(cell: unknown): boolean {
  const s = normalizeString(cell).toLowerCase().replace(/\s/g, '');
  return /^(сумма|amount|сумм)$/.test(s) || s.includes('сумм');
}

/** Проверка, что строка похожа на подпись "описание/назначение" */
function isDescLabel(cell: unknown): boolean {
  const s = normalizeString(cell).toLowerCase().replace(/\s/g, '');
  return /^(описание|назначение|description|комментарий|примечание)$/.test(s) ||
    s.includes('описан') || s.includes('назначен') || s.includes('comment');
}

/**
 * Парсинг вертикального формата: колонка A — подписи (Дата, Сумма, Описание), колонка B — значения.
 * Одна операция может идти тремя подряд строками в любом порядке; накапливаем поля и при полном наборе добавляем операцию.
 */
function parseVertical(
  rows: unknown[][],
  operations: Array<Omit<FinanceOperation, 'id' | 'createdAt'>>,
  errors: string[]
): void {
  let dateVal: string | null = null;
  let amountVal: number | null = null;
  let desc = '';

  const flush = () => {
    if (dateVal && amountVal !== null && amountVal !== 0) {
      operations.push({
        date: dateVal,
        amount: amountVal,
        description: desc || 'Без описания',
        target: 'personal',
        articleId: null,
        raw: {},
      });
    }
    dateVal = null;
    amountVal = null;
    desc = '';
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const label = normalizeString(row[0]);
    const value = row[1];
    if (!label) continue;

    if (isDateLabel(row[0])) {
      const d = normalizeDate(value);
      if (d) {
        flush();
        dateVal = d;
      }
    } else if (isAmountLabel(row[0])) {
      const a = normalizeAmount(value);
      if (a !== null) amountVal = a;
    } else if (isDescLabel(row[0])) {
      desc = normalizeString(value);
    }
  }
  flush();
}

/** Названия месяцев по-русски (именительный и родительный падеж) */
const RU_MONTHS: Record<string, number> = {
  январ: 0, янв: 0, января: 0,
  феврал: 1, фев: 1, февраля: 1,
  мар: 2, март: 2, марта: 2,
  апрел: 3, апр: 3, апреля: 3,
  май: 4, ма: 4, мая: 4,
  июн: 5, июнь: 5, июня: 5,
  июл: 6, июль: 6, июля: 6,
  август: 7, авг: 7, августа: 7,
  сентябр: 8, сен: 8, сентября: 8,
  октябр: 9, окт: 9, октября: 9,
  ноябр: 10, ноя: 10, ноября: 10,
  декабр: 11, дек: 11, декабря: 11,
};

/** Проверка, что строка — заголовок даты выписки (Сегодня, Вчера, 27 феврал, 27.02 и т.д.) */
function parseStatementDateHeader(text: string, today: Date): string | null {
  const t = text.trim().toLowerCase();
  if (t === 'сегодня') return formatDate(today);
  if (t === 'вчера') {
    const d = new Date(today); d.setDate(d.getDate() - 1); return formatDate(d);
  }
  const dotMatch = t.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?$/);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10) - 1;
    const y = dotMatch[3] ? (dotMatch[3].length === 2 ? 2000 + parseInt(dotMatch[3], 10) : parseInt(dotMatch[3], 10)) : today.getFullYear();
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const d = new Date(y, month, day);
      return formatDate(d);
    }
  }
  const match = t.match(/^(\d{1,2})\s*(январ|января|феврал|февраля|фев|март|марта|мар|апрел|апреля|апр|май|мая|июн|июня|июль|июля|июл|август|августа|авг|сентябр|сентября|сен|октябр|октября|окт|ноябр|ноября|ноя|декабр|декабря|дек)/);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthKey = match[2];
    const month = RU_MONTHS[monthKey];
    if (month !== undefined && day >= 1 && day <= 31) {
      const y = today.getFullYear();
      const d = new Date(y, month, day);
      return formatDate(d);
    }
  }
  return null;
}

/** Первая непустая ячейка в строке (для выписки данные могут быть в A или B) */
function getFirstCell(row: unknown[]): string {
  for (let j = 0; j < row.length; j++) {
    const v = row[j];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

/** Вторая непустая ячейка (для табличного формата: A = сумма, B = контрагент) */
function getSecondCell(row: unknown[]): string {
  let found = 0;
  for (let j = 0; j < row.length; j++) {
    const v = row[j];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) {
      found++;
      if (found === 2) return s;
    }
  }
  return '';
}

/** Развернуть строки: если в ячейке есть переносы строк — каждая строка становится отдельной записью */
function flattenStatementRows(rows: unknown[][]): unknown[][] {
  const out: unknown[][] = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const cell = getFirstCell(row);
    if (!cell) continue;
    const lines = cell.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (lines.length > 1) {
      for (const line of lines) out.push([line]);
    } else {
      out.push(row);
    }
  }
  return out;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Извлечь сумму из строки вида "+4 900 ₽", "499,62 ₽", "-100 ₽", "100 руб" */
function parseAmountFromStatement(text: string): number | null {
  const raw = text.trim();
  const hasPlus = /\+/.test(raw);
  const cleaned = raw.replace(/\s/g, '').replace(',', '.').replace(/[₽руб]/gi, '').replace(/\u2212/g, '-').trim();
  const numMatch = cleaned.replace(/^\+/, '').match(/(-?\d+\.?\d*)/);
  if (!numMatch) return null;
  const n = parseFloat(numMatch[1]);
  if (Number.isNaN(n)) return null;
  return hasPlus ? Math.abs(n) : -Math.abs(n);
}

/**
 * Если в одной ячейке сумма и контрагент (например "−684,56 Абсолют" или "-135 Яндекс"),
 * извлечь и то и другое. Иначе только сумму, counterparty = ''.
 */
function parseAmountAndCounterparty(text: string): { amount: number; counterparty: string } | null {
  const raw = text.trim();
  const hasPlus = /\+/.test(raw);
  const normalized = raw.replace(/\u2212/g, '-');
  const numMatch = normalized.match(/^([+\-]?\s*\d[\d\s]*[,.]?\d*)\s*([₽руб.\s]*)(.*)$/i);
  if (!numMatch) {
    const amount = parseAmountFromStatement(raw);
    return amount !== null ? { amount, counterparty: '' } : null;
  }
  const amountStr = numMatch[1].replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(amountStr.replace(/^\+/, ''));
  if (Number.isNaN(n)) return null;
  const amount = hasPlus ? Math.abs(n) : -Math.abs(n);
  const counterparty = (numMatch[3] || '').replace(/[₽руб.]/gi, '').trim();
  return { amount, counterparty };
}

/** Проверка, что строка похожа на сумму из выписки (содержит число и ₽ или просто число с +) */
function isStatementAmountLine(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (/\d/.test(t) && (t.includes('₽') || /^[+\-]?\s*\d/.test(t)));
}

/** Известные типы операций — не использовать как описание контрагента */
const STATEMENT_TYPE_PREFIXES = ['оплата товаров', 'оплата то', 'входящий', 'перевод', 'комиссия', 'прочие сг', 'прочие сп', 'недостато', 'оплата'];

function isStatementTypeLine(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (t.length < 5) return false;
  return STATEMENT_TYPE_PREFIXES.some((p) => t.startsWith(p) || t === p);
}

/** Строка выглядит как итог за день (только число без ₽ и без +), а не как операция */
function isDayTotalLine(text: string): boolean {
  const t = text.trim();
  if (!t || t.includes('₽') || t.includes('+') || t.includes('−')) return false;
  return /^\s*[\d\s]+[,.]?\d*\s*$/.test(t) && /\d/.test(t);
}

/**
 * Парсинг формата выписки: одна колонка, заголовки дат (Сегодня/Вчера/27 феврал),
 * затем строка с итогом за день (пропускаем), затем блоки «сумма ₽», контрагент, тип операции.
 */
function parseBankStatement(
  rows: unknown[][],
  operations: Array<Omit<FinanceOperation, 'id' | 'createdAt'>>,
  _errors: string[],
  today: Date
): void {
  let currentDate: string | null = null;
  let lastDescription = '';
  let pendingAmount: number | null = null;
  let skipNextIfDayTotal = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cell = getFirstCell(row);
    if (!cell) continue;

    if (skipNextIfDayTotal) {
      skipNextIfDayTotal = false;
      if (isDayTotalLine(cell)) continue;
    }

    const dateFromHeader = parseStatementDateHeader(cell, today);
    if (dateFromHeader) {
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
      currentDate = dateFromHeader;
      lastDescription = '';
      pendingAmount = null;
      skipNextIfDayTotal = true;
      continue;
    }

    const secondCell = getSecondCell(row);
    const amountWithCounterparty = parseAmountAndCounterparty(cell);
    const amount = amountWithCounterparty ? amountWithCounterparty.amount : parseAmountFromStatement(cell);
    const inlineCounterparty = amountWithCounterparty?.counterparty ?? '';
    const fromSecondCol = secondCell && !isStatementTypeLine(secondCell) && !isDayTotalLine(secondCell) ? secondCell : '';
    const useCounterparty = fromSecondCol || (inlineCounterparty && !isStatementTypeLine(inlineCounterparty) ? inlineCounterparty : '');

    if (amount !== null && amount !== 0 && currentDate) {
      const description = useCounterparty || lastDescription;
      if (description) {
        if (pendingAmount !== null) {
          operations.push({
            date: currentDate,
            amount: pendingAmount,
            description: lastDescription || 'Без описания',
            target: 'personal',
            articleId: null,
            raw: {},
          });
          pendingAmount = null;
        }
        operations.push({
          date: currentDate,
          amount,
          description,
          target: 'personal',
          articleId: null,
          raw: { row: i + 1 },
        });
        lastDescription = '';
      } else {
        if (pendingAmount !== null) {
          operations.push({
            date: currentDate,
            amount: pendingAmount,
            description: lastDescription || 'Без описания',
            target: 'personal',
            articleId: null,
            raw: {},
          });
        }
        pendingAmount = amount;
        lastDescription = '';
      }
      continue;
    }

    if (!isStatementAmountLine(cell) && !isStatementTypeLine(cell)) {
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
        const rows = XLSX.utils.sheet_to_json(firstSheet, {
          header: 1,
          defval: '',
        }) as unknown as unknown[][];

        if (rows.length < 2) {
          resolve({ operations: [], errors: ['Нужна хотя бы строка заголовков и одна строка данных'] });
          return;
        }

        const headers = rows[0].map((c) => normalizeString(c));
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

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const dateVal = normalizeDate(row[useDateCol], today);
          let amountVal = normalizeAmount(row[useAmountCol]);
          const counterparty = normalizeString(row[useDescCol] ?? '');
          const typeDesc = descCol >= 0 && descCol !== counterpartyCol ? normalizeString(row[descCol] ?? '') : '';

          if (!dateVal) {
            errors.push(`Строка ${i + 1}: не удалось определить дату`);
            continue;
          }
          if (amountVal === null || amountVal === 0) {
            errors.push(`Строка ${i + 1}: неверная сумма`);
            continue;
          }

          if (useCategoryCol >= 0) {
            const cat = normalizeString(row[useCategoryCol]).toLowerCase();
            if (cat === 'доход' && amountVal < 0) amountVal = Math.abs(amountVal);
            else if (cat === 'расход' && amountVal > 0) amountVal = -Math.abs(amountVal);
          }

          operations.push({
            date: dateVal,
            amount: amountVal,
            description: counterparty.trim() || 'Без описания',
            typeDescription: typeDesc || undefined,
            target: 'personal',
            articleId: null,
            raw: { row: i + 1, rawRow: row },
          });
        }

        if (operations.length === 0 && rows.length >= 2) {
          parseVertical(rows, operations, errors);
        }
        if (operations.length === 0 && rows.length >= 1) {
          const flattenedRows = flattenStatementRows(rows);
          parseBankStatement(flattenedRows, operations, errors, new Date());
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
