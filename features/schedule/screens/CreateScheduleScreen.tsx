import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import DateRangeCard from "@/features/schedule/components/DateRangeCard";
import EventsPreviewCard from "@/features/schedule/components/EventsPreviewCard";
import GoogleConnectionCard from "@/features/schedule/components/GoogleConnectionCard";
import ScheduleHero from "@/features/schedule/components/ScheduleHero";
import useCreateScheduleFlow from "@/features/schedule/hooks/useCreateScheduleFlow";

export default function CreateScheduleScreen() {
  const flow = useCreateScheduleFlow();

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
        <ScheduleHero />
        <DateRangeCard
          startDate={flow.startDate}
          endDate={flow.endDate}
          pickerTarget={flow.pickerTarget}
          today={flow.today}
          availableDates={flow.availableDates}
          validationMessage={flow.validationMessage}
          onStartDatePress={flow.openStartDatePicker}
          onEndDatePress={flow.openEndDatePicker}
          onWebDateSelect={flow.selectWebDate}
          onNativeDateChange={flow.handleNativeDateChange}
          onClosePicker={flow.closePicker}
        />
        <GoogleConnectionCard
          isAuthenticated={flow.isAuthenticated}
          isAuthReady={flow.isAuthReady}
          isConnectingGoogle={flow.isConnectingGoogle}
          onConnectGoogle={flow.handleConnectGoogle}
          onDisconnect={flow.handleDisconnect}
        />
        <EventsPreviewCard
          events={flow.events}
          errorMessage={flow.errorMessage}
          isLoadingEvents={flow.isLoadingEvents}
          canFetchEvents={flow.canFetchEvents}
          onFetchEvents={flow.handleFetchEvents}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
