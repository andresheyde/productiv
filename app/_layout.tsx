import { Stack } from "expo-router";

import { AuthProvider } from "@/features/auth/AuthProvider";

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack>
        <Stack.Screen name="index" options={{ title: "Create Schedule" }} />
        <Stack.Screen name="calendar" options={{ title: "Calendar" }} />
        <Stack.Screen
          name="auth/callback"
          options={{ headerShown: false, presentation: "transparentModal" }}
        />
      </Stack>
    </AuthProvider>
  );
}
