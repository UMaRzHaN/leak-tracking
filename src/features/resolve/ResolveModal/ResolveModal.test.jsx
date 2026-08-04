import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ResolveModal from "./ResolveModal";

vi.mock("@/hooks/usePhotoStorage", () => ({
  usePhotoStorage: () => ({ savePhoto: vi.fn(), deletePhoto: vi.fn() }),
}));
vi.mock("@/hooks/useModalDialog", () => ({
  useModalDialog: () => ({ current: null }),
}));
// Renders just its label, which is one of the four strings under test.
vi.mock("@/features/photos/PhotoInput/PhotoInput", () => ({
  default: ({ label }) => <span>{label}</span>,
}));

// Resolves against the real English locale, so a missing key fails here rather
// than quietly rendering its own name.
vi.mock("react-i18next", async () => {
  const { translate } = await import("@/test/translate");
  return { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) };
});

function renderModal(mode) {
  return render(
    <ResolveModal
      leak={{ id: "leak-1", materials_equipment: "", note: "" }}
      mode={mode}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

describe("ResolveModal", () => {
  // The two modes share one component and differ in four labels. Those four
  // were the last inline language ternaries in the app; a wrong key scope
  // would silently show the resolution wording while repairing a leak.
  it("uses the resolution wording by default", () => {
    renderModal("resolved");
    expect(screen.getByText("Leak resolution")).toBeInTheDocument();
    expect(screen.getByText("Photo after resolution")).toBeInTheDocument();
  });

  it("uses the repair wording in repair mode", () => {
    renderModal("repair");
    expect(screen.getByText("Leak under repair")).toBeInTheDocument();
    expect(screen.getByText("Repair photo")).toBeInTheDocument();
  });

  it("shares the labels the two modes have in common", () => {
    renderModal("repair");
    expect(screen.getByText("Note")).toBeInTheDocument();
  });
});
