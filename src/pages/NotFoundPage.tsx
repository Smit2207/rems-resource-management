import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";

export default function NotFoundPage() {
  return (
    <PageLayout>
      <Card>
        <h2 className="text-xl font-bold">Not found</h2>
        <p className="text-secondary-text">The page you are looking for does not exist.</p>
      </Card>
    </PageLayout>
  );
}
