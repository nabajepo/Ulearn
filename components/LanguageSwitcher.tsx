"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import type {
  Language,
} from "@/contexts/LanguageContext";

type LanguageOption = {
  code: Language;
  shortLabel: string;
  label: string;
};

const LANGUAGES: LanguageOption[] =
  [
    {
      code: "en",
      shortLabel: "EN",
      label: "English",
    },
    {
      code: "fr",
      shortLabel: "FR",
      label: "Français",
    },
    {
      code: "rn",
      shortLabel: "RN",
      label: "Kirundi",
    },
  ];

export default function LanguageSwitcher() {
  const {
    language,
    setLanguage,
  } = useLanguage();

  const [
    open,
    setOpen,
  ] = useState(false);

  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const currentLanguage =
    LANGUAGES.find(
      (item) =>
        item.code === language
    ) ?? LANGUAGES[0];

  useEffect(() => {
    function handleOutsideClick(
      event: MouseEvent
    ) {
      const target =
        event.target as Node;

      if (
        containerRef.current &&
        !containerRef.current.contains(
          target
        )
      ) {
        setOpen(false);
      }
    }

    function handleEscape(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape"
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, []);

  function selectLanguage(
    newLanguage: Language
  ) {
    setLanguage(
      newLanguage
    );

    setOpen(false);
  }

  return (
    <div
      ref={containerRef}
      className="language-switcher"
    >
      <button
        type="button"
        className="language-switcher-trigger"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change language"
      >
        <span
          className="language-switcher-globe"
          aria-hidden="true"
        >
          ◉
        </span>

        <span>
          {
            currentLanguage.shortLabel
          }
        </span>

        <span
          className={
            open
              ? "language-switcher-arrow is-open"
              : "language-switcher-arrow"
          }
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          className="language-switcher-menu"
          role="menu"
        >
          {LANGUAGES.map(
            (item) => {
              const selected =
                item.code ===
                language;

              return (
                <button
                  type="button"
                  key={item.code}
                  role="menuitemradio"
                  aria-checked={
                    selected
                  }
                  className={
                    selected
                      ? "language-switcher-option is-selected"
                      : "language-switcher-option"
                  }
                  onClick={() =>
                    selectLanguage(
                      item.code
                    )
                  }
                >
                  <span>
                    {item.label}
                  </span>

                  {selected && (
                    <span
                      className="language-switcher-check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}