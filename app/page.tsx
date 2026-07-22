import Link from "next/link";

import Reveal from "@/components/Reveal";
import SectionBox from "@/components/SectionBox";
import ShowFeedbacks from "@/components/ShowFeedbacks";
import PlatformStats from "@/components/PlatformStats";
import { SignInButtonBox } from "@/components/SignInButtonBox";

import styles from "./HomePage.module.css";

export default function Home() {
  return (
    <>
      <header className={styles.header}>
        <Link href="#home" className={styles.name}>
          ULearn
        </Link>

        <nav className={styles.navbar}>
          <SignInButtonBox text="Sign In" classNameC="navName" />
          <SectionBox />
        </nav>
      </header>

      <main>
        <Reveal>
          <section
            id="home"
            className={`${styles.section} ${styles.heroSection}`}
          >
            <div className={styles.heroContent}>
              <span className={styles.heroBadge}>
                Smart quiz platform
              </span>

              <h1 className={styles.homeTitle}>Welcome to ULearn</h1>

              <h2>Transforming Quizzes into Real Learning Experiences</h2>

              <p>
                ULearn helps teachers create quizzes, assign them to students,
                correct multiple-choice questions automatically, and track
                class progress. The first version focuses on a simple and
                useful quiz workflow for teachers and students.
              </p>

              <div className={styles.heroActions}>
                <SignInButtonBox
                  text="Get Started"
                  classNameC={styles.primaryButton}
                />

                <Link
                  href="#howItWorks"
                  className={styles.secondaryButton}
                >
                  Learn More
                </Link>
              </div>
            </div>

            <div className={styles.heroCard}>
              <div className={styles.heroCardTop}>
                <span>Quiz Preview</span>
                <strong>QCM</strong>
              </div>

              <div className={styles.quizPreview}>
                <h3>Basic Math Quiz</h3>
                <p>What is 2 + 2 ?</p>

                <div
                  className={`${styles.answer} ${styles.activeAnswer}`}
                >
                  4
                </div>

                <div className={styles.answer}>6</div>
                <div className={styles.answer}>8</div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="howItWorks" className={styles.section}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionTag}>Process</span>

              <h2>How It Works?</h2>

              <p>
                ULearn keeps the workflow simple: create a quiz, share it with
                students, collect answers, and review performance.
              </p>
            </div>

            <div className={styles.cardsGrid}>
              <article className={styles.infoCard}>
                <span className={styles.cardNumber}>01</span>

                <h3>Create</h3>

                <p>
                  Teachers create one quiz with up to 50 questions, including
                  multiple-choice and development questions.
                </p>
              </article>

              <article className={styles.infoCard}>
                <span className={styles.cardNumber}>02</span>

                <h3>Assign</h3>

                <p>
                  Students receive access to the quiz and submit their answers
                  before the teacher closes the evaluation.
                </p>
              </article>

              <article className={styles.infoCard}>
                <span className={styles.cardNumber}>03</span>

                <h3>Review</h3>

                <p>
                  QCM answers are corrected automatically, while development
                  questions can be reviewed manually by the teacher.
                </p>
              </article>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="faq" className={styles.section}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionTag}>FAQ</span>
              <h2>Frequently Asked Questions</h2>
            </div>

            <div className={styles.cardsGrid}>
              <article className={styles.faqCard}>
                <h3>What is ULearn?</h3>

                <p>
                  ULearn is a quiz platform that helps teachers create academic
                  evaluations and helps students learn through structured
                  practice.
                </p>
              </article>

              <article className={styles.faqCard}>
                <h3>Who is it for?</h3>

                <p>
                  It is mainly for teachers, tutors, students, and academic
                  groups that need a simple quiz management tool.
                </p>
              </article>

              <article className={styles.faqCard}>
                <h3>How many quizzes can a teacher create?</h3>

                <p>
                  In this first version, one teacher can create one active quiz.
                  If the quiz is deleted, the create button becomes available
                  again.
                </p>
              </article>

              <article className={styles.faqCard}>
                <h3>How long does an account last?</h3>

                <p>
                  For this test version, teacher accounts and related quiz data
                  are kept for three days before being removed.
                </p>
              </article>

              <article className={styles.faqCard}>
                <h3>Can teachers use development questions?</h3>

                <p>
                  Yes. The quiz can include QCM questions and development
                  questions that the teacher reviews manually.
                </p>
              </article>

              <article className={styles.faqCard}>
                <h3>Is ULearn free?</h3>

                <p>
                  The first version is free for testing and academic
                  experimentation.
                </p>
              </article>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section
            id="stats"
            className={`${styles.section} ${styles.statsSection}`}
          >
            <div className={styles.sectionHeading}>
              <span className={styles.sectionTag}>Platform</span>

              <h2>ULearn Statistics</h2>

              <p>
                A quick overview of current usage during the test version.
              </p>
            </div>

            <PlatformStats />
          </section>
        </Reveal>

        <Reveal>
          <section
            id="feedback"
            className={`${styles.section} ${styles.feedbackSection}`}
          >
            <div className={styles.sectionHeading}>
              <span className={styles.sectionTag}>Reviews</span>
              <h2>Feedbacks</h2>
            </div>

            <ShowFeedbacks />
          </section>
        </Reveal>

        <Reveal>
          <section
            id="start"
            className={`${styles.section} ${styles.startSection}`}
          >
            <div className={styles.startBox}>
              <h2>Ready to create your first quiz?</h2>

              <p>
                Sign in and start building your first ULearn evaluation.
              </p>

              <SignInButtonBox
                text="Get Started"
                classNameC={styles.primaryButton}
              />
            </div>
          </section>
        </Reveal>
      </main>
    </>
  );
}