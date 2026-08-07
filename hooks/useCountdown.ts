"use client";

/**
 * ============================================================================
 * ULearn - useCountdown Hook
 * ============================================================================
 *
 * Purpose
 * -------
 * Calculates and updates a real-time localized countdown
 * until a given expiration date.
 *
 * Examples:
 *
 * English:
 * 2d 14h 32m 18s
 *
 * French:
 * 2j 14h 32min 18s
 *
 * Kirundi:
 * 2u 14h 32m 18s
 *
 * ============================================================================
 */

import {
  useEffect,
  useState,
} from "react";

import {
  useLanguage,
} from "@/hooks/useLanguage";

export function useCountdown(
  expiresAt: string | null
) {
  const { t } =
    useLanguage();

  const [
    timeLeft,
    setTimeLeft,
  ] = useState("");

  useEffect(() => {
    /* =====================================================
       No expiration date
       ===================================================== */

    if (!expiresAt) {
      setTimeLeft(
        t(
          "countdown.unavailable"
        )
      );

      return;
    }

    /* =====================================================
       Countdown calculation
       ===================================================== */

    function updateCountdown() {
      const now =
        Date.now();

      const expiration =
        new Date(
          expiresAt
        ).getTime();

      /* ===================================================
         Invalid date
         =================================================== */

      if (
        Number.isNaN(
          expiration
        )
      ) {
        setTimeLeft(
          t(
            "countdown.unavailable"
          )
        );

        return;
      }

      const difference =
        expiration - now;

      /* ===================================================
         Expired
         =================================================== */

      if (
        difference <= 0
      ) {
        setTimeLeft(
          t(
            "countdown.expired"
          )
        );

        return;
      }

      /* ===================================================
         Calculate units
         =================================================== */

      const days =
        Math.floor(
          difference /
            (
              1000 *
              60 *
              60 *
              24
            )
        );

      const hours =
        Math.floor(
          (
            difference /
            (
              1000 *
              60 *
              60
            )
          ) %
            24
        );

      const minutes =
        Math.floor(
          (
            difference /
            (
              1000 *
              60
            )
          ) %
            60
        );

      const seconds =
        Math.floor(
          (
            difference /
            1000
          ) %
            60
        );

      /* ===================================================
         Localized units
         =================================================== */

      const dayUnit =
        t(
          "countdown.units.day"
        );

      const hourUnit =
        t(
          "countdown.units.hour"
        );

      const minuteUnit =
        t(
          "countdown.units.minute"
        );

      const secondUnit =
        t(
          "countdown.units.second"
        );

      /* ===================================================
         Final text
         =================================================== */

      setTimeLeft(
        `${days}${dayUnit} ` +
          `${hours}${hourUnit} ` +
          `${minutes}${minuteUnit} ` +
          `${seconds}${secondUnit}`
      );
    }

    /* =====================================================
       Run immediately
       ===================================================== */

    updateCountdown();

    /* =====================================================
       Update every second
       ===================================================== */

    const interval =
      window.setInterval(
        updateCountdown,
        1000
      );

    /* =====================================================
       Cleanup
       ===================================================== */

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    expiresAt,
    t,
  ]);

  /* =====================================================
     Initial localized loading state
     ===================================================== */

  if (!timeLeft) {
    return t(
      "countdown.loading"
    );
  }

  return timeLeft;
}