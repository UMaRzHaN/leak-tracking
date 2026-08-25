import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Контрастность палитры как тест, а не как договорённость.
 *
 * Цвет здесь живёт в двух ролях сразу: заливка под белым текстом хочет
 * потемнее, надпись на светлой плашке — тоже потемнее, а та же надпись в
 * тёмной теме — наоборот, посветлее. Пока роли делили один токен, любая правка
 * чинила одну сторону и ломала другую, причём молча: значок непрочитанных и
 * кнопка KML отрисовываются не на каждом экране, и глазами это не ловилось.
 *
 * Тест читает те же значения, что уходят в сборку, и проверяет пары, которые
 * действительно встречаются на экране: тройки из `status.js` и `priority.js`,
 * белый текст на заливках, приглушённые уровни на всех светлых поверхностях.
 */

const AA_NORMAL = 4.5;

// Путь от корня репозитория, как в locales.test.js: под jsdom `import.meta.url`
// не файловый и readFileSync его не принимает.
//
// Комментарии срезаются до разбора: они здесь на русском и сами упоминают
// токены — «Светлее --c-surface: иначе полоса…» разбиралась как объявление
// с многострочным значением.
const source = readFileSync("src/index.scss", "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function readBlock(selector) {
  const start = source.indexOf(selector);
  if (start === -1) throw new Error(`Блок ${selector} не найден в index.scss`);
  const open = source.indexOf("{", start);
  const close = source.indexOf("\n}", open);
  const body = source.slice(open, close);
  const tokens = {};
  for (const [, name, value] of body.matchAll(
    /(--[a-z0-9-]+)\s*:\s*([^;]+);/g,
  )) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const light = readBlock(":root {");
const darkOverrides = readBlock('[data-theme="dark"] {');
const dark = { ...light, ...darkOverrides };

function parseColor(value) {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], a: 1 };
  }
  const rgba = value.match(
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/,
  );
  if (rgba) {
    return {
      rgb: [+rgba[1], +rgba[2], +rgba[3]],
      a: rgba[4] === undefined ? 1 : +rgba[4],
    };
  }
  throw new Error(`Не разобрать цвет: ${value}`);
}

function luminance([r, g, b]) {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * Плашки статусов в тёмной теме полупрозрачные, и мерить их как непрозрачные
 * бессмысленно — получится контраст с цветом, которого на экране нет. Плашка
 * смешивается с поверхностью, на которой лежит.
 */
function flatten(theme, name, under = "--c-surface") {
  const color = parseColor(theme[name]);
  if (color.a === 1) return color.rgb;
  const base = parseColor(theme[under]).rgb;
  return color.rgb.map((ch, i) => ch * color.a + base[i] * (1 - color.a));
}

// Тройки «надпись + плашка», как их складывают status.js и priority.js.
const BADGES = [
  ["статус «Открыта»", "--c-open-text", "--c-open-bg"],
  ["статус «В ремонте»", "--c-progress-text", "--c-progress-bg"],
  ["статус «Устранена»", "--c-resolved-text", "--c-resolved-bg"],
  ["приоритет critical", "--c-critical", "--c-critical-bg"],
  ["приоритет high", "--c-high", "--c-high-bg"],
  ["приоритет medium", "--c-medium", "--c-medium-bg"],
  ["приоритет low", "--c-low", "--c-low-bg"],
  ["опасность как надпись", "--c-danger-text", "--c-danger-bg"],
  ["синий на голубой плашке", "--c-blue-text", "--c-blue-dim"],
];

// Токены, которые в SCSS стоят заливкой под `color: #fff`.
const WHITE_ON_FILL = [
  "--c-open",
  "--c-progress",
  "--c-resolved",
  "--c-danger",
  "--c-blue",
];

// Надписи на обычных поверхностях. Светлых поверхностей три, и на самой
// тёмной из них контраст ниже — раньше палитру сверяли только с белым.
const SURFACES = ["--c-surface", "--c-bg", "--c-surface2"];
const TEXT_TOKENS = [
  "--c-text",
  "--c-text2",
  "--c-text3",
  "--c-blue-text",
  "--c-success",
  "--c-warning",
  "--c-red",
  "--c-amber",
  "--c-danger-text",
];

describe.each([
  ["светлая", light],
  ["тёмная", dark],
])("палитра: %s тема", (_name, theme) => {
  it("надписи читаются на своих плашках", () => {
    const failing = BADGES.filter(
      ([, fg, bg]) =>
        contrast(flatten(theme, fg), flatten(theme, bg)) < AA_NORMAL,
    ).map(
      ([label, fg, bg]) =>
        `${label}: ${contrast(flatten(theme, fg), flatten(theme, bg)).toFixed(2)}:1`,
    );

    expect(failing).toEqual([]);
  });

  it("белый текст читается на заливках", () => {
    const failing = WHITE_ON_FILL.filter(
      (token) => contrast([255, 255, 255], flatten(theme, token)) < AA_NORMAL,
    ).map(
      (token) =>
        `${token}: ${contrast([255, 255, 255], flatten(theme, token)).toFixed(2)}:1`,
    );

    expect(failing).toEqual([]);
  });

  it("надписи читаются на всех поверхностях темы", () => {
    const failing = [];
    for (const token of TEXT_TOKENS) {
      for (const surface of SURFACES) {
        const ratio = contrast(
          flatten(theme, token, surface),
          flatten(theme, surface),
        );
        if (ratio < AA_NORMAL) {
          failing.push(`${token} на ${surface}: ${ratio.toFixed(2)}:1`);
        }
      }
    }

    expect(failing).toEqual([]);
  });

  // Три уровня текста должны читаться как три уровня. Подтягивая контраст,
  // легко привести их к одному цвету — тогда контраст в порядке, а иерархии
  // больше нет.
  it("сохраняет три различимых уровня текста", () => {
    const levels = ["--c-text", "--c-text2", "--c-text3"].map((token) =>
      luminance(flatten(theme, token)),
    );
    const gaps = [
      Math.abs(levels[0] - levels[1]),
      Math.abs(levels[1] - levels[2]),
    ];

    expect(gaps.every((gap) => gap > 0.01)).toBe(true);
  });
});
