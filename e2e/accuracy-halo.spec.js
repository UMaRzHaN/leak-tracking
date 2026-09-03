import { expect, test } from "@playwright/test";
import { createLeak, createProject, openMap, setUserProfile } from "./helpers";

/**
 * Ненадёжная точка видна на карте до нажатия.
 *
 * Цепочка сквозная: радиус приходит от приёмника, ложится в запись, доезжает
 * до слоя карты и превращается в ободок. По отдельности куски молчат, а без
 * ободка точка со стометровой погрешностью выглядит на карте так же уверенно,
 * как снятая в двух метрах.
 */
test("точка с большой погрешностью носит ободок, точная — нет", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);

  await context.setGeolocation({
    latitude: 41.311081,
    longitude: 69.240562,
    accuracy: 6,
  });
  await createProject(page);
  await setUserProfile(page);
  await createLeak(page, "4242");

  // Вторая снята под эстакадой: пятьдесят пять метров — это уже другой узел.
  await context.setGeolocation({
    latitude: 41.3122,
    longitude: 69.2422,
    accuracy: 55,
  });
  await createLeak(page, "4243");

  await openMap(page);
  await expect(
    page.locator('.leaflet-marker-icon div[style*="dashed"]'),
  ).toHaveCount(1);
});
