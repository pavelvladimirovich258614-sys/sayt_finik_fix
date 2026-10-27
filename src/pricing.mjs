// Акция «два аналога — скидка 15%». Одна формула для сервера, клиента (дублируется в app.js) и тестов.
export const PAIR_DISCOUNT = 0.15;
/** Итого = (цена первого + цена второго) × 0,85, округление до рубля. */
export function pairTotal(first, second) {
  const sum = first + second;
  const total = Math.round(sum * (1 - PAIR_DISCOUNT));
  return { sum, total, discount: sum - total };
}
