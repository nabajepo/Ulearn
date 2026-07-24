// lib/services/limits.ts

const ACCOUNT_DURATION_DAYS = 3;

export const LIMITS = {
  MAX_TEACHERS: 5,

  MAX_QUIZZES_PER_TEACHER: 1,

  MAX_QUESTIONS_PER_QUIZ: 50,
  MAX_QCM_QUESTIONS: 40,
  MAX_DEVELOPMENT_QUESTIONS: 10,

  MAX_STUDENTS_PER_QUIZ: 60,

  ACCOUNT_DURATION_DAYS,

  /*
   * Maximum theoretical quiz duration.
   *
   * 3 days × 24 hours × 60 minutes = 4320 minutes.
   *
   * The real maximum may be smaller because the teacher account
   * may already have consumed part of its 3-day lifetime.
   */
  MAX_QUIZ_DURATION_MINUTES:
    ACCOUNT_DURATION_DAYS * 24 * 60,
};