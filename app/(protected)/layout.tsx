import HelpSupport from "@/components/HelpSupport";

/* =========================================================
   Protected teacher layout
   ========================================================= */

export default function ProtectedLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {
  return (
    <>
      {children}

      <HelpSupport
        context="teacher"
      />
    </>
  );
}