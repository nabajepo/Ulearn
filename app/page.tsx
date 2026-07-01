import Link from "next/link";
import Reveal from "@/components/Reveal";
import SectionBox from "@/components/SectionBox";
import ShowFeedbacks from "@/components/ShowFeedbacks";
import PlatformStats from "@/components/PlatformStats";
import { SignInButtonBox } from "@/components/SignInButtonBox";

export default function Home() {
  return (
    <>
      <header className="header_ulearn">
        <Link href="#home" className="name">
          ULearn
        </Link>

        <nav className="navbar">
          <SignInButtonBox text="Sign In" classNameC="navName" />
          <SectionBox />
        </nav>
      </header>

      <main>
        <Reveal>
          <section id="home" className="section hero-section">
            <div className="hero-content">
              <span className="hero-badge">Smart quiz platform</span>

              <h1 className="home-class">Welcome to Ulearn</h1>

              <h2>Transforming Quizzes into Real Learning Experiences</h2>

              <p>
                ULearn helps teachers create quizzes, assign them to students,
                correct multiple-choice questions automatically, and track class
                progress. The first version focuses on a simple and useful quiz
                workflow for teachers and students.
              </p>

              <div className="hero-actions">
                <SignInButtonBox text="Get Started" classNameC="btn-app" />
                <Link href="#howItWorks" className="btn-secondary">
                  Learn More
                </Link>
              </div>
            </div>

            <div className="hero-card">
              <div className="hero-card-top">
                <span>Quiz Preview</span>
                <strong>QCM</strong>
              </div>

              <div className="quiz-preview">
                   <h3>Basic Math Quiz</h3>
                   <p>What is 2 + 2 ?</p>
                   <div className="answer active">4</div>
                   <div className="answer">6</div>
                   <div className="answer">8</div>
              </div>
            </div>
          </section>
        </Reveal>

        <Reveal>
          <section id="howItWorks" className="section">
            <div className="section-heading">
              <span className="section-tag">Process</span>
              <h2>How It Works?</h2>
              <p>
                ULearn keeps the workflow simple: create a quiz, share it with
                students, collect answers, and review performance.
              </p>
            </div>

            <div className="steps-grid">
              <article className="info-card">
                <span className="card-number">01</span>
                <h3>Create</h3>
                <p>
                  Teachers create one quiz with up to 50 questions, including
                  multiple-choice and development questions.
                </p>
              </article>

              <article className="info-card">
                <span className="card-number">02</span>
                <h3>Assign</h3>
                <p>
                  Students receive access to the quiz and submit their answers
                  before the teacher closes the evaluation.
                </p>
              </article>

              <article className="info-card">
                <span className="card-number">03</span>
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
          <section id="faq" className="section">
            <div className="section-heading">
              <span className="section-tag">FAQ</span>
              <h2>Frequently Asked Questions</h2>
            </div>

            <div className="faq-grid">
              <article className="faq-card">
                <h3>What is ULearn?</h3>
                <p>
                  ULearn is a quiz platform that helps teachers create academic
                  evaluations and helps students learn through structured
                  practice.
                </p>
              </article>

              <article className="faq-card">
                <h3>Who is it for?</h3>
                <p>
                  It is mainly for teachers, tutors, students, and academic
                  groups that need a simple quiz management tool.
                </p>
              </article>

              <article className="faq-card">
                <h3>How many quizzes can a teacher create?</h3>
                <p>
                  In this first version, one teacher can create one active quiz.
                  If the quiz is deleted, the create button becomes available
                  again.
                </p>
              </article>

              <article className="faq-card">
                <h3>How long does an account last?</h3>
                <p>
                  For this test version, teacher accounts and related quiz data
                  are kept for three days before being removed.
                </p>
              </article>

              <article className="faq-card">
                <h3>Can teachers use development questions?</h3>
                <p>
                  Yes. The quiz can include QCM questions and development
                  questions that the teacher reviews manually.
                </p>
              </article>

              <article className="faq-card">
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
          <section id="stats" className="section stats-section">
            <div className="section-heading">
              <span className="section-tag">Platform</span>
              <h2>ULearn Statistics</h2>
              <p>
                A quick overview of current usage during the test version.
              </p>
            </div>

            <PlatformStats />
          </section>
        </Reveal>

        <Reveal>
          <section id="feedback" className="section">
            <div className="section-heading">
              <span className="section-tag">Reviews</span>
              <h2>Feedbacks</h2>
            </div>

            <ShowFeedbacks />
          </section>
        </Reveal>

        <Reveal>
          <section id="start" className="section start-section">
            <div className="start-box">
              <h2>Ready to create your first quiz?</h2>
              <p>Sign in and start building your first ULearn evaluation.</p>
              <SignInButtonBox text="Get Started" classNameC="btn-app" />
            </div>
          </section>
        </Reveal>
      </main>
    </>
  );
}