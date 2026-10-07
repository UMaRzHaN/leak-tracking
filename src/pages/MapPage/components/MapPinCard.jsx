import MapComponentCard from "./MapComponentCard";
import MapLeakCard from "./MapLeakCard";
import { canWriteRegistry } from "@/domain/componentHistory";
import { MODULE } from "@/app/modules/activeModule";
import { STATUS } from "@/utils/status";

/**
 * Карточка булавки снизу (5d): у компонента — своя, у утечки — своя, с тем
 * действием, которое значит «проверить» в этом модуле.
 */
export default function MapPinCard({
  pin,
  coords,
  module,
  userProfile,
  onMonitor,
  onReconcile,
  onOpenLeak,
  onOpenComponent,
}) {
  if (pin.kind === "component") {
    return (
      <MapComponentCard
        component={pin}
        coords={coords}
        // «Сверить» — как «Проверить» в мониторинге: осмотр идёт на экране
        // сверки по его правилам, а потом приложение возвращает на карту.
        onCheck={canWriteRegistry(userProfile) ? onReconcile : null}
        onOpen={onOpenComponent}
      />
    );
  }

  return (
    <MapLeakCard
      leak={pin}
      coords={coords}
      // «Проверить» — в мониторинге осмотр, в ремонтах проверка ремонта
      // (куда ведёт, решает приложение). Принятый ремонт проверять нечем.
      onMonitor={
        module === MODULE.MONITORING ||
        (module === MODULE.REPAIRS &&
          (pin.status ?? STATUS.OPEN) !== STATUS.RESOLVED)
          ? onMonitor
          : null
      }
      onOpen={onOpenLeak}
    />
  );
}
