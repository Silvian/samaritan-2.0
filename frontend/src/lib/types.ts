export type UUID = string;

export type Me = {
  id: UUID;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: { id: UUID; name: string } | null;
  permissions: string[];
  is_superuser: boolean;
  mfa_enabled: boolean;
  mfa_required: boolean;
  must_change_password: boolean;
  person_id: UUID | null;
  last_login: string | null;
  recovery_codes_remaining: number;
};

export type PersonStatus = "visitor" | "regular" | "member" | "inactive" | "former" | "deceased";

export const PERSON_STATUSES: { value: PersonStatus; label: string }[] = [
  { value: "visitor", label: "Visitor" },
  { value: "regular", label: "Regular attender" },
  { value: "member", label: "Member" },
  { value: "inactive", label: "Inactive" },
  { value: "former", label: "Former member" },
  { value: "deceased", label: "Deceased" },
];

export type Tag = { id: UUID; name: string; color: string; people_count?: number };
export type Position = { id: UUID; name: string; description: string; people_count?: number };
export type Campus = { id: UUID; name: string; address?: string; is_active?: boolean };
export type Brief = { id: UUID; name: string };

export type PersonListItem = {
  id: UUID;
  full_name: string;
  first_name: string;
  last_name: string;
  preferred_name: string;
  email: string;
  phone_mobile: string;
  status: PersonStatus;
  status_display: string;
  age: number | null;
  date_of_birth: string | null;
  household: Brief | null;
  campus: Brief | null;
  tags: Tag[];
  city: string;
  postcode: string;
  archived_at: string | null;
  created_at: string;
};

export type Milestone = {
  id: UUID;
  person: UUID;
  person_name: string;
  kind: string;
  kind_display: string;
  date: string;
  place: string;
  officiant: string;
  notes: string;
};

export type Person = PersonListItem & {
  title: string;
  gender: string;
  is_child: boolean;
  marital_status: string;
  anniversary: string | null;
  phone_home: string;
  address_line1: string;
  address_line2: string;
  region: string;
  country: string;
  occupation: string;
  employer: string;
  household_role: string;
  household_members: { id: UUID; full_name: string; household_role: string; age: number | null; status: PersonStatus }[];
  membership_date: string | null;
  first_visit_date: string | null;
  how_heard: string;
  positions: Position[];
  notes: string;
  medical_notes?: string;
  confidential_notes?: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  groups: { id: UUID; name: string; role: string; group_type: string | null }[];
  milestones: Milestone[];
  has_user_account: boolean;
  can_view_sensitive: boolean;
  archive_reason: string;
  date_of_death: string | null;
  updated_at: string;
};

export type Household = {
  id: UUID;
  name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  region: string;
  postcode: string;
  country: string;
  campus: Brief | null;
  member_count: number;
  members: { id: UUID; full_name: string; household_role: string; age: number | null; status: PersonStatus; email: string; phone_mobile: string }[];
};

export type GroupType = { id: UUID; name: string; description: string; color: string; group_count?: number };

export type Group = {
  id: UUID;
  name: string;
  description: string;
  group_type: GroupType | null;
  campus: Brief | null;
  meeting_day: string;
  meeting_day_display: string;
  meeting_time: string | null;
  frequency: string;
  location: string;
  capacity: number | null;
  is_active: boolean;
  is_open: boolean;
  is_children: boolean;
  member_count: number;
  leaders: { id: UUID; full_name: string }[];
  is_leader: boolean;
};

export type GroupMembership = {
  id: UUID;
  group: UUID;
  group_name: string;
  person: UUID;
  person_name: string;
  person_email: string;
  person_phone: string;
  role: "leader" | "co_leader" | "member" | "guest";
  joined_on: string | null;
};

export type EventItem = {
  id: UUID;
  title: string;
  description: string;
  kind: string;
  kind_display: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  campus: Brief | null;
  group_id: UUID | null;
  group_name: string | null;
  capacity: number | null;
  headcount: number | null;
  check_in_enabled: boolean;
  is_cancelled: boolean;
  present_count: number;
};

export type RosterEntry = {
  person_id: UUID;
  full_name: string;
  age: number | null;
  household: string | null;
  is_child: boolean;
  status: "present" | "absent" | "excused" | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  security_code: string;
};

export type Attendance = {
  id: number;
  event: UUID;
  event_title: string;
  event_starts_at: string;
  person: UUID;
  person_name: string;
  status: string;
  checked_in_at: string | null;
  security_code: string;
};

export type Fund = {
  id: UUID;
  name: string;
  description: string;
  goal_amount: string | null;
  is_restricted: boolean;
  is_active: boolean;
  total_this_year: string | null;
};

export type Donation = {
  id: UUID;
  person: UUID | null;
  person_name: string | null;
  fund: UUID;
  fund_name: string;
  amount: string;
  date: string;
  method: string;
  method_display: string;
  reference: string;
  notes: string;
  eligible_for_gift_aid: boolean;
  gift_aid_claimed_at: string | null;
};

export type GiftAidDeclaration = {
  id: UUID;
  person: UUID;
  person_name: string;
  start_date: string;
  end_date: string | null;
  method: string;
  covers_past_four_years: boolean;
  notes: string;
  is_active: boolean;
};

export type CareRecord = {
  id: UUID;
  person: UUID;
  person_name: string;
  kind: string;
  kind_display: string;
  subject: string;
  is_confidential: boolean;
  status: "open" | "follow_up" | "closed";
  priority: "low" | "normal" | "high" | "urgent";
  occurred_on: string | null;
  follow_up_on: string | null;
  assigned_to: UUID | null;
  assigned_to_name: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  details?: string;
  notes?: { id: UUID; body: string; author: string | null; created_at: string }[];
  closed_at?: string | null;
};

export type Audience = { group_ids: UUID[]; tag_ids: UUID[]; person_ids: UUID[]; statuses: PersonStatus[] };

export type Message = {
  id: UUID;
  subject: string;
  body: string;
  channel: string;
  audience: Audience;
  status: "draft" | "sent" | "failed";
  sent_at: string | null;
  recipient_count: number;
  skipped_count: number;
  created_by_name: string | null;
  created_at: string;
};

export type ConsentState = {
  purpose: string;
  label: string;
  granted: boolean | null;
  recorded_at: string | null;
  method: string | null;
};

export type DataRequest = {
  id: UUID;
  person: UUID | null;
  person_name: string | null;
  requester_name: string;
  requester_email: string;
  kind: string;
  kind_display: string;
  status: string;
  status_display: string;
  received_on: string;
  due_on: string;
  identity_verified: boolean;
  description: string;
  resolution: string;
  completed_on: string | null;
  handled_by_name: string | null;
  is_overdue: boolean;
};

export type User = {
  id: UUID;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: { id: UUID; name: string } | null;
  person: UUID | null;
  person_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  mfa_enabled: boolean;
  last_login: string | null;
  date_joined: string;
};

export type Role = {
  id: UUID;
  name: string;
  description: string;
  permissions: string[];
  is_system: boolean;
  user_count: number;
};

export type PermissionGroup = { group: string; permissions: { code: string; label: string }[] };

export type AuditEntry = {
  id: number;
  timestamp: string;
  actor_email: string;
  action: string;
  object_type: string;
  object_id: string;
  object_repr: string;
  changes: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string;
};

export type ChurchSettings = {
  name: string;
  legal_name: string;
  charity_number: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  currency: string;
  timezone: string;
  primary_color: string;
  data_controller_name: string;
  dpo_email: string;
  privacy_notice_url: string;
  retention_years_inactive: number;
  retention_years_financial: number;
  require_mfa: boolean;
  session_idle_minutes: number;
};
