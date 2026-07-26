import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import VirtualizedLeakList from "./VirtualizedLeakList";

describe("VirtualizedLeakList", () => {
  it("renders only a small window from a 10,000-item project", () => {
    const items = Array.from({ length: 10_000 }, (_, id) => ({ id }));
    const renderItem = vi.fn((item) => <span>{item.id}</span>);
    const { container } = render(
      <VirtualizedLeakList
        items={items}
        height={600}
        renderItem={renderItem}
      />,
    );

    expect(renderItem.mock.calls.length).toBeLessThan(20);
    const viewport = container.firstElementChild;
    Object.defineProperty(viewport, "scrollTop", {
      configurable: true,
      value: 600_000,
    });
    fireEvent.scroll(viewport);

    expect(renderItem.mock.calls.length).toBeLessThan(40);
    expect(container.textContent).toContain("5000");
  });
});
