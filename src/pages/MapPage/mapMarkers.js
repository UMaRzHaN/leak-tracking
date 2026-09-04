import L from "leaflet";
import i18n from "@/i18n";
import { STATUS_META, getStatusMeta } from "@/utils/status";

/**
 * Как выглядит точка на карте: значок, всплывающее окно, круг точности и вес
 * в тепловой подложке.
 *
 * Отделено от самой карты: здесь решают, что показать про запись, а там — как
 * устроен слой, кэш плиток и их выгрузка. Вопросы разной природы, и правка
 * подписи не должна вести в модуль про жизненный цикл плиток.
 */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COMPONENT_MARKER_COLOR = "#0ea5e9";

export function isComponentMarker(item) {
  return item?.kind === "component";
}

/**
 * Осмотренная в текущем обходе точка гаснет.
 *
 * Работа обхода — не найденное, а пройденное: карта должна отвечать на вопрос
 * «где ещё не были», а он читается только тогда, когда осмотренное перестаёт
 * спорить за внимание с неосмотренным. Поэтому пройденная булавка теряет
 * заливку и бледнеет, а не меняет цвет: цвет здесь занят статусом утечки, и
 * второй смысл на него не навесить.
 *
 * Признака нет вовсе, пока обход не заведён: тогда «не осмотрено» значило бы
 * «никогда не проверялось» — другой вопрос, и отвечать на него видом булавки
 * было бы подменой.
 */
export function leakIcon(leak) {
  const meta = isComponentMarker(leak)
    ? { color: COMPONENT_MARKER_COLOR }
    : (STATUS_META[leak.status] ?? STATUS_META.open);
  const safeLabel = escapeHtml(leak.leak_id ?? `#${leak.id}`);
  const checked = leak?._checkedInRound === true;
  const dotStyle = checked
    ? `background:transparent;border:2px solid ${meta.color};opacity:0.55;`
    : `background:${meta.color};border:2px solid #fff;`;

  // Ненадёжная точка носит пунктирное кольцо — «где-то здесь». Отдельная ось
  // от покрытия обхода: то гасит булавку целиком, это добавляет ей ободок, и
  // две пометки на одной точке не спорят и читаются обе.
  const accuracy = accuracyMetres(leak);
  const poorAccuracy = accuracy != null && accuracy > POOR_ACCURACY_METRES;
  const halo = poorAccuracy
    ? `<div style="
        position:absolute;left:50%;top:50%;width:21px;height:21px;
        transform:translate(-50%,-50%);border-radius:50%;
        border:1px dashed ${meta.color};opacity:0.75;pointer-events:none;
      "></div>`
    : "";

  return L.divIcon({
    className: "",
    html: `<div style="display:flex;align-items:center;gap:3px;white-space:nowrap;${
      checked ? "opacity:0.6;" : ""
    }">
      <div style="position:relative;width:11px;height:11px;flex-shrink:0;">
        ${halo}
        <div style="
        width:11px;height:11px;border-radius:50%;
        ${dotStyle}
        box-shadow:0 1px 5px rgba(0,0,0,0.5);
      "></div>
      </div>
      <div style="
        background:rgba(15,23,42,0.72);color:#fff;
        font-size:10px;font-weight:700;line-height:1;
        padding:2px 5px;border-radius:8px;
        backdrop-filter:blur(3px);
        max-width:72px;overflow:hidden;text-overflow:ellipsis;
        border:1px solid rgba(255,255,255,0.18);
      ">${safeLabel}</div>
    </div>`,
    iconSize: undefined,
    iconAnchor: [5, 5],
    popupAnchor: [20, -6],
  });
}

/** Радиус приёмника в метрах, если он записан и осмыслен. */
export function accuracyMetres(record) {
  const value = Number(record?.coords_accuracy);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : null;
}

/**
 * С какого радиуса точка перестаёт указывать на железо.
 *
 * Двадцать пять метров — это расстояние, на котором соседние аппараты уже не
 * различить: пришедший по такой точке окажется у другого узла и будет искать
 * бирку глазами. До десяти метров приёмник даёт в чистом поле, двадцать-сорок
 * — под эстакадой и у металла, и разница между этими случаями и есть то, что
 * кольцо показывает.
 *
 * Число не измерено, а выбрано по этому рассуждению и подтверждено владельцем
 * проекта — это решение, а не заглушка. Пересматривать его стоит от практики
 * съёмки на объекте: если годным для отчёта считается другой радиус, правится
 * одна эта строка, и метка перестроится сама.
 */
const POOR_ACCURACY_METRES = 25;

export function createPopupEl(leak) {
  const labels = {
    tag: i18n.t("map.popup.tag"),
    component: i18n.t("map.popup.component"),
    description: i18n.t("map.popup.description"),
    status: i18n.t("map.popup.status"),
  };
  const el = document.createElement("div");
  const component = isComponentMarker(leak);

  const title = document.createElement("b");
  title.textContent = component
    ? `${i18n.t("map.popup.componentTag")} ${leak.leak_id ?? ""}`
    : `${labels.tag} ${leak.leak_id ?? ""}`;
  el.appendChild(title);

  const fields = component
    ? [
        [labels.component, leak.component],
        [i18n.t("map.popup.schemeTag"), leak.scheme_tag],
        [labels.status, leak.component_status],
      ]
    : [
        [labels.component, leak.component],
        [labels.description, leak.leak_description],
        [labels.status, getStatusMeta(leak.status, i18n.t.bind(i18n)).label],
      ];

  for (const [label, value] of fields) {
    el.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = `${label}: ${value ?? ""}`;
    el.appendChild(span);
  }

  if (typeof leak?._checkedInRound === "boolean") {
    el.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = `${i18n.t("map.popup.round")}: ${i18n.t(
      leak._checkedInRound ? "map.popup.checked" : "map.popup.due",
    )}`;
    el.appendChild(span);
  }

  const accuracy = accuracyMetres(leak);
  if (accuracy != null) {
    el.appendChild(document.createElement("br"));
    const span = document.createElement("span");
    span.textContent = `${i18n.t("map.popup.accuracy")}: ${i18n.t(
      "map.popup.accuracyValue",
      { count: accuracy },
    )}`;
    el.appendChild(span);
  }

  return el;
}

/**
 * Круг погрешности рисуется только у раскрытой точки.
 *
 * Круг у каждой точки объект с сотнями записей превращает в кашу из
 * перекрывающихся окружностей, где не видно ни одной. А вопрос про точность
 * возникает не про все точки разом, а про ту, на которую сейчас смотрят, —
 * поэтому круг живёт ровно столько, сколько открыт её пузырёк.
 */
const ACCURACY_CIRCLE = "_accuracyCircle";
const ACCURACY_CIRCLE_OWNER = "_accuracyCircleOwner";

/**
 * Круг снимается вместе с тем пузырьком, который его завёл.
 *
 * `owner` не перестраховка: при переходе с точки на точку Leaflet закрывает
 * прежний пузырёк и открывает следующий, и стоит порядку этих двух событий
 * оказаться обратным — снятие пришло бы уже на чужой круг и стёрло бы только
 * что нарисованный. Проверка владельца делает порядок безразличным.
 */
export function clearAccuracyCircle(map, owner = undefined) {
  const circle = map?.[ACCURACY_CIRCLE];
  if (!circle) return;
  if (owner !== undefined && map[ACCURACY_CIRCLE_OWNER] !== owner) return;
  map.removeLayer(circle);
  map[ACCURACY_CIRCLE] = null;
  map[ACCURACY_CIRCLE_OWNER] = null;
}

export function showAccuracyCircle(map, latlng, metres, owner) {
  if (!map) return;
  clearAccuracyCircle(map);
  map[ACCURACY_CIRCLE_OWNER] = owner;
  map[ACCURACY_CIRCLE] = L.circle(latlng, {
    radius: metres,
    // Нейтральный синий, а не цвет статуса: круг говорит про измерение, а не
    // про то, открыта утечка или устранена.
    color: "#1a73e8",
    weight: 1,
    opacity: 0.7,
    fillColor: "#1a73e8",
    fillOpacity: 0.08,
    interactive: false,
  }).addTo(map);
}

const HEAT_PRIORITY_WEIGHT = {
  critical: 1,
  high: 0.78,
  medium: 0.48,
  low: 0.3,
};

export function heatWeight(leak) {
  const speed = Number(leak.leak_speed ?? leak.emission_rate);
  if (Number.isFinite(speed) && speed > 0) {
    return Math.min(1, Math.max(0.24, Math.log10(speed + 1) / 3));
  }
  return HEAT_PRIORITY_WEIGHT[leak.priority] ?? 0.34;
}
