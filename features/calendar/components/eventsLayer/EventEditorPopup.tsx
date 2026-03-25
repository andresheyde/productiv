import { Pressable, Text, View } from "react-native";
import { EVENT_EDITOR_POPUP_HEIGHT } from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";

type EventEditorPopupProps = {
  selectedEvent: CalendarEvent;
  canSaveToGoogle: boolean;
  isSavingToGoogle: boolean;
  saveErrorMessage: string | null;
  saveStatusMessage: string | null;
  onSaveToGoogle: () => void;
};

export default function EventEditorPopup({
  selectedEvent,
  canSaveToGoogle,
  isSavingToGoogle,
  saveErrorMessage,
  saveStatusMessage,
  onSaveToGoogle,
}: EventEditorPopupProps) {
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: EVENT_EDITOR_POPUP_HEIGHT,
        borderTopWidth: 2,
        borderTopColor: "white",
        backgroundColor: "#f4f1ea",
        padding: 16,
        gap: 12,
        zIndex: 10,
        elevation: 10,
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: "700", color: "#1f2937" }}>
        {selectedEvent.title ? selectedEvent.title : "Untitled Event"}
      </Text>
      <Text style={{ color: "#5f6b76", lineHeight: 20 }}>
        {`Start: ${selectedEvent.startTime.toLocaleString()}\nEnd: ${selectedEvent.endTime.toLocaleString()}`}
      </Text>
      <Pressable
        onPress={onSaveToGoogle}
        disabled={!canSaveToGoogle || isSavingToGoogle}
        style={{
          backgroundColor: !canSaveToGoogle || isSavingToGoogle ? "#cbd5e1" : "#1f6f78",
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#f8fafc", fontWeight: "700" }}>
          {selectedEvent.googleCalendarEventId
            ? "Saved to Google Calendar"
            : isSavingToGoogle
              ? "Saving..."
              : "Save to Google Calendar"}
        </Text>
      </Pressable>
      {saveStatusMessage ? (
        <Text style={{ color: "#5f6b76", fontWeight: "600" }}>
          {saveStatusMessage}
        </Text>
      ) : null}
      {saveErrorMessage ? (
        <Text style={{ color: "#b42318", fontWeight: "600" }}>
          {saveErrorMessage}
        </Text>
      ) : null}
    </View>
  );
}
