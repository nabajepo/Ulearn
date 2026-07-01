"use client";

import { useEffect, useState } from "react";
import { getAppStats, type AppStats } from "@/lib/services/stats";
import { LIMITS } from "@/lib/services/limits";

export default function PlatformStats() {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await getAppStats();
        setStats(data);
      } catch (error) {
        console.error("Error loading platform stats:", error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="platform-stats">
        <p>Loading platform statistics...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="platform-stats">
        <p>Unable to load platform statistics.</p>
      </div>
    );
  }

  return (
    <div className="platform-stats">
      <article className="stat-card">
        <span>Active Teachers</span>
        <strong>
          {stats.activeTeachers} / {LIMITS.MAX_TEACHERS}
        </strong>
      </article>

      <article className="stat-card">
        <span>Total Teachers</span>
        <strong>{stats.totalTeachers}</strong>
      </article>

      <article className="stat-card">
        <span>Active Quizzes</span>
        <strong>{stats.activeQuizzes}</strong>
      </article>

      <article className="stat-card">
        <span>Total Quizzes Created</span>
        <strong>{stats.totalQuizzesCreated}</strong>
      </article>
    </div>
  );
}