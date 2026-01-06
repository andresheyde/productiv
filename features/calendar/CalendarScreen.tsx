import { ScrollView, useWindowDimensions } from "react-native";
import GridCanvas from "./components/GridCanvas";
import StickyHeader from "./components/layers/StickyHeader";
import { TIME_GUTTER_WIDTH } from "./layout/calendarLayout";


export default function CalendarScreen() {
    const numDays = 7;
    const columnWidth = (useWindowDimensions().width - TIME_GUTTER_WIDTH)/numDays;

  return (<>
    <StickyHeader startDate={new Date()} numDays={numDays} columnWidth={columnWidth}/>
    <ScrollView style={{ flex: 1 }}>
        <GridCanvas numDays={numDays} columnWidth={columnWidth}/>
    </ScrollView>
  </>);
}