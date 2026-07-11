const isDev = import.meta.env.DEV;
const isTest = import.meta.env.MODE === "test" || import.meta.env.VITEST;

function emit(method, args) {
  if (!isDev || isTest) return;
  console[method](...args);
}

export const logger = {
  log: (...args) => emit("log", args),
  warn: (...args) => emit("warn", args),
  error: (...args) => emit("error", args),
};
