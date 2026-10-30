export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <div className="container">{children}</div>
    </div>
  );
}
