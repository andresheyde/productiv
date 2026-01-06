import { View } from 'react-native';
import { DEFAULT_HOUR_HEIGHT, HOURS, timeToY } from '../../layout/calendarLayout';

export default function HourLines() {
    return Array.from({ length: HOURS - 1 }, (_, i) => {
          return (
            <View
              key={i}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: timeToY(i+1, 0, DEFAULT_HOUR_HEIGHT),
                height: 1,
                backgroundColor: "white",
                opacity: 1
              }}
            />
          );
        })
}