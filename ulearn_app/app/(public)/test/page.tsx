"use client";

import { addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function TestPage() {
  const insertFeedbacks = async () => {
    try {
      const feedbacks = [
        {
          rating: 5,
          comment: "Amazing platform, very engaging!",
          createdAt: new Date().toISOString(),
        },
        {
          rating: 4,
          comment: "Very good but needs harder questions.",
          createdAt: new Date().toISOString(),
        },
        {
          rating: 3,
          comment: "Good overall experience.",
          createdAt: new Date().toISOString(),
        },
        {
          rating: 5,
          comment: "I love the competition mode!",
          createdAt: new Date().toISOString(),
        },
        {
          rating: 4,
          comment: "Great UI and smooth experience.",
          createdAt: new Date().toISOString(),
        },
      ];

      for (const f of feedbacks) {
        await addDoc(collection(db, "feedbacks"), f);
      }

      alert("✅ 5 feedbacks ajoutés !");
    } catch (error) {
      console.error(error);
      alert("❌ Erreur insertion");
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Insert Feedbacks</h1>
      <button onClick={insertFeedbacks}>
        Ajouter 5 feedbacks
      </button>
    </div>
  );
}