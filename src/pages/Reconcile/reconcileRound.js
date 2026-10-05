/**
 * Сверка реестра (6b) — аналог обхода мониторинга. Номер и начало сверки
 * хранятся в проекте; сверенным считается компонент, осмотренный после её
 * начала. Отдельного списка «сверено» нет: отметка осмотра (`inspected_at`)
 * уже лежит в карточке и уходит в выгрузку инвентаризации.
 */
const key = (projectId) =>
  projectId ? `app:${projectId}:reconcile_round_v1` : null;

export function readReconcileRound(projectId) {
  const storageKey = key(projectId);
  if (!storageKey) return null;
  try {
    const round = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    return round?.startedAt && Number(round.number) > 0 ? round : null;
  } catch {
    return null;
  }
}

export function startReconcileRound(projectId, now = Date.now()) {
  const previous = readReconcileRound(projectId);
  const round = {
    number: (previous?.number ?? 0) + 1,
    startedAt: new Date(now).toISOString(),
  };
  const storageKey = key(projectId);
  if (storageKey) localStorage.setItem(storageKey, JSON.stringify(round));
  return round;
}

export function isReconciled(component, round) {
  if (!round) return false;
  const inspected = Date.parse(component?.inspected_at ?? "");
  return Number.isFinite(inspected) && inspected >= Date.parse(round.startedAt);
}
