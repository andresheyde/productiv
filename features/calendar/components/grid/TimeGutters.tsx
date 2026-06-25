import { Text, View } from "react-native";
import {
  CalendarTimeWindow,
  getCalendarGridHeight,
  TIME_GUTTER_HEIGHT,
  TIME_GUTTER_WIDTH,
  timeToY,
} from "../../layout/calendarLayout";
import { formatLocaleHour } from "@/features/shared/utils/dateTime";

type TimeGuttersProps = {
  timeWindow: CalendarTimeWindow;
};

export default function TimeGutters({ timeWindow }: TimeGuttersProps) {
  const gridHeight = getCalendarGridHeight(timeWindow);
  const hourCount = timeWindow.endHour - timeWindow.startHour;

  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: TIME_GUTTER_WIDTH,
        height: gridHeight,
        backgroundColor: "#efe6d7",
      }}
    >
      {Array.from({ length: hourCount }, (_, i) => {
        const hour = timeWindow.startHour + i;

        return (
          <View
            key={hour}
            style={{
              position: "absolute",
              left: 0,
              top: timeToY(hour, 0, undefined, timeWindow.startHour),
              width: TIME_GUTTER_WIDTH,
              height: TIME_GUTTER_HEIGHT,
            }}
          >
            <Text
              style={{
                textAlign: "center",
                color: "#5f6b76",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {hourToString(hour)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function hourToString(hour: number) {
  if (hour < 0 || hour > 24) {
    throw new Error(`Invalid hour: ${hour}`);
  }

  return formatLocaleHour(hour % 24);
}
