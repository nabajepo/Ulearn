"use client";

import { useState } from "react";
import Link from "next/link";

export default function SectionBox() {
  const [open, setOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setOpen(false);
    }
  };

  return (
    <div className="navSectionBox">
      <Link href="#" className="navName" onClick={() => setOpen(!open)}>Menu</Link>
      {open && (
        <div className="navSectionBoxLink">
          <Link href="#home" onClick={() => scrollToSection("home")} className="navLink">Home</Link>
          <Link href="#howItWorks" onClick={() => scrollToSection("howItWorks")} className="navLink">How it Works?</Link>
          <Link href="#faq" onClick={() => scrollToSection("faq")} className="navLink">FAQ</Link>
          <Link href="#feedback" onClick={() => scrollToSection("feedback")} className="navLink">Feedback</Link>
          <Link href="#start" onClick={() => scrollToSection("start")} className="navLink" >Get Started</Link>
        </div>
      )}
    </div>
  );
}
