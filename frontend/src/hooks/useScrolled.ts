import { useEffect, useState } from "react";

// True once the page has scrolled down at all. Used to show the sticky
// header's bottom border only when content is sliding underneath it.
export function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(() => window.scrollY > 0);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return scrolled;
}
