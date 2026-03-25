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
        backgroundColor: getEventBackground(event),
        borderWidth: 1,
        borderColor: getEventBorder(event),
        borderRadius: 8,
        paddingHorizontal: 6,
        justifyContent: "center",
      }}
    >
      <Text numberOfLines={1} style={{ fontSize: 12, color: "#1f2937", fontWeight: "600" }}>
        {event.title || "Event"}
      </Text>
    </View>
  );
}

function getEventBackground(event: CalendarEvent) {
  if (event.source === "google") {
    return "#d9e7e3";
  }

  if (event.source === "device") {
    return "#efe6d7";
  }

  return "#f6c453";
}

function getEventBorder(event: CalendarEvent) {
  if (event.source === "google") {
    return "#1f6f78";
  }

  if (event.source === "device") {
    return "#b89f7a";
  }

  return "#d29d12";
}
