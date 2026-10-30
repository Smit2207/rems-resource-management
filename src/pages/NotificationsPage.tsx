import { useNotifications } from "../hooks/useIncidents";
import { PageLayout } from "../components/PageLayout";
import { Card } from "../components/Card";
import { EmptyState } from "../components/Common";
import { formatDateTime } from "../lib/utils";
import { Bell } from "lucide-react";

export default function NotificationsPage() {
  const { notifications, loading, markRead } = useNotifications();

  if (loading) return (
    <PageLayout>
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        Loading notifications…
      </div>
    </PageLayout>
  );

  const unread = notifications.filter((n) => !n.read);

  return (
    <PageLayout>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-forest" />
          <h1 className="text-xl font-bold text-dark">Notifications</h1>
        </div>
        {unread.length > 0 && (
          <span className="badge badge-open text-xs">
            {unread.length} unread
          </span>
        )}
      </div>
      <Card>
        {notifications.length === 0 ? (
          <EmptyState
            title="No notifications"
            description="You will see activity here."
          />
        ) : (
          <div className="space-y-3">
            {notifications.map((n: any) => (
              <div
                key={n.id}
                onClick={() => markRead(n.id)}
                style={{ cursor: "pointer" }}
                className="group"
              >
                <Card
                  className={`p-4 ${
                    !n.read ? "border-forest bg-forest/5" : ""
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-bold text-dark">{n.title}</h3>
                    <span className="text-xs text-muted">
                      {formatDateTime(n.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-muted">{n.message}</p>
                  {!n.read && (
                    <span className="block mt-1 text-xs text-forest font-medium">
                      Click to mark as read
                    </span>
                  )}
                </Card>
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
