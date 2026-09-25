import "server-only";

import {
  clerkClient,
} from "@clerk/nextjs/server";

import type {
  DocumentData,
  QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "@/lib/firebaseAdmin";

import {
  sendEmail,
} from "@/lib/email/mailer";

import {
  generateExpirationArchive,
  type ExpirationArchiveLanguage,
} from "@/lib/server/expiration/archive";

import {
  calculateAutomaticScore,
} from "@/lib/scoring/attemptScoring";

import type {
  Attempt,
} from "@/lib/services/attempts";

import type {
  Question,
} from "@/lib/services/questions";

import type {
  Quiz,
} from "@/lib/services/quizzes";

/* =========================================================
   Constants
   ========================================================= */

const WARNING_BEFORE_EXPIRATION_MS =
  3 * 60 * 60 * 1000;

const USERS_COLLECTION =
  "users";

const QUIZZES_COLLECTION =
  "quizzes";

const QUESTIONS_COLLECTION =
  "questions";

const ATTEMPTS_COLLECTION =
  "attempts";

const STUDENT_ATTEMPT_CREDENTIALS_COLLECTION =
  "studentAttemptCredentials";

/* =========================================================
   Types
   ========================================================= */

type TeacherLanguage =
  ExpirationArchiveLanguage;

type ExpirationTeacher = {
  id: string;

  name: string;
  email: string;

  expiresAt: string;

  quizId: string | null;

  status:
    | "active"
    | "expired";

  expirationWarningSentAt:
    string | null;

  expirationArchiveSentAt:
    string | null;
};

export type ExpirationCleanupResult = {
  checkedTeachers: number;

  warningsSent: number;

  expiredTeachers: number;

  archivesSent: number;

  deletedTeachers: number;

  errors: Array<{
    teacherId: string;
    message: string;
  }>;
};

type ExpirationEmailCopy = {
  professor: string;

  warningSubject: string;
  warningTitle: string;
  warningIntro: string;
  warningExpirationLabel: string;
  warningAction: string;
  warningArchive: string;

  finalSubjectNoQuiz: string;
  finalSubjectWithQuiz: (
    quizTitle: string
  ) => string;

  finalTitle: string;
  finalIntro: string;
  finalArchive: (
    quizTitle: string
  ) => string;

  finalNoQuiz: string;

  copiesLabel: string;

  footer: string;
};

/* =========================================================
   Generic helpers
   ========================================================= */

function getString(
  value: unknown
) {
  return typeof value === "string"
    ? value
    : "";
}

function getNullableString(
  value: unknown
) {
  return typeof value === "string"
    ? value
    : null;
}

function mapTeacher(
  snapshot: QueryDocumentSnapshot<DocumentData>
): ExpirationTeacher {
  const data =
    snapshot.data();

  return {
    id:
      snapshot.id,

    name:
      getString(
        data.name
      ),

    email:
      getString(
        data.email
      )
        .trim()
        .toLowerCase(),

    expiresAt:
      getString(
        data.expiresAt
      ),

    quizId:
      getNullableString(
        data.quizId
      ),

    status:
      data.status === "expired"
        ? "expired"
        : "active",

    expirationWarningSentAt:
      getNullableString(
        data.expirationWarningSentAt
      ),

    expirationArchiveSentAt:
      getNullableString(
        data.expirationArchiveSentAt
      ),
  };
}

function getExpirationTime(
  teacher: ExpirationTeacher
) {
  return new Date(
    teacher.expiresAt
  ).getTime();
}

function getErrorMessage(
  error: unknown
) {
  if (
    error instanceof Error
  ) {
    return error.message;
  }

  return "Unknown cleanup error.";
}

/* =========================================================
   HTML helpers
   ========================================================= */

function escapeHtml(
  value: string
) {
  return value
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function getEmailCopy(
  language: TeacherLanguage
): ExpirationEmailCopy {
  if (
    language === "fr"
  ) {
    return {
      professor:
        "Professeur",

      warningSubject:
        "Rappel d’expiration de votre compte ULearn",

      warningTitle:
        "Votre compte expire bientôt",

      warningIntro:
        "Votre compte professeur temporaire ULearn arrivera bientôt à expiration.",

      warningExpirationLabel:
        "Expiration",

      warningAction:
        "Veuillez terminer les corrections restantes avant l’expiration de votre compte.",

      warningArchive:
        "À l’expiration, ULearn préparera automatiquement votre archive finale de corrections et vous l’enverra par courriel.",

      finalSubjectNoQuiz:
        "Expiration de votre compte ULearn",

      finalSubjectWithQuiz:
        (
          quizTitle: string
        ) =>
          `Corrections finales ULearn - ${quizTitle}`,

      finalTitle:
        "Votre compte ULearn a expiré",

      finalIntro:
        "Votre compte professeur ULearn a atteint sa date d’expiration.",

      finalArchive:
        (
          quizTitle: string
        ) =>
          `Vous trouverez en pièce jointe l’archive finale contenant les PDF de correction des étudiants pour « ${quizTitle} ».`,

      finalNoQuiz:
        "Aucun quiz n’était associé à votre compte au moment de son expiration. Il n’y a donc aucune archive de corrections à joindre.",

      copiesLabel:
        "Nombre de copies",

      footer:
        "ULearn — Plateforme intelligente de quiz",
    };
  }

  if (
    language === "rn"
  ) {
    return {
      professor:
        "Mwigisha",

      warningSubject:
        "ULearn: konti yanyu igiye kurangira",

      warningTitle:
        "Konti yanyu igiye kurangira",

      warningIntro:
        "Konti yanyu y’umwigisha ya ULearn y’igihe gito igiye kurangira.",

      warningExpirationLabel:
        "Igihe izorangirira",

      warningAction:
        "Turabasavyeurangize gukosora ibisigaye imbere y’uko konti yanyu irangira.",

      warningArchive:
        "Konti niyarangira, ULearn izotegura ubwayo archive ya nyuma y’amakosorwa hanyuma iyibarungikire kuri email.",

      finalSubjectNoQuiz:
        "Konti yanyu ya ULearn yarangiye",

      finalSubjectWithQuiz:
        (
          quizTitle: string
        ) =>
          `ULearn - Amakosorwa ya nyuma - ${quizTitle}`,

      finalTitle:
        "Konti yanyu ya ULearn yarangiye",

      finalIntro:
        "Konti yanyu y’umwigisha ya ULearn yashitse ku gihe co kurangira.",

      finalArchive:
        (
          quizTitle: string
        ) =>
          `Archive ya nyuma irimwo PDF z’amakosorwa y’abanyeshure kuri « ${quizTitle} » iri kumwe n’iyi email.`,

      finalNoQuiz:
        "Nta quiz yari ifatanye na konti yanyu igihe yarangira, rero nta archive y’amakosorwa iri kumwe n’iyi email.",

      copiesLabel:
        "Igitigiri c’amakopi",

      footer:
        "ULearn — Urubuga rw’ibibazo rw’ubwenge",
    };
  }

  return {
    professor:
      "Professor",

    warningSubject:
      "ULearn account expiration reminder",

    warningTitle:
      "Your account expires soon",

    warningIntro:
      "Your temporary ULearn teacher account will expire soon.",

    warningExpirationLabel:
      "Expiration",

    warningAction:
      "Please complete any remaining grading before the account expires.",

    warningArchive:
      "When the account expires, ULearn will automatically prepare and email your final correction archive.",

    finalSubjectNoQuiz:
      "Your ULearn account has expired",

    finalSubjectWithQuiz:
      (
        quizTitle: string
      ) =>
        `ULearn final corrections - ${quizTitle}`,

    finalTitle:
      "Your ULearn account has expired",

    finalIntro:
      "Your ULearn teacher account has reached its expiration date.",

    finalArchive:
      (
        quizTitle: string
      ) =>
        `Attached is the final archive containing the student correction PDFs for "${quizTitle}".`,

    finalNoQuiz:
      "No quiz was associated with your account when it expired, so there is no correction archive to attach.",

    copiesLabel:
      "Number of copies",

    footer:
      "ULearn — Smart quiz platform",
  };
}

function getLocale(
  language: TeacherLanguage
) {
  if (
    language === "fr"
  ) {
    return "fr-CA";
  }

  if (
    language === "rn"
  ) {
    return "rn";
  }

  return "en-CA";
}

function formatExpirationDate(
  teacher: ExpirationTeacher,
  language: TeacherLanguage
) {
  const expiresAt =
    new Date(
      teacher.expiresAt
    );

  if (
    Number.isNaN(
      expiresAt.getTime()
    )
  ) {
    return teacher.expiresAt;
  }

  return expiresAt.toLocaleString(
    getLocale(
      language
    ),
    {
      timeZone:
        "UTC",

      dateStyle:
        "medium",

      timeStyle:
        "short",
    }
  ) + " UTC";
}

type MultilingualEmailSection = {
  languageLabel: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  highlightLabel?: string;
  highlightValue?: string;
};

function buildMultilingualEmailTemplate(
  sections: MultilingualEmailSection[]
) {
  const sectionsHtml =
    sections
      .map(
        (
          section,
          index
        ) => {
          const paragraphsHtml =
            section.paragraphs
              .map(
                (
                  paragraph
                ) =>
                  `<p style="margin:0 0 16px;color:#3f3f46;font-size:16px;line-height:1.7;">${escapeHtml(
                    paragraph
                  )}</p>`
              )
              .join("");

          const highlightHtml =
            section.highlightLabel &&
            section.highlightValue
              ? `
                <div style="margin:24px 0;padding:18px 20px;border-radius:14px;background:#f4effc;border:1px solid #e4d7f8;">
                  <div style="margin-bottom:6px;color:#6b7280;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">
                    ${escapeHtml(
                      section.highlightLabel
                    )}
                  </div>
                  <div style="color:#2a0369;font-size:18px;font-weight:800;line-height:1.4;">
                    ${escapeHtml(
                      section.highlightValue
                    )}
                  </div>
                </div>
              `
              : "";

          const divider =
            index === 0
              ? ""
              : `<div style="height:1px;background:#ebe6f3;margin:30px 0;"></div>`;

          return `
            ${divider}

            <section>
              <div style="margin-bottom:10px;color:#7c3aed;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">
                ${escapeHtml(
                  section.languageLabel
                )}
              </div>

              <h2 style="margin:0 0 18px;color:#2a0369;font-size:22px;line-height:1.3;">
                ${escapeHtml(
                  section.title
                )}
              </h2>

              <p style="margin:0 0 16px;color:#3f3f46;font-size:16px;line-height:1.7;">
                ${escapeHtml(
                  section.greeting
                )}
              </p>

              ${highlightHtml}

              ${paragraphsHtml}
            </section>
          `;
        }
      )
      .join("");

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f5f7;padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #ececf0;">
            <tr>
              <td style="background:#2a0369;padding:24px 30px;">
                <div style="color:#ffffff;font-size:28px;font-weight:800;letter-spacing:-.5px;">
                  ULearn
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:32px 30px 28px;">
                ${sectionsHtml}
              </td>
            </tr>

            <tr>
              <td style="padding:20px 30px;background:#fafafa;border-top:1px solid #eeeeef;color:#71717a;font-size:13px;line-height:1.6;">
                ULearn — Smart quiz platform
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();
}

/* =========================================================
   Warning email
   ========================================================= */

async function sendExpirationWarning(
  teacher: ExpirationTeacher
) {
  if (
    !teacher.email
  ) {
    throw new Error(
      "Teacher email is missing."
    );
  }

  const english =
    getEmailCopy(
      "en"
    );

  const french =
    getEmailCopy(
      "fr"
    );

  const kirundi =
    getEmailCopy(
      "rn"
    );

  const englishExpiration =
    formatExpirationDate(
      teacher,
      "en"
    );

  const frenchExpiration =
    formatExpirationDate(
      teacher,
      "fr"
    );

  const kirundiExpiration =
    formatExpirationDate(
      teacher,
      "rn"
    );

  const teacherName =
    teacher.name ||
    english.professor;

  await sendEmail({
    to:
      teacher.email,

    subject:
      "ULearn — Account expiration reminder / Rappel d’expiration / Konti igiye kurangira",

    text:
      `ENGLISH

` +
      `Hello ${teacherName},

` +
      `${english.warningIntro}

` +
      `${english.warningExpirationLabel}: ${englishExpiration}

` +
      `${english.warningAction}

` +
      `${english.warningArchive}

` +
      `------------------------------

` +
      `FRANÇAIS

` +
      `Bonjour ${teacher.name || french.professor},

` +
      `${french.warningIntro}

` +
      `${french.warningExpirationLabel} : ${frenchExpiration}

` +
      `${french.warningAction}

` +
      `${french.warningArchive}

` +
      `------------------------------

` +
      `KIRUNDI

` +
      `Bwakeye ${teacher.name || kirundi.professor},

` +
      `${kirundi.warningIntro}

` +
      `${kirundi.warningExpirationLabel}: ${kirundiExpiration}

` +
      `${kirundi.warningAction}

` +
      `${kirundi.warningArchive}

` +
      `ULearn`,

    html:
      buildMultilingualEmailTemplate([
        {
          languageLabel:
            "English",

          title:
            english.warningTitle,

          greeting:
            `Hello ${teacherName},`,

          paragraphs: [
            english.warningIntro,
            english.warningAction,
            english.warningArchive,
          ],

          highlightLabel:
            english.warningExpirationLabel,

          highlightValue:
            englishExpiration,
        },
        {
          languageLabel:
            "Français",

          title:
            french.warningTitle,

          greeting:
            `Bonjour ${teacher.name || french.professor},`,

          paragraphs: [
            french.warningIntro,
            french.warningAction,
            french.warningArchive,
          ],

          highlightLabel:
            french.warningExpirationLabel,

          highlightValue:
            frenchExpiration,
        },
        {
          languageLabel:
            "Kirundi",

          title:
            kirundi.warningTitle,

          greeting:
            `Bwakeye ${teacher.name || kirundi.professor},`,

          paragraphs: [
            kirundi.warningIntro,
            kirundi.warningAction,
            kirundi.warningArchive,
          ],

          highlightLabel:
            kirundi.warningExpirationLabel,

          highlightValue:
            kirundiExpiration,
        },
      ]),

    idempotencyKey:
      `teacher-expiration-warning-${teacher.id}`,
  });

  await adminDb
    .collection(
      USERS_COLLECTION
    )
    .doc(
      teacher.id
    )
    .update({
      expirationWarningSentAt:
        new Date()
          .toISOString(),
    });
}

/* =========================================================
   Firestore loading
   ========================================================= */

async function getQuizForTeacher(
  teacher: ExpirationTeacher
): Promise<Quiz | null> {
  if (
    teacher.quizId
  ) {
    const snapshot =
      await adminDb
        .collection(
          QUIZZES_COLLECTION
        )
        .doc(
          teacher.quizId
        )
        .get();

    if (
      snapshot.exists
    ) {
      return {
        id:
          snapshot.id,

        ...snapshot.data(),
      } as Quiz;
    }
  }

  const snapshot =
    await adminDb
      .collection(
        QUIZZES_COLLECTION
      )
      .where(
        "teacherId",
        "==",
        teacher.id
      )
      .limit(1)
      .get();

  if (
    snapshot.empty
  ) {
    return null;
  }

  const quizDocument =
    snapshot.docs[0];

  return {
    id:
      quizDocument.id,

    ...quizDocument.data(),
  } as Quiz;
}

async function getQuestions(
  quizId: string
): Promise<Question[]> {
  const snapshot =
    await adminDb
      .collection(
        QUESTIONS_COLLECTION
      )
      .where(
        "quizId",
        "==",
        quizId
      )
      .get();

  return snapshot.docs
    .map(
      (
        document
      ) => ({
        id:
          document.id,

        ...document.data(),
      } as Question)
    )
    .sort(
      (
        first,
        second
      ) =>
        first.order -
        second.order
    );
}

async function getAttempts(
  quizId: string
): Promise<Attempt[]> {
  const snapshot =
    await adminDb
      .collection(
        ATTEMPTS_COLLECTION
      )
      .where(
        "quizId",
        "==",
        quizId
      )
      .get();

  return snapshot.docs.map(
    (
      document
    ) => ({
      id:
        document.id,

      ...document.data(),
    } as Attempt)
  );
}

/* =========================================================
   Finalize in-progress attempts
   ========================================================= */

/**
 * At TEACHER expiration, every still in-progress attempt belonging
 * to that teacher quiz is frozen immediately.
 *
 * We deliberately DO NOT compare attempt.expiresAt here.
 * The teacher account expiration is the final archive boundary.
 */
async function finalizeInProgressAttemptsAtTeacherExpiration(
  quizId: string,
  questions: Question[]
) {
  const snapshot =
    await adminDb
      .collection(
        ATTEMPTS_COLLECTION
      )
      .where(
        "quizId",
        "==",
        quizId
      )
      .where(
        "status",
        "==",
        "in_progress"
      )
      .get();

  if (
    snapshot.empty
  ) {
    return;
  }

  const now =
    new Date()
      .toISOString();

  /*
   * A teacher can have at most 60 students in ULearn V1,
   * so this remains safely below Firestore's batch write limit.
   */
  const batch =
    adminDb.batch();

  for (
    const document of
    snapshot.docs
  ) {
    const attempt = {
      id:
        document.id,

      ...document.data(),
    } as Attempt;

    const grading =
      calculateAutomaticScore(
        attempt,
        questions
      );

    const automaticScore =
      grading.automaticScore;

    const requiresManualGrading =
      grading.developmentQuestions >
      0;

    if (
      !requiresManualGrading
    ) {
      batch.update(
        document.ref,
        {
          status:
            "graded",

          automaticScore,

          manualScore:
            0,

          finalScore:
            automaticScore,

          developmentScores:
            {},

          submittedAt:
            attempt.submittedAt ??
            now,

          gradedAt:
            now,

          updatedAt:
            now,
        }
      );

      continue;
    }

    /*
     * Development grades are never invented.
     * The expiration PDF will display them as not graded and
     * the final score as unavailable.
     */
    batch.update(
      document.ref,
      {
        status:
          "submitted",

        automaticScore,

        manualScore:
          0,

        finalScore:
          null,

        developmentScores:
          {},

        submittedAt:
          attempt.submittedAt ??
          now,

        gradedAt:
          null,

        updatedAt:
          now,
      }
    );
  }

  await batch.commit();
}

/* =========================================================
   Final expiration delivery
   ========================================================= */

async function markFinalExpirationDeliveryAsSent(
  teacherId: string
) {
  const sentAt =
    new Date()
      .toISOString();

  await adminDb
    .collection(
      USERS_COLLECTION
    )
    .doc(
      teacherId
    )
    .update({
      expirationArchiveSentAt:
        sentAt,

      updatedAt:
        sentAt,
    });

  return sentAt;
}

async function sendFinalExpirationEmailWithoutQuiz(
  teacher: ExpirationTeacher
) {
  if (
    !teacher.email
  ) {
    throw new Error(
      "Teacher email is missing."
    );
  }

  const english =
    getEmailCopy(
      "en"
    );

  const french =
    getEmailCopy(
      "fr"
    );

  const kirundi =
    getEmailCopy(
      "rn"
    );

  await sendEmail({
    to:
      teacher.email,

    subject:
      "ULearn — Account expired / Compte expiré / Konti yarangiye",

    text:
      `ENGLISH

` +
      `Hello ${teacher.name || english.professor},

` +
      `${english.finalIntro}

` +
      `${english.finalNoQuiz}

` +
      `------------------------------

` +
      `FRANÇAIS

` +
      `Bonjour ${teacher.name || french.professor},

` +
      `${french.finalIntro}

` +
      `${french.finalNoQuiz}

` +
      `------------------------------

` +
      `KIRUNDI

` +
      `Bwakeye ${teacher.name || kirundi.professor},

` +
      `${kirundi.finalIntro}

` +
      `${kirundi.finalNoQuiz}

` +
      `ULearn`,

    html:
      buildMultilingualEmailTemplate([
        {
          languageLabel:
            "English",

          title:
            english.finalTitle,

          greeting:
            `Hello ${teacher.name || english.professor},`,

          paragraphs: [
            english.finalIntro,
            english.finalNoQuiz,
          ],
        },
        {
          languageLabel:
            "Français",

          title:
            french.finalTitle,

          greeting:
            `Bonjour ${teacher.name || french.professor},`,

          paragraphs: [
            french.finalIntro,
            french.finalNoQuiz,
          ],
        },
        {
          languageLabel:
            "Kirundi",

          title:
            kirundi.finalTitle,

          greeting:
            `Bwakeye ${teacher.name || kirundi.professor},`,

          paragraphs: [
            kirundi.finalIntro,
            kirundi.finalNoQuiz,
          ],
        },
      ]),

    idempotencyKey:
      `teacher-expiration-final-${teacher.id}`,
  });
}

async function sendExpirationArchive(
  teacher: ExpirationTeacher,
  quiz: Quiz,
  attempts: Attempt[],
  questions: Question[]
) {
  if (
    !teacher.email
  ) {
    throw new Error(
      "Teacher email is missing."
    );
  }

  /*
   * The automatic expiration archive is intentionally standardized
   * in English. Only one ZIP is generated.
   */
  const archive =
    await generateExpirationArchive({
      quiz,
      attempts,
      questions,
      language:
        "en",
    });

  const english =
    getEmailCopy(
      "en"
    );

  const french =
    getEmailCopy(
      "fr"
    );

  const kirundi =
    getEmailCopy(
      "rn"
    );

  const englishArchiveMessage =
    english.finalArchive(
      quiz.title
    );

  const frenchArchiveMessage =
    french.finalArchive(
      quiz.title
    );

  const kirundiArchiveMessage =
    kirundi.finalArchive(
      quiz.title
    );

  const englishCopies =
    `${english.copiesLabel}: ${archive.pdfCount}`;

  const frenchCopies =
    `${french.copiesLabel} : ${archive.pdfCount}`;

  const kirundiCopies =
    `${kirundi.copiesLabel}: ${archive.pdfCount}`;

  await sendEmail({
    to:
      teacher.email,

    subject:
      `ULearn — Final corrections / Corrections finales / Amakosorwa ya nyuma — ${quiz.title}`,

    text:
      `ENGLISH

` +
      `Hello ${teacher.name || english.professor},

` +
      `${english.finalIntro}

` +
      `${englishArchiveMessage}

` +
      `${englishCopies}

` +
      `------------------------------

` +
      `FRANÇAIS

` +
      `Bonjour ${teacher.name || french.professor},

` +
      `${french.finalIntro}

` +
      `${frenchArchiveMessage}

` +
      `${frenchCopies}

` +
      `------------------------------

` +
      `KIRUNDI

` +
      `Bwakeye ${teacher.name || kirundi.professor},

` +
      `${kirundi.finalIntro}

` +
      `${kirundiArchiveMessage}

` +
      `${kirundiCopies}

` +
      `ULearn`,

    html:
      buildMultilingualEmailTemplate([
        {
          languageLabel:
            "English",

          title:
            english.finalTitle,

          greeting:
            `Hello ${teacher.name || english.professor},`,

          paragraphs: [
            english.finalIntro,
            englishArchiveMessage,
            englishCopies,
          ],
        },
        {
          languageLabel:
            "Français",

          title:
            french.finalTitle,

          greeting:
            `Bonjour ${teacher.name || french.professor},`,

          paragraphs: [
            french.finalIntro,
            frenchArchiveMessage,
            frenchCopies,
          ],
        },
        {
          languageLabel:
            "Kirundi",

          title:
            kirundi.finalTitle,

          greeting:
            `Bwakeye ${teacher.name || kirundi.professor},`,

          paragraphs: [
            kirundi.finalIntro,
            kirundiArchiveMessage,
            kirundiCopies,
          ],
        },
      ]),

    attachments: [
      {
        filename:
          archive.filename,

        content:
          archive.buffer,

        contentType:
          "application/zip",
      },
    ],

    /*
     * Stable across retries.
     * If Resend accepted the first request but the Firestore marker
     * write failed, retrying uses the same logical message.
     */
    idempotencyKey:
      `teacher-expiration-final-${teacher.id}`,
  });

  return archive;
}

/* =========================================================
   Firestore deletion helpers
   ========================================================= */

async function deleteQueryInBatches(
  collectionName: string,
  field: string,
  value: string
) {
  const BATCH_SIZE =
    400;

  while (
    true
  ) {
    const snapshot =
      await adminDb
        .collection(
          collectionName
        )
        .where(
          field,
          "==",
          value
        )
        .limit(
          BATCH_SIZE
        )
        .get();

    if (
      snapshot.empty
    ) {
      return;
    }

    const batch =
      adminDb.batch();

    snapshot.docs.forEach(
      (
        document
      ) => {
        batch.delete(
          document.ref
        );
      }
    );

    await batch.commit();

    if (
      snapshot.size <
      BATCH_SIZE
    ) {
      return;
    }
  }
}

async function deleteQuizData(
  quiz: Quiz
) {
  await deleteQueryInBatches(
    QUESTIONS_COLLECTION,
    "quizId",
    quiz.id
  );

  await deleteQueryInBatches(
    ATTEMPTS_COLLECTION,
    "quizId",
    quiz.id
  );

  await deleteQueryInBatches(
    STUDENT_ATTEMPT_CREDENTIALS_COLLECTION,
    "quizId",
    quiz.id
  );

  await adminDb
    .collection(
      QUIZZES_COLLECTION
    )
    .doc(
      quiz.id
    )
    .delete();
}

/* =========================================================
   Clerk deletion
   ========================================================= */

function isNotFoundError(
  error: unknown
) {
  if (
    typeof error !== "object" ||
    error === null
  ) {
    return false;
  }

  const candidate =
    error as {
      status?: unknown;
      statusCode?: unknown;
    };

  return (
    candidate.status === 404 ||
    candidate.statusCode === 404
  );
}

async function deleteClerkTeacher(
  teacherId: string
) {
  const client =
    await clerkClient();

  try {
    await client.users.deleteUser(
      teacherId
    );
  } catch (
    error
  ) {
    /*
     * Makes retries safe when Clerk was already deleted during
     * a previous cleanup run but the final Firestore deletion failed.
     */
    if (
      isNotFoundError(
        error
      )
    ) {
      return;
    }

    throw error;
  }
}

/* =========================================================
   Teacher Firestore profile deletion
   ========================================================= */

async function deleteTeacherProfile(
  teacherId: string
) {
  await adminDb
    .collection(
      USERS_COLLECTION
    )
    .doc(
      teacherId
    )
    .delete();
}

/* =========================================================
   Final account deletion
   ========================================================= */

/**
 * IMPORTANT:
 * This function may only be called AFTER expirationArchiveSentAt
 * exists in Firestore.
 *
 * Teacher Firestore profile is deleted LAST so a failed Clerk
 * deletion can be retried by the next cleanup execution.
 */
async function deleteExpiredTeacher(
  teacher: ExpirationTeacher,
  quiz: Quiz | null
) {
  if (
    quiz
  ) {
    await deleteQuizData(
      quiz
    );
  }

  await deleteClerkTeacher(
    teacher.id
  );

  await deleteTeacherProfile(
    teacher.id
  );
}

/* =========================================================
   Process one expired teacher
   ========================================================= */

async function processExpiredTeacher(
  teacher: ExpirationTeacher
) {
  /*
   * Mark expired immediately, without deleting anything.
   */
  if (
    teacher.status !==
    "expired"
  ) {
    await adminDb
      .collection(
        USERS_COLLECTION
      )
      .doc(
        teacher.id
      )
      .update({
        status:
          "expired",

        updatedAt:
          new Date()
            .toISOString(),
      });
  }

  /*
   * Load the quiz before deciding whether a final email is needed.
   *
   * On a retry after partial deletion, the quiz may already be gone.
   * expirationArchiveSentAt tells us whether final delivery already
   * succeeded, so we must not send another email in that case.
   */
  const quiz =
    await getQuizForTeacher(
      teacher
    );

  let finalDeliverySentNow =
    false;

  /*
   * =======================================================
   * FINAL DELIVERY PHASE
   * =======================================================
   *
   * No deletion is allowed until the final email has succeeded
   * AND expirationArchiveSentAt has been persisted.
   */
  if (
    !teacher.expirationArchiveSentAt
  ) {
    if (
      !quiz
    ) {
      /*
       * Even a teacher with no quiz receives a final expiration email.
       */
      await sendFinalExpirationEmailWithoutQuiz(
        teacher
      );

      await markFinalExpirationDeliveryAsSent(
        teacher.id
      );

      finalDeliverySentNow =
        true;
    } else {
      const questions =
        await getQuestions(
          quiz.id
        );

      /*
       * Freeze ALL still in-progress attempts at teacher expiration.
       * Their individual student timers no longer matter here.
       */
      await finalizeInProgressAttemptsAtTeacherExpiration(
        quiz.id,
        questions
      );

      /*
       * Reload after finalization so generated PDFs use the final state.
       */
      const attempts =
        await getAttempts(
          quiz.id
        );

      /*
       * A ZIP is generated even when attempts.length === 0.
       * This keeps the final delivery rule uniform for every teacher
       * who owns a quiz.
       */
      await sendExpirationArchive(
        teacher,
        quiz,
        attempts,
        questions
      );

      /*
       * CRITICAL:
       * persist successful delivery BEFORE any deletion begins.
       */
      await markFinalExpirationDeliveryAsSent(
        teacher.id
      );

      finalDeliverySentNow =
        true;
    }
  }

  /*
   * =======================================================
   * DELETION PHASE
   * =======================================================
   *
   * Either:
   * - the marker already existed when this cleanup started, or
   * - final delivery succeeded above and the marker was persisted.
   */
  const deliveryConfirmed =
    Boolean(
      teacher.expirationArchiveSentAt
    ) ||
    finalDeliverySentNow;

  if (
    !deliveryConfirmed
  ) {
    /*
     * Defensive guard. This path should never be reached.
     */
    return {
      archiveSent:
        false,

      deleted:
        false,
    };
  }

  await deleteExpiredTeacher(
    teacher,
    quiz
  );

  return {
    /*
     * In this result, archiveSent means the final expiration
     * delivery was successfully completed during THIS execution.
     *
     * For a teacher without a quiz, the delivery is the required
     * final email without an attachment.
     */
    archiveSent:
      finalDeliverySentNow,

    deleted:
      true,
  };
}

/* =========================================================
   Main cleanup
   ========================================================= */

/**
 * Runs one complete teacher expiration scan.
 *
 * Security contract:
 * - warning is sent once;
 * - expired teacher is marked expired;
 * - all in-progress attempts are frozen;
 * - final email/ZIP is delivered;
 * - expirationArchiveSentAt is persisted;
 * - ONLY THEN may data and Clerk be deleted.
 *
 * If final delivery fails, the catch below records the error and
 * no deletion is performed for that teacher.
 */
export async function runExpirationCleanup(): Promise<ExpirationCleanupResult> {
  const result:
    ExpirationCleanupResult = {
      checkedTeachers:
        0,

      warningsSent:
        0,

      expiredTeachers:
        0,

      archivesSent:
        0,

      deletedTeachers:
        0,

      errors:
        [],
    };

  const teachersSnapshot =
    await adminDb
      .collection(
        USERS_COLLECTION
      )
      .get();

  const teachers =
    teachersSnapshot.docs.map(
      mapTeacher
    );

  result.checkedTeachers =
    teachers.length;

  /*
   * Sequential processing is intentional.
   * ULearn has a small teacher limit and PDF generation can be heavy.
   */
  for (
    const teacher of
    teachers
  ) {
    try {
      const expirationTime =
        getExpirationTime(
          teacher
        );

      if (
        Number.isNaN(
          expirationTime
        )
      ) {
        throw new Error(
          "Teacher expiration date is invalid."
        );
      }

      const now =
        Date.now();

      const remainingTime =
        expirationTime -
        now;

      /*
       * ===================================================
       * Account expired
       * ===================================================
       */
      if (
        remainingTime <=
        0
      ) {
        result.expiredTeachers +=
          1;

        const expirationResult =
          await processExpiredTeacher(
            teacher
          );

        if (
          expirationResult.archiveSent
        ) {
          result.archivesSent +=
            1;
        }

        if (
          expirationResult.deleted
        ) {
          result.deletedTeachers +=
            1;
        }

        continue;
      }

      /*
       * ===================================================
       * Three-hour warning window
       * ===================================================
       */
      if (
        remainingTime <=
          WARNING_BEFORE_EXPIRATION_MS &&
        !teacher.expirationWarningSentAt
      ) {
        await sendExpirationWarning(
          teacher
        );

        result.warningsSent +=
          1;
      }
    } catch (
      error
    ) {
      /*
       * One teacher failure must not block the others.
       */
      console.error(
        `Expiration cleanup failed for teacher ${teacher.id}:`,
        error
      );

      result.errors.push({
        teacherId:
          teacher.id,

        message:
          getErrorMessage(
            error
          ),
      });
    }
  }

  return result;
}
