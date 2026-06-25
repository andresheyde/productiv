import { differenceInCalendarDays } from "date-fns";
import { View } from "react-native";
import {
  CalendarTimeWindow,
  dateToY,
  getCalendarGridHeight,
} from "../../layout/calendarLayout";

type CurrentTimeBar = {
  currentTime: Date;
  leftDate: Date;
  columnWidth: number;
  timeWindow: CalendarTimeWindow;
};

export default function CurrentTimeBar({
  currentTime,
  leftDate,
  columnWidth,
  timeWindow,
}: CurrentTimeBar) {
  const top = dateToY(currentTime, undefined, timeWindow.startHour);
  const gridHeight = getCalendarGridHeight(timeWindow);

  if (top < 0 || top > gridHeight) {
    return null;
  }

  return (
    <View
      style={{
        top,
        height: 2,
        left: differenceInCalendarDays(currentTime, leftDate) * columnWidth,
        width: columnWidth,
        backgroundColor: "blue",
      }}
    />
  );
}
