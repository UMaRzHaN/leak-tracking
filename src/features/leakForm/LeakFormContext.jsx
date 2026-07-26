import { createContext, use } from "react";
import { useLeakForm } from "@/features/leakForm/hooks/useLeakForm";

const LeakFormContext = createContext(null);

export function LeakFormProvider({ children }) {
  const value = useLeakForm();
  return <LeakFormContext value={value}>{children}</LeakFormContext>;
}

export function useLeakFormContext() {
  const ctx = use(LeakFormContext);
  if (!ctx)
    throw new Error("useLeakFormContext must be used inside LeakFormProvider");
  return ctx;
}
