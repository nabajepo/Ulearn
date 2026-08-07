"use client";

import {
  ClerkProvider,
} from "@clerk/nextjs";

import {
  enUS,
  frFR,
} from "@clerk/localizations";

import {
  useMemo,
  type ReactNode,
} from "react";

import {
  LanguageProvider,
} from "@/contexts/LanguageContext";

import {
  useLanguage,
} from "@/hooks/useLanguage";

/* =========================================================
   Localized Clerk provider
   ========================================================= */

function LocalizedClerkProvider({
  children,
}: {
  children: ReactNode;
}) {
  const {
    language,
    t,
  } = useLanguage();

  const localization =
    useMemo(() => {
      /*
       * Clerk currently provides French,
       * but not Kirundi.
       *
       * Therefore:
       *
       * EN -> Clerk English
       * FR -> Clerk French
       * RN -> English base + our
       *       Kirundi custom strings.
       */
      const baseLocalization =
        language === "fr"
          ? frFR
          : enUS;

      return {
        ...baseLocalization,

        formButtonPrimary:
          t(
            "clerk.common.continue"
          ),

        signIn: {
          ...baseLocalization.signIn,

          start: {
            ...baseLocalization
              .signIn?.start,

            title:
              t(
                "clerk.signIn.title"
              ),

            subtitle:
              t(
                "clerk.signIn.subtitle"
              ),
          },
        },

        signUp: {
          ...baseLocalization.signUp,

          start: {
            ...baseLocalization
              .signUp?.start,

            title:
              t(
                "clerk.signUp.title"
              ),

            subtitle:
              t(
                "clerk.signUp.subtitle"
              ),
          },
        },
      };
    }, [
      language,
      t,
    ]);

  return (
    <ClerkProvider
      localization={
        localization
      }
    >
      {children}
    </ClerkProvider>
  );
}

/* =========================================================
   Global providers
   ========================================================= */

export default function AppProviders({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <LanguageProvider>
      <LocalizedClerkProvider>
        {children}
      </LocalizedClerkProvider>
    </LanguageProvider>
  );
}