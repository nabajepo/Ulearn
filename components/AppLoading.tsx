"use client";

type AppLoadingProps = {
  title?: string;
  subtitle?: string;
  fullScreen?: boolean;
};

const loadingLetters = "Loading".split("");

export default function AppLoading({
  title = "ULearn",
  subtitle = "Preparing your workspace...",
  fullScreen = true,
}: AppLoadingProps) {
  return (
    <main
      className={`app-loading ${
        fullScreen ? "app-loading--fullscreen" : "app-loading--inline"
      }`}
      role="status"
      aria-live="polite"
      aria-label={subtitle}
    >
      <section className="app-loading-content">
        <div className="app-loading-logo" aria-hidden="true">
          U
        </div>

        <h1 className="app-loading-title">{title}</h1>

        <div className="app-loading-word" aria-hidden="true">
          {loadingLetters.map((letter, index) => (
            <span
              key={`${letter}-${index}`}
              style={{
                animationDelay: `${index * 0.1}s`,
              }}
            >
              {letter}
            </span>
          ))}

          <span
            className="app-loading-dot"
            style={{ animationDelay: "0.7s" }}
          >
            .
          </span>

          <span
            className="app-loading-dot"
            style={{ animationDelay: "0.8s" }}
          >
            .
          </span>

          <span
            className="app-loading-dot"
            style={{ animationDelay: "0.9s" }}
          >
            .
          </span>
        </div>

        <p className="app-loading-subtitle">{subtitle}</p>
      </section>
    </main>
  );
}