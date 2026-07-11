import PageHeader from "@/components/layout/PageHeader/PageHeader";
import VoiceButton from "@/features/voice/VoiceButton/VoiceButton";

export default function AddLeakHeader({
  setPage,
  prevPage,
  stopVoiceInput,
  startVoiceInput,
  step,
  steps,
  title,
  localeTexts,
}) {
  const currentStep = steps?.[step - 1];
  const totalSteps = steps?.length ?? 1;
  const hasSteps = step != null && steps?.length > 0;

  return (
    <PageHeader
      title={title ?? localeTexts?.pageTitle ?? "New leak"}
      subtitle={
        hasSteps
          ? `${localeTexts?.stepPrefix ?? "Step"} ${step} / ${totalSteps} · ${currentStep?.title ?? ""}`
          : undefined
      }
      badge={hasSteps ? `${step}/${totalSteps}` : undefined}
      onBack={() => {
        stopVoiceInput?.();
        setPage(prevPage ?? "");
      }}
      right={
        <VoiceButton
          startVoiceInput={startVoiceInput}
          stopVoiceInput={stopVoiceInput}
          dark
        />
      }
    />
  );
}
