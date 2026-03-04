import { PermissionResponse, PermissionStatus } from "expo-calendar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDeviceCalendarPermissions,
  requestDeviceCalendarPermissions,
} from "../adapters/deviceCalendarPermissionsAdapter";

export default function useDeviceCalendarPermissions() {
  const [permissions, setPermissions] = useState<PermissionResponse>({
    status: PermissionStatus.UNDETERMINED,
    granted: false,
    canAskAgain: true,
    expires: "never",
  });
  const isMounted = useRef(true);

  const applyPermissions = (result: PermissionResponse) => {
    if (isMounted.current) {
      setPermissions(result);
    }
  };

  useEffect(() => {
    getDeviceCalendarPermissions().then((result) => {
      applyPermissions(result);
    });

    return () => {
      isMounted.current = false;
    };
  }, []);

  const requestPermissions = useCallback(() => {
    requestDeviceCalendarPermissions().then((result) => {
      applyPermissions(result);
    });
  }, []);

  const refreshPermissions = useCallback(() => {
    getDeviceCalendarPermissions().then((result) => {
      applyPermissions(result);
    });
  }, []);

  return { permissions, requestPermissions, refreshPermissions };
}
