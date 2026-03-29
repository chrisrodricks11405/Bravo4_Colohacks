import { Redirect } from "expo-router";
import { StateScreen } from "../src/components/app/StateScreen";
import { useAuth, useSessionHydration } from "../src/providers";
import { useSessionStore } from "../src/stores";

export default function Index() {
  const { session, isLoading } = useAuth();
  const { isHydrating } = useSessionHydration();
  const activeSession = useSessionStore((state) => state.session);

  if (isLoading || (session && isHydrating)) {
    return (
      <StateScreen
        title="Preparing your teacher workspace"
        message="Checking your session and loading local settings."
        loading
      />
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (activeSession?.status === "lobby") {
    return <Redirect href={{ pathname: "/session/lobby", params: { sessionId: activeSession.id } }} />;
  }

  if (activeSession?.status === "active" || activeSession?.status === "paused") {
    return <Redirect href={{ pathname: "/session/live", params: { sessionId: activeSession.id } }} />;
  }

  return <Redirect href="/(tabs)" />;
}
