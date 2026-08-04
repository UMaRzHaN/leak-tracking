import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LeakForm from "./LeakForm";

const mocks = vi.hoisted(() => ({
  initialForm: {},
  language: "en",
  photoRequired: false,
  vars: null,
  setVars: vi.fn(),
  stopVoiceInput: vi.fn(),
}));

vi.mock("@/features/leakForm/LeakFormContext", async () => {
  const React = await import("react");
  return {
    useLeakFormContext() {
      const [form, setForm] = React.useState(mocks.initialForm);
      const [errors, setErrors] = React.useState({});
      return {
        form,
        errors,
        setForm,
        setErrors,
        handle: (key, value) =>
          setForm((current) => ({ ...current, [key]: value })),
      };
    },
  };
});

vi.mock("@/app/project/hooks/useProjectConfig", () => ({
  useProjectConfig: () => ({
    system: { copyable: ["station"], numeric: ["leak_speed"] },
    vars: {},
  }),
}));

vi.mock("@/app/project/hooks/useEffectiveProjectConfig", () => ({
  useEffectiveProjectConfig: () => ({
    steps: {
      steps: [
        {
          title: "Main",
          fields: [
            {
              key: "leak_speed",
              label: "Leak speed",
              type: "input",
              required: true,
            },
            { key: "station", label: "Station", type: "input" },
            { key: "photo", label: "Photo", type: "photo" },
          ],
        },
      ],
    },
  }),
}));

vi.mock("@/app/project/ProjectContext", () => ({
  useProjectData: () => ({ activeProject: { id: "project-a" } }),
}));
vi.mock("@/app/project/hooks/usePhotoRequirements", () => ({
  usePhotoRequirements: () => ({ leakPhotoRequired: mocks.photoRequired }),
}));
vi.mock("@/app/project/hooks/useProjectVars", () => ({
  useProjectVars: () => ({ vars: mocks.vars, setVars: mocks.setVars }),
}));
vi.mock("@/app/hooks/useLanguage", async () => {
  const { englishLanguageHook } = await import("@/test/translate");
  const hook = englishLanguageHook();
  return {
    useLanguage: () => ({ ...hook.useLanguage(), lang: mocks.language }),
  };
});
vi.mock("@/app/hooks/useVoiceControl", () => ({
  useVoiceControl: () => ({
    pendingVoiceData: null,
    dismissVoiceData: vi.fn(),
    startVoiceInput: vi.fn(),
    stopVoiceInput: mocks.stopVoiceInput,
  }),
}));

vi.mock("./Header/AddLeakHeader", () => ({
  default: ({ onBack }) => <button onClick={onBack}>back-header</button>,
}));
vi.mock("./Footer/AddLeakFooter", () => ({
  default: ({ prevStep, nextStep, save }) => (
    <div>
      <button onClick={prevStep}>previous</button>
      <button onClick={nextStep}>next</button>
      <button onClick={save}>save</button>
    </div>
  ),
}));
vi.mock("@/features/leakForm/components/StepRenderer/StepRenderer", () => ({
  default: ({ form, errors, onChange }) => (
    <div>
      <output data-testid="form">{JSON.stringify(form)}</output>
      <output data-testid="errors">{JSON.stringify(errors)}</output>
      <button onClick={() => onChange("leak_speed", "12,5")}>set-speed</button>
      <button onClick={() => onChange("station", "")}>clear-station</button>
    </div>
  ),
}));
vi.mock("./components/ClearActions", () => ({
  default: ({ onClearStep, onClearAll }) => (
    <div>
      <button onClick={onClearStep}>clear-step</button>
      <button onClick={onClearAll}>clear-all</button>
    </div>
  ),
}));
vi.mock("@/components/ui/ConfirmSheet/ConfirmSheet", () => ({
  default: ({ open, onConfirm, onCancel }) =>
    open ? (
      <div>
        <button onClick={onConfirm}>confirm-copy</button>
        <button onClick={onCancel}>cancel-copy</button>
      </div>
    ) : null,
}));
vi.mock("@/features/voice/VoicePreviewSheet/VoicePreviewSheet", () => ({
  default: () => null,
}));
vi.mock("@/features/settings/SettingsModal/SettingsModal", () => ({
  default: ({ open, onClose }) =>
    open ? <button onClick={onClose}>close-settings</button> : null,
}));

describe("LeakForm", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    mocks.initialForm = {};
    mocks.language = "en";
    mocks.photoRequired = false;
    mocks.vars = null;
    mocks.setVars.mockClear();
    mocks.stopVoiceInput.mockClear();
  });

  it("blocks saving and reports required fields", () => {
    const onAdd = vi.fn();
    render(<LeakForm onAdd={onAdd} />);

    fireEvent.click(screen.getByText("save"));

    expect(onAdd).not.toHaveBeenCalled();
    expect(screen.getByTestId("errors").textContent).toContain(
      '"leak_speed":"Required field"',
    );
  });

  it("normalizes numeric values and reports the saved record", async () => {
    const saved = { id: "saved-1" };
    const onAdd = vi.fn().mockResolvedValue(saved);
    const onSaved = vi.fn();
    render(<LeakForm onAdd={onAdd} onSaved={onSaved} />);

    fireEvent.click(screen.getByText("set-speed"));
    fireEvent.click(screen.getByText("save"));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(onAdd.mock.calls[0][0]).toMatchObject({ leak_speed: 12.5 });
    expect(onAdd.mock.calls[0][0].createdAt).toBeInstanceOf(Date);
    expect(mocks.stopVoiceInput).toHaveBeenCalled();
  });

  it("offers to copy configured values from the previous leak", async () => {
    const onAdd = vi.fn().mockResolvedValue({ id: "saved-2" });
    mocks.initialForm = { leak_speed: "1", station: "" };
    render(<LeakForm onAdd={onAdd} lastItem={{ station: "Station A" }} />);

    fireEvent.click(screen.getByText("save"));
    expect(onAdd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("confirm-copy"));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0][0]).toMatchObject({
      leak_speed: 1,
      station: "Station A",
    });
  });

  it("validates a required photo and supports form clearing", () => {
    mocks.photoRequired = true;
    mocks.initialForm = { leak_speed: "3", station: "A" };
    render(<LeakForm />);

    fireEvent.click(screen.getByText("save"));
    expect(screen.getByTestId("errors").textContent).toContain(
      '"photo":"Add a photo"',
    );

    fireEvent.click(screen.getByText("clear-step"));
    expect(screen.getByTestId("form").textContent).toContain('"leak_speed":""');
    fireEvent.click(screen.getByText("clear-all"));
    expect(screen.getByTestId("form").textContent).toContain("{}");
  });

  it("accepts a restorable data URL photo loaded from a draft", async () => {
    const onAdd = vi.fn().mockResolvedValue({ id: "saved-from-draft" });
    mocks.photoRequired = true;
    mocks.initialForm = {
      leak_speed: "3",
      station: "A",
      photo: { src: "data:image/jpeg;base64,YQ==" },
    };
    render(<LeakForm onAdd={onAdd} />);

    fireEvent.click(screen.getByText("save"));

    await waitFor(() => expect(onAdd).toHaveBeenCalledOnce());
    expect(screen.getByTestId("errors").textContent).not.toContain(
      '"photo":"Add a photo"',
    );
  });

  it("opens and closes calculation settings", () => {
    render(<LeakForm />);
    fireEvent.click(screen.getByText("Edit Parameters"));
    expect(screen.getByText("close-settings")).not.toBeNull();
    fireEvent.click(screen.getByText("close-settings"));
    expect(screen.queryByText("close-settings")).toBeNull();
  });
});
