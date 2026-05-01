import PageHeader from "@/components/layout/PageHeader/PageHeader";
import VoiceButton from "@/features/voice/VoiceButton/VoiceButton";

export default function AddLeakHeader({ setPage, prevPage, stopVoiceInput, startVoiceInput }) {
  return (
    <PageHeader
      title="Добавить утечку"
      onBack={() => {
        stopVoiceInput?.();
        setPage(prevPage ?? "");
      }}
      right={
        <VoiceButton
          startVoiceInput={startVoiceInput}
          stopVoiceInput={stopVoiceInput}
        />
      }
    />
  );
}
