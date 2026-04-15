import PageHeader from "../../PageHeader/PageHeader";
import VoiceButton from "../../VoiceButton/VoiceButton";

export default function AddLeakHeader({ setPage, stopVoiceInput, startVoiceInput }) {
  return (
    <PageHeader
      title="Добавить утечку"
      onBack={() => {
        stopVoiceInput?.();
        setPage("");
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
