import { addDays, startOfDay, startOfWeek, subDays } from "date-fns";
import { useMemo, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";

import useGoogleEvents from "@/features/calendar/data/google/hooks/useGoogleEvents";
import AllDayEventsHeader, {
  calculateAllDayHeaderHeight,
  computeAllDayRows,
} from "@/features/calendar/components/allDayEvents/AllDayEventsHeader";
import GridCanvas from "@/features/calendar/components/grid/GridCanvas";
import StickyHeader from "@/features/calendar/components/header/StickyHeader";
import { TIME_GUTTER_WIDTH } from "@/features/calendar/layout/calendarLayout";
import type { CalendarEvent } from "@/features/calendar/types";
import { proposalBlocksToCalendarEvents } from "@/features/planning/proposal/proposalAdapter";
import type { ProposedScheduleBlock } from "@/features/planning/proposal/types";

type ProposalCalendarPreviewProps = {
  proposalBlocks: ProposedScheduleBlock[];
  isAuthenticated: boolean;
};

const NUM_DAYS = 7;

export default function ProposalCalendarPreview({
  proposalBlocks,
  isAuthenticated,
}: ProposalCalendarPreviewProps) {
  const [leftDate, setLeftDate] = useState(() =>
    startOfDay(startOfWeek(new Date(), { weekStartsOn: 0 })),
  );
  const rightDate = addDays(leftDate, NUM_DAYS);
  const googleFetchEndDate = addDays(leftDate, NUM_DAYS - 1);
  const columnWidth =
    (useWindowDimensions().width - TIME_GUTTER_WIDTH) / NUM_DAYS;
  const {
    googleEvents,
    googleEventsError,
    googleEventsLoading,
    googleEventsRefresh,
  } = useGoogleEvents(leftDate, googleFetchEndDate);

  const proposalEvents = useMemo(
    () => proposalBlocksToCalendarEvents(proposalBlocks, leftDate),
    [proposalBlocks, leftDate],
  );

  const mergedEvents = useMemo<CalendarEvent[]>(
    () => [...googleEvents, ...proposalEvents],
    [googleEvents, proposalEvents],
  );

  const timedEvents = useMemo(
    () => mergedEvents.filter((event) => !event.allDay),
    [mergedEvents],
  );
  const allDayRows = computeAllDayRows(mergedEvents, leftDate, NUM_DAYS);
  const allDayEventsHeaderHeight = calculateAllDayHeaderHeight(allDayRows.length);

  return (
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
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "700",
            color: "#1f2937",
          }}
        >
          Proposed weekly schedule
        </Text>
        <Text
          style={{
            color: "#5f6b76",
            lineHeight: 20,
          }}
        >
          Proposed blocks are generated from the plan and shown alongside existing
          Google Calendar events when available.
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <LegendPill label="Proposed schedule" backgroundColor="#fde7a1" borderColor="#d29d12" />
        <LegendPill label="Existing Google event" backgroundColor="#d9e7e3" borderColor="#1f6f78" />
        {!isAuthenticated ? (
          <LegendPill label="Connect Google to overlay existing events" backgroundColor="#f7f3ec" borderColor="#dfd6c8" />
        ) : null}
      </View>

      {proposalBlocks.length === 0 ? (
        <Text
          style={{
            color: "#9b2c2c",
            backgroundColor: "#fce8e8",
            padding: 12,
            borderRadius: 14,
          }}
        >
          A plan exists, but no schedule blocks could be derived from it yet.
          Expand the plan details and adjust the prompts or sample plan content.
        </Text>
      ) : null}

      {googleEventsError ? (
        <Text
          style={{
            color: "#9b2c2c",
            backgroundColor: "#fce8e8",
            padding: 12,
            borderRadius: 14,
          }}
        >
          {googleEventsError.message}
        </Text>
      ) : null}

      <View
        style={{
          overflow: "hidden",
          borderRadius: 18,
          borderWidth: 1,
          borderColor: "#dfd6c8",
        }}
      >
        <StickyHeader
          today={new Date()}
          startDate={leftDate}
          numDays={NUM_DAYS}
          columnWidth={columnWidth}
          isSyncing={googleEventsLoading}
          onTodayPress={() =>
            setLeftDate(startOfDay(startOfWeek(new Date(), { weekStartsOn: 0 })))
          }
          onPrevPress={() => setLeftDate((prev) => subDays(prev, NUM_DAYS))}
          onNextPress={() => setLeftDate((prev) => addDays(prev, NUM_DAYS))}
          onSyncPress={
            isAuthenticated ? () => {
              void googleEventsRefresh();
            } : undefined
          }
        />
        <AllDayEventsHeader
          rows={allDayRows}
          startDate={leftDate}
          numDays={NUM_DAYS}
          columnWidth={columnWidth}
        />
        <View style={{ marginTop: allDayEventsHeaderHeight }}>
          <GridCanvas
            numDays={NUM_DAYS}
            leftDate={leftDate}
            rightDate={rightDate}
            today={new Date()}
            columnWidth={columnWidth}
            events={timedEvents}
            selectedEvent={null}
            onEventBlockPress={() => undefined}
            onEventsLayerEmptyPress={() => undefined}
            onEventsLayerLongPressBegin={() => undefined}
            onEventsLayerLongPressEnd={() => undefined}
          />
        </View>
      </View>
    </View>
  );
}

type LegendPillProps = {
  label: string;
  backgroundColor: string;
  borderColor: string;
};

function LegendPill({ label, backgroundColor, borderColor }: LegendPillProps) {
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor,
        borderWidth: 1,
        borderColor,
      }}
    >
      <Text
        style={{
          color: "#1f2937",
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );
}
