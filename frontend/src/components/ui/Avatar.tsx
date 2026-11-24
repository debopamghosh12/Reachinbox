import { useState } from "react";
import { cn } from "../../lib/cn";

interface AvatarProps {
  name: string;
  src?: string | null;
  className?: string;
}

// Shows the image, or the first letter on a green circle when there is no
// image or it really failed to load. Note: for Google accounts without a
// profile photo, Google's own URL is a generated letter avatar (white letter
// on a colored circle), so a letter can be the real image.
export function Avatar({ name, src, className }: AvatarProps) {
  // Remember WHICH url failed: if src changes later (new photo after the next
  // login), the new url gets a fresh try instead of staying on the fallback.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const base = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", className);

  if (src && src !== failedSrc) {
    return (
      <img
        src={src}
        alt=""
        // Google's avatar host (lh3.googleusercontent.com) may refuse hotlinked
        // requests that carry a Referer, so send none.
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        className={cn(base, "object-cover")}
      />
    );
  }
  return (
    <span aria-hidden className={cn(base, "bg-green-500 font-medium text-white")}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
