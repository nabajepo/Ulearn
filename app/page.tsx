"use client";

import Link from "next/link";

import Reveal from "@/components/Reveal";
import SectionBox from "@/components/SectionBox";
import HelpSupport from "@/components/HelpSupport";
import ShowFeedbacks from "@/components/ShowFeedbacks";
import PlatformStats from "@/components/PlatformStats";
import LanguageSwitcher from "@/components/LanguageSwitcher";


import {
  SignInButtonBox,
} from "@/components/SignInButtonBox";

import {
  useLanguage,
} from "@/hooks/useLanguage";

import styles from "./HomePage.module.css";

export default function Home() {
  const {
    t,
  } = useLanguage();

  return (
    <>
      <header
        className={
          styles.header
        }
      >
        <div
          className={
            styles.name
          }
        >
          ULearn
        </div>

        <nav
          className={
            styles.navbar
          }
        >
          <LanguageSwitcher />

          <SignInButtonBox
            text={
              t(
                "common.signIn"
              )
            }
            classNameC="navName"
          />

          <SectionBox />
        </nav>
      </header>

      <main>
        {/* =================================================
            Hero
            ================================================= */}

        <Reveal>
          <section
            id="home"
            className={`${styles.section} ${styles.heroSection}`}
          >
            <div
              className={
                styles.heroContent
              }
            >
              <span
                className={
                  styles.heroBadge
                }
              >
                {t(
                  "home.hero.badge"
                )}
              </span>

              <h1
                className={
                  styles.homeTitle
                }
              >
                {t(
                  "home.hero.title"
                )}
              </h1>

              <h2>
                {t(
                  "home.hero.subtitle"
                )}
              </h2>

              <p>
                {t(
                  "home.hero.description"
                )}
              </p>

              <div
                className={
                  styles.heroActions
                }
              >
                <SignInButtonBox
                  text={
                    t(
                      "common.getStarted"
                    )
                  }
                  classNameC={
                    styles.primaryButton
                  }
                />

                <Link
                  href="#howItWorks"
                  className={
                    styles.secondaryButton
                  }
                >
                  {t(
                    "common.learnMore"
                  )}
                </Link>
              </div>
            </div>

            <div
              className={
                styles.heroCard
              }
            >
              <div
                className={
                  styles.heroCardTop
                }
              >
                <span>
                  {t(
                    "home.preview.label"
                  )}
                </span>

                <strong>
                  {t(
                    "home.preview.type"
                  )}
                </strong>
              </div>

              <div
                className={
                  styles.quizPreview
                }
              >
                <h3>
                  {t(
                    "home.preview.title"
                  )}
                </h3>

                <p>
                  {t(
                    "home.preview.question"
                  )}
                </p>

                <div
                  className={`${styles.answer} ${styles.activeAnswer}`}
                >
                  4
                </div>

                <div
                  className={
                    styles.answer
                  }
                >
                  6
                </div>

                <div
                  className={
                    styles.answer
                  }
                >
                  8
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* =================================================
            Process
            ================================================= */}

        <Reveal>
          <section
            id="howItWorks"
            className={
              styles.section
            }
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <span
                className={
                  styles.sectionTag
                }
              >
                {t(
                  "home.process.tag"
                )}
              </span>

              <h2>
                {t(
                  "home.process.title"
                )}
              </h2>

              <p>
                {t(
                  "home.process.description"
                )}
              </p>
            </div>

            <div
              className={
                styles.cardsGrid
              }
            >
              <article
                className={
                  styles.infoCard
                }
              >
                <span
                  className={
                    styles.cardNumber
                  }
                >
                  01
                </span>

                <h3>
                  {t(
                    "home.process.create.title"
                  )}
                </h3>

                <p>
                  {t(
                    "home.process.create.description"
                  )}
                </p>
              </article>

              <article
                className={
                  styles.infoCard
                }
              >
                <span
                  className={
                    styles.cardNumber
                  }
                >
                  02
                </span>

                <h3>
                  {t(
                    "home.process.assign.title"
                  )}
                </h3>

                <p>
                  {t(
                    "home.process.assign.description"
                  )}
                </p>
              </article>

              <article
                className={
                  styles.infoCard
                }
              >
                <span
                  className={
                    styles.cardNumber
                  }
                >
                  03
                </span>

                <h3>
                  {t(
                    "home.process.review.title"
                  )}
                </h3>

                <p>
                  {t(
                    "home.process.review.description"
                  )}
                </p>
              </article>
            </div>
          </section>
        </Reveal>

        {/* =================================================
            FAQ
            ================================================= */}

        <Reveal>
          <section
            id="faq"
            className={
              styles.section
            }
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <span
                className={
                  styles.sectionTag
                }
              >
                {t(
                  "home.faq.tag"
                )}
              </span>

              <h2>
                {t(
                  "home.faq.title"
                )}
              </h2>
            </div>

            <div
              className={
                styles.cardsGrid
              }
            >
              <article
                className={
                  styles.faqCard
                }
              >
                <h3>
                  {t(
                    "home.faq.what.question"
                  )}
                </h3>

                <p>
                  {t(
                    "home.faq.what.answer"
                  )}
                </p>
              </article>

              <article
                className={
                  styles.faqCard
                }
              >
                <h3>
                  {t(
                    "home.faq.who.question"
                  )}
                </h3>

                <p>
                  {t(
                    "home.faq.who.answer"
                  )}
                </p>
              </article>

              <article
                className={
                  styles.faqCard
                }
              >
                <h3>
                  {t(
                    "home.faq.quizLimit.question"
                  )}
                </h3>

                <p>
                  {t(
                    "home.faq.quizLimit.answer"
                  )}
                </p>
              </article>

              <article
                className={
                  styles.faqCard
                }
              >
                <h3>
                  {t(
                    "home.faq.accountDuration.question"
                  )}
                </h3>

                <p>
                  {t(
                    "home.faq.accountDuration.answer"
                  )}
                </p>
              </article>

              <article
                className={
                  styles.faqCard
                }
              >
                <h3>
                  {t(
                    "home.faq.developmentQuestions.question"
                  )}
                </h3>

                <p>
                  {t(
                    "home.faq.developmentQuestions.answer"
                  )}
                </p>
              </article>

              <article
                className={
                  styles.faqCard
                }
              >
                <h3>
                  {t(
                    "home.faq.free.question"
                  )}
                </h3>

                <p>
                  {t(
                    "home.faq.free.answer"
                  )}
                </p>
              </article>
            </div>
          </section>
        </Reveal>

        {/* =================================================
            Stats
            ================================================= */}

        <Reveal>
          <section
            id="stats"
            className={`${styles.section} ${styles.statsSection}`}
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <span
                className={
                  styles.sectionTag
                }
              >
                {t(
                  "home.stats.tag"
                )}
              </span>

              <h2>
                {t(
                  "home.stats.title"
                )}
              </h2>

              <p>
                {t(
                  "home.stats.description"
                )}
              </p>
            </div>

            <PlatformStats />
          </section>
        </Reveal>

        {/* =================================================
            Feedback
            ================================================= */}

        <Reveal>
          <section
            id="feedback"
            className={`${styles.section} ${styles.feedbackSection}`}
          >
            <div
              className={
                styles.sectionHeading
              }
            >
              <span
                className={
                  styles.sectionTag
                }
              >
                {t(
                  "home.feedback.tag"
                )}
              </span>

              <h2>
                {t(
                  "home.feedback.title"
                )}
              </h2>
            </div>

            <ShowFeedbacks />
          </section>
        </Reveal>

        {/* =================================================
            Get started
            ================================================= */}

        <Reveal>
          <section
            id="start"
            className={`${styles.section} ${styles.startSection}`}
          >
            <div
              className={
                styles.startBox
              }
            >
              <h2>
                {t(
                  "home.start.title"
                )}
              </h2>

              <p>
                {t(
                  "home.start.description"
                )}
              </p>

              <SignInButtonBox
                text={
                  t(
                    "common.getStarted"
                  )
                }
                classNameC={
                  styles.primaryButton
                }
              />
            </div>
          </section>
        </Reveal>
      </main>
      <HelpSupport context="anonymous"/>
    </>
  );
}