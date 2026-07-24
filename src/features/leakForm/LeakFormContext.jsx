import { createContext, useContext } from "react";
import { useLeakForm } from "@/features/leakForm/hooks/useLeakForm";

const LeakFormContext = createContext(null);

export function LeakFormProvider({ children }) {
  const value = useLeakForm();
  return (
    <LeakFormContext.Provider value={value}>
      {children}
    </LeakFormContext.Provider>
  );
}

export function useLeakFormContext() {
  const ctx = useContext(LeakFormContext);
  if (!ctx)
    throw new Error("useLeakFormContext must be used inside LeakFormProvider");
  return ctx;
}
