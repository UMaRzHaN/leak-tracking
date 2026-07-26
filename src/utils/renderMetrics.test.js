import { beforeEach, describe, expect, it } from "vitest";
import {
  getRenderMetrics,
  recordRender,
  resetRenderMetrics,
} from "./renderMetrics";

describe("renderMetrics", () => {
  beforeEach(() => resetRenderMetrics());

  it("counts and resets development renders", () => {
    recordRender("Card");
    recordRender("Card");
    expect(getRenderMetrics()).toEqual({ Card: 2 });
    resetRenderMetrics();
    expect(getRenderMetrics()).toEqual({});
  });
});
