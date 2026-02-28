/** Статья: доход или расход */
export type FinanceArticleType = 'income' | 'expense';

export interface FinanceArticle {
  id: string;
  name: string;
  type: FinanceArticleType;
  order?: number;
}

/** Направление операции: счёт академии или личная */
export type OperationTarget = 'academy' | 'personal';

export interface FinanceOperation {
  id: string;
  /** Дата в формате YYYY-MM-DD */
  date: string;
  /** Сумма: положительная = доход, отрицательная = расход */
  amount: number;
  description: string;
  /** На счёт академии или личная операция */
  target: OperationTarget;
  /** ID статьи (доход/расход); null = не распределено */
  articleId: string | null;
  /** Исходные данные из импорта (для отображения) */
  raw?: Record<string, unknown>;
  createdAt: string;
}

export const STORAGE_ARTICLES = 'personal_finance_articles';
export const STORAGE_OPERATIONS = 'personal_finance_operations';
