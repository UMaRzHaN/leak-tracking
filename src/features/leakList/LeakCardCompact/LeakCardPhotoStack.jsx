import s from "./LeakCardPhotoStack.module.scss";

/**
 * Снимки утечки стопкой: «до» спереди, дальше ремонт и устранение.
 *
 * Стопка — только когда снимков хотя бы два: один снимок карточка показывает
 * миниатюрой, и решает это она.
 *
 * @param {{
 *   pairs: {key: string, src: string, label: string}[],
 *   repair: boolean,
 *   onOpen: (event: import("react").MouseEvent) => void,
 * }} props
 */
export default function LeakCardPhotoStack({ pairs, repair, onOpen }) {
  return (
    <div
      className={`${s.photoStack} ${
        pairs.length >= 3 ? s.photoStackTriple : ""
      } ${repair ? s.photoStackRepair : ""}`}
      onClick={onOpen}
    >
      {pairs.map((pair, index) => {
        const isFront = index === 0;
        const isBack = index === pairs.length - 1;
        return (
          <div
            key={pair.label}
            className={`${s.photoStackItem} ${
              isFront
                ? s.photoStackFront
                : isBack
                  ? s.photoStackBack
                  : s.photoStackMiddle
            } ${s[`photoStack${pair.key}`] ?? ""}`}
          >
            <img
              src={pair.src}
              alt={pair.label}
              className={s.photoStackImg}
              loading="lazy"
              draggable={false}
            />
            <span
              className={isFront ? s.photoStackLabel : s.photoStackBackLabel}
            >
              {pair.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
