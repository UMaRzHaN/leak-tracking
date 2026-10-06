import { distanceMeters } from "@/utils/geoUtils";
import { getLastMonitoringRecord, isMonitoringDue } from "@/utils/monitoring";

/**
 * Маршрут обхода: какие точки, в каком порядке и сколько уже пройдено.
 *
 * Навигация только внутри приложения (так в хэндоффе): маршрут — это порядок
 * обхода и прогресс по нему, а не прокладка дорог. Порядок строится жадно —
 * от текущего места к ближайшей непройденной точке. На сотне точек это
 * мгновенно и для куста скважин достаточно близко к оптимуму; точный обход
 * коммивояжёра здесь не окупился бы.
 */

function hasCoords(leak) {
  return (
    leak?.lat != null &&
    leak?.lng != null &&
    leak.lat !== "" &&
    leak.lng !== "" &&
    Number.isFinite(Number(leak.lat)) &&
    Number.isFinite(Number(leak.lng))
  );
}

/**
 * Точки маршрута — всё, что ещё к проверке в текущем обходе, и только то,
 * что можно поставить на карту. Мониторинг идёт по всем биркам, поэтому
 * статус утечки здесь не отбирает: проверяют и открытые, и в ремонте, и
 * устранённые. Без обхода «к проверке» — то, что не проверялось ни разу.
 */
export function routeCandidates(leaks, round = /** @type {any} */ (null)) {
  return (Array.isArray(leaks) ? leaks : []).filter(
    (leak) =>
      hasCoords(leak) &&
      isMonitoringDue(leak, round?.id ?? null, round?.number ?? null),
  );
}

/**
 * @param {any[]} points
 * @param {{lat:number,lng:number}|null} origin без GPS — от первой точки
 * @returns {{ stops: Array<{leak:any, legMeters:number}>, totalMeters:number }}
 */
export function planRoute(points, origin = null) {
  const left = [...points];
  const stops = [];
  let totalMeters = 0;
  let here =
    origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)
      ? origin
      : null;

  while (left.length) {
    let best = 0;
    let bestDistance = here
      ? distanceMeters(here.lat, here.lng, left[0].lat, left[0].lng)
      : 0;
    if (here) {
      for (let index = 1; index < left.length; index += 1) {
        const distance = distanceMeters(
          here.lat,
          here.lng,
          left[index].lat,
          left[index].lng,
        );
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      }
    }
    const [leak] = left.splice(best, 1);
    stops.push({ leak, legMeters: Math.round(bestDistance) });
    totalMeters += bestDistance;
    here = { lat: Number(leak.lat), lng: Number(leak.lng) };
  }

  return { stops, totalMeters: Math.round(totalMeters) };
}

/**
 * Точка пройдена, если её проверили после старта маршрута. Удалённая из
 * проекта точка тоже считается пройденной: идти к ней больше незачем.
 *
 * @param {{ ids: string[], startedAt: string }|null} route
 * @param {any[]} leaks
 */
export function routeProgress(route, leaks) {
  if (!route?.ids?.length) return null;
  const byId = new Map(
    (Array.isArray(leaks) ? leaks : []).map((leak) => [leak.id, leak]),
  );
  const started = Date.parse(route.startedAt);
  const isDone = (id) => {
    const leak = byId.get(id);
    if (!leak) return true;
    const last = getLastMonitoringRecord(leak);
    return Boolean(last && Date.parse(last.date ?? "") >= started);
  };
  const doneCount = route.ids.filter(isDone).length;
  const currentId = route.ids.find((id) => !isDone(id)) ?? null;
  return {
    total: route.ids.length,
    done: doneCount,
    left: route.ids.length - doneCount,
    current: currentId ? byId.get(currentId) : null,
    step: Math.min(doneCount + 1, route.ids.length),
    finished: currentId === null,
  };
}

const storageKey = (projectId) =>
  projectId ? `app:${projectId}:route_v1` : null;

export function readRoute(projectId) {
  const key = storageKey(projectId);
  if (!key) return null;
  try {
    const route = JSON.parse(localStorage.getItem(key) ?? "null");
    return Array.isArray(route?.ids) && route.startedAt ? route : null;
  } catch {
    return null;
  }
}

export function saveRoute(projectId, route) {
  const key = storageKey(projectId);
  if (!key) return;
  try {
    if (route) localStorage.setItem(key, JSON.stringify(route));
    else localStorage.removeItem(key);
  } catch {
    // Маршрут доживёт до перезапуска и без хранилища.
  }
}

/** «180 м», «1,6 км» — как подписи расстояний в макетах. */
export function formatDistance(meters, lang = "ru", units) {
  if (!Number.isFinite(meters)) return "";
  if (meters < 1000) return `${Math.round(meters)} ${units.m}`;
  const km = new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(
    meters / 1000,
  );
  return `${km} ${units.km}`;
}
