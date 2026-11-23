export type CallRecord = {
  id: number;
  call_date: string;
  call_time: string;
  received_at: string;
  extension: string;
  direction: "Entrante" | "Saliente" | "Interna" | string;
  caller: string;
  destination: string;
  ring: string;
  duration: string;
  condition: string;
  result: string;
};

export type DashboardData = {
  status: {
    connected: boolean;
    message: string;
    pbx_ip: string;
    pbx_port: number;
    last_record_at: string | null;
  };
  summary: {
    total: number;
    incoming: number;
    answered: number;
    missed: number;
    outgoing: number;
    active_extensions: number;
  };
  daily: { date: string; incoming: number; outgoing: number; missed: number }[];
  extensions: { extension: string; incoming: number; answered: number; missed: number }[];
  dids: { number: string; incoming: number }[];
  menu_did: string;
  menu_areas: {
    key: number;
    area: string;
    extension: string;
    incoming: number;
    answered: number;
    missed: number;
    other: number;
  }[];
  calls: CallRecord[];
  pagination: { page: number; per_page: number; total: number; total_pages: number };
};
