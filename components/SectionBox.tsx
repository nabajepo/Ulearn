"use client";

import {
  useState,
} from "react";

import Link from "next/link";

import { useLanguage } from "@/hooks/useLanguage";

export default function SectionBox() {
  const { t } =
    useLanguage();

  const [open, setOpen] =
    useState(false);

  function scrollToSection(
    id: string
  ) {
    const element =
      document.getElementById(
        id
      );

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
      });

      setOpen(false);
    }
  }

  return (
    <div className="navSectionBox">
      <button
        type="button"
        className="navName"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {t(
          "navigation.menu"
        )}
      </button>

      {open && (
        <div
          className="navSectionBoxLink"
          role="menu"
        >
          <Link
            href="#home"
            onClick={() =>
              scrollToSection(
                "home"
              )
            }
            className="navLink"
          >
            {t(
              "navigation.home"
            )}
          </Link>
          <Link
            href="#findAQuiz"
            onClick={() =>
              scrollToSection(
                "findAQuiz"
              )
            }
            className="navLink"
          >
            {t(
              "navigation.findAQuiz"
            )}
          </Link>

          <Link
            href="#howItWorks"
            onClick={() =>
              scrollToSection(
                "howItWorks"
              )
            }
            className="navLink"
          >
            {t(
              "navigation.howItWorks"
            )}
          </Link>

          <Link
            href="#faq"
            onClick={() =>
              scrollToSection(
                "faq"
              )
            }
            className="navLink"
          >
            FAQ
          </Link>

          <Link
            href="#stats"
            onClick={() =>
              scrollToSection(
                "stats"
              )
            }
            className="navLink"
          >
            {t(
              "navigation.stats"
            )}
          </Link>

          <Link
            href="#feedback"
            onClick={() =>
              scrollToSection(
                "feedback"
              )
            }
            className="navLink"
          >
            {t(
              "navigation.feedback"
            )}
          </Link>

          <Link
            href="#start"
            onClick={() =>
              scrollToSection(
                "start"
              )
            }
            className="navLink"
          >
            {t(
              "navigation.getStarted"
            )}
          </Link>
        </div>
      )}
    </div>
  );
}