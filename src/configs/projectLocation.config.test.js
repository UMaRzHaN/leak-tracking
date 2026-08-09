import { describe, expect, it } from "vitest";
import { PROJECT_LOCATION_CONFIG } from "./projectLocation.config";
import { PROJECTS } from "./projects";

// The location hierarchy is written down twice: here, where the map, the voice
// parser and the object browser read it, and under `system.location` of each
// project config, where projectAdapter reads it. Nothing forces the two to
// agree, so a change applied to one of them alone would leave the map
// navigating by a different level than the database — visible only by using the
// app. These tests are the thing that forces them to agree.
describe("project location hierarchy", () => {
  it.each(Object.keys(PROJECT_LOCATION_CONFIG))(
    "%s is described identically in both places",
    (projectType) => {
      const standalone = PROJECT_LOCATION_CONFIG[projectType];
      const embedded = PROJECTS[projectType].system.location;

      expect(embedded.main).toBe(standalone.main);
      expect(embedded.secondary).toBe(standalone.secondary);
      expect(embedded.last).toBe(standalone.last);
    },
  );

  it.each(Object.keys(PROJECT_LOCATION_CONFIG))(
    "%s names three distinct levels",
    (projectType) => {
      const { main, secondary, last } = PROJECT_LOCATION_CONFIG[projectType];

      expect(new Set([main, secondary, last]).size).toBe(3);
    },
  );

  // Held down deliberately: a settlement contains districts, not the other way
  // round, and the levels were once ordered backwards, which built the object
  // browser upside down. The voice markers in features/voice/utils/synonyms.js
  // encode the same order and have to move with it.
  it("puts the settlement above the district in downstream", () => {
    expect(PROJECT_LOCATION_CONFIG.downstream).toMatchObject({
      main: "locality",
      secondary: "district",
      last: "address",
    });
  });
});
