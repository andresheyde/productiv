import { Pressable, Text, TextInput, View } from "react-native";
import { EVENT_EDITOR_POPUP_HEIGHT } from "../../layout/calendarLayout";
import { CalendarEvent } from "../../types";

type EventEditorPopupProps = {
  selectedEvent: CalendarEvent;
  draftTitle: string;
  draftDescription: string;
  canSyncToGoogle: boolean;
  canDelete: boolean;
  isSaving: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onDraftTitleChange: (nextValue: string) => void;
  onDraftDescriptionChange: (nextValue: string) => void;
  onSaveLocal: () => void;
  onSyncGoogle: () => void;
  onDelete: () => void;
};

export default function EventEditorPopup({
  selectedEvent,
  draftTitle,
  draftDescription,
  canSyncToGoogle,
  canDelete,
  isSaving,
  statusMessage,
  errorMessage,
  onDraftTitleChange,
  onDraftDescriptionChange,
  onSaveLocal,
  onSyncGoogle,
  onDelete,
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
      <Text style={{ fontSize: 12, fontWeight: "700", color: "#5f6b76" }}>
        {getSourceLabel(selectedEvent)}
      </Text>
      <TextInput
        value={draftTitle}
        onChangeText={onDraftTitleChange}
        placeholder="Event title"
        style={{
          borderWidth: 1,
          borderColor: "#cbd5e1",
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "#fffdf8",
          fontSize: 18,
          fontWeight: "700",
          color: "#1f2937",
        }}
      />
      <Text style={{ color: "#5f6b76", lineHeight: 20 }}>
        {`Start: ${selectedEvent.startTime.toLocaleString()}\nEnd: ${selectedEvent.endTime.toLocaleString()}`}
      </Text>
      <TextInput
        value={draftDescription}
        onChangeText={onDraftDescriptionChange}
        placeholder="Details or notes"
        multiline
        textAlignVertical="top"
        style={{
          minHeight: 72,
          borderWidth: 1,
          borderColor: "#cbd5e1",
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: "#fffdf8",
          color: "#1f2937",
        }}
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onSaveLocal}
          style={{
            flex: 1,
            backgroundColor: "#16423c",
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#f8fafc", fontWeight: "700" }}>
            Save Changes
          </Text>
        </Pressable>
        <Pressable
          onPress={onSyncGoogle}
          disabled={!canSyncToGoogle || isSaving}
          style={{
            flex: 1,
            backgroundColor:
              !canSyncToGoogle || isSaving ? "#cbd5e1" : "#1f6f78",
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#f8fafc", fontWeight: "700" }}>
            {getSyncLabel(selectedEvent, isSaving)}
          </Text>
        </Pressable>
      </View>
      <Pressable
        onPress={onDelete}
        disabled={!canDelete || isSaving}
        style={{
          backgroundColor: !canDelete || isSaving ? "#e7d8d2" : "#b42318",
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff7f5", fontWeight: "700" }}>
          {getDeleteLabel(selectedEvent, isSaving)}
        </Text>
      </Pressable>
      {statusMessage ? (
        <Text style={{ color: "#5f6b76", fontWeight: "600" }}>
          {statusMessage}
        </Text>
      ) : null}
      {errorMessage ? (
        <Text style={{ color: "#b42318", fontWeight: "600" }}>
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

function getSourceLabel(event: CalendarEvent) {
  if (event.source === "google") {
    return `Google Event${event.sourceCalendarName ? ` • ${event.sourceCalendarName}` : ""}`;
  }

  if (event.source === "device") {
    return "Device Calendar Event";
  }

  return "Productiv Event";
}

function getSyncLabel(event: CalendarEvent, isSaving: boolean) {
  if (isSaving) {
    return "Saving...";
  }

  if (event.source === "google" || event.googleCalendarEventId) {
    return "Update Google";
  }

  return "Save to Google";
}

function getDeleteLabel(event: CalendarEvent, isSaving: boolean) {
  if (isSaving) {
    return "Working...";
  }

  if (event.source === "device") {
    return "Device Events Are Read-Only";
  }

  if (event.source === "google" || event.googleCalendarEventId) {
    return "Delete From Productiv And Google";
  }

  return "Delete Event";
}
