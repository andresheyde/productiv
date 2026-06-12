import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  addDays,
  differenceInCalendarDays,
  format,
  isBefore,
  startOfDay,
} from "date-fns";
import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/features/auth/AuthProvider";
import { connectGoogleCalendar } from "@/features/auth/googleAuth";
import {
  type BackendScheduleEvent,
  fetchScheduleEvents,
} from "@/features/schedule/api/scheduleApi";
import { ApiError } from "@/features/shared/api/request";
import { getSessionTokenFromUrl } from "@/features/schedule/utils/scheduleAuth";

type PickerTarget = "start" | "end" | null;

const MAX_RANGE_IN_DAYS = 7;

export default function CreateScheduleScreen() {
  const today = startOfDay(new Date());
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(addDays(today, 2));
  const [pickerTarget, setPickerTarget] = useState<PickerTarget>(null);
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [events, setEvents] = useState<BackendScheduleEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    clearSession,
    isAuthenticated,
    isAuthReady,
    refreshAuthState,
    sessionToken,
    setSessionToken,
  } = useAuth();
  const availableDates = getAvailableDates(today, 21);

  const validationMessage = getValidationMessage(startDate, endDate, today);
  const canFetchEvents =
    isAuthReady &&
    isAuthenticated &&
    validationMessage === null &&
    !isConnectingGoogle &&
    !isLoadingEvents;

  async function handleConnectGoogle() {
    setErrorMessage(null);
    setIsConnectingGoogle(true);

    try {
      const result = await connectGoogleCalendar();

      if (result.type === "success") {
        const nextSessionToken = getSessionTokenFromUrl(result.url);

        if (nextSessionToken) {
          setSessionToken(nextSessionToken);
          return;
        }

        if (await refreshAuthState()) {
          return;
        }
      }

      if (result.type === "cancel" || result.type === "dismiss") {
        setErrorMessage("Google authentication was cancelled.");
      } else if (result.type === "success") {
        setErrorMessage(
          "Google authentication finished, but no session was created.",
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to Google right now.",
      );
    } finally {
      setIsConnectingGoogle(false);
    }
  }

  async function handleFetchEvents() {
    if (!isAuthenticated) {
      setErrorMessage("Connect Google before fetching events.");
      return;
    }

    if (validationMessage) {
      setErrorMessage(validationMessage);
      return;
    }

    setErrorMessage(null);
    setIsLoadingEvents(true);

    try {
      const nextEvents = await fetchScheduleEvents(
        startDate,
        endDate,
        sessionToken,
      );
      setEvents(nextEvents);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await handleDisconnect();
        setErrorMessage("Your Google session expired. Connect Google again.");
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "Failed to fetch events.",
      );
    } finally {
      setIsLoadingEvents(false);
    }
  }

  async function handleDisconnect() {
    await clearSession();
    setEvents([]);
    setErrorMessage(null);
  }

  function handleDateChange(
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    if (!selectedDate) {
      if (Platform.OS !== "ios") {
        setPickerTarget(null);
      }
      return;
    }

    const normalizedDate = startOfDay(selectedDate);

    if (pickerTarget === "start") {
      setStartDate(normalizedDate);
    }

    if (pickerTarget === "end") {
      setEndDate(normalizedDate);
    }

    if (Platform.OS !== "ios") {
      setPickerTarget(null);
    }
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#f4f1ea",
      }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 18,
        }}
      >
        <View
          style={{
            backgroundColor: "#16423c",
            borderRadius: 24,
            padding: 20,
            gap: 12,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: "700",
              color: "#f4f1ea",
            }}
          >
            Build your next week
          </Text>
          <Text
            style={{
              fontSize: 16,
              lineHeight: 22,
              color: "#d9e7e3",
            }}
          >
            Pick a future date range, connect Google Calendar, and preview the
            events that will shape your schedule.
          </Text>
          <Link
            href="/calendar"
            style={{
              alignSelf: "flex-start",
              color: "#f6c453",
              fontWeight: "600",
            }}
          >
            Open the existing calendar view
          </Link>
        </View>

        <View
          style={{
            backgroundColor: "#fffdf8",
            borderRadius: 20,
            padding: 18,
            gap: 14,
            borderWidth: 1,
            borderColor: "#dfd6c8",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: "#1f2937",
            }}
          >
            1. Choose a date range
          </Text>
          <Text
            style={{
              color: "#5f6b76",
              lineHeight: 20,
            }}
          >
            Dates must start today or later and stay within a single 7-day
            window.
          </Text>

          <DateField
            label="Start date"
            value={startDate}
            onPress={() => setPickerTarget("start")}
          />
          <DateField
            label="End date"
            value={endDate}
            onPress={() => setPickerTarget("end")}
          />

          {Platform.OS === "web" ? (
            <View style={{ gap: 10 }}>
              <Text
                style={{
                  color: "#5f6b76",
                  fontWeight: "600",
                }}
              >
                {pickerTarget === "end"
                  ? "Choose an end date"
                  : "Choose a start date"}
              </Text>
              <FlatList
                horizontal
                data={availableDates}
                keyExtractor={(item) => item.toISOString()}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10 }}
                renderItem={({ item }) => {
                  const isDisabled =
                    pickerTarget === "end" && isBefore(item, startDate);
                  const isSelected =
                    (pickerTarget === "start" &&
                      item.getTime() === startDate.getTime()) ||
                    (pickerTarget === "end" &&
                      item.getTime() === endDate.getTime());

                  return (
                    <Pressable
                      disabled={isDisabled}
                      onPress={() => {
                        if (pickerTarget === "end") {
                          setEndDate(item);
                        } else {
                          setStartDate(item);
                        }
                      }}
                      style={{
                        minWidth: 112,
                        borderRadius: 16,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        backgroundColor: isSelected ? "#16423c" : "#efe6d7",
                        opacity: isDisabled ? 0.45 : 1,
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? "#f4f1ea" : "#1f2937",
                          fontWeight: "700",
                        }}
                      >
                        {format(item, "EEE")}
                      </Text>
                      <Text
                        style={{
                          color: isSelected ? "#d9e7e3" : "#5f6b76",
                        }}
                      >
                        {format(item, "MMM d")}
                      </Text>
                    </Pressable>
                  );
                }}
              />
            </View>
          ) : pickerTarget ? (
            <View
              style={{
                borderRadius: 16,
                backgroundColor: "#f4f1ea",
                padding: 12,
              }}
            >
              <DateTimePicker
                value={pickerTarget === "start" ? startDate : endDate}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                minimumDate={pickerTarget === "start" ? today : startDate}
                onChange={handleDateChange}
              />
              {Platform.OS === "ios" ? (
                <Pressable
                  onPress={() => setPickerTarget(null)}
                  style={buttonStyle("#16423c")}
                >
                  <Text style={buttonTextStyle("#f4f1ea")}>Done</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {validationMessage ? (
            <Text
              style={{
                color: "#b42318",
                fontWeight: "600",
              }}
            >
              {validationMessage}
            </Text>
          ) : null}
        </View>

        <View
          style={{
            backgroundColor: "#fffdf8",
            borderRadius: 20,
            padding: 18,
            gap: 14,
            borderWidth: 1,
            borderColor: "#dfd6c8",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: "#1f2937",
            }}
          >
            2. Connect Google
          </Text>
          <Text
            style={{
              color:
                !isAuthReady || isAuthenticated ? "#166534" : "#5f6b76",
              fontWeight: "600",
            }}
          >
            {!isAuthReady
              ? "Checking Google connection..."
              : isAuthenticated
                ? "Google Calendar connected"
                : "Google Calendar not connected yet"}
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Pressable
              onPress={handleConnectGoogle}
              disabled={isConnectingGoogle}
              style={buttonStyle("#1f6f78", isConnectingGoogle)}
            >
              <Text style={buttonTextStyle("#f4f1ea")}>
                {isConnectingGoogle ? "Connecting..." : "Connect Google"}
              </Text>
            </Pressable>
            {isAuthenticated ? (
              <Pressable
                onPress={() => {
                  void handleDisconnect();
                }}
                style={buttonStyle("#efe6d7")}
              >
                <Text style={buttonTextStyle("#1f2937")}>Disconnect</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#fffdf8",
            borderRadius: 20,
            padding: 18,
            gap: 14,
            borderWidth: 1,
            borderColor: "#dfd6c8",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: "#1f2937",
            }}
          >
            3. Preview events
          </Text>
          <Pressable
            onPress={handleFetchEvents}
            disabled={!canFetchEvents}
            style={buttonStyle("#f6c453", !canFetchEvents)}
          >
            <Text style={buttonTextStyle("#1f2937")}>
              {isLoadingEvents ? "Loading events..." : "Fetch events"}
            </Text>
          </Pressable>

          {isLoadingEvents ? (
            <ActivityIndicator color="#16423c" />
          ) : null}

          {errorMessage ? (
            <Text
              style={{
                color: "#b42318",
                fontWeight: "600",
              }}
            >
              {errorMessage}
            </Text>
          ) : null}

          {!isLoadingEvents && events.length === 0 ? (
            <Text
              style={{
                color: "#5f6b76",
                lineHeight: 20,
              }}
            >
              Once you connect Google and fetch events, they’ll appear here as a
              simple schedule preview.
            </Text>
          ) : null}

          {events.map((event) => (
            <View
              key={event.id}
              style={{
                borderRadius: 16,
                backgroundColor: "#f4f1ea",
                padding: 14,
                gap: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: "#1f2937",
                }}
              >
                {event.title}
              </Text>
              <Text style={{ color: "#5f6b76" }}>
                Start: {format(event.startTime, "EEE, MMM d • h:mm a")}
              </Text>
              <Text style={{ color: "#5f6b76" }}>
                End: {format(event.endTime, "EEE, MMM d • h:mm a")}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type DateFieldProps = {
  label: string;
  value: Date;
  onPress: () => void;
};

function DateField({ label, value, onPress }: DateFieldProps) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          fontSize: 14,
          fontWeight: "600",
          color: "#1f2937",
        }}
      >
        {label}
      </Text>
      <Pressable onPress={onPress} style={buttonStyle("#efe6d7")}>
        <Text style={buttonTextStyle("#1f2937")}>
          {format(value, "EEEE, MMMM d, yyyy")}
        </Text>
      </Pressable>
    </View>
  );
}

function getValidationMessage(startDate: Date, endDate: Date, today: Date) {
  if (isBefore(startDate, today)) {
    return "Start date must be today or later.";
  }

  if (isBefore(endDate, startDate)) {
    return "End date must be on or after the start date.";
  }

  if (differenceInCalendarDays(endDate, startDate) >= MAX_RANGE_IN_DAYS) {
    return "Date range must stay within 7 days.";
  }

  return null;
}

function getAvailableDates(today: Date, numberOfDays: number) {
  return Array.from({ length: numberOfDays }, (_, index) =>
    addDays(today, index),
  );
}

function buttonStyle(backgroundColor: string, disabled = false) {
  return {
    backgroundColor,
    opacity: disabled ? 0.6 : 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
}

function buttonTextStyle(color: string) {
  return {
    color,
    fontSize: 15,
    fontWeight: "700" as const,
  };
}
