import { Text, View } from "react-native";
import { CalendarEvent } from "../../types";

type AllDayEventBlockProps = {
  event: CalendarEvent;
  eventLeft: number;
  eventWidth: number;
  rowHeight: number;
};

export default function AllDayEventBlock({
  event,
  eventLeft,
  eventWidth,
  rowHeight,
}: AllDayEventBlockProps) {
  return (
    <View
      key={event.id}
      style={{
        position: "absolute",
        left: eventLeft,
        width: eventWidth,
        height: rowHeight - 4,
        backgroundColor: "white",
        borderWidth: 1,
        borderColor: "#e6e6e6",
        borderRadius: 4,
        paddingHorizontal: 6,
        justifyContent: "center",
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: 12, color: "#111" }}>
        {event.title || "Event"}
      </Text>
    </View>
  );
}
