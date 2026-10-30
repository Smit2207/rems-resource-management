import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signUp, resendConfirmation } from "../lib/auth";
import { registerSchema } from "../lib/validations";
import { PageLayout } from "../components/PageLayout";
import { FormField } from "../components/Common";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    role: "student",
    institution: "",
    department: "",
    yearOfStudy: "",
    studentStaffId: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Invalid input");
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    const { data, error: err } = await signUp(
      form.email,
      form.password,
      form.fullName,
    );
    setLoading(false);
    if (err) {
      if (err.status === 429 || /rate limit/i.test(err.message || "")) {
        setError(
          "Too many registration attempts. Please wait a moment and try again.",
        );
      } else if (/already registered/i.test(err.message || "")) {
        setError("An account with this email already exists. Please sign in instead.");
      } else {
        setError(err.message || "Registration failed");
      }
      return;
    }
    if (data?.user && !data.session) {
      // Email confirmation is required. data.session is null when Supabase
      // requires email verification before creating a session.
      setRegisteredEmail(form.email);
      setRegistered(true);
      setForm({
        email: "",
        password: "",
        confirmPassword: "",
        fullName: "",
        role: "student",
        institution: "",
        department: "",
        yearOfStudy: "",
        studentStaffId: "",
      });
    } else if (data?.user && data.session) {
      // Auto-logged in (no email confirmation required).
      navigate("/resources", { replace: true });
    }
  }

  async function handleResend() {
    if (!registeredEmail) return;
    setResendLoading(true);
    const { error: err } = await resendConfirmation(registeredEmail);
    setResendLoading(false);
    if (err) {
      setError(err.message || "Could not resend confirmation email. Please try again later.");
      return;
    }
    setError("");
  }

  return (
    <PageLayout>
      <div className="max-w-md mx-auto">
        <div className="card">
          {registered ? (
            <div className="text-center">
              <h2 className="text-xl font-bold mb-6">Account created</h2>
              <div className="p-4 rounded bg-forest/5 border border-forest/10 mb-6">
                <p className="mb-3 text-sm text-dark">
                  An account was created for{" "}
                  <strong className="text-forest">{registeredEmail}</strong>.
                </p>
                <p className="mb-3 text-sm text-muted">
                  Please check your email at{" "}
                  <strong className="text-dark">{registeredEmail}</strong> and follow the
                  confirmation link before signing in.
                </p>
                <p className="text-xs text-muted">
                  If you don't see the email, check your spam or junk folder.
                </p>
              </div>
              <button
                onClick={handleResend}
                className="btn-outline w-full mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={resendLoading}
              >
                {resendLoading ? "Sending…" : "Resend confirmation email"}
              </button>
              <button
                onClick={() => navigate("/login", { replace: true })}
                className="btn-primary w-full"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold mb-6">Create account</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Full name">
                  <input
                    className="input"
                    value={form.fullName}
                    onChange={(e) =>
                      setForm({ ...form, fullName: e.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="Email">
                  <input
                    type="email"
                    className="input"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="Password">
                  <input
                    type="password"
                    className="input"
                    value={form.password}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="Confirm password">
                  <input
                    type="password"
                    className="input"
                    value={form.confirmPassword}
                    onChange={(e) =>
                      setForm({ ...form, confirmPassword: e.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="Role">
                  <select
                    className="input"
                    value={form.role}
                    onChange={(e) =>
                      setForm({ ...form, role: e.target.value })
                    }
                  >
                    <option value="student">Student</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </FormField>
                <FormField label="Institution">
                  <input
                    className="input"
                    value={form.institution}
                    onChange={(e) =>
                      setForm({ ...form, institution: e.target.value })
                    }
                    required
                  />
                </FormField>
                <FormField label="Department (optional)">
                  <input
                    className="input"
                    value={form.department}
                    onChange={(e) =>
                      setForm({ ...form, department: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="Year of study (optional)">
                  <input
                    type="number"
                    className="input"
                    value={form.yearOfStudy}
                    onChange={(e) =>
                      setForm({ ...form, yearOfStudy: e.target.value })
                    }
                  />
                </FormField>
                <FormField label="Student / staff ID (optional)">
                  <input
                    className="input"
                    value={form.studentStaffId}
                    onChange={(e) =>
                      setForm({ ...form, studentStaffId: e.target.value })
                    }
                  />
                </FormField>
                {error && (
                  <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm">
                    {error}
                  </div>
                )}
                <button className="btn-primary w-full" disabled={loading}>
                  {loading ? "Creating account…" : "Create account"}
                </button>
              </form>
              <p className="mt-6 text-sm text-center text-muted">
                Already have an account?{" "}
                <a href="/login" className="text-forest hover:underline">
                  Sign in
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
