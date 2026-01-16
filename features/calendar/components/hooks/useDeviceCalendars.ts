import * as Calendar from "expo-calendar";
import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceCalendars } from "../adapters/deviceCalendarAdapter";
import useDeviceCalendarPermissions from "./useDeviceCalendarPermissions";


export default function useDeviceCalendars() {
    const [calendars, setCalendars] = useState<Calendar.Calendar[]>([]);
    const isMounted = useRef(true);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const { permissions } = useDeviceCalendarPermissions();
    const blocked = !permissions.granted;
    const status = permissions.status;

    useEffect(() => {
        return () => {
            isMounted.current = false;
        }
    }, [])

    const refresh = useCallback(() => {
        setLoading(true);
        setError(null);
        if (permissions.granted) {
            getDeviceCalendars().then(result => {
                if(isMounted.current) {
                    setLoading(false);
                    setCalendars(result);
                }
            }).catch(reason => {
                if (isMounted.current) {
                    setLoading(false);
                    setError(reason instanceof Error ? reason : new Error(String(reason)));
                }
            })
        }
    }, [permissions.granted])

    useEffect(() => {
        refresh()
    }, [permissions.granted, refresh])

    

    return { calendars, loading, error, blocked, status, refresh }
}