import type { LaunchFont } from "./api";

export const LAUNCH_FONT_CLASSES: Record<LaunchFont, string> = {
  modern: "font-modern",
  geometric: "font-geometric",
  prestigious: "font-prestigious",
  editorial: "font-editorial",
  couture: "font-couture",
  handwritten: "font-handwritten",
  elegant_script: "font-elegant-script",
  festive: "font-festive",
  playful: "font-playful",
  spooky: "font-spooky",
  ceremonial: "font-ceremonial",
  cinematic: "font-cinematic",
};

export function readableInk(hex: string) {
  const channels = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(
    (value) => Number.parseInt(value, 16) / 255,
  );
  const [red = 0, green = 0, blue = 0] = channels.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.45
    ? "#101418"
    : "#f6f4ed";
}

export function applyAccentTheme(accent: string) {
  const root = document.documentElement;
  root.style.setProperty("--color-accent", accent);
  root.style.setProperty("--color-accent-ink", readableInk(accent));
}
