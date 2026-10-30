import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { BookOpen, ArrowRight } from "lucide-react";

const categories = [
  { name: "Laboratory Equipment" },
  { name: "Audio Visual" },
  { name: "Meeting Rooms" },
  { name: "Study Spaces" },
  { name: "Workshops" },
  { name: "Outdoor Gear" },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // During auth initialization, show a neutral loading state.
  // Do not redirect until we know the user's authentication status.
  if (loading) {
    return (
      <div className="page flex flex-col items-center justify-center py-24 text-center text-muted">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <span className="rounded bg-forest px-2 py-0.5 text-white text-xs font-bold">U</span>
          <span className="font-bold text-xl tracking-tight text-forest">Unlock Underused</span>
        </div>
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  // Redirect authenticated users to their dashboard after auth is confirmed.
  if (user) {
    navigate(user.role === "student" ? "/resources" : "/manager", {
      replace: true,
    });
    return null;
  }

  return (
    <div className="page">
      <nav className="sticky top-0 z-20 border-b border-border bg-ivory/90 backdrop-blur-md">
        <div className="container flex items-center justify-between px-4 py-3">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-xl tracking-tight text-forest">
            <span className="rounded bg-lime px-2 py-0.5 text-forest text-xs font-bold">U</span>
            Unlock<span className="text-muted"> Underused</span>
          </NavLink>
          <div className="hidden md:flex items-center gap-6">
            <NavLink to="/resources" className="text-sm font-medium text-muted hover:text-forest transition-colors">Browse Resources</NavLink>
            <NavLink to="/login" className="text-sm font-medium text-muted hover:text-forest transition-colors">Sign In</NavLink>
            <button className="btn-primary text-sm px-4 py-2">Get Started</button>
          </div>
          <div className="md:hidden">
            <button className="text-muted hover:text-forest" aria-label="Open menu">
              <span className="sr-only">Open menu</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      <main>
        <section className="py-24 lg:py-36 overflow-hidden">
          <div className="container relative mx-auto">
            <div className="max-w-2xl mx-auto text-center">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime/20 text-forest text-xs font-semibold mb-6">
                Campus Resource Exchange
              </span>
              <h1 className="text-4xl lg:text-6xl font-bold text-dark mb-6 tracking-tight">
                The resources you need are already here.
              </h1>
              <p className="text-lg text-muted mb-10 max-w-lg mx-auto leading-relaxed">
                Discover equipment and spaces available across your community. Find what you need,
                request it when you need it, and help existing resources go further.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <NavLink to="/register" className="btn-primary px-8 py-3 text-lg flex items-center justify-center gap-2">
                  Get Started <ArrowRight className="h-4 w-4" />
                </NavLink>
                <NavLink to="/login" className="btn-outline px-8 py-3 text-lg flex items-center justify-center gap-2 border">
                  Sign In
                </NavLink>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-ivory/50">
          <div className="container mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl font-bold text-dark mb-4">Resource Categories</h2>
              <p className="text-muted">Browse available resources by category</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {categories.map((cat) => (
                <div
                  key={cat.name}
                  className="card hover:border-forest transition-colors cursor-pointer group"
                >
                  <div className="w-12 h-12 rounded-xl bg-forest/10 flex items-center justify-center mb-3 group-hover:bg-forest transition-colors">
                    <BookOpen className="h-5 w-5 text-forest" />
                  </div>
                  <h3 className="font-medium text-dark">{cat.name}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-2xl font-bold text-dark mb-6">How It Works</h2>
                <div className="space-y-8">
                  <div className="flex gap-5">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-lime/20 flex items-center justify-center text-forest font-bold text-xl">
                      1
                    </div>
                    <div>
                      <h3 className="font-bold text-dark mb-2">Discover</h3>
                      <p className="text-muted text-sm">
                        Browse available equipment and spaces across your campus.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-5">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-lime/20 flex items-center justify-center text-forest font-bold text-xl">
                      2
                    </div>
                    <div>
                      <h3 className="font-bold text-dark mb-2">Request</h3>
                      <p className="text-muted text-sm">
                        Book a resource for your preferred time slot and await approval.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-5">
                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-lime/20 flex items-center justify-center text-forest font-bold text-xl">
                      3
                    </div>
                    <div>
                      <h3 className="font-bold text-dark mb-2">Share</h3>
                      <p className="text-muted text-sm">
                        Pick up, use, and return — making every resource go further.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="hidden lg:block">
                <div className="relative">
                  <div className="absolute inset-0 bg-lime/20 rounded-[2rem] blur-[60px]"></div>
                  <div className="relative rounded-[2rem] border border-border p-10">
                    <h3 className="font-bold text-dark mb-4">Ready to get started?</h3>
                    <p className="text-muted mb-6">
                      Create your account and start booking resources today.
                    </p>
                    <NavLink to="/register" className="btn-primary w-full">
                      Create Account
                    </NavLink>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-forest text-white">
          <div className="container mx-auto text-center">
            <h2 className="text-2xl font-bold mb-6">Make Every Resource Count</h2>
            <p className="text-lime/80 mb-10 max-w-2xl mx-auto">
              Unlock underused equipment and spaces across your institution.
              Reduce waste, save costs, and build a community of shared resources.
            </p>
            <NavLink to="/register" className="btn-primary px-8 py-3 text-lg">
              Get Started Today
            </NavLink>
          </div>
        </section>

        <footer className="border-t border-border bg-ivory py-10">
          <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="rounded bg-forest px-2 py-0.5 text-white text-xs font-bold">U</span>
              <span className="font-bold text-xl tracking-tight text-forest">Unlock Underused</span>
            </div>
            <p className="text-xs text-muted">
              &copy; {new Date().getFullYear()} Unlock Underused Equipment and Spaces. All rights reserved.
            </p>
            <div className="flex gap-4 text-xs text-muted">
              <a href="/" className="hover:text-forest transition-colors">Home</a>
              <a href="/resources" className="hover:text-forest transition-colors">Browse Resources</a>
              <a href="/login" className="hover:text-forest transition-colors">Sign In</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
