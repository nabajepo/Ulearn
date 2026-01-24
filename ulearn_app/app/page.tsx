import Link from "next/link";
import SectionBox from "@/components/SectionBox";
import { SignInButtonBox } from "@/components/SignInButtonBox";
import { SignInButton } from "@clerk/nextjs";

// Home page 
export default function Home() {
  return (
    <>
      {/* Header */}
      <header className="header_ulearn">
         {/* Name */}
         <Link href="#" className="name">Ulearn</Link>
         {/* NAVBAR */}
         <nav className="navbar">
             <SignInButtonBox text="Sign In" classNameC="navName"/>
             <SectionBox/>
         </nav>
      </header>
      {/* HERO / HOME */}
      <section id="home" className="section">
        <h1 id="home-logo" className="home-class">Welcome to Ulearn</h1>
        <h2>Transforming Quizzes into Real Learning Experiences</h2>
        <p>
         ULearn modernizes academic evaluations by transforming quizzes from static tasks into engaging learning experiences. Instead of answering once and moving on, students can practice repeatedly, challenge themselves, compete with peers, analyze their progress over time, and build confidence through continuous feedback. Teachers benefit from intuitive tools that allow them to create quizzes, track performance, identify strengths and weaknesses, and support each student's learning journey more effectively.
         In its first version, ULearn focuses on core quiz functionality: teachers create quizzes and assign them to students. Multiple-choice questions are automatically corrected by the platform, while open-ended questions are evaluated manually by the teacher outside the system. After grading, the teacher can release final results and review performance trends at both individual and group levels.
         In future versions, ULearn will introduce real-time competition modes, automated evaluation for open-ended responses, gamified progression systems, advanced analytics dashboards, teacher feedback workflows, and collaborative learning features — turning assessment into a shared, motivating, and data-driven experience for both students and teachers. The long-term vision is to make evaluations not just a way to measure learning, but a way to accelerate learning.
        </p>
      </section>

      {/* HOW IT WORKS */}
      <section id="howItWorks" className="section">
        <h2>How It Works ?</h2>
        <p>
          ULearn simplifies the workflow between teachers and students when it comes to academic evaluations. Teachers begin by creating quizzes, configuring question types, and inviting their students to participate. Once assigned, students answer individually or take part in competitive modes where time, performance, and progression create a more engaging learning experience. After completion, the platform automatically corrects multiple-choice questions while open-ended questions are reviewed by the teacher. Once grading is finalized, results are released to the students and class-wide statistics provide immediate insight into strengths, weaknesses, and progression.
          In its current version, ULearn stores each quiz, submission, and grading result for a period of three days in the database to allow teachers to verify answers, complete manual grading, and adjust scores if necessary. After this period, the system automatically clears the stored data to preserve privacy, optimize storage, and maintain a clean evaluation cycle. Future versions will introduce persistent historical records, advanced analytics, and long-term performance tracking across subjects and semesters.
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="section">
        <h2>FAQ</h2>
        <article>
          <h3>What is ULearn?</h3>
          <p>
            ULearn is an interactive platform designed to transform academic evaluations into more engaging and meaningful learning experiences. Instead of being limited to static quizzes, students can practice repeatedly, receive feedback, compete with peers, and monitor their progress over time. Teachers gain access to tools that help them design quizzes, evaluate performance, and support student learning more efficiently.
          </p>
        </article>

        <article>
         <h3>Who is it for?</h3>
         <p>
          ULearn is built for teachers, tutors, and academic institutions seeking to increase student engagement and improve the learning process. Students in schools, universities, training centers, or self-learning environments can also benefit from ULearn’s interactive and progressive approach to evaluation.
         </p>
        </article>
        <article>
         <h3>How does the competition mode work?</h3>
         <p>
            ULearn supports multiple competitive formats such as real-time challenges, duels, and team-based competitions. These modes introduce time pressure, scoring, rankings, and performance metrics that make learning more dynamic and enjoyable. Competitions can also be used as a training tool to reinforce memory and improve problem-solving skills.
         </p>
        </article>
        <article>
         <h3>Can teachers evaluate open-ended questions?</h3>
         <p>
            Yes. In the current version, ULearn automatically corrects multiple-choice questions while open-ended responses are reviewed manually by the teacher. After grading, results are confirmed and published, allowing students to receive both a score and written feedback where applicable. Future versions will explore automated correction models and assisted grading mechanisms.
         </p>
        </article>
        <article>
         <h3>How long are results stored?</h3>
         <p>
           In the initial version, quiz submissions and grading data are stored for three days in the system to allow teachers to verify answers, complete manual grading, and adjust scores if necessary. After this retention period, data is automatically cleared to preserve privacy and optimize storage. Later versions will introduce long-term tracking, historical performance analytics, and export options for both teachers and students.
         </p>
        </article>
         <article>
          <h3>Is ULearn free?</h3>
          <p>
            The first version of ULearn is free for testing and academic experimentation. As the platform evolves, multiple plans may be introduced for institutions, teachers, and students depending on features such as analytics, storage, and competition modes.
          </p>
         </article>
      </section>


      {/* Feedback */}
      <section id="feedback" className="section">
        <h2>Feedback</h2>
        <p>This place is for feedback</p>
       
      </section>

      {/* GET STARTED */}
      <section id="start" className="section">
        <h2>Get Started</h2>
        <p>Create your first quiz and start training with your class or team.</p>
        <SignInButtonBox text="Get Started" classNameC="get-start"/>
      </section>
    </>
  );
}
