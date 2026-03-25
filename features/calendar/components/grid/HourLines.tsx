import { View } from "react-native";
import { HOURS, timeToY } from "../../layout/calendarLayout";

export default function HourLines() {
  return Array.from({ length: HOURS - 1 }, (_, i) => {
    return (
      <View
        key={i}
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: timeToY(i + 1),
          height: 1,
          backgroundColor: "#eadfcd",
          opacity: 1,
        }}
      />
    );
  });
}
