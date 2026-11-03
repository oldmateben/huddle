// A random per-device id so people can change their vote after a refresh. It identifies nobody.
function stored(key: string, make: () => string): string {
  try {
    const v = localStorage.getItem(key) ?? make();
    localStorage.setItem(key, v);
    return v;
  } catch {
    return make();
  }
}
export const participantId = stored("huddle:pid", () => crypto.randomUUID());

export const savedName = {
  get: () => {
    try {
      return localStorage.getItem("huddle:name") ?? "";
    } catch {
      return "";
    }
  },
  set: (name: string) => {
    try {
      localStorage.setItem("huddle:name", name);
    } catch {
      /* storage unavailable */
    }
  },
};
