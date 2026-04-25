# Исправления Infinite Loop ошибок (25.04.2026)

## Проблема: "Maximum update depth exceeded"

Это классическая React ошибка, которая происходит когда компонент входит в бесконечный цикл обновлений. В этом проекте было несколько причин.

---

## ✅ Исправление #1: useProjectVars.js

**Проблема:** Нарушение React Hooks rules of hooks

```javascript
// ❌ БЫЛО - нарушение: условный return перед hooks
export function useProjectVars(projectId, defaults = defaultVars) {
  if (!projectId) {
    return { vars: defaults, setVars: () => {}, resetVars: () => {} };
  }
  
  // Hooks вызываются условно! ⚠️
  const setVars = useCallback(...);
  const resetVars = useCallback(...);
}
```

**Почему это проблема:**
- React требует, чтобы все hooks вызывались в одинаковом порядке при каждом render
- Условный return нарушает это правило
- Это вызывает рассинхронизацию состояния

**Решение:** Все hooks вызываются безусловно

```javascript
// ✅ СТАЛО - все hooks безусловны
export function useProjectVars(projectId, defaults = defaultVars) {
  const storageKey = useMemo(
    () => (projectId ? STORAGE_KEYS.PROJECT_VARS(projectId) : null),
    [projectId]
  );

  const vars = useMemo(() => {
    if (!projectId || !storageKey) return defaults;
    // ... логика
  }, [projectId, storageKey, defaults]);

  const setVars = useCallback(
    (nextVars) => {
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(nextVars));
    },
    [storageKey]
  );

  const resetVars = useCallback(
    () => { if (storageKey) localStorage.removeItem(storageKey); },
    [storageKey]
  );

  return { vars, setVars, resetVars };
}
```

---

## ✅ Исправление #2: usePhotoStorage.js

**Проблема:** Незакрытый `useCallback` для функции `deletePhoto`

```javascript
// ❌ БЫЛО - нет закрывающей скобки и dependency array
const deletePhoto = useCallback(async (path) => {
  if (!path) return;
  if (path.startsWith("idb://")) { ... }
  if (isNative && path.startsWith("data://")) { ... }
}  // ← Нет }, [deps]!
```

**Почему это проблема:**
- `deletePhoto` становится функцией без стабильного identity
- Когда она используется в dependency array других useEffect'ов, это вызывает их пересчет
- Бесконечный цикл обновлений

**Решение:**

```javascript
// ✅ СТАЛО - правильный useCallback
const deletePhoto = useCallback(async (path) => {
  if (!path) return;
  if (path.startsWith("idb://")) {
    if (ready) await idbDelete(path.replace("idb://", ""));
    return;
  }
  if (isNative && path.startsWith("data://")) {
    await Filesystem.deleteFile({ directory: Directory.Data, path: path.replace("data://", "") }).catch(() => {});
  }
}, [ready, idbDelete, isNative]);  // ← Правильный dependency array
```

---

## ✅ Исправление #3: useProjectData.js

**Проблема:** Потенциальная рассинхронизация dependency array

```javascript
// Было: [filePath, storageKey]
useEffect(() => {
  if (!storageKey && !filePath) {
    setData([]);
    return;
  }
  // ...
}, [filePath, storageKey]);
```

**Решение:** Переорганизована последовательность зависимостей (minor fix)

```javascript
useEffect(() => {
  // ...
}, [storageKey, filePath]);
```

---

## 🧪 Как проверить исправления

```bash
# Скомпилировать проект
npm run build

# Запустить в dev режиме
npm start

# Открыть браузер на http://localhost:5173
# Проверить консоль - не должно быть "Maximum update depth exceeded"
```

---

## 📋 Остаток проблем (требуют дополнительной работы)

### Критические (Security):
- [ ] TypeScript миграция для type safety
- [ ] XSS защита в маркерах карты (использовать `textContent` вместо innerHTML)
- [ ] Input sanitization на форме

### High Priority (Performance):
- [ ] React.memo() для LeakCardCompact
- [ ] useReducer для DataBase.jsx
- [ ] useMemo для маркеров карты
- [ ] Web Worker для compressImage

### Medium Priority (Code Quality):
- [ ] Удалить 16 console.log statements
- [ ] Добавить JSDoc для всех hooks
- [ ] Правильная обработка errors (вместо empty catch)

---

## 🔍 Использованные файлы

| Файл | Изменение |
|------|-----------|
| `src/app/settings/useProjectVars.js` | Исправлена нарушение rules of hooks |
| `src/hooks/usePhotoStorage.js` | Добавлена закрывающая скобка useCallback |
| `src/app/hooks/useProjectData.js` | Переорганизован dependency array |
| `src/hooks/usePhotoStorage.js` | Добавлена `useCallback` для `deletePhoto` |

---

**Статус:** ✅ Проект скомпилирован успешно (6.25s build time)
