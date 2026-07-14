import { Locale } from "./types";
import zh from "./locales/zh";
import en from "./locales/en";

export const locales: Locale[] = ["zh", "en"];

export const localeLabels: Record<Locale, string> = {
  zh: "中文",
  en: "EN",
};

const dictionaries = { zh, en };

export function getDictionary(locale: Locale) {
  return dictionaries[locale];
}

export type Dictionary = ReturnType<typeof getDictionary>;
