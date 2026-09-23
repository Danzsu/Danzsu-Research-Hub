import { redirect } from "next/navigation";
import { DigestDashboard } from "@/app/components/digest-dashboard";
import { chatGPTSignInPath, chatGPTSignOutPath } from "@/app/chatgpt-auth";
import { getAppUser } from "@/app/lib/user";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getAppUser();
  if (!user) redirect(chatGPTSignInPath("/"));

  return (
    <DigestDashboard
      displayName={user.displayName}
      email={user.email}
      signOutPath={chatGPTSignOutPath("/")}
    />
  );
}
