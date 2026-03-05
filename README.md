# Ulearn

Ulearn is a web-based learning platform where **teachers can create quizzes**, **correct student answers**, **deliver scores**, and **track student progress**.

Future versions will introduce competitive learning modes such as **real-time challenges**, **rankings**, and **team events** to make learning more engaging.

---

## Key Features
- Teacher quiz creation and management
- Student submissions and correction workflow
- Score delivery and performance tracking
- Dashboard-style organization (protected routes)

---

## Tech Stack
- Next.js (App Router)
- TypeScript
- React


---

## Project Tree

```txt
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
  layout/
    Navbar.tsx
    Sidebar.tsx
    Footer.tsx
    PageHeader.tsx

  auth/
    AuthForm.tsx
    LoginForm.tsx
    RegisterForm.tsx

  quiz/
    QuizForm.tsx
    QuestionItem.tsx
    AnswerOptions.tsx
    QuizList.tsx

  students/
    StudentTable.tsx
    StudentCard.tsx

  results/
    ResultsTable.tsx
    ResultsSummary.tsx
    PerformanceChart.tsx

  ui/
    Button.tsx
    Input.tsx
    Select.tsx
    Modal.tsx
    Badge.tsx
    Card.tsx

  common/
    LoadingSpinner.tsx
    ErrorMessage.tsx
    EmptyState.tsx

lib/                                  # Helper functions, business logic, utilities
  auth/
    authGuard.ts
    getCurrentUser.ts

  db/
    client.ts
    quizRepository.ts
    resultsRepository.ts
    usersRepository.ts

  validators/
    quizSchema.ts
    answerSchema.ts

  utils/
    date.ts
    scoring.ts
    pagination.ts
    logger.ts

hooks/
  useAuth.ts
  useQuizForm.ts
  useNotifications.ts
  useIsClient.ts

types/
  user.ts
  quiz.ts
  results.ts
  common.ts
```
---
Status

🚧 Work in Progress — Ulearn is actively being developed.

Planned improvements:

- Real-time competition mode

- Rankings and dynamic leaderboards

- Team-based events

- More analytics and progress insights
