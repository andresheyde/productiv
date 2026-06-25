import { View } from "react-native";
import { CalendarTimeWindow, timeToY } from "../../layout/calendarLayout";

type HourLinesProps = {
  timeWindow: CalendarTimeWindow;
};

export default function HourLines({ timeWindow }: HourLinesProps) {
  const hourCount = timeWindow.endHour - timeWindow.startHour;

  return Array.from({ length: hourCount - 1 }, (_, i) => {
    const hour = timeWindow.startHour + i + 1;

    return (
      <View
        key={hour}
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: timeToY(hour, 0, undefined, timeWindow.startHour),
          height: 1,
          backgroundColor: "#eadfcd",
          opacity: 1,
        }}
      />
    );
  });
}
