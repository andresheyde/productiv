import CalendarScreen from "@/features/calendar/CalendarScreen";
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
