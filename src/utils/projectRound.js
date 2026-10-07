/**
 * Обход по номерам вне мониторинга — сверка реестра и обход ремонтов. Номер,
 * начало и завершение хранятся в проекте; что считать сделанным в обходе,
 * решает его владелец по дате начала. Предыдущий обход хранится рядом —
 * ошибочно начатый можно влить обратно; глубже объединять незачем.
 *
 * @param {string} name часть ключа хранения: `reconcile_round_v1`…
 */
export function createProjectRound(name) {
  const key = (projectId) => (projectId ? `app:${projectId}:${name}` : null);

  function read(projectId) {
    const storageKey = key(projectId);
    if (!storageKey) return null;
    try {
      const round = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      return round?.startedAt && Number(round.number) > 0 ? round : null;
    } catch {
      return null;
    }
  }

  function write(projectId, round) {
    const storageKey = key(projectId);
    if (storageKey) localStorage.setItem(storageKey, JSON.stringify(round));
  }

  function start(projectId, now = Date.now()) {
    const previous = read(projectId);
    const round = {
      number: (previous?.number ?? 0) + 1,
      startedAt: new Date(now).toISOString(),
      ...(previous ? { previous: withoutPrevious(previous) } : {}),
    };
    write(projectId, round);
    return round;
  }

  /** Обход завершён: новый можно начать, текущий остаётся в истории. */
  function finish(projectId, now = Date.now()) {
    const current = read(projectId);
    if (!current || current.completedAt) return current;
    const round = { ...current, completedAt: new Date(now).toISOString() };
    write(projectId, round);
    return round;
  }

  /**
   * «Новый обход» начали по ошибке — продолжить предыдущий. Записи никуда не
   * переносятся: сделанным считается сделанное после начала обхода, и всё из
   * ошибочного попадает в предыдущий само.
   *
   * @returns {{number: number, startedAt: string}|null} null — сливать не с чем
   */
  function merge(projectId) {
    const current = read(projectId);
    const previous = current?.previous;
    if (!previous?.startedAt || current.completedAt) return null;
    const round = { number: previous.number, startedAt: previous.startedAt };
    write(projectId, round);
    return round;
  }

  return { read, start, finish, merge };
}

function withoutPrevious(round) {
  return {
    number: round.number,
    startedAt: round.startedAt,
    ...(round.completedAt ? { completedAt: round.completedAt } : {}),
  };
}

/** Было ли событие (ISO-дата) после начала обхода. */
export function isInRound(date, round) {
  if (!round || !date) return false;
  const time = Date.parse(String(date));
  return Number.isFinite(time) && time >= Date.parse(round.startedAt);
}
