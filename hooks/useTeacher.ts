"use client";

/**
 * ============================================================================
 * ULearn - useTeacher Hook
 * ============================================================================
 *
 * Purpose
 * -------
 * This hook initializes and manages the currently authenticated teacher.
 *
 * Why does this file exist?
 * -------------------------
 * Every protected page in ULearn needs information about the connected
 * teacher. Instead of repeating authentication and Firestore logic
 * everywhere, this hook centralizes all initialization in one place.
 *
 * Responsibilities
 * ----------------
 * • Read the authenticated Clerk user.
 * • Create the Firestore teacher profile if it does not exist.
 * • Check whether the account has expired.
 * • Return loading and error states.
 * • Return the current teacher profile.
 *
 * Workflow
 * --------
 * Clerk Authentication
 *          ↓
 * Retrieve Clerk User
 *          ↓
 * Create Teacher (if needed)
 *          ↓
 * Check Account Expiration
 *          ↓
 * Load Teacher Profile
 *          ↓
 * Dashboard
 *
 * Used by
 * -------
 * Dashboard
 * Future Protected Pages
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

import {
  cleanupExpiredTeacher,
  createTeacher,
  type Teacher,
} from "@/lib/services/users";

export function useTeacher() {
  const { user, isLoaded } = useUser();

  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function initializeTeacher() {
      if (!isLoaded) return;

      if (!user) {
        setLoading(false);
        setBlocked(true);
        setMessage("User not authenticated.");
        return;
      }

      try {
        setLoading(true);

        const fullName =
          user.fullName ||
          user.firstName ||
          user.primaryEmailAddress?.emailAddress ||
          "Professor";

        const email = user.primaryEmailAddress?.emailAddress || "";

        const result = await createTeacher({
          id: user.id,
          name: fullName,
          email,
        });

        if (!result.success || !result.teacher) {
          setBlocked(true);
          setMessage(result.message);
          setLoading(false);
          return;
        }

        const cleanup = await cleanupExpiredTeacher(user.id);

        if (cleanup.deleted) {
          setBlocked(true);
          setMessage("Your account has expired.");
          setLoading(false);
          return;
        }

        setTeacher(result.teacher);
      } catch (error) {
        console.error("Error initializing teacher:", error);

        setBlocked(true);
        setMessage("Unable to prepare your dashboard.");
      } finally {
        setTimeout(() => {
          setLoading(false);
        }, 3000);
      }
    }

    initializeTeacher();
  }, [isLoaded, user]);

  return {
    teacher,
    loading,
    blocked,
    message,
  };
}