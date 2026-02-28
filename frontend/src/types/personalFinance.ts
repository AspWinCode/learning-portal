/** Статья: доход или расход */
export type FinanceArticleType = 'income' | 'expense';

export interface FinanceArticle {
  id: string;
  name: string;
  type: FinanceArticleType;
  order?: number;
}

/** Направление операции: куда относится операция */
export type OperationTarget = 'academy' | 'personal' | 'gogol_mogol' | 'leninets';

export const OPERATION_TARGET_LABELS: Record<OperationTarget, string> = {
  personal: 'Личная',
  academy: 'Счёт академии',
  gogol_mogol: 'Гоголь Моголь',
  leninets: 'Ленинец',
};

export interface FinanceOperation {
  id: string;
  /** Дата в формате YYYY-MM-DD */
  date: string;
  /** Сумма: положительная = доход, отрицательная = расход */
  amount: number;
  /** Контрагент (название из выписки или распознанное) */
  description: string;
  /** Тип операции из выписки (Оплата товаров и услуг, Входящий перевод и т.д.) */
  typeDescription?: string;
  /** На счёт академии или личная операция */
  target: OperationTarget;
  /** ID статьи (доход/расход); null = не распределено */
  articleId: string | null;
  /** Исходные данные из импорта (для отображения) */
  raw?: Record<string, unknown>;
  createdAt: string;
}

/** Правило опознавания: если в операции описание совпадает с pattern — показывать как displayName */
export interface RecognitionRule {
  id: string;
  /** Точное совпадение или подстрока в описании операции */
  pattern: string;
  /** Как отображать в списке операций */
  displayName: string;
}

export const STORAGE_ARTICLES = 'personal_finance_articles';
export const STORAGE_OPERATIONS = 'personal_finance_operations';
export const STORAGE_RECOGNITION = 'personal_finance_recognition';
