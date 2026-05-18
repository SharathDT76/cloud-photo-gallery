import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Image as ImageIcon, EnvelopeSimple, LockKey, ArrowLeft } from "@phosphor-icons/react";
import { apiLogin, apiSignup, apiConfirm, apiResend } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup | confirm
  const [busy, setBusy] = useState(false);

  // shared state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  async function handleSignin(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const tokens = await apiLogin(email, password);
      login(tokens);
      toast.success("Welcome back!");
      navigate("/gallery");
    } catch (err) {
      const msg = err?.response?.data?.detail || err.message;
      if (String(msg).toLowerCase().includes("not confirmed")) {
        setMode("confirm");
        toast.info("Please confirm your email first");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiSignup(email, password);
      toast.success("Verification code sent to your email");
      setMode("confirm");
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiConfirm(email, code);
      toast.success("Email confirmed. Signing you in...");
      const tokens = await apiLogin(email, password);
      login(tokens);
      navigate("/gallery");
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    try {
      await apiResend(email);
      toast.success("Code re-sent");
    } catch (err) {
      toast.error(err?.response?.data?.detail || err.message);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left – form */}
      <div className="w-full lg:w-1/2 flex flex-col p-6 lg:p-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900" data-testid="auth-back-home">
          <ArrowLeft size={16} /> Back home
        </Link>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-md mx-auto">
            <div className="flex items-center gap-2 mb-10">
              <div className="h-8 w-8 rounded-md bg-neutral-900 flex items-center justify-center">
                <ImageIcon size={18} weight="bold" color="white" />
              </div>
              <span className="font-heading font-semibold tracking-tight text-xl">
                Shadow Gallery
              </span>
            </div>

            {mode === "confirm" ? (
              <form onSubmit={handleConfirm} className="space-y-5">
                <div>
                  <h1 className="font-heading text-3xl font-semibold tracking-tight">
                    Confirm your email
                  </h1>
                  <p className="mt-2 text-neutral-600">
                    We sent a 6-digit code to <b>{email}</b>.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Verification code</Label>
                  <Input
                    id="code"
                    data-testid="auth-confirm-code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="123456"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  data-testid="auth-confirm-submit-btn"
                  disabled={busy}
                  className="w-full h-11 rounded-md bg-neutral-900 hover:bg-neutral-800"
                >
                  {busy ? "Confirming..." : "Confirm & sign in"}
                </Button>
                <div className="flex justify-between text-sm">
                  <button type="button" onClick={handleResend} className="text-neutral-600 hover:text-neutral-900" data-testid="auth-resend-btn">
                    Resend code
                  </button>
                  <button type="button" onClick={() => setMode("signin")} className="text-neutral-600 hover:text-neutral-900">
                    Back to sign in
                  </button>
                </div>
              </form>
            ) : (
              <Tabs value={mode} onValueChange={setMode}>
                <TabsList className="grid grid-cols-2 mb-8 bg-neutral-100">
                  <TabsTrigger value="signin" data-testid="auth-tab-signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup" data-testid="auth-tab-signup">Create account</TabsTrigger>
                </TabsList>

                <TabsContent value="signin">
                  <form onSubmit={handleSignin} className="space-y-5">
                    <div>
                      <h1 className="font-heading text-3xl font-semibold tracking-tight">
                        Welcome back.
                      </h1>
                      <p className="mt-2 text-neutral-600">
                        Sign in to access your gallery.
                      </p>
                    </div>
                    <EmailField email={email} setEmail={setEmail} />
                    <PasswordField password={password} setPassword={setPassword} />
                    <Button
                      type="submit"
                      data-testid="auth-signin-submit-btn"
                      disabled={busy}
                      className="w-full h-11 rounded-md bg-neutral-900 hover:bg-neutral-800"
                    >
                      {busy ? "Signing in..." : "Sign in"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup">
                  <form onSubmit={handleSignup} className="space-y-5">
                    <div>
                      <h1 className="font-heading text-3xl font-semibold tracking-tight">
                        Create your vault.
                      </h1>
                      <p className="mt-2 text-neutral-600">
                        Start uploading in less than a minute.
                      </p>
                    </div>
                    <EmailField email={email} setEmail={setEmail} />
                    <PasswordField
                      password={password}
                      setPassword={setPassword}
                      helper="Min 8 characters · upper, lower, number, symbol"
                    />
                    <Button
                      type="submit"
                      data-testid="auth-signup-submit-btn"
                      disabled={busy}
                      className="w-full h-11 rounded-md bg-neutral-900 hover:bg-neutral-800"
                    >
                      {busy ? "Creating..." : "Create account"}
                    </Button>
                    <p className="text-xs text-neutral-500">
                      By continuing you agree to our terms. Email verification required.
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>

      {/* Right – visual */}
      <div className="hidden lg:block lg:w-1/2 relative bg-neutral-900 overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1693929268060-ea24d5e0f830?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzNTl8MHwxfHNlYXJjaHwxfHxsYW5kc2NhcGUlMjBuYXR1cmUlMjB3aWRlfGVufDB8fHx8MTc3ODg1NDgzMHww&ixlib=rb-4.1.0&q=85"
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        <div className="absolute bottom-12 left-12 right-12 text-white">
          <p className="text-sm uppercase tracking-[0.2em] opacity-80">Cognito · S3 · Lambda</p>
          <p className="mt-3 font-heading text-3xl font-medium max-w-md leading-snug">
            Encryption at rest, signed URLs in transit. Your photographs stay yours.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmailField({ email, setEmail }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <div className="relative">
        <EnvelopeSimple size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <Input
          id="email"
          data-testid="auth-email-input"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="pl-9"
          placeholder="you@domain.com"
        />
      </div>
    </div>
  );
}

function PasswordField({ password, setPassword, helper }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="password">Password</Label>
      <div className="relative">
        <LockKey size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <Input
          id="password"
          data-testid="auth-password-input"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="pl-9"
          placeholder="••••••••"
        />
      </div>
      {helper && <p className="text-xs text-neutral-500">{helper}</p>}
    </div>
  );
}
