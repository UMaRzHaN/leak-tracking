export async function handleExport({ leaks, saveFn, onSuccess, onError }) {
  try {
    if (!leaks.length) {
      onError?.("Нет данных для экспорта");
      return;
    }

    if (!saveFn) {
      onError?.("Экспорт недоступен для этого проекта");
      return;
    }

    const result = await saveFn();
    onSuccess?.(result);
  } catch (e) {
    console.error(e);
    onError?.("Ошибка экспорта");
  }
}
