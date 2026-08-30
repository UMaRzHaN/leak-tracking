import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { hasComponentRegistry } from "@/configs/componentRegistry.config";
import { useProjectData } from "@/app/project/ProjectContext";
import { onComponentRegistryChanged } from "@/repositories/componentRegistrySignal";
import { liveComponents } from "@/domain/componentTombstones";
import { logger } from "@/utils/logger";

/**
 * Реестр компонентов активного проекта — один список на всё приложение.
 *
 * Читателей у реестра четверо: экран реестра, выбор места в шапке, пины на
 * карте и выбор карточки в форме утечки. Каждый читал хранилище сам, и на
 * upstream это значило два одновременных чтения одного и того же при открытии
 * экрана — а после сохранения карточки шапка перечитывала с диска весь обход
 * целиком. Расходились они тоже сами по себе: список, прочитанный раньше,
 * оставался прежним, пока экран не пересоздадут.
 *
 * Здесь список читается один раз на проект и живёт, пока проект не сменится.
 *
 * Загрузка идёт по требованию, а не при старте: проект без реестра не должен
 * платить ничего, а карта на большинстве сессий про утечки. Первый читатель,
 * которому список действительно нужен, зовёт `requestLoad`; остальные получают
 * уже прочитанное.
 */

const EMPTY = /** @type {any[]} */ (/** @type {unknown} */ (Object.freeze([])));
const NOTHING_SETTLED = -1;

/**
 * Экспортирован ради тестов читателей: карту, шапку и лист выбора проверяют
 * на подставленном списке, не поднимая ни хранилища, ни провайдера — их
 * поведение от того, откуда пришёл список, не зависит.
 */
/** @type {import("react").Context<any>} */
export const ComponentRegistryContext = createContext(null);

/**
 * `ComponentRepository` тянет за собой мост Capacitor, а провайдер стоит в
 * стартовом графе, где запас до предела сборки — несколько килобайт. Поэтому
 * он читается по требованию, а не импортом.
 */
function loadRepository() {
  return import("@/repositories/ComponentRepository").then(
    (module) => module.ComponentRepository,
  );
}

export function ComponentRegistryProvider({ children }) {
  // Активный проект берётся здесь, а не приходит свойством: провайдер стоит
  // выше App, а второй ответ на вопрос «какой проект сейчас» разошёлся бы с
  // первым ровно в момент переключения.
  const { activeProject: project } = useProjectData();
  const enabled = Boolean(project?.id) && hasComponentRegistry(project);
  const projectId = project?.id ?? null;

  // Полный список — с надгробиями удалённых карточек. Наружу они не выходят,
  // но в хранилище лежат и ездят между устройствами: без них удаление не
  // переживает ни одного обмена. См. componentTombstones.
  const [stored, setStored] = useState(EMPTY);
  const [error, setError] = useState(/** @type {any} */ (null));
  const [revision, setRevision] = useState(0);
  const [requested, setRequested] = useState(false);
  // Какое поколение чтения уже отработало. Отсюда `loading` считается, а не
  // хранится: иначе между «список попросили» и «эффект успел выставить флаг»
  // остаётся кадр, в котором загрузки как бы нет, а списка ещё нет, — и
  // читатель успевает принять пустоту за ответ.
  const [settledRevision, setSettledRevision] = useState(NOTHING_SETTLED);
  const loading = requested && settledRevision !== revision;

  /** @type {import("react").MutableRefObject<Promise<any>>} */
  const writeQueueRef = useRef(Promise.resolve(EMPTY));
  // Мутации читают этот список, а не состояние: запись, начатая до
  // ре-рендера, должна строиться на том, из чего её посчитали.
  const latestRef = useRef(EMPTY);
  // Номер поколения: ответ по прежнему проекту не должен подменить нынешний
  // список, а запись, начатая до переключения, — вернуть его на экран.
  const generationRef = useRef(0);

  // Другой проект — другой реестр. Список сбрасывается сразу, а не когда
  // приедет новый: показать чужие карточки хуже, чем не показать никаких.
  //
  // Первый проход пропускается, и не ради экономии: эффекты детей выполняются
  // раньше родительских, так что читатель успевает попросить список до того,
  // как сюда дойдёт очередь, — и сброс на монтировании стирал бы эту просьбу,
  // оставляя реестр непрочитанным навсегда.
  const knownProjectRef = useRef(`${projectId}:${enabled}`);
  useEffect(() => {
    const key = `${projectId}:${enabled}`;
    if (knownProjectRef.current === key) return;
    knownProjectRef.current = key;

    generationRef.current += 1;
    latestRef.current = EMPTY;
    writeQueueRef.current = Promise.resolve(EMPTY);
    setStored(EMPTY);
    setError(null);
    setRequested(false);
    setSettledRevision(NOTHING_SETTLED);
  }, [projectId, enabled]);

  const requestLoad = useCallback(() => setRequested(true), []);
  const reload = useCallback(() => setRevision((value) => value + 1), []);

  // Перечитать после чужой записи можно только то, что кто-то читает: пока
  // никто не просил список, `reload` лишь двигает счётчик, и импорт в
  // неоткрытый реестр не поднимает весь обход с диска впустую.
  useEffect(() => onComponentRegistryChanged(reload), [reload]);

  useEffect(() => {
    if (!enabled || !requested) return undefined;

    const generation = ++generationRef.current;
    let cancelled = false;
    setError(null);

    loadRepository()
      .then((repository) => repository.load(project))
      .then((loaded) => {
        if (cancelled || generation !== generationRef.current) return;
        latestRef.current = loaded;
        setStored(loaded);
      })
      .catch((loadError) => {
        if (cancelled || generation !== generationRef.current) return;
        logger.error("[components] registry load failed:", loadError);
        setError(loadError);
      })
      .finally(() => {
        if (!cancelled && generation === generationRef.current) {
          setSettledRevision(revision);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, project, requested, revision]);

  /**
   * Ставит запись в очередь, считая следующий список **внутри** очереди.
   *
   * Пересчёт не должен идти в момент вызова: две карточки, сохранённые подряд
   * — а обход так и идёт, — обе посчитались бы от одного и того же списка, и
   * вторая замена целиком молча потеряла бы первую.
   */
  const persist = useCallback(
    (recompute, { numericKeys = [] } = {}) => {
      if (!enabled) return Promise.resolve(EMPTY);

      const generation = generationRef.current;
      const run = writeQueueRef.current.then(async () => {
        const repository = await loadRepository();
        const previous = latestRef.current;
        const written = await repository.save(project, recompute(previous), {
          numericKeys,
          // Что, по мнению приложения, уже лежит в хранилище. С этим одна
          // исправленная карточка стоит одной строки, а не переписывания
          // всего обхода — на телефоне, под открытым небом, посреди обхода.
          previous,
        });
        // Проект успели переключить: записать в прежний было правильно, а
        // показать записанное — уже нет.
        if (generation !== generationRef.current) return written;
        latestRef.current = written;
        setStored(written);
        return written;
      });

      // Пустой намеренно: `run` возвращается вызывающему, и об ошибке
      // сообщает он. Эта ветка только не даёт одной неудачной записи
      // заклинить все последующие.
      // eslint-disable-next-line no-restricted-syntax
      writeQueueRef.current = run.catch(() => {});
      return run;
    },
    [enabled, project],
  );

  // Наружу — только карточки. Надгробие не показывают, не считают в папках, не
  // выгружают в книгу и не сличают по номерам: это запись о том, чего нет.
  const components = useMemo(() => liveComponents(stored), [stored]);

  const value = useMemo(
    () => ({
      enabled,
      components,
      loading,
      error,
      requestLoad,
      reload,
      persist,
    }),
    [components, enabled, error, loading, persist, reload, requestLoad],
  );

  return (
    <ComponentRegistryContext value={value}>
      {children}
    </ComponentRegistryContext>
  );
}

/**
 * Список реестра и запись в него.
 *
 * `active` — нужен ли список этому читателю прямо сейчас. Пока никто не
 * попросил, хранилище не читается вовсе; попросивший получает уже прочитанное,
 * если кто-то попросил раньше.
 *
 * @param {{active?: boolean}} [options]
 */
export function useComponentRegistryStore({ active = true } = {}) {
  const store = use(ComponentRegistryContext);
  if (!store) {
    throw new Error(
      "useComponentRegistryStore requires a ComponentRegistryProvider",
    );
  }

  const { enabled, requestLoad } = store;
  useEffect(() => {
    if (active && enabled) requestLoad();
  }, [active, enabled, requestLoad]);

  return store;
}
