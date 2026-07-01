"use client";

import { SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

export const SignInButtonBox = ({
  text,
  classNameC = "",
}: {
  text: string;
  classNameC?: string;
}) => {
  return (
    <>
      <SignedOut>
        <div className={classNameC}>
          <SignInButton
            mode="modal"
            forceRedirectUrl="/dashboard"
            fallbackRedirectUrl="/dashboard"
            signUpForceRedirectUrl="/dashboard"
            signUpFallbackRedirectUrl="/dashboard"
            appearance={{
              variables: {
                colorPrimary: "#2a0369",
                borderRadius: "10px",
              },
            }}
          >
            {text}
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <Link href="/dashboard" className={classNameC}>
          Dashboard
        </Link>
      </SignedIn>
    </>
  );
};