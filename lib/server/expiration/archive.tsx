import "server-only";

import JSZip from "jszip";
import { pdf } from "@react-pdf/renderer";

import AttemptCorrectionPdf from "@/components/AttemptCorrectionPdf";

import type { Attempt } from "@/lib/services/attempts";
import type { Question } from "@/lib/services/questions";
import type { Quiz } from "@/lib/services/quizzes";

export type ExpirationArchiveLanguage =
  | "en"
  | "fr"
  | "rn";

type GenerateExpirationArchiveInput = {
  quiz: Quiz;
  attempts: Attempt[];
  questions: Question[];
  language?: ExpirationArchiveLanguage;
};

type GenerateExpirationArchiveResult = {
  buffer: Buffer;
  filename: string;
  pdfCount: number;
};

/**
 * Removes characters that are unsafe inside file names.
 */
function sanitizeFileName(
  value: string
) {
  const sanitized = value
    .trim()
    .replace(
      /[<>:"/\\|?*\u0000-\u001F]/g,
      "-"
    )
    .replace(
      /\s+/g,
      " "
    );

  return sanitized || "student";
}

/**
 * Generates the ZIP containing every student correction PDF
 * when a teacher account expires.
 *
 * IMPORTANT:
 * ----------
 * Unlike the normal manual ZIP download, this archive includes
 * every attempt, including attempts that were not fully graded.
 *
 * AttemptCorrectionPdf receives expirationArchive=true so:
 *
 * • automatic QCM/multiple-choice grading remains visible;
 * • development answers remain visible;
 * • missing teacher grades are displayed as "Not graded";
 * • an incomplete final score is displayed as "Not available".
 */
export async function generateExpirationArchive({
  quiz,
  attempts,
  questions,
  language = "en",
}: GenerateExpirationArchiveInput): Promise<GenerateExpirationArchiveResult> {
  const zip =
    new JSZip();

  const correctionsFolder =
    zip.folder(
      "ULearn-corrections"
    );

  if (!correctionsFolder) {
    throw new Error(
      "Unable to create the corrections ZIP folder."
    );
  }

  /*
   * Keep file names unique even if two students happen
   * to have the same displayed name.
   */
  const usedFileNames =
    new Set<string>();

  for (
    let index = 0;
    index < attempts.length;
    index += 1
  ) {
    const attempt =
      attempts[index];

    /*
     * Generate the same correction document used by ULearn,
     * but activate the special expiration behavior.
     */
    const pdfBlob =
      await pdf(
        <AttemptCorrectionPdf
          quiz={quiz}
          attempt={attempt}
          questions={questions}
          language={language}
          expirationArchive
        />
      ).toBlob();

    /*
     * React PDF returns a Blob here.
     *
     * We convert it to a Node.js Buffer because the automatic
     * archive is generated on the server and will eventually
     * be attached directly to an email.
     */
    const pdfBuffer =
      Buffer.from(
        await pdfBlob.arrayBuffer()
      );

    const studentName =
      sanitizeFileName(
        attempt.studentName
      );

    let pdfFileName =
      `${studentName}.pdf`;

    /*
     * Prevent one PDF from replacing another inside the ZIP
     * when students share the same name.
     */
    if (
      usedFileNames.has(
        pdfFileName.toLowerCase()
      )
    ) {
      pdfFileName =
        `${studentName}-${index + 1}.pdf`;
    }

    usedFileNames.add(
      pdfFileName.toLowerCase()
    );

    correctionsFolder.file(
      pdfFileName,
      pdfBuffer
    );
  }

  /*
   * Generate the entire ZIP directly as a Node.js Buffer.
   *
   * No browser download is involved.
   */
  const buffer =
    await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: {
        level: 6,
      },
    });

  const quizTitle =
    sanitizeFileName(
      quiz.title
    );

  return {
    buffer,

    filename:
      `ULearn-corrections-${quizTitle}.zip`,

    pdfCount:
      attempts.length,
  };
}