"use client";

/**
 * ============================================================================
 * ULearn - useCountdown Hook
 * ============================================================================
 *
 * Purpose
 * -------
 * This custom React hook calculates and updates a real-time countdown
 * until a given expiration date.
 *
 * Why does this file exist?
 * -------------------------
 * Every teacher account in ULearn expires after a fixed number of days.
 * Instead of rewriting countdown logic in multiple pages or components,
 * this hook centralizes the countdown behavior in one reusable place.
 *
 * Responsibilities
 * ----------------
 * • Calculate the remaining time.
 * • Update the countdown every second.
 * • Detect when the account has expired.
 * • Return a formatted string ready to display in the UI.
 *
 * Example Output
 * --------------
 * 2d 14h 32m 18s
 *
 * Used by
 * -------
 * Dashboard
 * Teacher Account Header
 * Future Account Management Pages
 * ============================================================================
 */

import { useEffect, useState } from "react";

export function useCountdown(expiresAt: string | null) {
  const [timeLeft, setTimeLeft] = useState("Loading...");

  useEffect(() => {
    if (!expiresAt) {
      setTimeLeft("Unavailable");
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const expiration = new Date(expiresAt).getTime();
      const diff = expiration - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown();

    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return timeLeft;
}