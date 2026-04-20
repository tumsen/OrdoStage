import { createAuthClient } from "better-auth/react";
import { emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_BACKEND_URL || undefined,
  plugins: [
    emailOTPClient(),
    inferAdditionalFields({
      user: {
        organizationId: { type: "string", required: false, input: false },
        orgRole: { type: "string", required: false, input: false },
        isAdmin: { type: "boolean", required: false, input: false },
      },
    }),
  ],
  fetchOptions: {
    credentials: "include",
  },
});

export const { useSession, signOut, getSession } = authClient;
