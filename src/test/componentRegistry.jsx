import { ComponentRegistryContext } from "@/features/componentRegistry/ComponentRegistryContext";

/**
 * Провайдер реестра для тестов, которые проверяют не реестр, а его читателя.
 *
 * Читателю всё равно, откуда взялся список, — поэтому здесь он просто
 * подставляется, без хранилища, без моста Capacitor и без ожиданий загрузки.
 * Сам провайдер проверяется отдельно, в ComponentRegistryContext.test.jsx.
 *
 * @param {Partial<{
 *   enabled: boolean, components: any[], loading: boolean, error: any,
 *   requestLoad: () => void, reload: () => void,
 *   persist: (recompute: (current: any[]) => any[], options?: any) => Promise<any[]>,
 * }>} [value]
 */
export function componentRegistryWrapper(value = {}) {
  const store = {
    enabled: true,
    components: [],
    loading: false,
    error: null,
    requestLoad: () => {},
    reload: () => {},
    persist: async (recompute) => recompute([]),
    ...value,
  };

  return function ComponentRegistryTestProvider({ children }) {
    return (
      <ComponentRegistryContext value={store}>
        {children}
      </ComponentRegistryContext>
    );
  };
}
