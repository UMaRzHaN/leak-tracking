import LeakDetailsSheet from "@/features/leakDetails/LeakDetailsSheet";

export default function LeakModals({
  activeLeak,
  allLeaks,
  onCloseDetails,
  onSave,
  onDelete,
  userProfile,
}) {
  if (!activeLeak) return null;
  return (
    <LeakDetailsSheet
      leak={activeLeak}
      allLeaks={allLeaks}
      onClose={onCloseDetails}
      onSave={onSave}
      onDelete={onDelete}
      userProfile={userProfile}
    />
  );
}
