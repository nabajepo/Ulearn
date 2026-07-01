"use client";

/**
 * ============================================================================
 * ULearn - DashboardLoading Component
 * ============================================================================
 *
 * Purpose
 * -------
 * Displays a modern loading screen while the dashboard is being prepared.
 *
 * Why does this file exist?
 * -------------------------
 * The dashboard needs a short preparation step after authentication.
 * This component gives the user visual feedback while ULearn checks the
 * account, profile, expiration status, and workspace.
 *
 * Responsibilities
 * ----------------
 * • Show the ULearn brand.
 * • Display preparation steps.
 * • Animate a progress bar.
 * • Keep the dashboard transition professional.
 *
 * Used by
 * -------
 * Dashboard Page
 * Future protected pages
 * ============================================================================
 */

import { useEffect, useState } from "react";

const steps = [
  "Authentication verified",
  "Teacher profile loaded",
  "Checking account status",
  "Preparing workspace",
];

export default function DashboardLoading() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev >= steps.length - 1) return prev;
        return prev + 1;
      });
    }, 700);

    return () => clearInterval(interval);
  }, []);

  return (
    <main className="dashboard-loading-page">
      <div className="dashboard-loading-box">
        <div className="dashboard-loading-logo">ULearn</div>

        <h1>Preparing your dashboard</h1>
        <p>We are setting up your secure learning workspace.</p>

        <div className="loading-steps">
          {steps.map((step, index) => (
            <div
              key={step}
              className={`loading-step ${
                index <= activeStep ? "is-active" : ""
              }`}
            >
              <span>{index <= activeStep ? "✓" : index + 1}</span>
              <p>{step}</p>
            </div>
          ))}
        </div>

        <div className="loading-bar">
          <div className="loading-bar-fill" />
        </div>

        <small>Opening your dashboard...</small>
      </div>
    </main>
  );
}