import { Text, View } from "react-native";
import { EVENT_EDITOR_POPUP_HEIGHT } from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";

type EventEditorPopupProps = {
  selectedEvent: CalendarEvent;
};

export default function EventEditorPopup({
  selectedEvent,
}: EventEditorPopupProps) {
  return (
    <View
      style={{
        bottom: 0,
        height: EVENT_EDITOR_POPUP_HEIGHT,
        borderTopWidth: 2,
        borderTopColor: "white",
        backgroundColor: "gray",
        flexDirection: "row",
      }}
    >
      <Text
        style={{
          flex: 0.5,
          textAlign: "left",
          textAlignVertical: "top",
        }}
      >
        {selectedEvent.title ? selectedEvent.title : "Untitled Event"}
      </Text>
      <Text
        style={{
          flex: 0.5,
          textAlign: "right",
          textAlignVertical: "top",
        }}
      >
        {`Start: ${selectedEvent.startTime.getHours()}:${selectedEvent.startTime.getMinutes()} End: ${selectedEvent.endTime.getHours()}:${selectedEvent.endTime.getMinutes()}`}
      </Text>
    </View>
  );
}
