import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isNative: false,
  takePhoto: vi.fn(),
  pickFromGallery: vi.fn(),
  pickFromBrowser: vi.fn(),
}));

vi.mock("react-i18next", async () => {
  const { translate } = await import("@/test/translate");
  return { useTranslation: () => ({ t: translate, i18n: { language: "en" } }) };
});

// Платформа читается через useCamera, а не напрямую: тесту нужно менять её от
// случая к случаю, а `isNative` — константа, вычисленная при загрузке модуля.
vi.mock("@/hooks/useCamera", () => ({
  useCamera: () => ({
    isNative: mocks.isNative,
    takePhoto: mocks.takePhoto,
    pickFromGallery: mocks.pickFromGallery,
    pickFromBrowser: mocks.pickFromBrowser,
  }),
}));

const PhotoInput = (await import("./PhotoInput")).default;
const { appError } = await import("@/utils/appError");

const photo = { raw: new Blob(["jpeg"]), src: "blob:снимок" };

function renderInput(props = {}) {
  const onChange = vi.fn();
  const result = render(<PhotoInput onChange={onChange} {...props} />);
  return { ...result, onChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isNative = false;
});

describe("PhotoInput в браузере", () => {
  it("предлагает файл, а не камеру: снимать в браузере нечем", () => {
    renderInput();

    expect(screen.getByText("Choose file")).toBeInTheDocument();
    expect(screen.queryByText("Camera")).not.toBeInTheDocument();
    expect(screen.queryByText("Gallery")).not.toBeInTheDocument();
  });

  it("читает выбранный файл и отдаёт снимок наружу", async () => {
    mocks.pickFromBrowser.mockResolvedValue(photo);
    const { container, onChange } = renderInput();
    const file = new File(["jpeg"], "leak.jpg", { type: "image/jpeg" });

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(photo));
    expect(mocks.pickFromBrowser).toHaveBeenCalledWith(file);
  });

  it("сбрасывает поле файла, чтобы тот же снимок можно было выбрать снова", async () => {
    mocks.pickFromBrowser.mockResolvedValue(photo);
    const { container } = renderInput();
    const input = /** @type {HTMLInputElement} */ (
      container.querySelector('input[type="file"]')
    );

    fireEvent.change(input, {
      target: { files: [new File(["jpeg"], "leak.jpg")] },
    });

    await waitFor(() => expect(input.value).toBe(""));
  });

  it("показывает причину, а не молчит, если файл не прочитался", async () => {
    mocks.pickFromBrowser.mockRejectedValue(
      appError("PHOTO_NOT_IMAGE", "Selected file is not an image"),
    );
    const { container, onChange } = renderInput();

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(["x"], "leak.jpg")] },
    });

    expect(
      await screen.findByText("The selected file is not an image"),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("сырой текст браузера на экран не попадает", async () => {
    mocks.pickFromBrowser.mockRejectedValue(new Error("NotReadableError"));
    const { container } = renderInput();

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(["x"], "leak.jpg")] },
    });

    expect(
      await screen.findByText("Could not read the photo"),
    ).toBeInTheDocument();
    expect(screen.queryByText("NotReadableError")).not.toBeInTheDocument();
  });

  it("пустой выбор ничего не меняет", () => {
    const { container, onChange } = renderInput();

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [] },
    });

    expect(mocks.pickFromBrowser).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("PhotoInput на телефоне", () => {
  beforeEach(() => {
    mocks.isNative = true;
  });

  it("даёт и камеру, и галерею, а скрытого поля файла не заводит", () => {
    const { container } = renderInput();

    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.getByText("Gallery")).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it("снимок с камеры уходит наружу", async () => {
    mocks.takePhoto.mockResolvedValue(photo);
    const { onChange } = renderInput();

    fireEvent.click(screen.getByText("Camera"));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(photo));
  });

  it("отказ камеры виден на экране", async () => {
    mocks.takePhoto.mockRejectedValue(
      appError("CAMERA_PERMISSION_REQUIRED", "Camera permission denied"),
    );
    const { onChange } = renderInput();

    fireEvent.click(screen.getByText("Camera"));

    expect(
      await screen.findByText("Allow the app to use the camera"),
    ).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("отменённая камера — не отказ: человек просто передумал", async () => {
    // Плагин возвращает пустоту, когда снимок не сделан. Сообщать об этом
    // нечего, и подставлять пустое значение в поле — тоже.
    mocks.takePhoto.mockResolvedValue(null);
    const { container, onChange } = renderInput();

    fireEvent.click(screen.getByText("Camera"));

    await waitFor(() => expect(mocks.takePhoto).toHaveBeenCalled());
    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector("[class*=fieldError]")).toBeNull();
  });

  it("закрытая галерея или камера — молча, без ошибки на экране", async () => {
    // Плагин отменяет и исключением: старый путь — текстом «User cancelled
    // photos app», новый — кодом из CameraErrorCode.
    mocks.pickFromGallery.mockRejectedValue(
      new Error("User cancelled photos app"),
    );
    const { container, onChange } = renderInput();

    fireEvent.click(screen.getByText("Gallery"));
    await waitFor(() => expect(mocks.pickFromGallery).toHaveBeenCalled());

    mocks.takePhoto.mockRejectedValue(
      Object.assign(new Error("cancelled"), { code: "OS-PLUG-CAMR-0006" }),
    );
    fireEvent.click(screen.getByText("Camera"));
    await waitFor(() => expect(mocks.takePhoto).toHaveBeenCalled());

    expect(onChange).not.toHaveBeenCalled();
    expect(container.querySelector("[class*=fieldError]")).toBeNull();
  });

  it("галерея отдаёт снимок и сообщает о своём отказе отдельно", async () => {
    mocks.pickFromGallery.mockResolvedValue(photo);
    const { onChange } = renderInput();

    fireEvent.click(screen.getByText("Gallery"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(photo));

    mocks.pickFromGallery.mockRejectedValue(new Error("Галерея недоступна"));
    fireEvent.click(screen.getByText("Gallery"));
    expect(
      await screen.findByText("Could not open the gallery"),
    ).toBeInTheDocument();
  });
});

describe("PhotoInput показывает состояние поля", () => {
  it("вместо приглашения показывает выбранный снимок", () => {
    renderInput({ value: photo });

    expect(screen.getByRole("img")).toHaveAttribute("src", "blob:снимок");
    expect(screen.queryByText("Add a result photo")).not.toBeInTheDocument();
    // Кнопка меняет смысл: заменить, а не выбрать.
    expect(screen.getByText("Replace photo")).toBeInTheDocument();
  });

  it("объясняет, какое именно поле обязательно", () => {
    renderInput({ label: "Фото после ремонта", required: true, error: true });

    expect(
      screen.getByText('Field "Фото после ремонта" is required'),
    ).toBeInTheDocument();
  });

  it("без ошибки требование не выкрикивается", () => {
    renderInput({ required: true });

    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.queryByText(/is required/)).not.toBeInTheDocument();
  });
});
