import type {
  Attempt,
  AttemptAnswer,
} from "@/lib/services/attempts";

import type {
  Question,
} from "@/lib/services/questions";

export type AutomaticGradingResult = {
  automaticScore: number;
  qcmQuestions: number;
  multipleChoiceQuestions: number;
  developmentQuestions: number;
};

function roundScore(
  value: number
) {
  return (
    Math.round(
      (
        value +
        Number.EPSILON
      ) *
        10000
    ) /
    10000
  );
}

function calculateQcmScore(
  question: Extract<
    Question,
    {
      type: "qcm";
    }
  >,

  answer:
    AttemptAnswer | undefined
) {
  if (
    !answer ||
    typeof answer.selectedChoiceIndex !==
      "number"
  ) {
    return 0;
  }

  return (
    answer.selectedChoiceIndex ===
    question.correctChoiceIndex
      ? question.points
      : 0
  );
}

function calculateMultipleChoiceScore(
  question: Extract<
    Question,
    {
      type: "multiple_choice";
    }
  >,

  answer:
    AttemptAnswer | undefined
) {
  if (
    !answer ||
    !Array.isArray(
      answer.selectedChoiceIndexes
    )
  ) {
    return 0;
  }

  const correctIndexes = [
    ...new Set(
      question.correctChoiceIndexes
    ),
  ];

  if (
    correctIndexes.length === 0
  ) {
    return 0;
  }

  const selectedIndexes = [
    ...new Set(
      answer.selectedChoiceIndexes
    ),
  ];

  if (
    selectedIndexes.length === 0
  ) {
    return 0;
  }

  const correctSet =
    new Set(
      correctIndexes
    );

  let correctlySelected = 0;
  let wronglySelected = 0;

  for (
    const selectedIndex of
    selectedIndexes
  ) {
    if (
      correctSet.has(
        selectedIndex
      )
    ) {
      correctlySelected += 1;
    } else {
      wronglySelected += 1;
    }
  }

  const pointsPerCorrectAnswer =
    question.points /
    correctIndexes.length;

  const earnedPoints =
    correctlySelected *
    pointsPerCorrectAnswer;

  const penalty =
    wronglySelected *
    pointsPerCorrectAnswer;

  const rawScore =
    earnedPoints -
    penalty;

  const finalQuestionScore =
    Math.max(
      0,
      Math.min(
        question.points,
        rawScore
      )
    );

  return roundScore(
    finalQuestionScore
  );
}

export function calculateAutomaticScore(
  attempt: Attempt,
  questions: Question[]
): AutomaticGradingResult {
  let automaticScore = 0;
  let qcmQuestions = 0;
  let multipleChoiceQuestions = 0;
  let developmentQuestions = 0;

  const questionMap =
    new Map(
      questions.map(
        (question) => [
          question.id,
          question,
        ]
      )
    );

  for (
    const questionId of
    attempt.questionOrder
  ) {
    const question =
      questionMap.get(
        questionId
      );

    if (!question) {
      continue;
    }

    const answer =
      attempt.answers[
        question.id
      ];

    if (
      question.type ===
      "development"
    ) {
      developmentQuestions += 1;
      continue;
    }

    if (
      question.type ===
      "qcm"
    ) {
      qcmQuestions += 1;

      automaticScore +=
        calculateQcmScore(
          question,
          answer
        );

      continue;
    }

    multipleChoiceQuestions += 1;

    automaticScore +=
      calculateMultipleChoiceScore(
        question,
        answer
      );
  }

  return {
    automaticScore:
      roundScore(
        automaticScore
      ),

    qcmQuestions,

    multipleChoiceQuestions,

    developmentQuestions,
  };
}