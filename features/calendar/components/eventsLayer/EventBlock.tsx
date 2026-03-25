import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { CalendarEvent } from "../../types";

type EventBlockProps = {
  event: CalendarEvent;
  selectedEvent: CalendarEvent | null;
  onEventBlockPress: (arg0: CalendarEvent) => void;
};

export default function EventBlock({
  event,
  selectedEvent,
  onEventBlockPress,
}: EventBlockProps) {
  const selected =
    selectedEvent &&
    selectedEvent.id === event.id &&
    selectedEvent.startTime === event.startTime;

  return (
    <GestureDetector
      gesture={Gesture.Tap()
        .runOnJS(true)
        .onEnd(() => onEventBlockPress(event))}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: getEventBackground(event, Boolean(selected)),
          borderWidth: 1,
          borderColor: getEventBorder(event, Boolean(selected)),
          borderRadius: 10,
          padding: 6,
        }}
      >
        <Text
          style={{
            textAlign: "left",
            textAlignVertical: "top",
            color: selected ? "#f8fafc" : "#1f2937",
            fontWeight: "600",
            fontSize: 12,
          }}
          numberOfLines={3}
        >
          {event.title}
        </Text>
      </View>
    </GestureDetector>
  );
}

function getEventBackground(event: CalendarEvent, selected: boolean) {
  if (selected) {
    return "#16423c";
  }

  if (event.source === "google") {
    return "#d9e7e3";
  }

  if (event.source === "device") {
    return "#efe6d7";
  }

  return "#f6c453";
}

function getEventBorder(event: CalendarEvent, selected: boolean) {
  if (selected) {
    return "#0f2f2a";
  }

  if (event.source === "google") {
    return "#1f6f78";
  }

  if (event.source === "device") {
    return "#b89f7a";
  }

  return "#d29d12";
}
