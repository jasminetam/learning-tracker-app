export function getUserIdFromToken(token: string | null) {
  if (!token) return "dev-user";
  if (token.startsWith("dev-token:")) {
    return token.split(":")[1] || "dev-user";
  }
  // later, decode JWT here
  return "dev-user";
}
