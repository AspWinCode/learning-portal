import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import {
  FinanceArticle,
  FinanceOperation,
  RecognitionRule,
  STORAGE_ARTICLES,
  STORAGE_OPERATIONS,
  STORAGE_RECOGNITION,
} from '../types/personalFinance';

function loadArticles(): FinanceArticle[] {
  try {
    const raw = localStorage.getItem(STORAGE_ARTICLES);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveArticles(articles: FinanceArticle[]) {
  localStorage.setItem(STORAGE_ARTICLES, JSON.stringify(articles));
}

function loadOperations(): FinanceOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_OPERATIONS);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveOperations(operations: FinanceOperation[]) {
  localStorage.setItem(STORAGE_OPERATIONS, JSON.stringify(operations));
}

function loadRecognition(): RecognitionRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_RECOGNITION);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveRecognition(rules: RecognitionRule[]) {
  localStorage.setItem(STORAGE_RECOGNITION, JSON.stringify(rules));
}

interface PersonalFinanceContextValue {
  articles: FinanceArticle[];
  operations: FinanceOperation[];
  addArticle: (article: Omit<FinanceArticle, 'id'>) => void;
  updateArticle: (id: string, patch: Partial<FinanceArticle>) => void;
  deleteArticle: (id: string) => void;
  deleteArticles: (ids: string[]) => void;
  addOperation: (op: Omit<FinanceOperation, 'id' | 'createdAt'>) => void;
  addOperations: (ops: Omit<FinanceOperation, 'id' | 'createdAt'>[]) => void;
  updateOperation: (id: string, patch: Partial<FinanceOperation>) => void;
  deleteOperation: (id: string) => void;
  incomeArticles: FinanceArticle[];
  expenseArticles: FinanceArticle[];
  recognitionRules: RecognitionRule[];
  addRecognitionRule: (rule: Omit<RecognitionRule, 'id'>) => void;
  updateRecognitionRule: (id: string, patch: Partial<Pick<RecognitionRule, 'pattern' | 'displayName'>>) => void;
  deleteRecognitionRule: (id: string) => void;
  getDisplayDescription: (description: string) => string;
}

const PersonalFinanceContext = createContext<PersonalFinanceContextValue | null>(null);

export const PersonalFinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [articles, setArticles] = useState<FinanceArticle[]>(loadArticles);
  const [operations, setOperations] = useState<FinanceOperation[]>(loadOperations);
  const [recognitionRules, setRecognitionRules] = useState<RecognitionRule[]>(loadRecognition);

  const persistArticles = useCallback((next: FinanceArticle[]) => {
    setArticles(next);
    saveArticles(next);
  }, []);

  const persistOperations = useCallback((next: FinanceOperation[]) => {
    setOperations(next);
    saveOperations(next);
  }, []);

  const addArticle = useCallback(
    (article: Omit<FinanceArticle, 'id'>) => {
      const id = `art_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const newArt: FinanceArticle = { ...article, id, order: articles.length };
      persistArticles([...articles, newArt]);
    },
    [articles, persistArticles]
  );

  const updateArticle = useCallback(
    (id: string, patch: Partial<FinanceArticle>) => {
      persistArticles(
        articles.map((a) => (a.id === id ? { ...a, ...patch } : a))
      );
    },
    [articles, persistArticles]
  );

  const deleteArticle = useCallback(
    (id: string) => {
      persistArticles(articles.filter((a) => a.id !== id));
    },
    [articles, persistArticles]
  );

  const deleteArticles = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      persistArticles(articles.filter((a) => !set.has(a.id)));
    },
    [articles, persistArticles]
  );

  const addOperation = useCallback(
    (op: Omit<FinanceOperation, 'id' | 'createdAt'>) => {
      const id = `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const createdAt = new Date().toISOString();
      persistOperations([...operations, { ...op, id, createdAt }]);
    },
    [operations, persistOperations]
  );

  const addOperations = useCallback(
    (ops: Omit<FinanceOperation, 'id' | 'createdAt'>[]) => {
      const now = new Date().toISOString();
      const newOps: FinanceOperation[] = ops.map((op, i) => ({
        ...op,
        id: `op_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}`,
        createdAt: now,
      }));
      persistOperations([...operations, ...newOps]);
    },
    [operations, persistOperations]
  );

  const updateOperation = useCallback(
    (id: string, patch: Partial<FinanceOperation>) => {
      persistOperations(
        operations.map((o) => (o.id === id ? { ...o, ...patch } : o))
      );
    },
    [operations, persistOperations]
  );

  const deleteOperation = useCallback(
    (id: string) => {
      persistOperations(operations.filter((o) => o.id !== id));
    },
    [operations, persistOperations]
  );

  const incomeArticles = useMemo(
    () => articles.filter((a) => a.type === 'income').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [articles]
  );
  const expenseArticles = useMemo(
    () => articles.filter((a) => a.type === 'expense').sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [articles]
  );

  const persistRecognition = useCallback((next: RecognitionRule[]) => {
    setRecognitionRules(next);
    saveRecognition(next);
  }, []);

  const addRecognitionRule = useCallback(
    (rule: Omit<RecognitionRule, 'id'>) => {
      const id = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      persistRecognition([...recognitionRules, { ...rule, id }]);
    },
    [recognitionRules, persistRecognition]
  );

  const updateRecognitionRule = useCallback(
    (id: string, patch: Partial<Pick<RecognitionRule, 'pattern' | 'displayName'>>) => {
      persistRecognition(
        recognitionRules.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    [recognitionRules, persistRecognition]
  );

  const deleteRecognitionRule = useCallback(
    (id: string) => {
      persistRecognition(recognitionRules.filter((r) => r.id !== id));
    },
    [recognitionRules, persistRecognition]
  );

  const getDisplayDescription = useCallback(
    (description: string) => {
      const trimmed = description.trim();
      if (!trimmed) return description;
      const matching = recognitionRules.filter(
        (r) => {
          const p = r.pattern.trim();
          return p && (trimmed === p || trimmed.includes(p));
        }
      );
      if (matching.length === 0) return description;
      const best = matching.reduce((a, b) => (a.pattern.length >= b.pattern.length ? a : b));
      return best.displayName;
    },
    [recognitionRules]
  );

  const value = useMemo<PersonalFinanceContextValue>(
    () => ({
      articles,
      operations,
      addArticle,
      updateArticle,
      deleteArticle,
      deleteArticles,
      addOperation,
      addOperations,
      updateOperation,
      deleteOperation,
      incomeArticles,
      expenseArticles,
      recognitionRules,
      addRecognitionRule,
      updateRecognitionRule,
      deleteRecognitionRule,
      getDisplayDescription,
    }),
    [
      articles,
      operations,
      addArticle,
      updateArticle,
      deleteArticle,
      deleteArticles,
      addOperation,
      addOperations,
      updateOperation,
      deleteOperation,
      incomeArticles,
      expenseArticles,
      recognitionRules,
      addRecognitionRule,
      updateRecognitionRule,
      deleteRecognitionRule,
      getDisplayDescription,
    ]
  );

  return (
    <PersonalFinanceContext.Provider value={value}>
      {children}
    </PersonalFinanceContext.Provider>
  );
};

export function usePersonalFinance() {
  const ctx = useContext(PersonalFinanceContext);
  if (!ctx) throw new Error('usePersonalFinance must be used within PersonalFinanceProvider');
  return ctx;
}
