import { ScrollView, useWindowDimensions } from "react-native";
import GridCanvas from "./components/GridCanvas";
import StickyHeader from "./components/layers/StickyHeader";


export default function CalendarScreen() {
    const numDays = 5;
    const columnWidth = useWindowDimensions().width/numDays;

  return (<>
    <StickyHeader startDate={new Date()} numDays={numDays} columnWidth={columnWidth}/>
    <ScrollView style={{ flex: 1 }}>
        <GridCanvas numDays={numDays} columnWidth={columnWidth}/>
    </ScrollView>
  </>);
}