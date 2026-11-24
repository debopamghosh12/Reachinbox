import { CircleAlert } from "lucide-react";
import { useSearchParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { GoogleIcon } from "../components/ui/GoogleIcon";
import { Input } from "../components/ui/Input";
import { googleLoginUrl } from "../lib/api/endpoints";

// Readable text for the /login?error=<reason> values the backend sends.
const LOGIN_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  invalid_state: "Your sign-in link expired or was already used. Please try again.",
  missing_code: "Google didn't return a sign-in code. Please try again.",
  google_error: "Google reported an error. Please try again.",
  exchange_failed: "We couldn't complete Google sign-in. Please try again.",
};

export function LoginPage() {
  const [params] = useSearchParams();
  const reason = params.get("error");
  const error = reason ? (LOGIN_ERRORS[reason] ?? "Sign-in failed. Please try again.") : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[496px] rounded-2xl border border-line px-14 py-12">
        <h1 className="mb-7 text-center text-[32px] font-semibold text-[#1C1C1C]">Login</h1>

        {error && (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {error}
          </p>
        )}

        {/* A full-page navigation: the backend sends the browser on to Google. */}
        <a href={googleLoginUrl} className={buttonClasses("soft", "md", "w-full font-normal")}>
          <GoogleIcon className="h-4 w-4" />
          Login with Google
        </a>

        <div className="my-7 flex items-center gap-3 text-xs text-[#AFAFAF]">
          <span className="h-px flex-1 bg-line" />
          or sign up through email
          <span className="h-px flex-1 bg-line" />
        </div>

        {/* Shown to match the design, but there is no email/password backend. */}
        <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} aria-describedby="email-login-note">
          <Input label="Email ID" placeholder="Email ID" type="email" disabled />
          <Input label="Password" placeholder="Password" type="password" disabled />
          <Button type="submit" className="mt-4 w-full font-normal" disabled>
            Login
          </Button>
          <p id="email-login-note" className="text-center text-xs text-gray-500">
            Email sign-in isn't available yet. Use Google.
          </p>
        </form>
      </div>
    </main>
  );
}
