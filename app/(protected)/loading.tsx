"use client";

import AppLoading from "@/components/AppLoading";

import { useLanguage } from "@/hooks/useLanguage";

export default function Loading() {
  const { t } = useLanguage();

  return (
    <AppLoading
      title="ULearn"
      subtitle={t(
        "loading.secureWorkspace"
      )}
    />
  );
}