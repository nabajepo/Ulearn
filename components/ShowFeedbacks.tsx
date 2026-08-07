"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import { useLanguage } from "@/hooks/useLanguage";

type FeedbackItem = {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
};

function clampRating(
  rating: number
) {
  return Math.max(
    0,
    Math.min(
      5,
      Math.round(rating)
    )
  );
}

function Stars({
  rating,
  ariaLabel,
}: {
  rating: number;
  ariaLabel: string;
}) {
  const safeRating =
    clampRating(rating);

  return (
    <div
      className="sc__stars"
      aria-label={ariaLabel}
    >
      {[1, 2, 3, 4, 5].map(
        (number) => (
          <span
            key={number}
            className={`sc__star ${
              safeRating >= number
                ? "is-on"
                : ""
            }`}
          >
            ★
          </span>
        )
      )}

      <span className="sc__ratingText">
        {safeRating}/5
      </span>
    </div>
  );
}

export default function ShowFeedbacks() {
  const {
    t,
    language,
  } = useLanguage();

  const [feedbacks, setFeedbacks] =
    useState<FeedbackItem[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  useEffect(() => {
    async function loadFeedbacks() {
      try {
        setLoading(true);
        setError("");

        const feedbackQuery =
          query(
            collection(
              db,
              "feedbacks"
            ),
            orderBy(
              "createdAt",
              "desc"
            ),
            limit(6)
          );

        const snapshot =
          await getDocs(
            feedbackQuery
          );

        const data:
          FeedbackItem[] =
          snapshot.docs.map(
            (docSnap) => {
              const raw =
                docSnap.data();

              return {
                id: docSnap.id,

                rating:
                  typeof raw.rating ===
                  "number"
                    ? raw.rating
                    : 0,

                comment:
                  typeof raw.comment ===
                  "string"
                    ? raw.comment
                    : "",

                createdAt:
                  typeof raw.createdAt ===
                  "string"
                    ? raw.createdAt
                    : new Date().toISOString(),
              };
            }
          );

        setFeedbacks(data);
      } catch (error) {
        console.error(
          "Error while loading feedbacks:",
          error
        );

        setError(
          t(
            "feedbackComponent.loadError"
          )
        );
      } finally {
        setLoading(false);
      }
    }

    loadFeedbacks();
  }, [t]);

  const stats =
    useMemo(() => {
      if (
        feedbacks.length === 0
      ) {
        return {
          avg: 0,
          count: 0,
        };
      }

      const sum =
        feedbacks.reduce(
          (
            total,
            feedback
          ) =>
            total +
            clampRating(
              feedback.rating
            ),
          0
        );

      return {
        avg:
          sum /
          feedbacks.length,

        count:
          feedbacks.length,
      };
    }, [feedbacks]);

  const locale =
    language === "fr"
      ? "fr-FR"
      : language === "rn"
        ? "rn-BI"
        : "en-US";

  if (loading) {
    return (
      <div className="sc__state">
        <h4 className="sc__stateTitle">
          {t(
            "feedbackComponent.loadingTitle"
          )}
        </h4>

        <p className="sc__stateText">
          {t(
            "feedbackComponent.loadingText"
          )}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sc__state">
        <h4 className="sc__stateTitle">
          {t(
            "feedbackComponent.unavailableTitle"
          )}
        </h4>

        <p className="sc__stateText">
          {error}
        </p>
      </div>
    );
  }

  const reviewText =
    stats.count === 0
      ? t(
          "feedbackComponent.noReviews"
        )
      : stats.count === 1
        ? `${stats.count} ${t(
            "feedbackComponent.recentReview"
          )}`
        : `${stats.count} ${t(
            "feedbackComponent.recentReviews"
          )}`;

  return (
    <div className="sc">
      <div className="sc__header">
        <div>
          <h3 className="sc__title">
            {t(
              "feedbackComponent.title"
            )}
          </h3>

          <p className="sc__subtitle">
            {reviewText}
          </p>
        </div>

        <div className="sc__avg">
          <div className="sc__avgNumber">
            {stats.avg.toFixed(1)}
          </div>

          <Stars
            rating={stats.avg}
            ariaLabel={`${t(
              "feedbackComponent.rating"
            )} ${stats.avg.toFixed(
              1
            )} ${t(
              "feedbackComponent.outOfFive"
            )}`}
          />
        </div>
      </div>

      {feedbacks.length ===
      0 ? (
        <div className="sc__empty">
          <div className="sc__emptyIcon">
            ★
          </div>

          <h4 className="sc__emptyTitle">
            {t(
              "feedbackComponent.emptyTitle"
            )}
          </h4>

          <p className="sc__emptyText">
            {t(
              "feedbackComponent.emptyText"
            )}
          </p>
        </div>
      ) : (
        <div className="sc__grid">
          {feedbacks.map(
            (feedback) => (
              <div
                className="sc__card"
                key={
                  feedback.id
                }
              >
                <div className="sc__cardTop">
                  <Stars
                    rating={
                      feedback.rating
                    }
                    ariaLabel={`${t(
                      "feedbackComponent.rating"
                    )} ${clampRating(
                      feedback.rating
                    )} ${t(
                      "feedbackComponent.outOfFive"
                    )}`}
                  />

                  <span className="sc__date">
                    {new Date(
                      feedback.createdAt
                    ).toLocaleDateString(
                      locale
                    )}
                  </span>
                </div>

                <p className="sc__comment">
                  {
                    feedback.comment
                  }
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}