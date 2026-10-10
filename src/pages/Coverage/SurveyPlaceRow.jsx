import { useLanguage } from "@/app/hooks/useLanguage";
import { placeLabel, samePlace } from "@/domain/surveyGroups";
import s from "./SurveyPlace.module.scss";

/**
 * Место раскрытой группы обследования. Группу без места или из другого места
 * можно привязать к выбранному в шапке, привязанную — вернуть на весь проект.
 *
 * @param {{
 *   place?: string[],
 *   here: string[]|null,
 *   onChange: (place: string[]|undefined) => void,
 * }} props
 */
export default function SurveyPlaceRow({ place, here, onChange }) {
  const { t } = useLanguage();
  let action = /** @type {import("react").ReactNode} */ (null);
  if (here && !samePlace(place, here)) {
    action = (
      <button type="button" onClick={() => onChange(here)}>
        {t("coverage.bindHere", { place: placeLabel(here) })}
      </button>
    );
  } else if (place) {
    action = (
      <button type="button" onClick={() => onChange(undefined)}>
        {t("coverage.unbind")}
      </button>
    );
  }
  return (
    <div className={s.placeRow}>
      <small>{place ? placeLabel(place) : t("coverage.wholeProject")}</small>
      {action}
    </div>
  );
}
