import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthProvider } from "@/features/auth/AuthProvider";
import { WorkspaceProvider } from "@/features/workspace/WorkspaceProvider";

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <WorkspaceProvider>
          <Stack>
            <Stack.Screen name="(workspace)" options={{ headerShown: false }} />
            <Stack.Screen
              name="schedule"
              options={{ title: "Create Schedule" }}
            />
            <Stack.Screen
              name="auth/callback"
              options={{ headerShown: false, presentation: "transparentModal" }}
            />
          </Stack>
        </WorkspaceProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
