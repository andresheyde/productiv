import { addDays, startOfDay } from "date-fns";
import { Pressable, Text, View } from "react-native";
import { HEADER_BUTTON_BAR_HEIGHT } from "../../layout/calendarLayout";
import { formatLocaleDate } from "@/features/shared/utils/dateTime";

type StickyHeaderButtonsProps = {
  today: Date;
  startDate: Date;
  numDays: number;
  isSyncing?: boolean;
  onTodayPress?: () => void;
  onPrevPress?: () => void;
  onNextPress?: () => void;
  onSyncPress?: () => void;
};

export default function StickyHeaderButtons({
  today,
  startDate,
  numDays,
  isSyncing,
  onTodayPress,
  onPrevPress,
  onNextPress,
  onSyncPress,
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
        paddingHorizontal: 12,
        backgroundColor: "#fffdf8",
      }}
    >
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontWeight: "700", fontSize: 16, color: "#16423c" }}
        >
          {formatLocaleDate(startDate, { month: "long", year: "numeric" })}
        </Text>
      </View>
      <View
        style={{ flexDirection: "row", alignItems: "center", marginLeft: 8 }}
      >
        <Pressable
          onPress={() => onPrevPress && onPrevPress()}
          style={navButtonStyle(true)}
        >
          <Text style={navButtonTextStyle}>{"<"}</Text>
        </Pressable>
        <Pressable
          onPress={() => onNextPress && onNextPress()}
          style={navButtonStyle(false)}
        >
          <Text style={navButtonTextStyle}>{">"}</Text>
        </Pressable>
      </View>
      <View style={{ flex: 1 }} />
      {onSyncPress ? (
        <Pressable
          onPress={() => onSyncPress()}
          disabled={isSyncing}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 6,
            borderRadius: 999,
            backgroundColor: isSyncing ? "#cbd5e1" : "#d9e7e3",
            marginRight: 8,
          }}
        >
          <Text
            style={{
              color: "#16423c",
              fontWeight: "700",
            }}
          >
            {isSyncing ? "Syncing..." : "Sync"}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onTodayPress && onTodayPress()}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 999,
          backgroundColor: todayInView ? "#16423c" : "#efe6d7",
        }}
      >
        <Text
          style={{
            color: todayInView ? "#f4f1ea" : "#1f2937",
            fontWeight: "700",
          }}
        >
          Today
        </Text>
      </Pressable>
    </View>
  );
}

function navButtonStyle(withMarginRight: boolean) {
  return {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: withMarginRight ? 8 : 0,
    borderRadius: 999,
    backgroundColor: "#efe6d7",
  };
}

const navButtonTextStyle = {
  color: "#1f2937",
  fontWeight: "700" as const,
};
