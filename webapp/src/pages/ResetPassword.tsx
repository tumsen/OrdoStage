import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type FormValues = z.infer<typeof schema>;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [success, setSuccess] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError("");
    if (!token) {
      setError("Invalid or missing reset token. Please request a new link.");
      return;
    }
    const result = await authClient.resetPassword({
      newPassword: values.password,
      token,
    });
    if (result.error) {
      setError(result.error.message || "Failed to reset password");
      return;
    }
    setSuccess(true);
    setTimeout(() => navigate("/login"), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎭</div>
          <h1 className="text-3xl font-bold text-white">OrdoStage</h1>
          <p className="text-gray-400 mt-2">Set a new password</p>
        </div>
        <div className="bg-gray-900 border border-white/10 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-white mb-1">Reset Password</h2>
          <p className="text-gray-400 text-sm mb-6">Enter your new password below.</p>
          {success ? (
            <div className="space-y-4">
              <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-4">
                <p className="text-green-400 text-sm">
                  Password reset! Sign in with your new password.
                </p>
              </div>
              <p className="text-gray-500 text-xs text-center">Redirecting to login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {!token ? (
                <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-4">
                  <p className="text-red-400 text-sm">
                    Invalid reset link. Please{" "}
                    <Link to="/forgot-password" className="underline hover:text-red-300">
                      request a new one
                    </Link>
                    .
                  </p>
                </div>
              ) : null}
              <div className="space-y-1">
                <Label htmlFor="password" className="text-gray-300 text-sm">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="bg-gray-800 border-white/20 text-white placeholder:text-gray-500"
                  {...register("password")}
                />
                {errors.password ? <p className="text-red-400 text-xs">{errors.password.message}</p> : null}
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirmPassword" className="text-gray-300 text-sm">Confirm Password</Label>
                <Input
                  id="confirmPassword"
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
                disabled={isSubmitting || !token}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium"
              >
                {isSubmitting ? "Resetting..." : "Reset Password"}
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
