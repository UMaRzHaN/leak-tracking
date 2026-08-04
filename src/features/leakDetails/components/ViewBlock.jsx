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
          defaultValue: t("leakDetails.monitoring"),
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
        repair: t("leakDetails.statuses.in_progress"),
        after: t("leakDetails.photo.after"),
        monitoring: t("leakDetails.monitoringPhoto"),
        noPhoto: t("leakDetails.photo.noPhoto"),
      },

      monitoring: {
        round: t("leakDetails.round"),
        inspector: t("leakDetails.checkedBy"),
        materials: t("leakDetails.materials"),
        comment: t("leakDetails.roundComment"),
        photo: t("leakDetails.roundPhoto"),
        previousPhoto: t("leakDetails.photoBeforeRound"),
      },

      empty: {
        info: t("leakDetails.empty.info"),
        photo: t("leakDetails.empty.photo"),
        params: t("leakDetails.empty.params"),
        coords: t("leakDetails.empty.coords"),
        history: t("leakDetails.empty.history"),
        monitoring: t("leakDetails.noMonitoringChecks"),
      },
      user: t("leakDetails.user"),
    }),
    [t],
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
