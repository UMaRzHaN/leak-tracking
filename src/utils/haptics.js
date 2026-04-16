/** Короткий импульс — успех, сохранение */
export function hapticSuccess() {
  navigator.vibrate?.([40]);
}

/** Двойной импульс — удаление, предупреждение */
export function hapticWarning() {
  navigator.vibrate?.([30, 60, 30]);
}

/** Тройной — ошибка */
export function hapticError() {
  navigator.vibrate?.([50, 40, 50, 40, 50]);
}
