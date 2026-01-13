import { View } from 'react-native';
import { HOURS, TIME_GUTTER_WIDTH, timeToY } from '../../layout/calendarLayout';

export default function HourLines() {
    return Array.from({ length: HOURS - 1 }, (_, i) => {
          return (
            <View
              key={i}
              pointerEvents='none'
              style={{
                position: "absolute",
                left: TIME_GUTTER_WIDTH,
                right: 0,
                top: timeToY(i+1),
                height: 1,
                backgroundColor: "white",
                opacity: 1
              }}
            />
          );
        })
}