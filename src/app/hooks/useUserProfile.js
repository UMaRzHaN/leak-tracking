import { useCallback, useState } from "react";

const STORAGE_KEY = "leak_tracking:user_profile:v1";

function readProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { name: "" };
    const parsed = JSON.parse(raw);
    return {
      name: typeof parsed?.name === "string" ? parsed.name : "",
      updatedAt: parsed?.updatedAt ?? null,
    };
  } catch {
    return { name: "" };
  }
}

export function useUserProfile() {
  const [storedProfile, setStoredProfile] = useState(readProfile);

  const setProfile = useCallback((nextProfile) => {
    const next = {
      name: String(nextProfile?.name ?? "").trim(),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setStoredProfile(next);
    return next;
  }, []);

  return { profile: storedProfile, setProfile };
}
