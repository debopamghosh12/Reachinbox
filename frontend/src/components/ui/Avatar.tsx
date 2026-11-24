import { useState } from "react";
import { cn } from "../../lib/cn";

interface AvatarProps {
  name: string;
  src?: string | null;
  className?: string;
}

// Shows the image, or the first letter on a green circle when there is no
// image or it fails to load.
export function Avatar({ name, src, className }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const base = cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full", className);

  if (src && !broken) {
    // no-referrer: Google's avatar host can refuse requests that send a Referer.
    return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} className={cn(base, "object-cover")} />;
  }
  return (
    <span aria-hidden className={cn(base, "bg-green-500 font-medium text-white")}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
