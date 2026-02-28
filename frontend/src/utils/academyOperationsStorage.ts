import { FinanceOperation, STORAGE_ACADEMY_OPERATIONS } from '../types/personalFinance';

export function loadAcademyOperations(): FinanceOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_ACADEMY_OPERATIONS);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function saveAcademyOperations(ops: FinanceOperation[]): void {
  localStorage.setItem(STORAGE_ACADEMY_OPERATIONS, JSON.stringify(ops));
}

export function addAcademyOperation(op: FinanceOperation): void {
  const list = loadAcademyOperations();
  saveAcademyOperations([...list, op]);
}

export function removeAcademyOperation(id: string): void {
  const list = loadAcademyOperations().filter((o) => o.id !== id);
  saveAcademyOperations(list);
}
