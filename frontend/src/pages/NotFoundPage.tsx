import { MapPinOff } from "lucide-react";
import { Link } from "react-router";
import { buttonClasses } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";

export function NotFoundPage() {
  return (
    <EmptyState
      icon={MapPinOff}
      title="Page not found"
      action={<Link to="/dashboard" className={buttonClasses("outline", "sm")}>Go to Scheduled</Link>}
    />
  );
}
