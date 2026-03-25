import {
  addDays,
  addMinutes,
  isAfter,
  isBefore,
  startOfDay,
  startOfWeek,
  subDays,
} from "date-fns";
import * as Crypto from "expo-crypto";
import { useMemo, useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  MouseButton,
} from "react-native-gesture-handler";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from "../api/googleCalendarApi";
import AllDayEventsHeader, {
  calculateAllDayHeaderHeight,
  computeAllDayRows,
} from "../components/allDayEvents/AllDayEventsHeader";
import EventEditorPopup from "../components/eventsLayer/EventEditorPopup";
import GridCanvas from "../components/grid/GridCanvas";
import StickyHeader from "../components/header/StickyHeader";
import useDeviceCalendars from "../data/device/hooks/useDeviceCalendars";
import useDeviceEvents from "../data/device/hooks/useDeviceEvents";
import useGoogleEvents from "../data/google/hooks/useGoogleEvents";
import { TIME_GUTTER_WIDTH, xAndYToDate } from "../layout/calendarLayout";
import { CalendarEvent } from "../types";

export default function CalendarScreen() {
  const weekStartDay = 0;
  const numDays = 7;
  const today = new Date();
  const columnWidth =
    (useWindowDimensions().width - TIME_GUTTER_WIDTH) / numDays;

  const [leftDate, setLeftDate] = useState(getDefaultLeftDate());
  const rightDate = addDays(leftDate, numDays);
  const googleFetchEndDate = addDays(leftDate, numDays - 1);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletedEventIds, setDeletedEventIds] = useState<string[]>([]);
  const { authId, isAuthenticated } = useAuth();

  const {
    deviceCalendars,
    calendarsLoading,
    calendarsError,
    calendarsBlocked,
    calendarsRefresh,
  } = useDeviceCalendars();
  const {
    deviceEvents,
    eventsLoading,
    eventsError,
    eventsBlocked,
    eventsRefresh,
  } = useDeviceEvents(
    deviceCalendars
      .map((calendar) => calendar.id)
      .slice()
      .sort(),
    leftDate,
    rightDate,
  );
  const { googleEvents } = useGoogleEvents(
    authId,
    leftDate,
    googleFetchEndDate,
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const mergedEvents = useMemo(() => {
    const uniqueEvents = new Map<string, CalendarEvent>();

    [...events, ...googleEvents, ...deviceEvents].forEach((event) => {
      if (!deletedEventIds.includes(event.id) && !uniqueEvents.has(event.id)) {
        uniqueEvents.set(event.id, event);
      }
    });

    return Array.from(uniqueEvents.values());
  }, [events, googleEvents, deviceEvents, deletedEventIds]);

  const timedEvents = useMemo(() => {
    return mergedEvents.filter((event) => !event.allDay);
  }, [mergedEvents]);

  const gesture = Gesture.Exclusive(
    Gesture.Fling()
      .runOnJS(true)
      .direction(MouseButton.LEFT)
      .onEnd(() => onFling(MouseButton.LEFT)),
    Gesture.Fling()
      .runOnJS(true)
      .direction(MouseButton.RIGHT)
      .onEnd(() => onFling(MouseButton.RIGHT)),
  );

  function getDefaultLeftDate() {
    return startOfDay(
      numDays % 7 === 0
        ? startOfWeek(today, { weekStartsOn: weekStartDay })
        : today,
    );
  }

  const allDayRows = computeAllDayRows(mergedEvents, leftDate, numDays);
  const allDayEventsHeaderHeight = calculateAllDayHeaderHeight(
    allDayRows.length,
  );
  const canSyncSelectedEvent =
    selectedEvent !== null &&
    selectedEvent.source !== "device" &&
    isAuthenticated;
  const canDeleteSelectedEvent =
    selectedEvent !== null && selectedEvent.source !== "device";

  return (
    <>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }}>
          <StickyHeader
            today={today}
            startDate={leftDate}
            numDays={numDays}
            columnWidth={columnWidth}
            onTodayPress={() => setLeftDate(getDefaultLeftDate())}
            onPrevPress={() => setLeftDate((prev) => subDays(prev, numDays))}
            onNextPress={() => setLeftDate((prev) => addDays(prev, numDays))}
          />
          <AllDayEventsHeader
            rows={allDayRows}
            startDate={leftDate}
            numDays={numDays}
            columnWidth={columnWidth}
          />
          <ScrollView style={{ flex: 1, marginTop: allDayEventsHeaderHeight }}>
            <GridCanvas
              numDays={numDays}
              leftDate={leftDate}
              rightDate={rightDate}
              today={today}
              columnWidth={columnWidth}
              events={timedEvents}
              selectedEvent={selectedEvent}
              onEventBlockPress={onEventBlockPress}
              onEventsLayerEmptyPress={onEventsLayerEmptyPress}
              onEventsLayerLongPressBegin={onEventsLayerLongPressBegin}
              onEventsLayerLongPressEnd={onEventsLayerLongPressEnd}
            />
          </ScrollView>
        </View>
      </GestureDetector>
      {selectedEvent ? (
        <EventEditorPopup
          selectedEvent={selectedEvent}
          draftTitle={draftTitle}
          draftDescription={draftDescription}
          canSyncToGoogle={canSyncSelectedEvent}
          canDelete={canDeleteSelectedEvent}
          isSaving={isSaving}
          errorMessage={errorMessage}
          statusMessage={statusMessage}
          onDraftTitleChange={setDraftTitle}
          onDraftDescriptionChange={setDraftDescription}
          onSaveLocal={onSaveLocal}
          onSyncGoogle={onSyncGoogle}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );

  function onEventBlockPress(event: CalendarEvent) {
    setEditorState(event, getEventStatusMessage(event));
  }

  function onEventsLayerEmptyPress(x: number, y: number) {
    if (selectedEvent) {
      clearEditorMessages();
      setSelectedEvent(null);
      return;
    }
    const startTime = xAndYToDate(x, y, numDays, columnWidth, leftDate);
    const newEvent: CalendarEvent = {
      id: Crypto.randomUUID(),
      startTime: startTime,
      endTime: addMinutes(startTime, 60),
      title: "New Event",
      description: "",
      source: "productiv",
    };
    setEvents((prev) => [...prev, newEvent]);
    setEditorState(
      newEvent,
      "Edit the title or details, then save locally or sync to Google.",
    );
  }

  function onFling(direction: MouseButton) {
    if (direction === MouseButton.LEFT) {
      setLeftDate(subDays(leftDate, numDays));
      return;
    }
    if (direction === MouseButton.RIGHT) {
      setLeftDate(addDays(leftDate, numDays));
      return;
    }
    throw new Error(`Unrecognized fling direction: ${direction}`);
  }

  function onEventsLayerLongPressBegin(x: number, y: number) {
    clearEditorMessages();
    const startTime = xAndYToDate(x, y, numDays, columnWidth, leftDate);
    const newEvent: CalendarEvent = {
      id: Crypto.randomUUID(),
      startTime: startTime,
      endTime: addMinutes(startTime, 5),
      title: "New Event",
      description: "",
      source: "productiv",
    };
    setEvents((prev) => [...prev, newEvent]);
    setEditorState(
      newEvent,
      "Edit the title or details, then save locally or sync to Google.",
    );
  }

  function onEventsLayerLongPressEnd(x: number, y: number) {
    clearEditorMessages();
    const endTime = xAndYToDate(x, y, numDays, columnWidth, leftDate);
    const newEvent: CalendarEvent = {
      id: selectedEvent!.id,
      startTime: isBefore(selectedEvent!.startTime, endTime)
        ? selectedEvent!.startTime
        : endTime,
      endTime: isAfter(endTime, selectedEvent!.startTime)
        ? endTime
        : selectedEvent!.startTime,
      title: "New Event",
      description: selectedEvent!.description ?? "",
      source: selectedEvent!.source,
    };
    setEvents((prev) => [
      ...prev.filter((event) => event !== selectedEvent),
      newEvent,
    ]);
    setEditorState(
      newEvent,
      "Edit the title or details, then save locally or sync to Google.",
    );
  }

  function onSaveLocal() {
    if (!selectedEvent) {
      return;
    }

    const updatedEvent = applyDraftsToEvent(selectedEvent);

    replaceEventInState(updatedEvent);
    setEditorState(updatedEvent, getLocalSaveMessage(updatedEvent));
  }

  async function onSyncGoogle() {
    if (!selectedEvent || !authId) {
      setErrorMessage("Connect Google before saving events.");
      return;
    }

    if (selectedEvent.source === "device") {
      setErrorMessage("Device calendar events are read-only in this MVP.");
      setStatusMessage(
        "Create a Productiv event or edit a Google event to sync changes.",
      );
      return;
    }

    const updatedEvent = applyDraftsToEvent(selectedEvent);
    replaceEventInState(updatedEvent);

    setErrorMessage(null);
    setStatusMessage(
      updatedEvent.source === "google" || updatedEvent.googleCalendarEventId
        ? "Updating Google Calendar..."
        : "Sending event to Google Calendar...",
    );
    setIsSaving(true);

    try {
      if (
        updatedEvent.source === "google" &&
        updatedEvent.googleCalendarEventId &&
        updatedEvent.sourceCalendarId
      ) {
        await updateGoogleCalendarEvent({
          authId,
          eventId: updatedEvent.googleCalendarEventId,
          sourceCalendarId: updatedEvent.sourceCalendarId,
          title: updatedEvent.title,
          description: updatedEvent.description,
          startTime: updatedEvent.startTime,
          endTime: updatedEvent.endTime,
        });
        setEditorState(
          updatedEvent,
          `Updated Google Calendar${updatedEvent.sourceCalendarName ? ` (${updatedEvent.sourceCalendarName})` : ""}.`,
        );
      } else if (updatedEvent.googleCalendarEventId && updatedEvent.sourceCalendarId) {
        await updateGoogleCalendarEvent({
          authId,
          eventId: updatedEvent.googleCalendarEventId,
          sourceCalendarId: updatedEvent.sourceCalendarId,
          title: updatedEvent.title,
          description: updatedEvent.description,
          startTime: updatedEvent.startTime,
          endTime: updatedEvent.endTime,
        });
        setEditorState(updatedEvent, "Updated your synced Google Calendar event.");
      } else {
        const createdEvent = await createGoogleCalendarEvent({
          authId,
          title: updatedEvent.title,
          description: updatedEvent.description,
          startTime: updatedEvent.startTime,
          endTime: updatedEvent.endTime,
        });

        const syncedEvent: CalendarEvent = {
          ...updatedEvent,
          googleCalendarEventId: createdEvent.id ?? updatedEvent.id,
          sourceCalendarId: "primary",
          sourceCalendarName: "Primary",
        };

        replaceEventInState(syncedEvent);
        setEditorState(syncedEvent, "Saved to your primary Google Calendar.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to save event to Google Calendar.",
      );
      setStatusMessage(null);
    } finally {
      setIsSaving(false);
    }
  }

  async function onDelete() {
    if (!selectedEvent) {
      return;
    }

    if (selectedEvent.source === "device") {
      setErrorMessage("Device calendar events are read-only in this MVP.");
      return;
    }

    setErrorMessage(null);
    setStatusMessage(
      selectedEvent.source === "google" || selectedEvent.googleCalendarEventId
        ? "Deleting from Google Calendar..."
        : "Deleting event...",
    );
    setIsSaving(true);

    try {
      if (
        authId &&
        selectedEvent.googleCalendarEventId &&
        selectedEvent.sourceCalendarId
      ) {
        await deleteGoogleCalendarEvent({
          authId,
          eventId: selectedEvent.googleCalendarEventId,
          sourceCalendarId: selectedEvent.sourceCalendarId,
        });
      }

      removeEventFromState(selectedEvent);
      setDeletedEventIds((prev) =>
        prev.includes(selectedEvent.id) ? prev : [...prev, selectedEvent.id],
      );
      setSelectedEvent(null);
      setDraftTitle("");
      setDraftDescription("");
      setStatusMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to delete calendar event.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function getEventStatusMessage(event: CalendarEvent) {
    if (event.source === "google") {
      return `This event came from Google Calendar${event.sourceCalendarName ? ` (${event.sourceCalendarName})` : ""}.`;
    }

    if (event.googleCalendarEventId) {
      return "This event has already been saved to your primary Google Calendar.";
    }

    if (event.source === "device") {
      return "This is a device calendar event. Create a new Productiv event to save through Google.";
    }

    if (!isAuthenticated) {
      return "Connect Google on the schedule screen before saving calendar events.";
    }

    return "Tap the button below to save this event to your primary Google Calendar.";
  }

  function getLocalSaveMessage(event: CalendarEvent) {
    if (event.source === "google") {
      return "Saved locally. Use Update Google to push these edits back to Google Calendar.";
    }

    if (event.googleCalendarEventId) {
      return "Saved locally. Use Update Google to sync the edits.";
    }

    return "Saved inside Productiv. Use Save to Google when you're ready to sync it.";
  }

  function applyDraftsToEvent(event: CalendarEvent): CalendarEvent {
    return {
      ...event,
      title: draftTitle.trim().length > 0 ? draftTitle.trim() : "Untitled Event",
      description: draftDescription.trim(),
    };
  }

  function replaceEventInState(nextEvent: CalendarEvent) {
    setEvents((prev) => {
      const existingIndex = prev.findIndex((event) => event.id === nextEvent.id);

      if (existingIndex === -1) {
        return [nextEvent, ...prev];
      }

      return prev.map((event) => (event.id === nextEvent.id ? nextEvent : event));
    });
  }

  function setEditorState(event: CalendarEvent, nextStatusMessage: string | null) {
    setSelectedEvent(event);
    setDraftTitle(event.title ?? "");
    setDraftDescription(event.description ?? "");
    setErrorMessage(null);
    setStatusMessage(nextStatusMessage);
  }

  function clearEditorMessages() {
    setErrorMessage(null);
    setStatusMessage(null);
  }

  function removeEventFromState(eventToRemove: CalendarEvent) {
    setEvents((prev) => prev.filter((event) => event.id !== eventToRemove.id));
  }
}

const testEvents: CalendarEvent[] = [
  {
    id: "1",
    startTime: new Date(2026, 0, 18, 12, 30),
    endTime: new Date(2026, 0, 19, 12, 45),
    title: "First event",
    source: "productiv",
  },
  {
    id: "2",
    startTime: new Date(2026, 0, 20, 2, 0),
    endTime: new Date(2026, 0, 20, 8, 45),
    title: "second event",
    source: "productiv",
  },
  {
    id: "3",
    startTime: new Date(2026, 0, 21, 21, 0),
    endTime: new Date(2026, 0, 21, 23, 0),
    title: "third event",
    source: "productiv",
  },
  {
    id: "4",
    startTime: new Date(2026, 0, 24, 0, 0),
    endTime: new Date(2026, 0, 25, 0, 0),
    title: "fourth event",
    source: "productiv",
  },
];
