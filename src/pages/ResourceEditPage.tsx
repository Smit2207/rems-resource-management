import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { resourceSchema } from "../lib/validations";
import { useResources } from "../hooks/useResources";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { FormField } from "../components/Common";
import { ImageUpload } from "../components/ImageUpload";

export default function ResourceEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { resources, update } = useResources();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const resource = resources.find((r) => r.id === id);

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

  useEffect(() => {
    if (!resource) return;
    form.reset({
      name: resource.name,
      description: resource.description || "",
      type: resource.type,
      categoryId: resource.category_id || "",
      location: resource.location || "",
      capacity: resource.capacity?.toString() || "",
      eligibilityDepartment: resource.eligibility_department || "",
      eligibilityMinYear: resource.eligibility_min_year?.toString() || "",
      requiredTraining: resource.required_training,
      trainingRequired: resource.training_required || "",
      supervisionRequired: resource.supervision_required,
      usageRules: resource.usage_rules || "",
      depositAmount: resource.deposit_amount?.toString() || "",
      depositConditions: resource.deposit_conditions || "",
      status: resource.status,
      imageUrl: resource.image_url || null,
    });
  }, [resource, form]);

  if (!resource) return <div className="page">Resource not found or you do not own it.</div>;

  async function handleSubmit(values: any) {
    if (!resource) return;
    setError("");
    setSaving(true);
    try {
      await update(resource.id, {
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
      setError(e.message || "Could not update resource");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageLayout>
      <div className="max-w-2xl">
        <Card>
          <h1 className="text-xl font-bold mb-6">Edit Resource</h1>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <FormField label="Resource name">
              <input className="input" {...form.register("name")} required />
            </FormField>
            <FormField label="Description">
              <textarea className="input" rows={3} {...form.register("description")} required />
            </FormField>
            <FormField label="Type">
              <select className="input" {...form.register("type")}>
                <option value="equipment">Equipment</option>
                <option value="space">Space</option>
              </select>
            </FormField>
            <FormField label="Category">
              <select className="input" {...form.register("categoryId")}>
                <option value="">Select a category</option>
              </select>
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
            <FormField label="Status">
              <select className="input" {...form.register("status")}>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </FormField>
            {error && <div className="p-3 rounded bg-rose-50 text-rose-700 text-sm">{error}</div>}
            <button className="btn-primary w-full" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </form>
        </Card>
      </div>
    </PageLayout>
  );
}
