import { isNative } from "../utils/platform";
import { Geolocation } from "@capacitor/geolocation";

export const getCurrentLocation = async () => {
  // 🌐 WEB
  if (!isNative) {
    if (!navigator.geolocation) {
      throw new Error("Браузер не поддерживает геолокацию");
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }),
        (err) => reject(new Error(err.message)),
        {
          enableHighAccuracy: true,
          timeout: 10000,
        }
      );
    });
  }

  // 📱 MOBILE
  const perm = await Geolocation.requestPermissions();
  if (perm.location !== "granted") {
    throw new Error("Нет разрешения на геолокацию");
  }

  const pos = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
  });

  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
  };
};
