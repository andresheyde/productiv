import CalendarScreen from "@/features/calendar/CalendarScreen";
import { View } from "react-native";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: 'blue'
      }}
    >
      <CalendarScreen />
    </View>
  );
}
