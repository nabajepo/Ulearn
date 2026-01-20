
![description](ulearn_app/public/UlearnLogo.png)


# Ulearn
Ulearn is a web-based platform where teachers can create quizzes, correct student answers, deliver scores, and track student progress.
Future versions will introduce competitive learning modes such as real-time challenges, rankings, and team events to make learning more engaging.

# Project - Tree

app/                                  # Next.js App Router (routes, layouts, pages)
  layout.tsx                          # Root layout (applies to all pages)
  page.tsx                            # Landing page (public home page)

  (public)/                           # Route group for PUBLIC pages (no auth required)
    layout.tsx                        # Layout for public pages (header, footer, etc.)

    auth/                             # Authentication-related public pages
      login/
        page.tsx                      # Login page for teachers/students
      register/
        page.tsx                      # Registration page (optional for later)

    info/
      about/
        page.tsx                      # "About Ulearn" page (project explanation)
      contact/
        page.tsx                      # Contact / support page (optional)

  (protected)/                        # Route group for PRIVATE pages (requires auth)
    layout.tsx                        # Layout with auth guard (checks user session)

    dashboard/
      page.tsx                        # Teacher dashboard overview (summary of activity)

    quizzes/
      page.tsx                        # List of quizzes created by the teacher
      new/
        page.tsx                      # Page to create a new quiz
      [quizId]/                       # Dynamic route for a specific quiz
        page.tsx                      # View / edit / manage a specific quiz

    students/
      page.tsx                        # List of students / participants
      [studentId]/
        page.tsx                      # Details and performance of a specific student

    results/
      page.tsx                        # Global results & analytics (per quiz or class)

    settings/
      page.tsx                        # Teacher account settings & Ulearn preferences

    # Future features (you can create these later)
    competition/
      page.tsx                        # Competition mode (real-time battles / ranking)
    teams/
      page.tsx                        # Team-based mode (groups, team scores)

    profile/
      page.tsx                        # User profile page (name, role, etc.)

    notifications/
      page.tsx                        # Page to see all notifications (future)

  api/                                # API routes (handled by Next.js server)
    quizzes/
      route.ts                        # API endpoints for CRUD operations on quizzes
    results/
      route.ts                        # API endpoints for saving / fetching results
    auth/
      route.ts                        # Auth-related API (if you don't use external auth)


components/                           # Reusable UI components

  layout/                             # Layout building blocks
    Navbar.tsx                        # Top navigation bar
    Sidebar.tsx                       # Sidebar for the dashboard
    Footer.tsx                        # Footer for public pages
    PageHeader.tsx                    # Title / subtitle header for pages

  auth/                               # Components used on login/register pages
    AuthForm.tsx                      # Generic authentication form
    LoginForm.tsx                     # Login form logic
    RegisterForm.tsx                  # Registration form logic (optional)

  quiz/                               # Components related to quizzes
    QuizForm.tsx                      # Form to create / edit quizzes
    QuestionItem.tsx                  # Single question display
    AnswerOptions.tsx                 # UI for answers (QCM, text input, etc.)
    QuizList.tsx                      # List of quizzes (table or cards)

  students/                           # Components related to students
    StudentTable.tsx                  # Table of students
    StudentCard.tsx                   # Small card with student summary

  results/                            # Components to display performance
    ResultsTable.tsx                  # Table of scores
    ResultsSummary.tsx                # Summary (averages, best score, etc.)
    PerformanceChart.tsx              # Chart.js component for graphs

  ui/                                 # Generic UI components (buttons, inputs, etc.)
    Button.tsx                        # Custom button component
    Input.tsx                         # Custom input component
    Select.tsx                        # Select/dropdown component
    Modal.tsx                         # Modal (for confirmations, details, etc.)
    Badge.tsx                         # Badge for status or roles
    Card.tsx                          # Card component used everywhere

  common/
    LoadingSpinner.tsx                # Loading indicator
    ErrorMessage.tsx                  # Error display component
    EmptyState.tsx                    # Display when there is no data yet


lib/                                  # Helper functions, business logic, utilities

  auth/
    authGuard.ts                      # Function to protect private routes (check session)
    getCurrentUser.ts                 # Helper to fetch the currently logged-in user

  db/
    client.ts                         # Database client (e.g., Prisma or other)
    quizRepository.ts                 # Functions to interact with quizzes in the DB
    resultsRepository.ts              # DB logic for results and stats
    usersRepository.ts                # DB logic for users (teachers/students)

  validators/
    quizSchema.ts                     # Validation schema for quiz creation (e.g. Zod/Yup)
    answerSchema.ts                   # Validation for answers submitted by students

  utils/
    date.ts                           # Date formatting helpers
    scoring.ts                        # Logic to compute scores
    pagination.ts                     # Helpers for paginated lists
    logger.ts                         # Logging utilities (for debugging)

hooks/                                # Custom React hooks

  useAuth.ts                          # Hook to get current user and auth status
  useQuizForm.ts                      # Hook to manage quiz form state and validation
  useNotifications.ts                 # Hook to handle notifications (toast, etc.)
  useIsClient.ts                      # Hook to check if we are on the client side

types/                                # TypeScript type definitions

  user.ts                             # Types for User, Teacher, Student







  
  quiz.ts                             # Types for Quiz, Question, Answer
  results.ts                          # Types for Result, Score, Statistics
  common.ts                           # Shared types (IDs, roles, enums, etc.)


