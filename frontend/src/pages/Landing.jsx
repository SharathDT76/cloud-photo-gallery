import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, CloudArrowUp, Image as ImageIcon, ShieldCheck } from "@phosphor-icons/react";

const SAMPLES = [
  "https://images.unsplash.com/photo-1488972685288-c3fd157d7c7a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwxfHxtaW5pbWFsaXN0JTIwYXJjaGl0ZWN0dXJlJTIwYWJzdHJhY3R8ZW58MHx8fHwxNzc4ODU0ODI5fDA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1531591022136-eb8b0da1e6d0?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHw0fHxtaW5pbWFsaXN0JTIwYXJjaGl0ZWN0dXJlJTIwYWJzdHJhY3R8ZW58MHx8fHwxNzc4ODU0ODI5fDA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1567943183748-3a7542120c90?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwyfHxtaW5pbWFsaXN0JTIwYXJjaGl0ZWN0dXJlJTIwYWJzdHJhY3R8ZW58MHx8fHwxNzc4ODU0ODI5fDA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1693929268060-ea24d5e0f830?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwxfHxsYW5kc2NhcGUlMjBuYXR1cmUlMjB3aWRlfGVufDB8fHx8MTc3ODg1NDgzMHww&ixlib=rb-4.1.0&q=85",
];

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Top nav */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/70 border-b border-neutral-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" data-testid="brand-logo">
            <div className="h-7 w-7 rounded-md bg-neutral-900 flex items-center justify-center">
              <ImageIcon size={16} weight="bold" color="white" />
            </div>
            <span className="font-heading font-semibold tracking-tight text-lg">
              Shadow Gallery
            </span>
          </Link>
          <nav className="flex items-center gap-3">
            {user ? (
              <Link to="/gallery">
                <Button data-testid="nav-open-gallery-btn" className="rounded-md bg-neutral-900 hover:bg-neutral-800">
                  Open Gallery
                </Button>
              </Link>
            ) : (
              <Link to="/auth">
                <Button data-testid="nav-signin-btn" className="rounded-md bg-neutral-900 hover:bg-neutral-800">
                  Sign in
                </Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative hero-grain max-w-7xl mx-auto px-6 lg:px-12 pt-20 pb-16">
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-7 fade-up">
            <p className="text-sm uppercase tracking-[0.2em] text-neutral-500 mb-6">
              Cloud-native · S3 · DynamoDB · Cognito
            </p>
            <h1 className="font-heading text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.02] text-neutral-900">
              Your photographs,
              <br />
              <span className="text-neutral-400">privately</span> archived.
            </h1>
            <p className="mt-8 text-lg text-neutral-600 max-w-xl leading-relaxed">
              A minimal cloud photo vault. Upload originals to private S3, browse
              CloudFront-served thumbnails in a Pinterest-style masonry. Built on the
              AWS stack you trust.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link to={user ? "/gallery" : "/auth"}>
                <Button
                  data-testid="hero-get-started-btn"
                  className="h-12 px-6 rounded-md bg-neutral-900 hover:bg-neutral-800 text-base"
                >
                  {user ? "Open my gallery" : "Get started"}
                  <ArrowRight className="ml-2" size={18} weight="bold" />
                </Button>
              </Link>
              <a
                href="#features"
                className="h-12 px-5 inline-flex items-center text-sm text-neutral-700 hover:text-neutral-900"
              >
                How it works →
              </a>
            </div>

            <dl className="mt-16 grid grid-cols-3 gap-8 max-w-lg">
              <div>
                <dt className="text-xs uppercase tracking-widest text-neutral-400">Storage</dt>
                <dd className="mt-1 font-heading text-2xl">S3</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-neutral-400">CDN</dt>
                <dd className="mt-1 font-heading text-2xl">CloudFront</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-neutral-400">Auth</dt>
                <dd className="mt-1 font-heading text-2xl">Cognito</dd>
              </div>
            </dl>
          </div>

          {/* Sample masonry */}
          <div className="lg:col-span-5 fade-up">
            <div className="columns-2 gap-3 space-y-3">
              {SAMPLES.map((src, i) => (
                <div
                  key={i}
                  className="masonry-col rounded-lg overflow-hidden bg-neutral-200"
                  data-testid={`landing-sample-${i}`}
                >
                  <img
                    src={src}
                    alt=""
                    className="w-full h-auto"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 lg:px-12 py-20 border-t border-neutral-200">
        <h2 className="font-heading text-3xl sm:text-4xl font-medium tracking-tight max-w-xl">
          Designed for the AWS native stack.
        </h2>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {[
            {
              icon: <ShieldCheck size={22} weight="duotone" />,
              title: "Private by default",
              body: "Originals live in a private S3 bucket. Pre-signed URLs grant short-lived access only to you.",
            },
            {
              icon: <CloudArrowUp size={22} weight="duotone" />,
              title: "Direct-to-S3 uploads",
              body: "Drag and drop. Your browser uploads straight to S3 via pre-signed URLs — no server proxy.",
            },
            {
              icon: <ImageIcon size={22} weight="duotone" />,
              title: "Auto thumbnails",
              body: "A Sharp-powered Lambda generates 600px thumbnails on the fly, cached behind CloudFront.",
            },
          ].map((f, i) => (
            <div key={i} className="space-y-3" data-testid={`feature-${i}`}>
              <div className="h-10 w-10 rounded-md bg-neutral-100 flex items-center justify-center">
                {f.icon}
              </div>
              <h3 className="font-heading text-xl font-medium">{f.title}</h3>
              <p className="text-neutral-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-neutral-200 py-8">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 flex flex-col sm:flex-row justify-between gap-3 text-sm text-neutral-500">
          <p>© Shadow Gallery — A cloud photo vault.</p>
          <p>S3 · DynamoDB · CloudFront · Cognito · Lambda</p>
        </div>
      </footer>
    </div>
  );
}
