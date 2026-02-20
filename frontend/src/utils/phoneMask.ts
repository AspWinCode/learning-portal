/** Из строки оставляем только цифры; для номера РФ — 10 цифр (после 7/8). */
export function getPhoneDigits(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length >= 11 && (digits[0] === '7' || digits[0] === '8')) {
    return digits.slice(1, 11);
  }
  return digits.slice(0, 10);
}

/** Формат отображения: +7(XXX) XXX-XX-XX */
export function formatPhoneDisplay(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length <= 3) return '+7' + (d.length ? '(' + d : '');
  if (d.length <= 6) return '+7(' + d.slice(0, 3) + ') ' + d.slice(3);
  return '+7(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6, 8) + '-' + d.slice(8, 10);
}

/** Из ввода пользователя получаем отображаемую строку с маской. */
export function applyPhoneMask(input: string): string {
  return formatPhoneDisplay(getPhoneDigits(input));
}

/** Валидация: ровно 10 цифр (российский номер). */
export function isValidPhone(displayOrDigits: string): boolean {
  const digits = getPhoneDigits(displayOrDigits);
  return digits.length === 10;
}

/** Для отправки на API: нормализованный вид 7XXXXXXXXXX */
export function phoneToApiValue(displayOrDigits: string): string {
  const digits = getPhoneDigits(displayOrDigits);
  return digits.length === 10 ? '7' + digits : '';
}

/** Из значения с бэкенда (7XXXXXXXXXX или +7(...)) — в отображаемую маску. */
export function phoneFromApi(apiValue: string | null | undefined): string {
  if (!apiValue) return '';
  return formatPhoneDisplay(getPhoneDigits(apiValue));
}
