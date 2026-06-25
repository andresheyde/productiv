import { differenceInCalendarDays } from "date-fns";
import { View } from "react-native";
import { dateToY } from "../../layout/calendarLayout";

type CurrentTimeBar = {
  currentTime: Date;
  leftDate: Date;
  columnWidth: number;
};

export default function CurrentTimeBar({
  currentTime,
  leftDate,
  columnWidth,
}: CurrentTimeBar) {
  return (
    <View
      style={{
        top: dateToY(currentTime),
        height: 2,
        left: differenceInCalendarDays(currentTime, leftDate) * columnWidth,
        width: columnWidth,
        backgroundColor: "blue",
      }}
    />
  );
}
