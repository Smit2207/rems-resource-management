import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { useAuth } from "../hooks/useAuth";
import { Badge } from "../components/Badge";

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    full_name: user?.fullName || "",
    institution: user?.institution || "",
    department: user?.department || "",
    year_of_study: user?.yearOfStudy ? String(user.yearOfStudy) : "",
    student_staff_id: user?.studentStaffId || "",
  });

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        Loading profile…
      </div>
    </PageLayout>
  );

  if (!user) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-lg font-medium text-muted">Not signed in.</p>
          <Link to="/login" className="btn-primary mt-4">
            Sign in
          </Link>
        </div>
      </PageLayout>
    );
  }

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      const { error: err } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name || null,
          institution: formData.institution || null,
          department: formData.department || null,
          year_of_study: formData.year_of_study ? Number(formData.year_of_study) : null,
          student_staff_id: formData.student_staff_id || null,
        })
        .eq("id", user.id);

      if (err) throw err;

      setMessage("Profile updated successfully.");
      setEditing(false);
    } catch (err: any) {
      setError(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageLayout>
      <div className="max-w-2xl">
        <Card>
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-xl font-bold text-dark">Profile</h1>
              <p className="text-muted">
                Manage your personal information. Role and email are managed
                through your account settings.
              </p>
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="btn-primary"
              >
                Edit Profile
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div className="p-3 rounded border border-border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-dark">Name</span>
                <span className="text-xs text-muted">Full name</span>
              </div>
              <p className="text-sm">{user.fullName || "—"}</p>
            </div>

            <div className="p-3 rounded border border-border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-dark">Email</span>
                <span className="text-xs text-muted">Account email</span>
              </div>
              <p className="text-sm">{user.email}</p>
            </div>

            <div className="p-3 rounded border border-border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-dark">Role</span>
                <span className="text-xs text-muted">Account role</span>
              </div>
              <p className="text-sm">
                <Badge variant={user.role}>{user.role.charAt(0).toUpperCase() + user.role.slice(1)}</Badge>
              </p>
            </div>

            <div className="p-3 rounded border border-border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-dark">Institution</span>
                <span className="text-xs text-muted">School or organization</span>
              </div>
              <p className="text-sm">{user.institution || "—"}</p>
            </div>

            <div className="p-3 rounded border border-border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-dark">Department</span>
                <span className="text-xs text-muted">Academic department</span>
              </div>
              <p className="text-sm">{user.department || "—"}</p>
            </div>

            <div className="p-3 rounded border border-border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-dark">Year of Study</span>
                <span className="text-xs text-muted">Current year</span>
              </div>
              <p className="text-sm">{user.yearOfStudy ?? "—"}</p>
            </div>

            <div className="p-3 rounded border border-border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-dark">Student / Staff ID</span>
                <span className="text-xs text-muted">Institutional ID</span>
              </div>
              <p className="text-sm">{user.studentStaffId || "—"}</p>
            </div>

            <div className="p-3 rounded border border-border">
              <div className="flex justify-between items-start mb-2">
                <span className="font-medium text-dark">Training Completed</span>
                <span className="text-xs text-muted">Completed trainings</span>
              </div>
              <p className="text-sm">
                {user.trainingCompleted.length
                  ? user.trainingCompleted.join(", ")
                  : "None"}
              </p>
            </div>
          </div>

          {editing && (
            <div className="mt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <FormField label="Full Name">
                  <input
                    className="input"
                    value={formData.full_name}
                    onChange={(e) => handleChange("full_name", e.target.value)}
                  />
                </FormField>
                <FormField label="Institution">
                  <input
                    className="input"
                    value={formData.institution}
                    onChange={(e) => handleChange("institution", e.target.value)}
                  />
                </FormField>
                <FormField label="Department">
                  <input
                    className="input"
                    value={formData.department}
                    onChange={(e) => handleChange("department", e.target.value)}
                  />
                </FormField>
                <FormField label="Year of Study">
                  <input
                    type="number"
                    className="input"
                    min="1"
                    max="10"
                    value={formData.year_of_study}
                    onChange={(e) => handleChange("year_of_study", e.target.value)}
                  />
                </FormField>
                <FormField label="Student / Staff ID">
                  <input
                    className="input"
                    value={formData.student_staff_id}
                    onChange={(e) => handleChange("student_staff_id", e.target.value)}
                  />
                </FormField>
                {error && (
                  <div className="p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm">
                    {error}
                  </div>
                )}
                {message && (
                  <div className="p-3 rounded bg-forest/5 border border-forest/10 text-forest-700 text-sm">
                    {message}
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setError(null);
                      setMessage(null);
                      setFormData({
                        full_name: user.fullName || "",
                        institution: user.institution || "",
                        department: user.department || "",
                        year_of_study: user.yearOfStudy ? String(user.yearOfStudy) : "",
                        student_staff_id: user.studentStaffId || "",
                      });
                    }}
                    className="btn-ghost"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
