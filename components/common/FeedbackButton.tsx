"use client";

import React, { useState } from "react";
import styles from "./FeedbackButton.module.css";

const STORAGE_KEY = "maptocode-feedback";
const MAX_LENGTH = 1000;

// Optional: set NEXT_PUBLIC_FEEDBACK_EMAIL in web/.env.local to open the
// visitor's email app with their feedback pre-filled.
const FEEDBACK_EMAIL = process.env.NEXT_PUBLIC_FEEDBACK_EMAIL ?? "";

interface FeedbackEntry {
  rating: number;
  message: string;
  page: string;
  createdAt: string;
}

function saveLocally(entry: FeedbackEntry): void {
  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const list = Array.isArray(existing) ? existing : [];
    list.push(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-20)));
  } catch {
    // Storage can be unavailable (private mode); feedback still works via email.
  }
}

export default function FeedbackButton(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const reset = () => {
    setRating(0);
    setMessage("");
    setError("");
    setSent(false);
  };

  const close = () => {
    setOpen(false);
    if (sent) reset();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = message.trim();
    if (rating === 0 && text === "") {
      setError("Please pick a rating or write a short message.");
      return;
    }
    const entry: FeedbackEntry = {
      rating,
      message: text,
      page: window.location.pathname,
      createdAt: new Date().toISOString(),
    };
    saveLocally(entry);
    if (FEEDBACK_EMAIL) {
      const subject = encodeURIComponent("MapToCode feedback");
      const body = encodeURIComponent(`Rating: ${rating || "not given"}/5\n\n${text}`);
      window.location.href = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
    }
    setError("");
    setSent(true);
  };

  return (
    <>
      {open && (
        <div
          className={styles.panel}
          role="dialog"
          aria-label="Send feedback"
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <div className={styles.panelHead}>
            <h2 className={styles.title}>Send feedback</h2>
            <button type="button" className={styles.close} onClick={close} aria-label="Close feedback">
              ×
            </button>
          </div>

          {sent ? (
            <p className={styles.thanks}>
              Thank you! 🎉{" "}
              {FEEDBACK_EMAIL
                ? "Your email app should have opened — press send there to deliver it."
                : "Your feedback was saved on this device (placeholder: not sent to a server yet)."}
            </p>
          ) : (
            <form onSubmit={submit}>
              <p className={styles.hint}>What do you think of MapToCode so far?</p>
              <span className={styles.label} id="fb-rating-label">
                Rating
              </span>
              <div className={styles.stars} role="radiogroup" aria-labelledby="fb-rating-label">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={rating === n}
                    aria-label={`${n} out of 5`}
                    className={`${styles.star} ${n <= rating ? styles.starOn : ""}`}
                    onClick={() => setRating(n)}
                  >
                    ★
                  </button>
                ))}
              </div>
              <label className={styles.label} htmlFor="fb-message">
                Message
              </label>
              <textarea
                id="fb-message"
                className={styles.textarea}
                value={message}
                maxLength={MAX_LENGTH}
                placeholder="Bugs, ideas, or anything confusing…"
                onChange={(e) => setMessage(e.target.value)}
              />
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className={styles.send}>
                Send feedback
              </button>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        className={styles.fab}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg className={styles.fabIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Feedback
      </button>
    </>
  );
}
