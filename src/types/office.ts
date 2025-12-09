export interface Office {
    id: string;
    name: string;
    location: string;
    is_shared: boolean;
    created_by: string;
    created_at: string;
}

export interface OfficeBooking {
    id: string;
    office_id: string;
    user_id: string | null;
    start_time: string;
    end_time: string;
    is_admin_block: boolean;
    created_at: string;
    created_by: string;
    user?: {
        id: string;
        username: string;
        full_name: string;
    };
    offices?: {
        id: string;
        name: string;
        location: string;
    };
}
