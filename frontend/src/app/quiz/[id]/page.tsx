"use client";
import { useParams } from "next/navigation";
import { useEffect } from "react";

export default function QuizRedirect() {
  const { id } = useParams<{ id: string }>();
  useEffect(() => {
    window.location.replace(`/?material=${id}`);
  }, [id]);
  return null;
}
