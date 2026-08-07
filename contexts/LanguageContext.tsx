"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import enMessages from "@/messages/en.json";
import frMessages from "@/messages/fr.json";
import rnMessages from "@/messages/rn.json";

export type Language =
  | "en"
  | "fr"
  | "rn";

type TranslationMessages = Record<
  string,
  unknown
>;

type LanguageContextValue = {
  language: Language;
  setLanguage: (
    language: Language
  ) => void;
  t: (key: string) => string;
};

const STORAGE_KEY =
  "ulearn-language";

const DEFAULT_LANGUAGE: Language =
  "en";

const translations: Record<
  Language,
  TranslationMessages
> = {
  en: enMessages,
  fr: frMessages,
  rn: rnMessages,
};

export const LanguageContext =
  createContext<
    LanguageContextValue | undefined
  >(undefined);

/* =========================================================
   Translation helper
   ========================================================= */

function getTranslationValue(
  messages: TranslationMessages,
  key: string
): unknown {
  const keys = key.split(".");

  let current: unknown =
    messages;

  for (const currentKey of keys) {
    if (
      typeof current !==
        "object" ||
      current === null ||
      !(currentKey in current)
    ) {
      return undefined;
    }

    current = (
      current as Record<
        string,
        unknown
      >
    )[currentKey];
  }

  return current;
}

function isLanguage(
  value: string
): value is Language {
  return (
    value === "en" ||
    value === "fr" ||
    value === "rn"
  );
}

/* =========================================================
   Provider
   ========================================================= */

export function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  /*
   * English is always the initial/default
   * ULearn language.
   */
  const [
    language,
    setLanguageState,
  ] =
    useState<Language>(
      DEFAULT_LANGUAGE
    );

  const [
    initialized,
    setInitialized,
  ] = useState(false);

  /*
   * Restore the user's previous
   * language selection.
   */
  useEffect(() => {
    try {
      const savedLanguage =
        window.localStorage.getItem(
          STORAGE_KEY
        );

      if (
        savedLanguage &&
        isLanguage(savedLanguage)
      ) {
        setLanguageState(
          savedLanguage
        );
      }
    } catch (error) {
      console.warn(
        "Unable to restore language:",
        error
      );
    } finally {
      setInitialized(true);
    }
  }, []);

  /*
   * Save language and update the
   * <html lang=""> attribute.
   */
  useEffect(() => {
    if (!initialized) {
      return;
    }

    document.documentElement.lang =
      language;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        language
      );
    } catch (error) {
      console.warn(
        "Unable to save language:",
        error
      );
    }
  }, [
    language,
    initialized,
  ]);

  const setLanguage =
    useCallback(
      (
        newLanguage: Language
      ) => {
        setLanguageState(
          newLanguage
        );
      },
      []
    );

  /*
   * t("home.hero.title")
   */
  const t = useCallback(
    (key: string) => {
      const selectedValue =
        getTranslationValue(
          translations[language],
          key
        );

      if (
        typeof selectedValue ===
        "string"
      ) {
        return selectedValue;
      }

      /*
       * If a French/Kirundi translation
       * is missing, fall back to English.
       */
      const englishValue =
        getTranslationValue(
          translations.en,
          key
        );

      if (
        typeof englishValue ===
        "string"
      ) {
        return englishValue;
      }

      console.warn(
        `Missing translation: ${key}`
      );

      return key;
    },
    [language]
  );

  const value =
    useMemo(
      () => ({
        language,
        setLanguage,
        t,
      }),
      [
        language,
        setLanguage,
        t,
      ]
    );

  return (
    <LanguageContext.Provider
      value={value}
    >
      {children}
    </LanguageContext.Provider>
  );
}