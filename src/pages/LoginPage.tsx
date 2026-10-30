import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, ArrowRight, AlertCircle } from "lucide-react";
import { signIn, getProfile, resendConfirmation } from "../lib/auth";
import { loginSchema } from "../lib/validations";
import { PageLayout } from "../components/PageLayout";
import { FormField } from "../components/Common";

function rolePath(role: string) {
  switch (role) {
    case "manager":
    case "admin":
      return "/manager";
    default:
      return "/resources";
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);

  function isUnconfirmedEmail(err: any): boolean {
    if (!err) return false;
    if (err.code === "email_not_confirmed") return true;
    if (typeof err.message === "string" && /not confirmed/i.test(err.message))
      return true;
    return false;
  }

  function isRateLimited(err: any): boolean {
    if (!err) return false;
    if (err.status === 429) return true;
    if (typeof err.message === "string" && /rate limit/i.test(err.message))
      return true;
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    setLoading(true);
    const { error: err, data } = await signIn(email, password);
    if (err || !data?.user) {
      setLoading(false);
      if (isUnconfirmedEmail(err)) {
        setUnconfirmedEmail(email);
        setError(
          "Please confirm your email address before signing in. Check your inbox for a confirmation link.",
        );
      } else if (isRateLimited(err)) {
        setError(
          "Too many login attempts. Please wait a moment and try again.",
        );
      } else {
        setError("Invalid email or password. Please try again.");
      }
      return;
    }
    const profile = await getProfile();
    setLoading(false);
    if (!profile) {
      setError("Profile not found. Please contact support.");
      return;
    }
    navigate(rolePath(profile.role), { replace: true });
  }

  async function handleResend() {
    if (!unconfirmedEmail) return;
    setResendLoading(true);
    const { error: err } = await resendConfirmation(unconfirmedEmail);
    setResendLoading(false);
    if (err) {
      setError(err.message || "Could not resend confirmation email. Please try again later.");
      return;
    }
    setError("");
    setUnconfirmedEmail(null);
  }

  return (
    <PageLayout>
      <div className="max-w-md mx-auto">
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <span className="rounded bg-forest px-2 py-0.5 text-white text-xs font-bold">U</span>
            <h2 className="text-xl font-bold text-dark">Sign in</h2>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Email address">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="email"
                  className="input pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </FormField>
            <FormField label="Password">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
                <input
                  type="password"
                  className="input pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </FormField>
            {error && (
              <div className="p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
            {unconfirmedEmail && (
              <div className="p-4 rounded bg-amber-50 border border-amber-100 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-700 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-dark">
                      Email not confirmed
                    </p>
                    <p className="text-sm text-muted">
                      The email address{" "}
                      <strong>{unconfirmedEmail}</strong> has not been confirmed
                      yet. Check your inbox for a confirmation link, or request a
                      new one below.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleResend}
                  className="btn-outline text-sm w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={resendLoading}
                >
                  {resendLoading ? "Sending…" : "Resend confirmation email"}
                </button>
              </div>
            )}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? <><ArrowRight className="h-4 w-4 mr-2" />Signing in…</> : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-sm text-center text-muted">
            Don't have an account?{" "}
            <a href="/register" className="text-forest hover:underline font-medium">
              Create one
            </a>
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
