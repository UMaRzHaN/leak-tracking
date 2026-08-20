import { describe, expect, it } from "vitest";
import { splitPrecacheFiles } from "../../vite.config.mjs";

// Сборка отдаёт ровно такую форму: входной чанк со своими статическими
// импортами и стилями, ленивые чанки маршрутов и отдельные ассеты.
const bundle = {
  "assets/index-aaa.js": {
    fileName: "assets/index-aaa.js",
    isEntry: true,
    imports: ["assets/vendor-react-bbb.js", "assets/runtime-ccc.js"],
    viteMetadata: { importedCss: new Set(["assets/index-ddd.css"]) },
  },
  "assets/vendor-react-bbb.js": {
    fileName: "assets/vendor-react-bbb.js",
    imports: ["assets/runtime-ccc.js"],
  },
  "assets/runtime-ccc.js": { fileName: "assets/runtime-ccc.js", imports: [] },
  "assets/index-ddd.css": { fileName: "assets/index-ddd.css" },
  "assets/MapPage-eee.js": { fileName: "assets/MapPage-eee.js", imports: [] },
  "assets/vendor-excel-fff.js": {
    fileName: "assets/vendor-excel-fff.js",
    imports: [],
  },
};

describe("splitPrecacheFiles", () => {
  it("puts the shell and everything the entry needs into the essential half", () => {
    const { essential } = splitPrecacheFiles(bundle, "/");

    expect(essential).toEqual([
      "/",
      "/assets/index-aaa.js",
      "/assets/index-ddd.css",
      "/assets/runtime-ccc.js",
      "/assets/vendor-react-bbb.js",
      "/theme-init.js",
    ]);
  });

  it("leaves lazy routes and heavy vendors optional", () => {
    const { optional } = splitPrecacheFiles(bundle, "/");

    expect(optional).toContain("/assets/MapPage-eee.js");
    expect(optional).toContain("/assets/vendor-excel-fff.js");
    // Иконки и манифест нужны установленному приложению, но не первому экрану.
    expect(optional).toContain("/manifest.json");
    expect(optional).toContain("/icons/icon-192.png");
  });

  it("never lists the same file in both halves", () => {
    const { essential, optional } = splitPrecacheFiles(bundle, "/");

    expect(essential.filter((file) => optional.includes(file))).toEqual([]);
  });

  it("honours a deployment subpath", () => {
    const { essential, optional } = splitPrecacheFiles(bundle, "/leak/");

    expect(essential).toContain("/leak/");
    expect(essential).toContain("/leak/theme-init.js");
    expect(optional).toContain("/leak/assets/MapPage-eee.js");
  });

  it("survives an import that is not part of the bundle", () => {
    // Внешние зависимости в графе встречаются; падать на них сборке нельзя.
    const withExternal = {
      "assets/index-aaa.js": {
        fileName: "assets/index-aaa.js",
        isEntry: true,
        imports: ["https://cdn.example/lib.js"],
      },
    };

    expect(() => splitPrecacheFiles(withExternal, "/")).not.toThrow();
  });
});
