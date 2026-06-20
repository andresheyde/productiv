import { Text, View } from "react-native";
import {
  DEFAULT_GRID_HEIGHT,
  HOURS,
  TIME_GUTTER_HEIGHT,
  TIME_GUTTER_WIDTH,
  timeToY,
} from "../../layout/calendarLayout";
import { formatLocaleHour } from "@/features/shared/utils/dateTime";

export default function TimeGutters() {
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: TIME_GUTTER_WIDTH,
        height: DEFAULT_GRID_HEIGHT,
        backgroundColor: "#efe6d7",
      }}
    >
      {Array.from({ length: HOURS }, (_, i) => {
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: timeToY(i),
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
              {hourToString(i)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function hourToString(hour: number) {
  if (hour < 0 || hour > 23) {
    throw new Error(`Invalid hour: ${hour}`);
  }

  return formatLocaleHour(hour);
}
