import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().email("Invalid email address"),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPassword() {
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError("");
    const result = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: "/reset-password",
    });
    if (result.error) {
      setError(result.error.message || "Failed to send reset link");
      return;
    }
    setSuccess(true);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎭</div>
          <h1 className="text-3xl font-bold text-white">Theater Planner</h1>
          <p className="text-gray-400 mt-2">Reset your password</p>
        </div>
        <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-1">Forgot password?</h2>
          <p className="text-gray-400 text-sm mb-6">
            Enter your email and we'll send you a reset link.
          </p>
          {success ? (
            <div className="space-y-4">
              <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 text-sm">
                  Check your email for a reset link.
                </p>
              </div>
              <Link
                to="/login"
                className="block text-center text-purple-400 hover:text-purple-300 text-sm transition-colors"
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-gray-300 text-sm">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
                  {...register("email")}
                />
                {errors.email ? <p className="text-red-400 text-xs">{errors.email.message}</p> : null}
              </div>
              {error ? <p className="text-red-400 text-sm">{error}</p> : null}
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium"
              >
                {isSubmitting ? "Sending..." : "Send Reset Link"}
              </Button>
              <div className="text-center">
                <Link
                  to="/login"
                  className="text-purple-400 hover:text-purple-300 text-sm transition-colors"
                >
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
