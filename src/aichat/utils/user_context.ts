import { auth } from "@/lib/firebase";

export function buildAuthUserContext() {
  const user = auth.currentUser;
  if (!user) {
    return undefined;
  }

  const email = user.email || "";
  const name = user.displayName || email.split("@")[0] || "";

  if (!name && !email) {
    return undefined;
  }

  return {
    user: {
      name,
      email,
    },
  };
}
