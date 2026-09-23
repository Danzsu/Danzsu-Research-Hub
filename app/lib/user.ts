import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";

const previewUser: ChatGPTUser = {
  userId: "local-preview-user",
  email: "preview@neon-radar.local",
  fullName: "Preview Reader",
  displayName: "Preview Reader",
};

export async function getAppUser(): Promise<ChatGPTUser | null> {
  const user = await getChatGPTUser();
  if (user) return user;
  if (process.env.NODE_ENV !== "production") return previewUser;
  return null;
}
