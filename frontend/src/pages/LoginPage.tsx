import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button, buttonClasses } from "../components/ui/Button";
import { GoogleIcon } from "../components/ui/GoogleIcon";
import { Input } from "../components/ui/Input";
import { readIssues } from "../features/compose/scheduleErrors";
import { ApiError } from "../lib/api/client";
import { googleLoginUrl, loginWithPassword, signupWithPassword } from "../lib/api/endpoints";
import { queryKeys } from "../lib/queryClient";
import type { Me } from "../types/api";

// Readable text for the /login?error=<reason> values the backend sends after Google.
const LOGIN_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  invalid_state: "Your sign-in link expired or was already used. Please try again.",
  missing_code: "Google didn't return a sign-in code. Please try again.",
  google_error: "Google reported an error. Please try again.",
  exchange_failed: "We couldn't complete Google sign-in. Please try again.",
};

type Mode = "login" | "signup";
type Field = "name" | "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

const MIN_PASSWORD = 8; // same rule as the backend (which has the final say)

// Checks in the browser for instant feedback; the server checks everything again.
function validate(mode: Mode, name: string, email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (mode === "signup" && !name.trim()) errors.name = "Enter your name";
  if (!email.trim()) errors.email = "Enter your email";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = "Enter a valid email address";
  if (!password) errors.password = "Enter your password";
  else if (mode === "signup" && password.length < MIN_PASSWORD) errors.password = `Password must be at least ${MIN_PASSWORD} characters`;
  return errors;
}

export function LoginPage() {
  const [params] = useSearchParams();
  const reason = params.get("error");
  const googleError = reason ? (LOGIN_ERRORS[reason] ?? "Sign-in failed. Please try again.") : null;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (): Promise<Me> =>
      mode === "signup"
        ? signupWithPassword({ name: name.trim(), email: email.trim(), password })
        : loginWithPassword({ email: email.trim(), password }),
    onSuccess: (me) => {
      queryClient.clear(); // nothing from a previous session may leak into this one
      queryClient.setQueryData(queryKeys.me, me); // logged in: no need to ask /api/me again
      navigate("/dashboard", { replace: true });
    },
    onError: (err) => {
      // Field problems (ValidationError) go under their field; everything else
      // (wrong password, email taken, Google account, too many attempts,
      // network) is shown above the form.
      if (err instanceof ApiError && err.code === "ValidationError") {
        const errors: FieldErrors = {};
        for (const issue of readIssues(err.details)) {
          if (issue.path === "name" || issue.path === "email" || issue.path === "password") errors[issue.path] ??= issue.message;
        }
        setFieldErrors(errors);
        setFormError(Object.keys(errors).length ? null : err.message);
      } else {
        setFormError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errors = validate(mode, name, email, password);
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length === 0) submit.mutate();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setFieldErrors({});
    setFormError(null);
    setPassword("");
  }

  const isSignup = mode === "signup";
  const shownError = formError ?? googleError;

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-[496px] rounded-2xl border border-line px-6 py-12 sm:px-14">
        <h1 className="mb-7 text-center text-[32px] font-semibold text-[#1C1C1C]">{isSignup ? "Sign up" : "Login"}</h1>

        {shownError && (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {shownError}
          </p>
        )}

        {/* A full-page navigation: the backend sends the browser on to Google. */}
        <a href={googleLoginUrl} className={buttonClasses("soft", "md", "w-full font-normal")}>
          <GoogleIcon className="h-4 w-4" />
          {isSignup ? "Sign up with Google" : "Login with Google"}
        </a>

        <div className="my-7 flex items-center gap-3 text-xs text-[#AFAFAF]">
          <span className="h-px flex-1 bg-line" />
          {isSignup ? "or sign up through email" : "or login with email"}
          <span className="h-px flex-1 bg-line" />
        </div>

        <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
          {isSignup && (
            <Input label="Name" placeholder="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={fieldErrors.name} />
          )}
          <Input
            label="Email ID"
            placeholder="Email ID"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
          />
          <Input
            label="Password"
            placeholder={isSignup ? `Password (at least ${MIN_PASSWORD} characters)` : "Password"}
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fieldErrors.password}
          />
          <Button type="submit" className="mt-4 w-full font-normal" loading={submit.isPending}>
            {isSignup ? "Create account" : "Login"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          {isSignup ? "Already have an account? " : "Don't have an account? "}
          <button
            type="button"
            onClick={() => switchMode(isSignup ? "login" : "signup")}
            className="font-medium text-green-600 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-green-600"
          >
            {isSignup ? "Log in" : "Sign up"}
          </button>
        </p>

        <p className="mt-8 text-center text-xs">
          <Link to="/privacy" className="text-[#AFAFAF] hover:text-gray-600 focus-visible:outline-2 focus-visible:outline-green-600">
            Privacy
          </Link>
        </p>
      </div>
    </main>
  );
}
