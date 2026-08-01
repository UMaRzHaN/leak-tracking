import { lazy, Suspense } from "react";

const UserProfileSheet = lazy(
  () => import("@/components/ui/UserProfileSheet/UserProfileSheet"),
);

export default function AppDialogs({
  open,
  profile,
  onSaveProfile,
  onCloseProfile,
}) {
  if (!open) return null;

  return (
    <Suspense fallback={null}>
      <UserProfileSheet
        open
        profile={profile}
        onSave={onSaveProfile}
        onClose={onCloseProfile}
      />
    </Suspense>
  );
}
