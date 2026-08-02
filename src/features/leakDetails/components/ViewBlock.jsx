import { useMemo } from "react";
import { useLanguage } from "@/app/hooks/useLanguage";
import LeakSummarySection from "./LeakSummarySection";
import LeakLocationSection from "./LeakLocationSection";
import LeakMeasurementSection from "./LeakMeasurementSection";
import LeakRepairSection from "./LeakRepairSection";
import LeakHistorySection from "./LeakHistorySection";

function splitFields(fields) {
  return {
    text: fields.filter((field) => !field.numeric && !field.multiline),
    numeric: fields.filter((field) => field.numeric && !field.coord),
    coords: fields.filter((field) => field.coord),
    multi: fields.filter((field) => !field.numeric && field.multiline),
  };
}

export default function ViewBlock({ data, activeTab, projectConfig }) {
  const { t, lang } = useLanguage();

  const localeTexts = useMemo(
    () => ({
      priority: t("leakDetails.priority"),

      actions: {
        created: t("leakDetails.actions.created"),
        status_changed: t("leakDetails.actions.status_changed"),
        edited: t("leakDetails.actions.edited"),
        comment: t("leakDetails.actions.comment"),
        monitoring: t("leakDetails.actions.monitoring", {
          defaultValue: lang === "ru" ? "Мониторинг" : "Monitoring",
        }),
      },

      statuses: {
        open: t("leakDetails.statuses.open"),
        in_progress: t("leakDetails.statuses.in_progress"),
        resolved: t("leakDetails.statuses.resolved"),
      },

      comment: {
        add: t("leakDetails.comment.add"),
        placeholder: t("leakDetails.comment.placeholder"),
        cancel: t("leakDetails.comment.cancel"),
        save: t("leakDetails.comment.save"),
      },

      photo: {
        before: t("leakDetails.photo.before"),
        repair: lang === "ru" ? "В ремонте" : "Under repair",
        after: t("leakDetails.photo.after"),
        monitoring: lang === "ru" ? "Фото мониторинга" : "Monitoring photo",
        noPhoto: t("leakDetails.photo.noPhoto"),
      },

      monitoring: {
        round: lang === "ru" ? "Обход" : "Round",
        inspector: lang === "ru" ? "Проверил" : "Checked by",
        materials: lang === "ru" ? "МТР" : "Materials and equipment",
        comment: lang === "ru" ? "Комментарий" : "Comment",
        photo: lang === "ru" ? "Фото обхода" : "Round photo",
        previousPhoto: lang === "ru" ? "Фото до обхода" : "Photo before round",
      },

      empty: {
        info: t("leakDetails.empty.info"),
        photo: t("leakDetails.empty.photo"),
        params: t("leakDetails.empty.params"),
        coords: t("leakDetails.empty.coords"),
        history: t("leakDetails.empty.history"),
        monitoring:
          lang === "ru"
            ? "Проверки мониторинга пока не добавлены"
            : "No monitoring checks yet",
      },
      user: lang === "ru" ? "Пользователь" : "User",
    }),
    [t, lang],
  );
  const fields = useMemo(() => {
    const all = projectConfig.system.fields ?? [];
    return all
      .filter((f) => f.viewable !== false)
      .sort((a, b) => (a.viewOrder ?? 999) - (b.viewOrder ?? 999));
  }, [projectConfig]);

  const { text, numeric, coords, multi } = useMemo(
    () => splitFields(fields),
    [fields],
  );
  if (activeTab === "info") {
    return (
      <LeakSummarySection
        data={data}
        fields={[...text, ...multi]}
        localeTexts={localeTexts}
        t={t}
        lang={lang}
      />
    );
  }
  if (activeTab === "photo") {
    return <LeakRepairSection data={data} localeTexts={localeTexts} />;
  }
  if (activeTab === "params") {
    return (
      <LeakMeasurementSection
        data={data}
        fields={numeric}
        localeTexts={localeTexts}
        t={t}
        lang={lang}
      />
    );
  }
  if (activeTab === "coords") {
    return (
      <LeakLocationSection
        data={data}
        fields={coords}
        localeTexts={localeTexts}
        t={t}
        lang={lang}
      />
    );
  }
  if (activeTab === "monitoring" || activeTab === "log") {
    return (
      <LeakHistorySection
        activeTab={activeTab}
        data={data}
        fields={fields}
        localeTexts={localeTexts}
        t={t}
        lang={lang}
      />
    );
  }
  return null;
}
