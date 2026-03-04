import CalendarScreen from "@/features/calendar/screens/CalendarScreen";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function Index() {
  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
      }}
    >
      <CalendarScreen />
    </GestureHandlerRootView>
  );
}
