"use client";
import { useEffect } from "react";

export default function ReviewRedirect() {
  useEffect(() => {
    window.location.replace("/");
  }, []);
  return null;
}
