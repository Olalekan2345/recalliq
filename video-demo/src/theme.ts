import { loadFont as loadSora } from "@remotion/google-fonts/Sora";
import { loadFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";

// The app's own type: Sora for display, Geist for UI, Geist Mono for identifiers.
export const SORA = loadSora("normal", { weights: ["300", "600", "700"], subsets: ["latin"] }).fontFamily;
export const GEIST = loadGeist("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const MONO = loadGeistMono("normal", { weights: ["400", "500"], subsets: ["latin"] }).fontFamily;

/** RecallIQ light-theme tokens (src/app/globals.css). */
export const C = {
  bg: "#f8fbff",
  ice: "#edf8ff",
  lavender: "#f2efff",
  aqua: "#eafbf9",
  navy: "#101c44",
  muted: "#556580",
  line: "rgba(16,28,68,0.10)",
  cyan: "#18ccf9",
  blue: "#3254e4",
  violet: "#9976f9",
  primary: "#1371c9",
  success: "#0f7a52",
  warn: "#9a5200",
};

export const GRADIENT = "linear-gradient(120deg, #1678cf, #3156e3 55%, #6a48e6)";
export const GRADIENT_TEXT = "linear-gradient(90deg, #0b8fbf, #2d5be3 50%, #6b46e5)";
export const FPS = 30;
export const sec = (s: number) => Math.round(s * FPS);
