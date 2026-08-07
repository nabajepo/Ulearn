"use client";

import {
  useMemo,
} from "react";

import {
  useLanguage,
} from "@/hooks/useLanguage";

type AppLoadingProps = {
  title?: string;
  subtitle?: string;
  fullScreen?: boolean;
};

export default function AppLoading({
  title,
  subtitle,
  fullScreen = true,
}: AppLoadingProps) {
  const {
    t,
  } = useLanguage();

  const displayedTitle =
    title || "ULearn";

  const displayedSubtitle =
    subtitle ||
    t(
      "loading.defaultSubtitle"
    );

  const loadingLetters =
    useMemo(
      () =>
        t(
          "loading.word"
        ).split(""),
      [
        t,
      ]
    );

  const firstDotDelay =
    loadingLetters.length *
    0.1;

  return (
    <main
      className={`app-loading ${
        fullScreen
          ? "app-loading--fullscreen"
          : "app-loading--inline"
      }`}
      role="status"
      aria-live="polite"
      aria-label={
        displayedSubtitle
      }
    >
      <section className="app-loading-content">
        <div
          className="app-loading-logo"
          aria-hidden="true"
        >
          U
        </div>

        <h1 className="app-loading-title">
          {displayedTitle}
        </h1>

        <div
          className="app-loading-word"
          aria-hidden="true"
        >
          {loadingLetters.map(
            (
              letter,
              index
            ) => (
              <span
                key={`${letter}-${index}`}
                className="app-loading-letter"
                style={{
                  animationDelay:
                    `${index * 0.1}s`,
                }}
              >
                {letter}
              </span>
            )
          )}

          <span
            className="app-loading-dot"
            style={{
              animationDelay:
                `${firstDotDelay}s`,
            }}
          >
            .
          </span>

          <span
            className="app-loading-dot"
            style={{
              animationDelay:
                `${
                  firstDotDelay +
                  0.1
                }s`,
            }}
          >
            .
          </span>

          <span
            className="app-loading-dot"
            style={{
              animationDelay:
                `${
                  firstDotDelay +
                  0.2
                }s`,
            }}
          >
            .
          </span>
        </div>

        <p className="app-loading-subtitle">
          {displayedSubtitle}
        </p>
      </section>
    </main>
  );
}