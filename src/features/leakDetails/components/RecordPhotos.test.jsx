import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// Путь в хранилище превращается в адрес картинки как есть: важно, какие
// снимки показаны и под какой подписью, а не как их достают.
vi.mock("@/hooks/usePhotoSrc", () => ({
  usePhotoSrc: (path) => (path ? `blob:${path}` : null),
}));
vi.mock("@/features/photos/PhotoViewer/PhotoViewer", () => ({
  default: ({ src }) => <div>viewer:{src}</div>,
}));

const RecordPhotos = (await import("./RecordPhotos")).default;

describe("RecordPhotos", () => {
  it("ставит снимок до слева, после — справа, каждый со своей подписью", () => {
    render(
      <RecordPhotos
        before="idb://before"
        beforeLabel="Фото до ремонта"
        after="idb://after"
        afterLabel="Фото ремонта"
      />,
    );

    const images = screen.getAllByRole("img");
    expect(images.map((image) => image.getAttribute("alt"))).toEqual([
      "Фото до ремонта",
      "Фото ремонта",
    ]);
    expect(images[0]).toHaveAttribute("src", "blob:idb://before");
  });

  it("открывает снимок крупно по нажатию", async () => {
    const user = userEvent.setup();
    render(
      <RecordPhotos after="idb://after" afterLabel="Фото" beforeLabel="До" />,
    );

    await user.click(screen.getByRole("button", { name: "Фото" }));
    expect(screen.getByText("viewer:blob:idb://after")).toBeInTheDocument();
  });

  it("без снимков ничего не рисует", () => {
    const { container } = render(
      <RecordPhotos beforeLabel="До" afterLabel="После" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
