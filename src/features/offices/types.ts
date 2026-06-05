export interface OfficeUser {
  id: string;
  username: string;
  full_name: string;
  role: "admin" | "user";
  is_active: boolean;
}

export interface Office {
  id: string;
  name: string;
  location: string;
  is_shared: boolean;
  created_by: string;
  created_at: string;
  access_count?: number;
}

export interface OfficeBooking {
  id: string;
  office_id: string;
  user_id: string | null;
  start_time: string;
  end_time: string;
  is_admin_block: boolean;
  created_by: string;
  created_at: string;
  users?: Pick<OfficeUser, "id" | "username" | "full_name"> | null;
  offices?: Pick<Office, "id" | "name" | "location"> | null;
}
