import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function SignInForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await authClient.signIn.email({ email: email.trim(), password });
    setLoading(false);
    if (result.error) {
      setError(result.error.message || "Invalid email or password");
      return;
    }
    try {
      await api.get<unknown>("/api/org");
      navigate("/");
    } catch {
      navigate("/setup-org");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="signin-email" className="text-gray-300 text-sm">Email</Label>
        <Input
          id="signin-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signin-password" className="text-gray-300 text-sm">Password</Label>
        <Input
          id="signin-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
        />
      </div>
      <div className="flex justify-end">
        <Link to="/forgot-password" className="text-purple-400 hover:text-purple-300 text-sm">
          Forgot password?
        </Link>
      </div>
      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      <Button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700">
        {loading ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    const result = await authClient.signUp.email({ email: email.trim(), password, name: name.trim() });
    setLoading(false);
    if (result.error) {
      setError(result.error.message || "Sign up failed");
      return;
    }
    navigate("/setup-org");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="signup-name" className="text-gray-300 text-sm">Name</Label>
        <Input
          id="signup-name"
          type="text"
          placeholder="Your full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-email" className="text-gray-300 text-sm">Email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-password" className="text-gray-300 text-sm">Password</Label>
        <Input
          id="signup-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-confirm" className="text-gray-300 text-sm">Confirm Password</Label>
        <Input
          id="signup-confirm"
          type="password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
        />
      </div>
      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      <Button type="submit" disabled={loading} className="w-full bg-purple-600 hover:bg-purple-700">
        {loading ? "Creating account..." : "Sign Up"}
      </Button>
    </form>
  );
}

export default function Login() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎭</div>
          <h1 className="text-3xl font-bold text-white">Theater Planner</h1>
          <p className="text-gray-400 mt-2">Manage your productions</p>
        </div>
        <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
          <Tabs defaultValue="signin">
            <TabsList className="w-full mb-6 bg-gray-800">
              <TabsTrigger value="signin" className="flex-1 data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400">
                Sign In
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1 data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400">
                Sign Up
              </TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <SignInForm />
            </TabsContent>
            <TabsContent value="signup">
              <SignUpForm />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
