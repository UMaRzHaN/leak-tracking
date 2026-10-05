import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { englishLanguageHook } from "@/test/translate";

vi.mock("@/app/hooks/useLanguage", () => englishLanguageHook());

import LocationBrowser from "./LocationBrowser";

const TREE = [
  {
    value: "УМГ-1",
    count: 1,
    children: [{ value: "КС-3", count: 1, children: [] }],
  },
  {
    value: "УМГ-2",
    count: 3,
    children: [
      { value: "КС-5", count: 2, children: [] },
      { value: "КС-7", count: 1, children: [] },
    ],
  },
  { value: "", count: 2, children: [] },
];

function createScope(overrides = {}) {
  return {
    available: true,
    levelKeys: ["field", "station", "location"],
    levelLabels: ["MGPA", "Station", "Location"],
    tree: TREE,
    path: [],
    setPath: vi.fn(),
    selection: { path: [], values: [] },
    setSelection: vi.fn(),
    scopedCount: null,
    totalCount: 6,
    childrenAtPath: (path) => {
      let nodes = TREE;
      for (const value of path) {
        nodes = nodes.find((node) => node.value === value)?.children ?? [];
      }
      return nodes;
    },
    ...overrides,
  };
}

function renderBrowser(scope = createScope(), onClose = vi.fn()) {
  const onApplied = vi.fn();
  render(
    <LocationBrowser
      open
      scope={scope}
      onClose={onClose}
      onApplied={onApplied}
    />,
  );
  return { scope, onClose, onApplied };
}

describe("LocationBrowser", () => {
  it("lists the first level with a leak count per folder", () => {
    renderBrowser();

    expect(screen.getByText("MGPA")).toBeInTheDocument();
    expect(screen.getByText("УМГ-1")).toBeInTheDocument();
    expect(screen.getByText("УМГ-2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("names the group of leaks that have no location", () => {
    renderBrowser();

    expect(screen.getByText("Unnamed")).toBeInTheDocument();
  });

  it("drills into a folder without applying it", async () => {
    const user = userEvent.setup();
    const { scope, onClose } = renderBrowser();

    await user.click(screen.getByLabelText("Open “УМГ-2”"));

    expect(screen.getByText("КС-5")).toBeInTheDocument();
    expect(screen.getByText("Station")).toBeInTheDocument();
    // Browsing is local until something is applied, so the list behind the
    // sheet must not have changed yet.
    expect(scope.setPath).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("applies the folder that was clicked and closes", async () => {
    const user = userEvent.setup();
    const { scope, onClose } = renderBrowser();

    await user.click(screen.getByRole("button", { name: /УМГ-2\s*3/ }));

    expect(scope.setPath).toHaveBeenCalledWith(["УМГ-2"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("applies a nested folder as a full path", async () => {
    const user = userEvent.setup();
    const { scope } = renderBrowser();

    await user.click(screen.getByLabelText("Open “УМГ-2”"));
    await user.click(screen.getByRole("button", { name: /КС-5\s*2/ }));

    expect(scope.setPath).toHaveBeenCalledWith(["УМГ-2", "КС-5"]);
  });

  it("steps back up a level", async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.click(screen.getByLabelText("Open “УМГ-2”"));
    await user.click(screen.getByRole("button", { name: "← Up" }));

    expect(screen.getByText("УМГ-1")).toBeInTheDocument();
    expect(screen.queryByText("КС-5")).not.toBeInTheDocument();
  });

  it("opens on the folder that is already selected", () => {
    renderBrowser(createScope({ path: ["УМГ-2"] }));

    expect(screen.getByText("КС-5")).toBeInTheDocument();
  });

  it("clears the selection through show all", async () => {
    const user = userEvent.setup();
    const { scope } = renderBrowser(createScope({ path: ["УМГ-2"] }));

    await user.click(screen.getByRole("button", { name: "Show all (6)" }));

    expect(scope.setPath).toHaveBeenCalledWith([]);
  });

  it("reports the applied path so the caller can show its records", async () => {
    const user = userEvent.setup();
    const { onApplied } = renderBrowser();

    await user.click(screen.getByRole("button", { name: /УМГ-2\s*3/ }));

    expect(onApplied).toHaveBeenCalledWith(["УМГ-2"]);
  });

  it("reports the empty path for show all", async () => {
    const user = userEvent.setup();
    const { onApplied } = renderBrowser(createScope({ path: ["УМГ-2"] }));

    await user.click(screen.getByRole("button", { name: "Show all (6)" }));

    // Callers use the empty path to tell "go into this folder" from "back out
    // of it", and the latter should not drag the user to another screen.
    expect(onApplied).toHaveBeenCalledWith([]);
  });

  it("applies several ticked folders at once", async () => {
    const user = userEvent.setup();
    const { scope, onClose, onApplied } = renderBrowser();

    await user.click(screen.getByRole("checkbox", { name: "Select “УМГ-1”" }));
    await user.click(screen.getByRole("checkbox", { name: "Select “УМГ-2”" }));
    expect(scope.setPath).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Show selected (2)" }));

    expect(scope.setSelection).toHaveBeenCalledWith([], ["УМГ-1", "УМГ-2"]);
    expect(onApplied).toHaveBeenCalledWith([], ["УМГ-1", "УМГ-2"]);
    expect(onClose).toHaveBeenCalled();
  });

  it("toggles a row instead of applying it once something is ticked", async () => {
    const user = userEvent.setup();
    const { scope } = renderBrowser();

    await user.click(screen.getByRole("checkbox", { name: "Select “УМГ-1”" }));
    await user.click(screen.getByRole("button", { name: /УМГ-2\s*3/ }));

    expect(scope.setPath).not.toHaveBeenCalled();
    expect(
      screen.getByRole("checkbox", { name: "Select “УМГ-2”" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("applies a single ticked folder as a path", async () => {
    const user = userEvent.setup();
    const { scope } = renderBrowser();

    await user.click(screen.getByLabelText("Open “УМГ-2”"));
    await user.click(screen.getByRole("checkbox", { name: "Select “КС-7”" }));
    await user.click(screen.getByRole("button", { name: "Show selected (1)" }));

    expect(scope.setPath).toHaveBeenCalledWith(["УМГ-2", "КС-7"]);
  });

  it("drops the ticks when leaving the level", async () => {
    const user = userEvent.setup();
    renderBrowser();

    await user.click(screen.getByRole("checkbox", { name: "Select “УМГ-1”" }));
    await user.click(screen.getByLabelText("Open “УМГ-2”"));

    expect(screen.getByRole("button", { name: "Show selected" })).toBeEnabled();
  });

  it("reopens several picked folders on their parent with the ticks", () => {
    renderBrowser(
      createScope({
        path: null,
        selection: { path: ["УМГ-2"], values: ["КС-5", "КС-7"] },
      }),
    );

    expect(
      screen.getByRole("checkbox", { name: "Select “КС-5”" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("button", { name: "Show selected (2)" }),
    ).toBeInTheDocument();
  });

  it("renders nothing while closed", () => {
    const { container } = render(
      <LocationBrowser open={false} scope={createScope()} onClose={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
