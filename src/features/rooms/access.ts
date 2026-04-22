import { supabase } from "@/integrations/supabase/client";

interface RoomAccessUser {
  id: string;
  role: string;
}

export async function isUserRoomAdmin(
  roomId: string,
  user: RoomAccessUser | null | undefined,
): Promise<boolean> {
  if (!user) {
    return false;
  }

  if (user.role === "admin" || user.role === "super_admin") {
    return true;
  }

  const { data: access } = await supabase
    .from("room_access")
    .select("role")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  return access?.role === "admin";
}
