import { lazy, Suspense } from "react";
import { deleteLeakPhotosIfUnreferenced } from "@/domain/leakLifecycle";
import { usePhotoStorage } from "@/hooks/usePhotoStorage";
import { ignoredError } from "@/utils/ignoredError";

const LeakDetailsSheet = lazy(
  () => import("@/features/leakDetails/LeakDetailsSheet"),
);

/**
 * Карточка утечки из обхода ремонтов — по свайпу вправо, как в мониторинге.
 * Сохранение и удаление те же, что там: правка уходит в данные проекта, а
 * снимки удалённой записи убираются, если на них больше никто не ссылается.
 */
export default function RepairLeakDetails({
  leak,
  data,
  setData,
  userProfile,
  onChange,
}) {
  const { deletePhoto } = usePhotoStorage();
  if (!leak) return null;

  const save = async (nextLeak, options) => {
    await setData(
      data.map((item) => (item.id === nextLeak.id ? nextLeak : item)),
      options,
    );
    onChange(nextLeak);
  };

  const remove = async (id) => {
    const target = data.find((item) => item.id === id);
    const next = data.filter((item) => item.id !== id);
    await setData(next);
    onChange(null);
    await deleteLeakPhotosIfUnreferenced(target, next, deletePhoto).catch(
      ignoredError("repairs.photoCleanup"),
    );
  };

  return (
    <Suspense fallback={null}>
      <LeakDetailsSheet
        leak={leak}
        allLeaks={data}
        onClose={() => onChange(null)}
        onSave={save}
        onDelete={remove}
        userProfile={userProfile}
      />
    </Suspense>
  );
}
