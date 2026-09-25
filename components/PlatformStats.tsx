"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  getAppStats,
  type AppStats,
} from "@/lib/services/stats";

import {
  LIMITS,
} from "@/lib/services/limits";

import {
  useLanguage,
} from "@/hooks/useLanguage";

export default function PlatformStats() {
  const {
    t,
  } = useLanguage();

  const [
    stats,
    setStats,
  ] =
    useState<AppStats | null>(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const data =
          await getAppStats();

        setStats(data);
      } catch (error) {
        console.error(
          "Error loading platform stats:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <p>
        {t(
          "platformStats.loading"
        )}
      </p>
    );
  }

  if (!stats) {
    return (
      <p>
        {t(
          "platformStats.error"
        )}
      </p>
    );
  }

  return (
    <div className="platform-stats">
      {/* ===============================================
          Active teachers
          =============================================== */}

      <article className="stat-card">
        <span>
          {t(
            "platformStats.activeTeachers"
          )}
        </span>

        <strong>
          {
            stats.activeTeachers
          }{" "}
          /{" "}
          {
            LIMITS.MAX_TEACHERS
          }
        </strong>
      </article>

      {/* ===============================================
          Total teachers who have used ULearn
          =============================================== */}

      <article className="stat-card">
        <span>
          {t(
            "platformStats.totalTeachers"
          )}
        </span>

        <strong>
          {
            stats.totalTeachers
          }
        </strong>
      </article>
    </div>
  );
}