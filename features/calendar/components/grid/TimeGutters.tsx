import { Text, View } from "react-native";
import {
  DEFAULT_GRID_HEIGHT,
  HOURS,
  TIME_GUTTER_HEIGHT,
  TIME_GUTTER_WIDTH,
  timeToY,
} from "../../layout/calendarLayout";

export default function TimeGutters() {
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: TIME_GUTTER_WIDTH,
        height: DEFAULT_GRID_HEIGHT,
        backgroundColor: "gray",
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
  if (hour === 0 || hour === 24) {
    return "12am";
  } else if (hour < 12) {
    return `${hour}am`;
  } else if (hour === 12) {
    return "12pm";
  } else if (hour <= 23) {
    return `${hour - 12}pm`;
  } else {
    throw new Error(`Invalid hour: ${hour}`);
  }
}
