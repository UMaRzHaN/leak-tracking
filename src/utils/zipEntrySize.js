/**
 * Распакованный размер, который запись объявляет в заголовке.
 *
 * JSZip собирает 32-битное поле сдвигами, то есть как знаковое число: всё, что
 * от 2 ГБ, приходит отрицательным. Пока отрицательное считалось нулём, бомба с
 * честным заголовком в 2–4 ГБ проходила предварительную проверку как пустая —
 * её ловило только потоковое чтение, уже после того, как импорт начался.
 *
 * @param {any} entry запись JSZip
 * @returns {number}
 */
export function declaredEntrySize(entry) {
  const size = Number(entry?._data?.uncompressedSize);
  if (!Number.isSafeInteger(size)) return 0;
  if (size < 0) return size >= -0x80000000 ? size + 0x100000000 : 0;
  return size;
}
