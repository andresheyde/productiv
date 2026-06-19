import { Drawer } from "expo-router/drawer";
import { useWindowDimensions } from "react-native";

import WorkspaceDrawerContent from "@/features/workspace/components/WorkspaceDrawerContent";

export default function WorkspaceLayout() {
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= 960;

  return (
    <Drawer
      drawerContent={(props) => <WorkspaceDrawerContent {...props} />}
      screenOptions={{
        headerStyle: {
          backgroundColor: "#f3efe6",
        },
        headerTintColor: "#123a35",
        headerTitleStyle: {
          fontWeight: "700",
        },
        sceneStyle: {
          backgroundColor: "#f3efe6",
        },
        drawerType: isLargeScreen ? "permanent" : "front",
        swipeEnabled: !isLargeScreen,
        drawerStyle: {
          width: isLargeScreen ? 320 : 290,
          backgroundColor: "#0d302c",
          borderRightWidth: 0,
        },
        drawerActiveBackgroundColor: "#204d46",
        drawerActiveTintColor: "#f4f0e8",
        drawerInactiveTintColor: "#bfd1ca",
        drawerLabelStyle: {
          fontSize: 15,
          fontWeight: "700",
        },
        drawerItemStyle: {
          borderRadius: 16,
          marginHorizontal: 12,
        },
      }}
    >
      <Drawer.Screen
        name="index"
        options={{
          title: "Chat",
        }}
      />
      <Drawer.Screen
        name="goals"
        options={{
          title: "Goals",
        }}
      />
      <Drawer.Screen
        name="tasks"
        options={{
          title: "Tasks",
        }}
      />
      <Drawer.Screen
        name="metrics"
        options={{
          title: "Metrics",
        }}
      />
      <Drawer.Screen
        name="calendar"
        options={{
          title: "Calendar",
        }}
      />
      <Drawer.Screen
        name="preferences"
        options={{
          title: "Scheduling Preferences",
        }}
      />
    </Drawer>
  );
}
