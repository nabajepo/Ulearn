"use client";

import { useEffect, useState } from "react";
import { collection, addDoc, getDocs } from "firebase/firestore";
import { database } from "@/lib/firebase_config";

export default function Home() {
  const [names, setNames] = useState<string[]>([]);

 

  async function addStudent() {
    console.log("Hello");
    await addDoc(collection(database, "students"), {
      name: "Jean",
      createdAt: Date.now(),
    });
    
}

  return (
    <main style={{ padding: 20 }}>
      <button onClick={addStudent}>Add student</button>
    </main>
  );
}