import { addDays, startOfDay } from "date-fns";
import { Pressable, Text, View } from "react-native";
import { HEADER_BUTTON_BAR_HEIGHT } from "../../layout/calendarLayout";

type StickyHeaderButtonsProps = {
  today: Date;
  startDate: Date;
  numDays: number;
  onTodayPress?: () => void;
};

export default function StickyHeaderButtons({
  today,
  startDate,
  numDays,
  onTodayPress,
}: StickyHeaderButtonsProps) {
  const startOfToday = startOfDay(today);
  const startOfLeft = startOfDay(startDate);
  const endOfLeft = addDays(startOfLeft, numDays - 1);
  const todayInView = startOfToday >= startOfLeft && startOfToday <= endOfLeft;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: HEADER_BUTTON_BAR_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
      }}
    >
      <View style={{ flex: 1 }} />
      <Pressable
        onPress={() => onTodayPress && onTodayPress()}
        style={{ padding: 6 }}
      >
        <Text style={{ color: todayInView ? "blue" : "black" }}>Today</Text>
      </Pressable>
    </View>
  );
}
