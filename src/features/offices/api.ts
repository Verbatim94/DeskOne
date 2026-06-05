import { invokeOfficeBookingFunction, invokeOfficeFunction } from "@/lib/edge-functions";
import type { Office, OfficeBooking, OfficeUser } from "./types";

export function listOffices(): Promise<Office[]> {
  return invokeOfficeFunction<Office[]>("list");
}

export function createOffice(data: { name: string; location: string; userIds: string[] }): Promise<Office> {
  return invokeOfficeFunction<Office, typeof data>("create", data);
}

export function updateOffice(
  officeId: string,
  updates: { name: string; location: string; userIds: string[] },
): Promise<Office> {
  return invokeOfficeFunction<Office, { officeId: string; updates: typeof updates }>("update", { officeId, updates });
}

export function deleteOffice(officeId: string): Promise<{ success: boolean }> {
  return invokeOfficeFunction<{ success: boolean }, { officeId: string }>("delete", { officeId });
}

export function listOfficeUsers(): Promise<OfficeUser[]> {
  return invokeOfficeFunction<OfficeUser[]>("list_users");
}

export function listOfficeAccess(officeId: string): Promise<string[]> {
  return invokeOfficeFunction<string[], { officeId: string }>("list_access", { officeId });
}

export function listOfficeBookings(
  officeId: string,
  startDate: string,
  endDate: string,
): Promise<OfficeBooking[]> {
  return invokeOfficeBookingFunction<OfficeBooking[], { officeId: string; startDate: string; endDate: string }>(
    "list_by_office",
    { officeId, startDate, endDate },
  );
}

export function listMyOfficeBookings(): Promise<OfficeBooking[]> {
  return invokeOfficeBookingFunction<OfficeBooking[]>("list_by_user");
}

export function createOfficeBooking(data: {
  officeId: string;
  startTime: string;
  endTime: string;
  isAdminBlock?: boolean;
}): Promise<OfficeBooking> {
  const operation = data.isAdminBlock ? "create_admin_block" : "create";
  return invokeOfficeBookingFunction<OfficeBooking, typeof data>(operation, data);
}

export function deleteOfficeBooking(bookingId: string): Promise<{ success: boolean }> {
  return invokeOfficeBookingFunction<{ success: boolean }, { bookingId: string }>("delete", { bookingId });
}
