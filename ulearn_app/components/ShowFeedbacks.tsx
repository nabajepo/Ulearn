"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";

type FeedbackItem = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
};

function clampRating(r: number) {
  return Math.max(0, Math.min(5, Math.round(r)));
}

function Stars({ rating }: { rating: number }) {
  const r = clampRating(rating);

  return (
    <div className="sc__stars" aria-label={`Rating ${r} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`sc__star ${r >= n ? "is-on" : ""}`}>
          ★
        </span>
      ))}
      <span className="sc__ratingText">{r}/5</span>
    </div>
  );
}

export default function ShowFeedbacks() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadFeedbacks = async () => {
      try {
        setLoading(true);
        setError("");

        const q = query(collection(db, "feedbacks"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const data: FeedbackItem[] = snapshot.docs.map((doc) => {
          const raw = doc.data();

          return {
            id: doc.id,
            rating: typeof raw.rating === "number" ? raw.rating : 0,
            comment: typeof raw.comment === "string" ? raw.comment : "",
            createdAt:
              typeof raw.createdAt === "string"
                ? raw.createdAt
                : new Date().toISOString(),
          };
        });

        setFeedbacks(data);
      } catch (err) {
        console.error("Error while loading feedbacks:", err);
        setError("Unable to load feedback at the moment.");
      } finally {
        setLoading(false);
      }
    };

    loadFeedbacks();
  }, []);

  const stats = useMemo(() => {
    if (feedbacks.length === 0) {
      return { avg: 0, count: 0 };
    }

    const sum = feedbacks.reduce((acc, f) => acc + clampRating(f.rating), 0);

    return {
      avg: sum / feedbacks.length,
      count: feedbacks.length,
    };
  }, [feedbacks]);

  if (loading) {
    return (
      <div className="sc">
        <div className="sc__state">
          <h3 className="sc__stateTitle">Loading feedback...</h3>
          <p className="sc__stateText">
            Please wait while we load student reviews.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sc">
        <div className="sc__state sc__state--error">
          <h3 className="sc__stateTitle">Feedback unavailable</h3>
          <p className="sc__stateText">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sc">
      <div className="sc__header">
        <div>
          <h3 className="sc__title">Students Feedbacks</h3>
          <p className="sc__subtitle">
            {stats.count === 0
              ? "0 reviews"
              : `${stats.count} review${stats.count > 1 ? "s" : ""}`}
          </p>
        </div>

        <div className="sc__avg">
          <div className="sc__avgNumber">{stats.avg.toFixed(1)}</div>
          <Stars rating={stats.avg} />
        </div>
      </div>

      {feedbacks.length === 0 ? (
        <div className="sc__empty">
          <div className="sc__emptyIcon">★</div>
          <h4 className="sc__emptyTitle">No feedback yet</h4>
          <p className="sc__emptyText">
            There are currently no comments in the feedback section.
          </p>
        </div>
      ) : (
        <div className="sc__grid">
          {feedbacks.map((f) => (
            <div className="sc__card" key={f.id}>
              <div className="sc__cardTop">
                <Stars rating={f.rating} />
                <span className="sc__date">
                  {new Date(f.createdAt).toLocaleDateString()}
                </span>
              </div>

              <p className="sc__comment">{f.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}