import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resourceSchema } from "../lib/validations";
import { useResources } from "../hooks/useResources";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { ImageUpload } from "../components/ImageUpload";

export default function ResourceCreatePage() {
  const navigate = useNavigate();
  const { categories, create } = useResources();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const form = useForm<{
    name: string;
    description: string;
    type: string;
    categoryId: string;
    location: string;
    capacity: string;
    eligibilityDepartment: string;
    eligibilityMinYear: string;
    requiredTraining: boolean;
    trainingRequired: string;
    supervisionRequired: boolean;
    usageRules: string;
    depositAmount: string;
    depositConditions: string;
    status: string;
    imageUrl: string | null;
  }>({
    resolver: zodResolver(resourceSchema) as any,
    defaultValues: {
      name: "",
      description: "",
      type: "equipment",
      categoryId: "",
      location: "",
      capacity: "",
      eligibilityDepartment: "",
      eligibilityMinYear: "",
      requiredTraining: false,
      trainingRequired: "",
      supervisionRequired: false,
      usageRules: "",
      depositAmount: "",
      depositConditions: "",
      status: "active",
      imageUrl: null,
    },
  });

  async function handleSubmit(values: any) {
    setError("");
    setSaving(true);
    try {
      await create({
        name: values.name,
        description: values.description,
        type: values.type,
        category_id: values.categoryId || null,
        location: values.location,
        capacity: values.capacity ? Number(values.capacity) : null,
        eligibility_department: values.eligibilityDepartment || null,
        eligibility_min_year: values.eligibilityMinYear
          ? Number(values.eligibilityMinYear)
          : null,
        required_training: values.requiredTraining,
        training_required: values.trainingRequired || null,
        supervision_required: values.supervisionRequired,
        usage_rules: values.usageRules || null,
        deposit_amount: values.depositAmount ? Number(values.depositAmount) : null,
        deposit_conditions: values.depositConditions || null,
        status: values.status,
        image_url: values.imageUrl,
      });
      navigate("/resources/mine");
    } catch (e: any) {
      setError(e.message || "Could not create resource");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout>
      <div className="max-w-2xl">
        <Card>
          <h1 className="text-xl font-bold mb-6">Create Resource</h1>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField label="Resource name">
              <input
                className="input"
                {...form.register("name")}
                required
              />
              {form.formState.errors.name && (
                <p className="text-sm text-rose-600">
                  {form.formState.errors.name.message}
                </p>
              )}
            </FormField>
            <FormField label="Description">
              <textarea
                className="input"
                rows={3}
                {...form.register("description")}
                required
              />
              {form.formState.errors.description && (
                <p className="text-sm text-rose-600">
                  {form.formState.errors.description.message}
                </p>
              )}
            </FormField>
            <FormField label="Type">
              <select className="input" {...form.register("type")}>
                <option value="equipment">Equipment</option>
                <option value="space">Space</option>
              </select>
            </FormField>
            <FormField label="Category">
              <select className="input" {...form.register("categoryId")} required>
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.categoryId && (
                <p className="text-sm text-rose-600">
                  {form.formState.errors.categoryId.message}
                </p>
              )}
            </FormField>
            <FormField label="Location">
              <input className="input" {...form.register("location")} required />
            </FormField>
            <FormField label="Image">
              <ImageUpload
                value={form.getValues("imageUrl")}
                onChange={(url) => form.setValue("imageUrl", url)}
                disabled={saving}
              />
            </FormField>
            <FormField label="Capacity (optional)">
              <input type="number" className="input" {...form.register("capacity")} />
            </FormField>
            <FormField label="Eligible department (optional)">
              <input className="input" {...form.register("eligibilityDepartment")} />
            </FormField>
            <FormField label="Minimum year of study (optional)">
              <input type="number" className="input" {...form.register("eligibilityMinYear")} />
            </FormField>
            <div className="flex items-start gap-3 mb-2">
              <input
                id="requiredTraining"
                type="checkbox"
                className="mt-1"
                checked={form.getValues("requiredTraining")}
                onChange={() => form.setValue("requiredTraining", !form.getValues("requiredTraining"))}
              />
              <label htmlFor="requiredTraining" className="text-sm text-dark cursor-pointer">
                Required training
              </label>
            </div>
            <FormField label="Training required (name)">
              <input
                className="input"
                {...form.register("trainingRequired")}
                disabled={!form.getValues("requiredTraining")}
              />
            </FormField>
            <div className="flex items-start gap-3 mb-2">
              <input
                id="supervisionRequired"
                type="checkbox"
                className="mt-1"
                checked={form.getValues("supervisionRequired")}
                onChange={() => form.setValue("supervisionRequired", !form.getValues("supervisionRequired"))}
              />
              <label htmlFor="supervisionRequired" className="text-sm text-dark cursor-pointer">
                Supervision required
              </label>
            </div>
            <FormField label="Usage rules (optional)">
              <textarea className="input" rows={2} {...form.register("usageRules")} />
            </FormField>
            <FormField label="Deposit amount (optional)">
              <input type="text" className="input" {...form.register("depositAmount")} />
            </FormField>
            <FormField label="Deposit conditions (optional)">
              <textarea className="input" rows={2} {...form.register("depositConditions")} />
            </FormField>
            <FormField label="Status">
              <select className="input" {...form.register("status")}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </FormField>
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm">{error}</div>}
            <button className="btn-primary w-full" disabled={saving}>
              {saving ? "Creating…" : "Create Resource"}
            </button>
          </form>
        </Card>
      </div>
    </PageLayout>
  );
}
