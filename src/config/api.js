const productionApiUrl =
  "https://college-noticeboard-api.unkwn6769.workers.dev";

export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : productionApiUrl);