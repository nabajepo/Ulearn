// lib/email/templates.ts

import "server-only";

import { LIMITS } from "@/lib/services/limits";

/**
 * ============================================================================
 * ULearn - Email Templates
 * ============================================================================
 *
 * Responsibilities
 * ----------------
 * • Build reusable transactional email templates.
 * • Provide both HTML and plain-text versions.
 * • Keep email content independent from the email provider.
 *
 * Current templates
 * -----------------
 * • Teacher welcome email.
 * • Teacher sign-in security notification.
 *
 * Important
 * ---------
 * This file does NOT send emails.
 *
 * Email delivery is handled by:
 *
 * lib/email/mailer.ts
 *
 * Dates received by these templates represent absolute instants.
 * The time zone is used only to control how those dates are displayed.
 * ============================================================================
 */

export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Default display time zone.
 *
 * This affects only the date/time shown inside emails.
 * It does NOT change the actual instant represented by a Date.
 */
const DEFAULT_EMAIL_TIME_ZONE =
  "America/Toronto";

/**
 * Input required to generate the teacher welcome email.
 */
export type TeacherWelcomeEmailInput = {
  teacherName: string;

  /**
   * Exact account expiration instant.
   */
  expirationDate: Date;

  /**
   * Optional IANA time zone used only for display.
   */
  timeZone?: string;
};

/**
 * Input required to generate the teacher
 * sign-in security notification.
 */
export type TeacherLoginEmailInput = {
  teacherName: string;

  /**
   * Exact instant associated with the detected sign-in.
   */
  loginDate: Date;

  /**
   * Optional IANA time zone used only for display.
   */
  timeZone?: string;
};

/**
 * Escapes user-controlled text before inserting it
 * into an HTML email.
 */
function escapeHtml(
  value: string
): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Normalizes a teacher name.
 */
function normalizeTeacherName(
  value: string
): string {
  const normalized =
    value.trim();

  return normalized || "Teacher";
}

/**
 * Returns a valid display time zone.
 *
 * Intl.DateTimeFormat throws a RangeError when an
 * invalid IANA time zone is provided.
 *
 * Instead of allowing email generation to fail,
 * ULearn falls back to the default display time zone.
 */
function normalizeTimeZone(
  timeZone?: string
): string {
  const candidate =
    timeZone?.trim();

  if (!candidate) {
    return DEFAULT_EMAIL_TIME_ZONE;
  }

  try {
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: candidate,
      }
    ).format(new Date());

    return candidate;
  } catch {
    return DEFAULT_EMAIL_TIME_ZONE;
  }
}

/**
 * Formats a date for display inside an email.
 *
 * The Date represents the real instant.
 * timeZone changes only its visual representation.
 */
function formatDate(
  date: Date,
  locale: "en-CA" | "fr-CA",
  timeZone: string
): string {
  return new Intl.DateTimeFormat(
    locale,
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone,
      timeZoneName: "short",
    }
  ).format(date);
}

/**
 * Returns a simple English singular/plural form.
 */
function pluralizeEnglish(
  count: number,
  singular: string,
  plural: string
): string {
  return count === 1
    ? singular
    : plural;
}

/**
 * Returns a simple French singular/plural form.
 */
function pluralizeFrench(
  count: number,
  singular: string,
  plural: string
): string {
  return count === 1
    ? singular
    : plural;
}

/**
 * Builds the common visual structure used by ULearn emails.
 */
function buildLayout(
  content: string
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>ULearn</title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background-color: #f6f4fa;
          font-family: Arial, Helvetica, sans-serif;
          color: #171717;
        "
      >
        <div
          style="
            max-width: 680px;
            margin: 0 auto;
            padding: 32px 16px;
          "
        >
          <div
            style="
              background-color: #ffffff;
              border-radius: 16px;
              overflow: hidden;
              border: 1px solid #ebe6f3;
            "
          >
            <div
              style="
                background-color: #2a0369;
                color: #ffffff;
                padding: 24px 28px;
              "
            >
              <div
                style="
                  font-size: 24px;
                  font-weight: 700;
                "
              >
                ULearn
              </div>

              <div
                style="
                  margin-top: 6px;
                  font-size: 14px;
                  opacity: 0.9;
                "
              >
                Smart quiz platform
              </div>
            </div>

            <div
              style="
                padding: 28px;
              "
            >
              ${content}
            </div>

            <div
              style="
                padding: 20px 28px;
                background-color: #faf9fc;
                border-top: 1px solid #ebe6f3;
                color: #666666;
                font-size: 12px;
                line-height: 1.6;
              "
            >
              ULearn — Smart quiz platform
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * ============================================================================
 * Teacher Welcome Email
 * ============================================================================
 *
 * One email contains all three supported ULearn languages:
 *
 * • English
 * • French
 * • Kirundi
 * ============================================================================
 */
export function getTeacherWelcomeEmailTemplate(
  input: TeacherWelcomeEmailInput
): EmailTemplate {
  const rawTeacherName =
    normalizeTeacherName(
      input.teacherName
    );

  const htmlTeacherName =
    escapeHtml(
      rawTeacherName
    );

  const timeZone =
    normalizeTimeZone(
      input.timeZone
    );

  const expirationEnglish =
    formatDate(
      input.expirationDate,
      "en-CA",
      timeZone
    );

  const expirationFrench =
    formatDate(
      input.expirationDate,
      "fr-CA",
      timeZone
    );

  /**
   * Kirundi currently reuses the French/Canadian
   * date representation.
   */
  const expirationKirundi =
    expirationFrench;

  const englishQuizLabel =
    pluralizeEnglish(
      LIMITS.MAX_QUIZZES_PER_TEACHER,
      "active quiz",
      "active quizzes"
    );

  const englishStudentLabel =
    pluralizeEnglish(
      LIMITS.MAX_STUDENTS_PER_QUIZ,
      "student",
      "students"
    );

  const englishQuestionLabel =
    pluralizeEnglish(
      LIMITS.MAX_QUESTIONS_PER_QUIZ,
      "question",
      "questions"
    );

  const frenchQuizLabel =
    pluralizeFrench(
      LIMITS.MAX_QUIZZES_PER_TEACHER,
      "quiz actif",
      "quiz actifs"
    );

  const frenchStudentLabel =
    pluralizeFrench(
      LIMITS.MAX_STUDENTS_PER_QUIZ,
      "étudiant",
      "étudiants"
    );

  const frenchQuestionLabel =
    pluralizeFrench(
      LIMITS.MAX_QUESTIONS_PER_QUIZ,
      "question",
      "questions"
    );

  const content = `
    <!-- ENGLISH -->

    <section>
      <h2
        style="
          margin: 0 0 16px;
          color: #2a0369;
          font-size: 21px;
        "
      >
        Welcome to ULearn
      </h2>

      <p style="line-height: 1.7;">
        Hello ${htmlTeacherName},
      </p>

      <p style="line-height: 1.7;">
        Your ULearn teacher account has been successfully created.
      </p>

      <p style="line-height: 1.7;">
        Your account is available for
        <strong>${LIMITS.ACCOUNT_DURATION_DAYS} days</strong>
        and will expire on:
      </p>

      <p
        style="
          padding: 14px;
          background-color: #f6f2fc;
          border-radius: 10px;
          font-weight: 700;
          color: #2a0369;
        "
      >
        ${expirationEnglish}
      </p>

      <p style="line-height: 1.7;">
        During this period, you can create up to
        <strong>
          ${LIMITS.MAX_QUIZZES_PER_TEACHER}
          ${englishQuizLabel}
        </strong>,
        with up to
        <strong>
          ${LIMITS.MAX_STUDENTS_PER_QUIZ}
          ${englishStudentLabel}
        </strong>
        and
        <strong>
          ${LIMITS.MAX_QUESTIONS_PER_QUIZ}
          ${englishQuestionLabel}
        </strong>.
      </p>

      <p style="line-height: 1.7;">
        Before your account expires, make sure your quizzes
        are completed and graded.
      </p>
    </section>

    <hr
      style="
        border: 0;
        border-top: 1px solid #e6e0ef;
        margin: 32px 0;
      "
    />

    <!-- FRANÇAIS -->

    <section>
      <h2
        style="
          margin: 0 0 16px;
          color: #2a0369;
          font-size: 21px;
        "
      >
        Bienvenue sur ULearn
      </h2>

      <p style="line-height: 1.7;">
        Bonjour ${htmlTeacherName},
      </p>

      <p style="line-height: 1.7;">
        Votre compte enseignant ULearn a été créé avec succès.
      </p>

      <p style="line-height: 1.7;">
        Votre compte est disponible pendant
        <strong>${LIMITS.ACCOUNT_DURATION_DAYS} jours</strong>
        et expirera le :
      </p>

      <p
        style="
          padding: 14px;
          background-color: #f6f2fc;
          border-radius: 10px;
          font-weight: 700;
          color: #2a0369;
        "
      >
        ${expirationFrench}
      </p>

      <p style="line-height: 1.7;">
        Pendant cette période, vous pouvez créer jusqu'à
        <strong>
          ${LIMITS.MAX_QUIZZES_PER_TEACHER}
          ${frenchQuizLabel}
        </strong>,
        accueillir jusqu'à
        <strong>
          ${LIMITS.MAX_STUDENTS_PER_QUIZ}
          ${frenchStudentLabel}
        </strong>
        et ajouter jusqu'à
        <strong>
          ${LIMITS.MAX_QUESTIONS_PER_QUIZ}
          ${frenchQuestionLabel}
        </strong>.
      </p>

      <p style="line-height: 1.7;">
        Avant l'expiration de votre compte, assurez-vous
        que vos quiz sont terminés et corrigés.
      </p>
    </section>

    <hr
      style="
        border: 0;
        border-top: 1px solid #e6e0ef;
        margin: 32px 0;
      "
    />

    <!-- KIRUNDI -->

    <section>
      <h2
        style="
          margin: 0 0 16px;
          color: #2a0369;
          font-size: 21px;
        "
      >
        Karibu kuri ULearn
      </h2>

      <p style="line-height: 1.7;">
        Amahoro ${htmlTeacherName},
      </p>

      <p style="line-height: 1.7;">
        Konti yawe y'umwigisha kuri ULearn yarakozwe neza.
      </p>

      <p style="line-height: 1.7;">
        Konti yawe izomara
        <strong>${LIMITS.ACCOUNT_DURATION_DAYS} imisi</strong>
        kandi izorangira kuri:
      </p>

      <p
        style="
          padding: 14px;
          background-color: #f6f2fc;
          border-radius: 10px;
          font-weight: 700;
          color: #2a0369;
        "
      >
        ${expirationKirundi}
      </p>

      <p style="line-height: 1.7;">
        Muri ico gihe, ushobora gukora
        <strong>
          ${LIMITS.MAX_QUIZZES_PER_TEACHER} quiz
        </strong>,
        ikagira abanyeshure gushika kuri
        <strong>
          ${LIMITS.MAX_STUDENTS_PER_QUIZ}
        </strong>
        hamwe n'ibibazo gushika kuri
        <strong>
          ${LIMITS.MAX_QUESTIONS_PER_QUIZ}
        </strong>.
      </p>

      <p style="line-height: 1.7;">
        Imbere y'uko konti yawe irangira, urabe neza ko
        quiz zawe zarangiye kandi zakosowe.
      </p>
    </section>
  `;

  const html =
    buildLayout(content);

  const text = `
ULearn


ENGLISH

Hello ${rawTeacherName},

Your ULearn teacher account has been successfully created.

Account duration: ${LIMITS.ACCOUNT_DURATION_DAYS} days
Expiration: ${expirationEnglish}
Maximum active quizzes: ${LIMITS.MAX_QUIZZES_PER_TEACHER}
Maximum students per quiz: ${LIMITS.MAX_STUDENTS_PER_QUIZ}
Maximum questions per quiz: ${LIMITS.MAX_QUESTIONS_PER_QUIZ}

Before your account expires, make sure your quizzes are completed and graded.


FRANÇAIS

Bonjour ${rawTeacherName},

Votre compte enseignant ULearn a été créé avec succès.

Durée du compte : ${LIMITS.ACCOUNT_DURATION_DAYS} jours
Expiration : ${expirationFrench}
Nombre maximal de quiz actifs : ${LIMITS.MAX_QUIZZES_PER_TEACHER}
Nombre maximal d'étudiants par quiz : ${LIMITS.MAX_STUDENTS_PER_QUIZ}
Nombre maximal de questions par quiz : ${LIMITS.MAX_QUESTIONS_PER_QUIZ}

Avant l'expiration de votre compte, assurez-vous que vos quiz sont terminés et corrigés.


KIRUNDI

Amahoro ${rawTeacherName},

Konti yawe y'umwigisha kuri ULearn yarakozwe neza.

Igihe konti imara: imisi ${LIMITS.ACCOUNT_DURATION_DAYS}
Igihe izorangirira: ${expirationKirundi}
Quiz ushobora kugira: ${LIMITS.MAX_QUIZZES_PER_TEACHER}
Abanyeshure kuri quiz: ${LIMITS.MAX_STUDENTS_PER_QUIZ}
Ibibazo kuri quiz: ${LIMITS.MAX_QUESTIONS_PER_QUIZ}

Imbere y'uko konti yawe irangira, urabe neza ko quiz zawe
zarangiye kandi zakosowe.
  `.trim();

  return {
    subject:
      "Welcome to ULearn | Bienvenue sur ULearn | Karibu kuri ULearn",
    html,
    text,
  };
}

/**
 * ============================================================================
 * Teacher Sign-In Security Email
 * ============================================================================
 *
 * Sent when ULearn detects a new authenticated teacher sign-in.
 *
 * Important
 * ---------
 * This template does NOT decide whether a sign-in is new.
 *
 * Session/event deduplication must be handled by the server-side
 * authentication/email workflow.
 * ============================================================================
 */
export function getTeacherLoginEmailTemplate(
  input: TeacherLoginEmailInput
): EmailTemplate {
  const rawTeacherName =
    normalizeTeacherName(
      input.teacherName
    );

  const htmlTeacherName =
    escapeHtml(
      rawTeacherName
    );

  const timeZone =
    normalizeTimeZone(
      input.timeZone
    );

  const loginEnglish =
    formatDate(
      input.loginDate,
      "en-CA",
      timeZone
    );

  const loginFrench =
    formatDate(
      input.loginDate,
      "fr-CA",
      timeZone
    );

  const loginKirundi =
    loginFrench;

  const content = `
    <!-- ENGLISH -->

    <section>
      <h2
        style="
          margin: 0 0 16px;
          color: #2a0369;
          font-size: 21px;
        "
      >
        New sign-in detected
      </h2>

      <p style="line-height: 1.7;">
        Hello ${htmlTeacherName},
      </p>

      <p style="line-height: 1.7;">
        A new sign-in to your ULearn teacher account was detected.
      </p>

      <p
        style="
          padding: 14px;
          background-color: #f6f2fc;
          border-radius: 10px;
          font-weight: 700;
          color: #2a0369;
        "
      >
        ${loginEnglish}
      </p>

      <p style="line-height: 1.7;">
        If this was you, no action is required.
      </p>

      <p style="line-height: 1.7;">
        If you do not recognize this activity, secure your
        authentication account as soon as possible.
      </p>
    </section>

    <hr
      style="
        border: 0;
        border-top: 1px solid #e6e0ef;
        margin: 32px 0;
      "
    />

    <!-- FRANÇAIS -->

    <section>
      <h2
        style="
          margin: 0 0 16px;
          color: #2a0369;
          font-size: 21px;
        "
      >
        Nouvelle connexion détectée
      </h2>

      <p style="line-height: 1.7;">
        Bonjour ${htmlTeacherName},
      </p>

      <p style="line-height: 1.7;">
        Une nouvelle connexion à votre compte enseignant
        ULearn a été détectée.
      </p>

      <p
        style="
          padding: 14px;
          background-color: #f6f2fc;
          border-radius: 10px;
          font-weight: 700;
          color: #2a0369;
        "
      >
        ${loginFrench}
      </p>

      <p style="line-height: 1.7;">
        Si cette connexion vient de vous, aucune action
        n'est nécessaire.
      </p>

      <p style="line-height: 1.7;">
        Si vous ne reconnaissez pas cette activité,
        sécurisez votre compte d'authentification dès que possible.
      </p>
    </section>

    <hr
      style="
        border: 0;
        border-top: 1px solid #e6e0ef;
        margin: 32px 0;
      "
    />

    <!-- KIRUNDI -->

    <section>
      <h2
        style="
          margin: 0 0 16px;
          color: #2a0369;
          font-size: 21px;
        "
      >
        Hari ukwinjira gushasha kwabonywe
      </h2>

      <p style="line-height: 1.7;">
        Amahoro ${htmlTeacherName},
      </p>

      <p style="line-height: 1.7;">
        Hari ukwinjira gushasha kwabonywe kuri konti yawe
        y'umwigisha ya ULearn.
      </p>

      <p
        style="
          padding: 14px;
          background-color: #f6f2fc;
          border-radius: 10px;
          font-weight: 700;
          color: #2a0369;
        "
      >
        ${loginKirundi}
      </p>

      <p style="line-height: 1.7;">
        Nimba ari wewe winjiye, nta kindi utegerezwa gukora.
      </p>

      <p style="line-height: 1.7;">
        Nimba utazi uku kwinjira, kingira konti yawe
        yo kwemeza umwirondoro ningoga.
      </p>
    </section>
  `;

  const html =
    buildLayout(content);

  const text = `
ULearn


ENGLISH

Hello ${rawTeacherName},

A new sign-in to your ULearn teacher account was detected.

Date and time: ${loginEnglish}

If this was you, no action is required.

If you do not recognize this activity, secure your authentication account as soon as possible.


FRANÇAIS

Bonjour ${rawTeacherName},

Une nouvelle connexion à votre compte enseignant ULearn a été détectée.

Date et heure : ${loginFrench}

Si cette connexion vient de vous, aucune action n'est nécessaire.

Si vous ne reconnaissez pas cette activité, sécurisez votre compte d'authentification dès que possible.


KIRUNDI

Amahoro ${rawTeacherName},

Hari ukwinjira gushasha kwabonywe kuri konti yawe y'umwigisha ya ULearn.

Itariki n'isaha: ${loginKirundi}

Nimba ari wewe winjiye, nta kindi utegerezwa gukora.

Nimba utazi uku kwinjira, kingira konti yawe yo kwemeza umwirondoro ningoga.
  `.trim();

  return {
    subject:
      "ULearn sign-in alert | Alerte de connexion ULearn | Ubutumwa bwo kwinjira kuri ULearn",
    html,
    text,
  };
}