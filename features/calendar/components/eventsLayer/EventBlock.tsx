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
          backgroundColor:
            selected && event.id === selectedEvent.id ? "blue" : "white",
          borderWidth: 1,
          borderColor: "black",
        }}
      >
        <Text
          style={{
            textAlign: "left",
            textAlignVertical: "top",
          }}
        >
          {event.title}
        </Text>
      </View>
    </GestureDetector>
  );
}
