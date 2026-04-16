import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

function SignInForm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInValues>({ resolver: zodResolver(signInSchema) });

  const onSubmit = async (values: SignInValues) => {
    setError("");
    const result = await authClient.signIn.email({
      email: values.email,
      password: values.password,
    });
    if (result.error) {
      setError(result.error.message || "Sign in failed");
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="signin-email" className="text-gray-300 text-sm">Email</Label>
        <Input
          id="signin-email"
          type="email"
          placeholder="your@email.com"
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
          {...register("email")}
        />
        {errors.email ? <p className="text-red-400 text-xs">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="signin-password" className="text-gray-300 text-sm">Password</Label>
        <Input
          id="signin-password"
          type="password"
          placeholder="••••••••"
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
          {...register("password")}
        />
        {errors.password ? <p className="text-red-400 text-xs">{errors.password.message}</p> : null}
      </div>
      <div className="flex justify-end">
        <Link to="/forgot-password" className="text-purple-400 hover:text-purple-300 text-sm transition-colors">
          Forgot password?
        </Link>
      </div>
      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium"
      >
        {isSubmitting ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpValues>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = async (values: SignUpValues) => {
    setError("");
    const result = await authClient.signUp.email({
      email: values.email,
      password: values.password,
      name: values.name,
    });
    if (result.error) {
      setError(result.error.message || "Sign up failed");
      return;
    }
    navigate("/setup-org");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="signup-name" className="text-gray-300 text-sm">Name</Label>
        <Input
          id="signup-name"
          type="text"
          placeholder="Your full name"
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
          {...register("name")}
        />
        {errors.name ? <p className="text-red-400 text-xs">{errors.name.message}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-email" className="text-gray-300 text-sm">Email</Label>
        <Input
          id="signup-email"
          type="email"
          placeholder="your@email.com"
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
          {...register("email")}
        />
        {errors.email ? <p className="text-red-400 text-xs">{errors.email.message}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-password" className="text-gray-300 text-sm">Password</Label>
        <Input
          id="signup-password"
          type="password"
          placeholder="••••••••"
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
          {...register("password")}
        />
        {errors.password ? <p className="text-red-400 text-xs">{errors.password.message}</p> : null}
      </div>
      <div className="space-y-1">
        <Label htmlFor="signup-confirm" className="text-gray-300 text-sm">Confirm Password</Label>
        <Input
          id="signup-confirm"
          type="password"
          placeholder="••••••••"
          className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? <p className="text-red-400 text-xs">{errors.confirmPassword.message}</p> : null}
      </div>
      {error ? <p className="text-red-400 text-sm">{error}</p> : null}
      <Button
        type="submit"
        disabled={isSubmitting}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium"
      >
        {isSubmitting ? "Creating account..." : "Sign Up"}
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
