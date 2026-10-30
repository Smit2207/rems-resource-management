import { useParams, useNavigate, Link } from "react-router-dom";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { checkoutSchema } from "../lib/validations";
import { useBookings, recordCheckout } from "../hooks/useBookings";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { Mail } from "lucide-react";

export default function BookingCheckoutPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { bookings, reload } = useBookings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const booking = bookings.find((b: any) => b.id === id) as any;

  const form = useForm<{
    checkoutCondition: string;
    accessoriesIncluded: string;
    expectedReturnAt: string;
  }>({
    resolver: zodResolver(checkoutSchema) as any,
    defaultValues: {
      checkoutCondition: "",
      accessoriesIncluded: "",
      expectedReturnAt: "",
    },
  });

  async function handleSubmit(values: { checkoutCondition: string; accessoriesIncluded: string; expectedReturnAt: string }) {
    setError("");
    setLoading(true);
    try {
      const v = values as any;
      const accessories = (v.accessoriesIncluded || "")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      await (recordCheckout as any)(id, v.checkoutCondition, accessories, v.expectedReturnAt || "");
      reload();
      navigate("/bookings");
    } catch (e: any) {
      setError(e.message || "Could not record checkout");
    } finally {
      setLoading(false);
    }
  }

  if (!booking) return <div className="page">Booking not found.</div>;
  if (booking.status !== "Approved") {
    return (
      <PageLayout>
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <span className="h-5 w-5 rounded-full bg-forest flex items-center justify-center text-white text-xs font-bold">
              !
            </span>
            <h1 className="font-bold text-dark">Checkout</h1>
          </div>
          <p className="text-muted">Checkout can only be recorded for an approved booking.</p>
          <Link to="/bookings" className="btn-primary mt-4">Back to bookings</Link>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Mail className="h-5 w-5 text-forest" />
          <h1 className="font-bold text-dark">Record Checkout</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Resource</span>
              <span className="text-xs text-muted">Resource name</span>
            </div>
            <p className="text-sm">{booking.resource?.name || "—"}</p>
          </div>
          <div className="p-3 rounded border border-border">
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-dark">Borrower</span>
              <span className="text-xs text-muted">Borrower name</span>
            </div>
            <p className="text-sm">{booking.borrower?.full_name || "—"}</p>
          </div>
        </div>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField label="Condition at checkout">
            <select className="input" {...form.register("checkoutCondition")} required>
              <option value="Good">Good</option>
              <option value="Fair">Fair</option>
              <option value="Poor">Poor</option>
              <option value="Damaged">Damaged</option>
            </select>
          </FormField>
          <FormField label="Accessories included (comma separated)">
            <input
              className="input"
              {...form.register("accessoriesIncluded")}
              placeholder="e.g. slides, cable, remote"
            />
          </FormField>
          <FormField label="Expected return date & time">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                type="datetime-local"
                className="input pl-9"
                {...form.register("expectedReturnAt")}
                required
              />
            </div>
          </FormField>
          {error && (
            <div className="p-3 rounded bg-rose-50 border border-rose-100 text-rose-700 text-sm">
              {error}
            </div>
          )}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Recording…" : "Record Checkout"}
          </button>
        </form>
      </Card>
    </PageLayout>
  );
}
