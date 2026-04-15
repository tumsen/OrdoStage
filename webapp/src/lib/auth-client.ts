import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BACKEND_URL || undefined,
  plugins: [emailOTPClient()],
  fetchOptions: {
    credentials: "include",
  },
});

export const { useSession, signOut } = authClient;
