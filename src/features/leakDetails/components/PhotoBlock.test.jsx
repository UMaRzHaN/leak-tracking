import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/usePhotoSrc", () => ({
  usePhotoSrc: (path) => (path ? `blob:${path}` : null),
}));

const PhotoBlock = (await import("./PhotoBlock")).default;

describe("PhotoBlock photo strip (5e)", () => {
  it("counts the photos and opens the one on screen", () => {
    const onView = vi.fn();
    const { container } = render(
      <PhotoBlock photoPaths={["a", "b"]} identityNum="№ 1" onView={onView} />,
    );

    expect(screen.getByText("1 / 2")).toBeTruthy();

    // Свайп — прокрутка ленты на ширину кадра.
    const track = container.querySelector('[class*="heroTrack"]');
    Object.defineProperty(track, "clientWidth", { value: 300 });
    track.scrollLeft = 300;
    fireEvent.scroll(track);
    expect(screen.getByText("2 / 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button"));
    expect(onView).toHaveBeenCalledWith("blob:b");
  });

  it("shows no counter for a single photo", () => {
    render(<PhotoBlock photoPaths={["a"]} identityNum="№ 1" />);
    expect(screen.queryByText("1 / 1")).toBeNull();
  });

  it("показывает статус плашкой, а не кнопкой", () => {
    // Статус меняют проверки мониторинга и ремонта: нажатие на плашку в
    // шапке больше ничего не открывает.
    const { container } = render(
      <PhotoBlock photoPaths={[]} identityNum="№ 1" status="resolved" />,
    );

    expect(container.querySelector('span[class*="badge"]')).not.toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
